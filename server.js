const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || 'labquiz';

// When running as an executable (pkg)
const isPkg = typeof process.pkg !== 'undefined';
const BASE_DIR = isPkg ? path.dirname(process.execPath) : __dirname;

const DATA_DIR = path.join(BASE_DIR, 'data');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');

// Ensure directories exist
(async () => {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating directories:', error);
  }
})();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Game State
let gameState = {
  status: 'lobby', // lobby, playing, finished_round, finished_game
  currentRound: 0,
  activeRoundQuestions: [],
  currentQuestionIndex: -1,
  questions: [],
  players: new Map(),
  rollNumberMap: new Map(),
  timer: null,
  timeRemaining: 0,
  questionStartTime: null,
  lastLeaderboard: [],
  completedRounds: new Set()
};

// Admin auth
const authorizedAdmins = new Set();
function requireAdmin(socket) {
  if (!authorizedAdmins.has(socket.id)) {
    socket.emit('admin:error', { message: 'Unauthorized. Please authenticate as Admin.' });
    return false;
  }
  return true;
}

const ROLL_NUMBER_PATTERN = /^[0-9A-Z]+$/;

async function loadQuestions() {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, 'questions.json'), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function saveQuestions(questions) {
  await fs.writeFile(
    path.join(DATA_DIR, 'questions.json'),
    JSON.stringify(questions, null, 2)
  );
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/questions', async (req, res) => {
  const questions = await loadQuestions();
  res.json(questions);
});

app.get('/api/leaderboard.json', (req, res) => {
  res.json({ leaderboard: gameState.lastLeaderboard || [] });
});

