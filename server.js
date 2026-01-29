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
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

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
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Configure multer for file uploads
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
  status: 'lobby', // lobby, playing, paused, finished
  currentQuestionIndex: -1,
  questions: [],
  players: new Map(), // socketId -> {name, rollNumber, score, answers}
  rollNumberMap: new Map(), // rollNumber -> socketId (for reconnection)
  timer: null,
  timeRemaining: 0,
  questionStartTime: null
};

// Roll Number validation pattern
const ROLL_NUMBER_PATTERN = /^[0-9A-Z]+$/;

// Load questions from JSON file
async function loadQuestions() {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, 'questions.json'), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Save questions to JSON file
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

// API Routes
app.get('/api/questions', async (req, res) => {
  const questions = await loadQuestions();
  res.json(questions);
});

app.post('/api/questions', async (req, res) => {
  const questions = await loadQuestions();
  const question = {
    id: uuidv4(),
    type: req.body.type, // mcq, code, match
    text: req.body.text,
    timer: req.body.timer || 30,
    options: req.body.options || [],
    correctAnswer: req.body.correctAnswer, // Integer index for MCQ/Code
    codeSnippet: req.body.codeSnippet || null,
    matchMap: req.body.matchMap || null // Only for 'match' type
  };
  questions.push(question);
  await saveQuestions(questions);
  res.json(question);
});

// CSV Upload endpoint
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
        const question = {
          id: uuidv4(),
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

        // Handle match type if needed
        if (question.type === 'match') {
          // CSV would need special format for match questions
          // For now, skip match questions from CSV
          return;
        }

        questions.push(question);
      })
      .on('end', async () => {
        try {
          const existingQuestions = await loadQuestions();
          const mode = req.body.mode || 'append'; // 'append' or 'replace'
          
          if (mode === 'replace') {
            await saveQuestions(questions);
          } else {
            existingQuestions.push(...questions);
            await saveQuestions(existingQuestions);
          }

          // Clean up uploaded file
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

// Socket.io Connection Handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Admin actions
  socket.on('admin:load_questions', async () => {
    try {
      const questions = await loadQuestions();
      gameState.questions = questions;
      socket.emit('admin:questions_loaded', { questions: questions });
      console.log(`Loaded ${questions.length} questions into game state`);
    } catch (error) {
      console.error('Error loading questions:', error);
      socket.emit('admin:error', { message: 'Failed to load questions: ' + error.message });
    }
  });

  socket.on('admin:start_game', () => {
    if (gameState.questions.length === 0) {
      socket.emit('admin:error', { message: 'No questions loaded' });
      return;
    }
    gameState.status = 'playing';
    gameState.currentQuestionIndex = 0;
    startQuestion(0);
  });

  socket.on('admin:next_question', () => {
    if (gameState.status === 'playing') {
      if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
      }
      endQuestion();
    }
  });

  socket.on('admin:force_stop', () => {
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
      currentQuestionIndex: gameState.currentQuestionIndex,
      players: Array.from(gameState.players.values()).map(p => ({
        name: p.name,
        rollNumber: p.rollNumber,
        score: p.score
      })),
      timeRemaining: gameState.timeRemaining,
      totalQuestions: gameState.questions.length
    });
  });

  // Student actions - PRD compliant
  socket.on('join_request', (data) => {
    const name = data.name?.trim();
    const rollNumber = data.rollNumber?.trim().toUpperCase();

    // Validation
    if (!name || name.length < 1) {
      socket.emit('login_ack', { success: false, msg: 'Full Name is required' });
      return;
    }

    if (!rollNumber || rollNumber.length < 1) {
      socket.emit('login_ack', { success: false, msg: 'Roll Number is required' });
      return;
    }

    // Format check
    if (!ROLL_NUMBER_PATTERN.test(rollNumber)) {
      socket.emit('login_ack', { 
        success: false, 
        msg: 'Invalid Roll Number format. Use only numbers and uppercase letters.' 
      });
      return;
    }

    // Uniqueness check - check if roll number is already active
    const existingSocketId = gameState.rollNumberMap.get(rollNumber);
    if (existingSocketId && existingSocketId !== socket.id) {
      const existingPlayer = gameState.players.get(existingSocketId);
      if (existingPlayer) {
        socket.emit('login_ack', { 
          success: false, 
          msg: 'This Roll Number is already in use. Please use a different one.' 
        });
        return;
      }
    }

    // Reconnection: restore previous score if exists
    let previousScore = 0;
    let previousAnswers = new Map();
    if (existingSocketId && gameState.players.has(existingSocketId)) {
      const oldPlayer = gameState.players.get(existingSocketId);
      previousScore = oldPlayer.score;
      previousAnswers = oldPlayer.answers;
      // Remove old socket
      gameState.players.delete(existingSocketId);
    }

    // Add/update player
    gameState.players.set(socket.id, {
      name,
      rollNumber,
      score: previousScore,
      answers: previousAnswers,
      joinedAt: new Date().toISOString()
    });

    gameState.rollNumberMap.set(rollNumber, socket.id);

    socket.emit('login_ack', { 
      success: true, 
      msg: 'Successfully joined the game',
      score: previousScore
    });

    broadcastLobbyUpdate();

    // If game is in progress, send current question
    if (gameState.status === 'playing' && gameState.currentQuestionIndex >= 0) {
      const question = gameState.questions[gameState.currentQuestionIndex];
      const sanitizedQuestion = {
        id: question.id,
        type: question.type,
        text: question.text,
        options: question.options,
        codeSnippet: question.codeSnippet,
        duration: question.timer
      };
      socket.emit('new_question', sanitizedQuestion);
    }
  });

  socket.on('submit_answer', (data) => {
    if (gameState.status !== 'playing') {
      return;
    }

    const player = gameState.players.get(socket.id);
    if (!player) {
      return;
    }

    // Check if already answered this question
    if (player.answers.has(gameState.currentQuestionIndex)) {
      return;
    }

    // Store answer
    player.answers.set(gameState.currentQuestionIndex, {
      q_id: data.q_id,
      answerPayload: data.answerPayload,
      timestamp: Date.now()
    });
  });

  socket.on('disconnect', () => {
    const player = gameState.players.get(socket.id);
    if (player) {
      // Keep roll number mapping for reconnection, but remove socket
      // The roll number will be reused if they reconnect
    }
    gameState.players.delete(socket.id);
    broadcastLobbyUpdate();
    console.log('Client disconnected:', socket.id);
  });
});

// Game Engine Functions
function startQuestion(index) {
  if (index >= gameState.questions.length) {
    endGame();
    return;
  }

  const question = gameState.questions[index];
  gameState.currentQuestionIndex = index;
  gameState.timeRemaining = question.timer || 30;
  gameState.questionStartTime = Date.now();

  // Broadcast new question (without answer key)
  const sanitizedQuestion = {
    id: question.id,
    type: question.type,
    text: question.text,
    options: question.options,
    codeSnippet: question.codeSnippet,
    duration: question.timer
  };

  io.emit('new_question', sanitizedQuestion);

  // Start countdown
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
  // Lock inputs
  io.emit('time_up');

  // Calculate scores
  calculateScores();

  // Broadcast leaderboard (Top 5)
  const leaderboard = Array.from(gameState.players.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((p, index) => ({
      rank: index + 1,
      name: p.name,
      score: p.score
    }));

  io.emit('leaderboard_update', leaderboard);

  // Wait 5 seconds then move to next question
  setTimeout(() => {
    if (gameState.status === 'playing') {
      startQuestion(gameState.currentQuestionIndex + 1);
    }
  }, 5000);
}

function calculateScores() {
  const question = gameState.questions[gameState.currentQuestionIndex];
  if (!question) return;

  gameState.players.forEach((player, socketId) => {
    const answerData = player.answers.get(gameState.currentQuestionIndex);
    if (!answerData) return;

    let points = 0;

    if (question.type === 'mcq' || question.type === 'code') {
      // Both MCQ and Code use integer index answer
      const userAnswer = typeof answerData.answerPayload === 'number' 
        ? answerData.answerPayload 
        : parseInt(answerData.answerPayload);
      
      if (userAnswer === question.correctAnswer) {
        points = 10;
      }
    } else if (question.type === 'match') {
      // Match type: partial credit, 20 points total
      const correctMap = question.matchMap || {};
      const userMap = answerData.answerPayload || {};
      let correctPairs = 0;
      let totalPairs = Object.keys(correctMap).length;

      for (const [left, right] of Object.entries(userMap)) {
        if (correctMap[left] === right) {
          correctPairs++;
        }
      }

      if (totalPairs > 0) {
        points = Math.round((correctPairs / totalPairs) * 20);
      }
    }

    player.score += points;
  });
}

function endGame() {
  gameState.status = 'finished';
  const finalLeaderboard = Array.from(gameState.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, index) => ({
      rank: index + 1,
      name: p.name,
      score: p.score
    }));

  io.emit('game:finished', { leaderboard: finalLeaderboard });
}

function broadcastLobbyUpdate() {
  const players = Array.from(gameState.players.values()).map(p => ({
    name: p.name,
    rollNumber: p.rollNumber,
    score: p.score
  }));
  io.emit('lobby:update', { players });
}

// Start server
server.listen(PORT, () => {
  console.log(`LabQuiz server running on http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
  console.log(`\nTo access from other devices on LAN, use your local IP address:`);
  console.log(`Example: http://192.168.1.50:${PORT}`);
});