app.get('/api/leaderboard.csv', (req, res) => {
  const rows = gameState.lastLeaderboard || [];
  const header = ['rank', 'name', 'rollNumber', 'score', 'status'];
  const escapeCsv = (value) => {
    const s = String(value ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csvText =
    header.join(',') +
    '\n' +
    rows
      .map((r) => [r.rank, r.name, r.rollNumber, r.score, r.status].map(escapeCsv).join(','))
      .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=\"labquiz_leaderboard.csv\"');
  res.send(csvText);
});

app.post('/api/questions', async (req, res) => {
  const questions = await loadQuestions();
  const question = {
    id: uuidv4(),
    level: parseInt(req.body.level) || 1,
    type: req.body.type,
    text: req.body.text,
    timer: req.body.timer || 30,
    options: req.body.options || [],
    correctAnswer: req.body.correctAnswer,
    codeSnippet: req.body.codeSnippet || null,
    matchMap: req.body.matchMap || null
  };
  questions.push(question);
  await saveQuestions(questions);
  res.json(question);
});

// CSV Upload
app.post('/api/questions/upload-csv', upload.single('csv'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded' });
  }

  const questions = [];
  const filePath = req.file.path;
  const fsStream = require('fs').createReadStream;

  return new Promise((resolve, reject) => {
    fsStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        let level = 1;
        if (row.level) {
          level = parseInt(row.level);
          if (isNaN(level)) level = 1;
        }

        const question = {
          id: uuidv4(),
          level: level,
          type: row.type?.toLowerCase() || 'mcq',
          text: row.question || row.text || '',
          timer: parseInt(row.timer) || 30,
          options: [
            row.option1 || '',
            row.option2 || '',
            row.option3 || '',
            row.option4 || ''
          ].filter(opt => opt),
          correctAnswer: parseInt(row.correctAnswer) || 0,
          codeSnippet: row.codeSnippet || null,
          matchMap: null
        };

        if (question.type === 'match') return;

        questions.push(question);
      })
      .on('end', async () => {
        try {
          const existingQuestions = await loadQuestions();
          const mode = req.body.mode || 'append';

          if (mode === 'replace') {
            await saveQuestions(questions);
          } else {
            existingQuestions.push(...questions);
            await saveQuestions(existingQuestions);
          }
          await fs.unlink(filePath);
          res.json({
            success: true,
            message: `Uploaded ${questions.length} questions`,
            count: questions.length
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => {
        reject(error);
      });
  }).catch(error => {
    console.error('CSV parsing error:', error);
    res.status(500).json({ error: 'Failed to parse CSV file' });
  });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('admin:auth', (data) => {
    const pin = String(data?.pin ?? '');
    if (pin === ADMIN_PIN) {
      authorizedAdmins.add(socket.id);
      socket.emit('admin:auth_result', { success: true });
      return;
    }
    socket.emit('admin:auth_result', { success: false, message: 'Invalid PIN' });
  });

  socket.on('admin:load_questions', async () => {
    if (!requireAdmin(socket)) return;
    try {
      const questions = await loadQuestions();
      gameState.questions = questions;
      socket.emit('admin:questions_loaded', { questions: questions });
    } catch (error) {
      socket.emit('admin:error', { message: 'Failed to load questions: ' + error.message });
    }
  });

  socket.on('admin:start_round', (data) => {
    if (!requireAdmin(socket)) return;

    const round = parseInt(data.round) || 1;

    // Enforce Sequential Rounds
    if (round > 1 && !gameState.completedRounds.has(round - 1)) {
      socket.emit('admin:error', { message: `Cannot start Round ${round} until Round ${round - 1} is completed!` });
      return;
    }

    if (gameState.questions.length === 0) {
      socket.emit('admin:error', { message: 'No questions loaded' });
      return;
    }

    const roundQuestions = gameState.questions.filter(q => (q.level || 1) === round);
    if (roundQuestions.length === 0) {
      socket.emit('admin:error', { message: `No questions found for Round ${round}` });
      return;
    }

    gameState.status = 'playing';
    gameState.currentRound = round;
    gameState.activeRoundQuestions = roundQuestions;
    gameState.currentQuestionIndex = 0;

    gameState.players.forEach(player => {
      if (!player.roundScores) player.roundScores = {};
      player.roundScores[round] = 0;

      if (round === 1) {
        player.score = 0;
        player.roundScores = { 1: 0, 2: 0, 3: 0 };
        player.status = 'active';
        player.answers = new Map();
        gameState.completedRounds.clear();
      }
    });

    io.emit('round:started', { round: round });
    startQuestion(0);
  });

  socket.on('admin:next_question', () => {
    if (!requireAdmin(socket)) return;
    if (gameState.status === 'playing') {
      if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
      }
      endQuestion();
    }
  });

  socket.on('admin:force_stop', () => {
    if (!requireAdmin(socket)) return;
    if (gameState.timer) {
      clearInterval(gameState.timer);
      gameState.timer = null;
    }
    gameState.status = 'lobby';
    io.emit('game:stopped');
  });

  socket.on('admin:get_state', () => {
    socket.emit('admin:state', {
      status: gameState.status,
      currentRound: gameState.currentRound,
      currentQuestionIndex: gameState.currentQuestionIndex,
      players: Array.from(gameState.players.values()).map(p => ({
        name: p.name,
        rollNumber: p.rollNumber,
        score: p.score,
        status: p.status
      })),
      timeRemaining: gameState.timeRemaining,
      totalQuestions: gameState.activeRoundQuestions.length,
      totalAllQuestions: gameState.questions.length
    });
  });

  socket.on('join_request', (data) => {
    const name = data.name?.trim();
    const rollNumber = data.rollNumber?.trim().toUpperCase();

    if (!name || name.length < 1) {
      socket.emit('login_ack', { success: false, msg: 'Full Name is required' });
      return;
    }
    if (!rollNumber || rollNumber.length < 1) {
      socket.emit('login_ack', { success: false, msg: 'Roll Number is required' });
      return;
    }
    if (!ROLL_NUMBER_PATTERN.test(rollNumber)) {
      socket.emit('login_ack', { success: false, msg: 'Invalid Roll Number format.' });
      return;
    }

    const existingSocketId = gameState.rollNumberMap.get(rollNumber);
    if (existingSocketId && existingSocketId !== socket.id) {
      const existingPlayer = gameState.players.get(existingSocketId);
      if (existingPlayer) {
        socket.emit('login_ack', { success: false, msg: 'Roll Number in use.' });
        return;
      }
    }

    let previousScore = 0;
    let previousRoundScores = { 1: 0, 2: 0, 3: 0 };
    let previousStatus = 'active';
    let previousAnswers = new Map();

    if (existingSocketId && gameState.players.has(existingSocketId)) {
      const oldPlayer = gameState.players.get(existingSocketId);
      previousScore = oldPlayer.score;
      previousRoundScores = oldPlayer.roundScores || { 1: 0, 2: 0, 3: 0 };
      previousStatus = oldPlayer.status;
      previousAnswers = oldPlayer.answers;
      gameState.players.delete(existingSocketId);
    } else {
      if (gameState.currentRound > 1) {
        previousStatus = 'spectator';
      }
    }

    gameState.players.set(socket.id, {
      name,
      rollNumber,
      score: previousScore,
      roundScores: previousRoundScores,
      status: previousStatus,
      answers: previousAnswers,
      joinedAt: new Date().toISOString()
    });

    gameState.rollNumberMap.set(rollNumber, socket.id);

    socket.emit('login_ack', {
      success: true,
      msg: 'Joined successfully',
      score: previousScore,
      status: previousStatus,
      round: gameState.currentRound
    });

    broadcastLobbyUpdate();

    if (gameState.status === 'playing' && gameState.currentQuestionIndex >= 0) {
      const question = gameState.activeRoundQuestions[gameState.currentQuestionIndex];
      const sanitizedQuestion = {
        id: question.id,
        type: question.type,
        text: question.text,
        options: question.options,
        codeSnippet: question.codeSnippet,
        duration: question.timer,
        currentQuestion: gameState.currentQuestionIndex + 1,
        totalQuestions: gameState.activeRoundQuestions.length,
        round: gameState.currentRound
      };
      socket.emit('new_question', sanitizedQuestion);
    }
  });

  socket.on('submit_answer', (data) => {
    if (gameState.status !== 'playing') return;

    const player = gameState.players.get(socket.id);
    if (!player) return;
    if (player.status !== 'active') return;

    const qKey = `${gameState.currentRound}_${gameState.currentQuestionIndex}`;
    if (player.answers.has(qKey)) return;

    player.answers.set(qKey, {
      q_id: data.q_id,
      answerPayload: data.answerPayload,
      timestamp: Date.now(),
      timeRemainingAtAnswer: gameState.timeRemaining
    });
  });

  socket.on('disconnect', () => {
    gameState.players.delete(socket.id);
    broadcastLobbyUpdate();
    authorizedAdmins.delete(socket.id);
  });
});

function startQuestion(index) {
  if (index >= gameState.activeRoundQuestions.length) {
    endRound();
    return;
  }

  const question = gameState.activeRoundQuestions[index];
  gameState.currentQuestionIndex = index;
  gameState.timeRemaining = question.timer || 30;
  gameState.questionStartTime = Date.now();

  io.emit('admin:question_progress', {
    currentQuestionIndex: gameState.currentQuestionIndex,
    totalQuestions: gameState.activeRoundQuestions.length
  });

  const sanitizedQuestion = {
    id: question.id,
    type: question.type,
    text: question.text,
    options: question.options,
    codeSnippet: question.codeSnippet,
    duration: question.timer,
    currentQuestion: index + 1,
    totalQuestions: gameState.activeRoundQuestions.length,
    round: gameState.currentRound
  };

  io.emit('new_question', sanitizedQuestion);

  gameState.timer = setInterval(() => {
    gameState.timeRemaining--;
    if (gameState.timeRemaining <= 0) {
      clearInterval(gameState.timer);
      gameState.timer = null;
      endQuestion();
    }
  }, 1000);
}

function endQuestion() {
  io.emit('time_up');
  const perPlayerResults = calculateScoresAndReturnResults();

  perPlayerResults.forEach((r) => {
    io.to(r.socketId).emit('answer_result', {
      correct: r.correct,
      points: r.points,
      totalScore: r.totalScore,
      speedBonus: r.speedBonus,
      firstBlood: r.firstBlood,
      penalty: r.penalty
    });
  });

  const fullLeaderboard = getLeaderboard();
  gameState.lastLeaderboard = fullLeaderboard;

  setTimeout(() => {
    io.emit('leaderboard_update', fullLeaderboard);
  }, 3000);

  setTimeout(() => {
    if (gameState.status === 'playing') {
      startQuestion(gameState.currentQuestionIndex + 1);
    }
  }, 8000);
}

function calculateScoresAndReturnResults() {
  const round = gameState.currentRound;
  const question = gameState.activeRoundQuestions[gameState.currentQuestionIndex];
  if (!question) return [];

  const qKey = `${round}_${gameState.currentQuestionIndex}`;
  const totalDuration = question.timer || 30;

  // Answers gathering
  const allAnswers = [];
  gameState.players.forEach((player, socketId) => {
    if (player.status !== 'active') return;
    const ans = player.answers.get(qKey);
    if (ans) allAnswers.push({ socketId, ...ans });
  });
  allAnswers.sort((a, b) => a.timestamp - b.timestamp);

  const results = [];

  gameState.players.forEach((player, socketId) => {
    if (player.status !== 'active') return;

    const answerData = player.answers.get(qKey);
    let points = 0;
    let correct = false;

    if (!player.roundScores) player.roundScores = { 1: 0, 2: 0, 3: 0 };

    // Initialize temp meta for feedback
    let isSpeedBonus = false;
    let isPenalty = false;

    if (answerData) {
      if (question.type === 'mcq' || question.type === 'code') {
        const userAnswer = Number(answerData.answerPayload);
        if (userAnswer === question.correctAnswer) correct = true;
      } else if (question.type === 'match') {
        // Simple match logic
        const correctMap = question.matchMap || {};
        const userMap = answerData.answerPayload || {};
        let correctPairs = 0;
        let totalPairs = Object.keys(correctMap).length;
        for (const [left, right] of Object.entries(userMap)) {
          if (correctMap[left] === right) correctPairs++;
        }
        if (totalPairs > 0 && correctPairs === totalPairs) correct = true;
      }

      if (correct) {
        points += 1;
        if (round === 1) {
          if ((totalDuration - answerData.timeRemainingAtAnswer) <= 5) {
            points += 1;
            isSpeedBonus = true;
          }
        }
      } else {
        if (round === 3) {
          points -= 2;
          isPenalty = true;
        }
      }
    }

    results.push({
      socketId,
      correct,
      points,
      timestamp: answerData ? answerData.timestamp : Infinity,
      speedBonus: isSpeedBonus,
      penalty: isPenalty,
      firstBlood: false // set later
    });
  });

  // First Blood (Round 2)
  if (round === 2) {
    const correctResults = results.filter(r => r.correct).sort((a, b) => a.timestamp - b.timestamp);
    if (correctResults.length > 0) {
      correctResults[0].points += 2;
      correctResults[0].firstBlood = true;
    }
  }

  // Update State
  results.forEach(r => {
    const player = gameState.players.get(r.socketId);
    if (player) {
      player.score += r.points;
      player.roundScores[round] = (player.roundScores[round] || 0) + r.points;
      r.totalScore = player.score;
    }
  });

  return results;
}

function endRound() {
  const round = gameState.currentRound;
  // Mark completed
  gameState.completedRounds.add(round);

  const cutoff = Math.ceil(gameState.activeRoundQuestions.length * 0.5);

  gameState.players.forEach(player => {
    if (player.status !== 'active') return;
    const roundScore = player.roundScores[round] || 0;
    if (round < 3) {
      if (roundScore < cutoff) {
        player.status = 'spectator';
      }
    }
  });

  gameState.status = 'finished_round';

  if (round === 3) {
    endGame();
  } else {
    io.emit('round:finished', {
      round: round,
      cutoff: cutoff,
      leaderboard: getLeaderboard()
    });

    gameState.players.forEach((p, socketId) => {
      let qualified = p.status === 'active';
      io.to(socketId).emit('round:status', {
        qualified: qualified,
        message: qualified ? `Qualified for Round ${round + 1}!` : `Eliminated (Cutoff: ${cutoff}). Spectating...`,
        roundScore: p.roundScores[round]
      });
    });
  }
}

function endGame() {
  gameState.status = 'finished_game';
  const finalLeaderboard = getLeaderboard();
  gameState.lastLeaderboard = finalLeaderboard;
  io.emit('game:finished', { leaderboard: finalLeaderboard });
}

function getLeaderboard() {
  return Array.from(gameState.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, index) => ({
      rank: index + 1,
      name: p.name,
      rollNumber: p.rollNumber,
      score: p.score,
      status: p.status
    }));
}

function broadcastLobbyUpdate() {
  const players = Array.from(gameState.players.values()).map(p => ({
    name: p.name,
    rollNumber: p.rollNumber,
    score: p.score,
    status: p.status
  }));
  io.emit('lobby:update', { players });
}

server.listen(PORT, () => {
  console.log(`Tech Quest server running on http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
});
