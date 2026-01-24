const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
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
  players: new Map(), // socketId -> {nickname, score, answers}
  timer: null,
  timeRemaining: 0,
  questionStartTime: null
};

// Load quizzes from JSON file
async function loadQuizzes() {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, 'quizzes.json'), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Save quizzes to JSON file
async function saveQuizzes(quizzes) {
  await fs.writeFile(
    path.join(DATA_DIR, 'quizzes.json'),
    JSON.stringify(quizzes, null, 2)
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
app.get('/api/quizzes', async (req, res) => {
  const quizzes = await loadQuizzes();
  res.json(quizzes);
});

app.post('/api/quizzes', async (req, res) => {
  const quizzes = await loadQuizzes();
  const newQuiz = {
    id: uuidv4(),
    name: req.body.name || 'Untitled Quiz',
    questions: req.body.questions || [],
    createdAt: new Date().toISOString()
  };
  quizzes.push(newQuiz);
  await saveQuizzes(quizzes);
  res.json(newQuiz);
});

app.post('/api/quizzes/:id/questions', async (req, res) => {
  const quizzes = await loadQuizzes();
  const quiz = quizzes.find(q => q.id === req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz not found' });
  }
  
  const question = {
    id: uuidv4(),
    ...req.body
  };
  quiz.questions.push(question);
  await saveQuizzes(quizzes);
  res.json(question);
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Socket.io Connection Handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Admin actions
  socket.on('admin:load_quiz', async (data) => {
    const quizzes = await loadQuizzes();
    const quiz = quizzes.find(q => q.id === data.quizId);
    if (quiz) {
      gameState.questions = quiz.questions;
      socket.emit('admin:quiz_loaded', { questions: quiz.questions });
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

  socket.on('admin:pause_game', () => {
    if (gameState.timer) {
      clearInterval(gameState.timer);
      gameState.timer = null;
    }
    gameState.status = 'paused';
    io.emit('game:paused');
  });

  socket.on('admin:resume_game', () => {
    if (gameState.status === 'paused' && gameState.currentQuestionIndex >= 0) {
      gameState.status = 'playing';
      continueQuestion();
    }
  });

  socket.on('admin:kick_user', (data) => {
    const player = Array.from(gameState.players.entries())
      .find(([_, p]) => p.nickname === data.nickname);
    if (player) {
      const [socketId] = player;
      gameState.players.delete(socketId);
      io.to(socketId).emit('kicked');
      io.to(socketId).disconnectSockets();
      broadcastLobbyUpdate();
    }
  });

  socket.on('admin:get_state', () => {
    socket.emit('admin:state', {
      status: gameState.status,
      currentQuestionIndex: gameState.currentQuestionIndex,
      players: Array.from(gameState.players.values()),
      timeRemaining: gameState.timeRemaining,
      totalQuestions: gameState.questions.length
    });
  });

  // Student actions
  socket.on('student:join', (data) => {
    const nickname = data.nickname?.trim();
    if (!nickname || nickname.length < 1) {
      socket.emit('student:error', { message: 'Nickname required' });
      return;
    }

    // Check if nickname already exists
    const existingPlayer = Array.from(gameState.players.values())
      .find(p => p.nickname.toLowerCase() === nickname.toLowerCase());
    if (existingPlayer) {
      socket.emit('student:error', { message: 'Nickname already taken' });
      return;
    }

    gameState.players.set(socket.id, {
      nickname,
      score: 0,
      answers: new Map(),
      joinedAt: new Date().toISOString()
    });

    socket.emit('student:joined', {
      status: gameState.status,
      currentQuestion: gameState.currentQuestionIndex >= 0 
        ? gameState.questions[gameState.currentQuestionIndex] 
        : null,
      timeRemaining: gameState.timeRemaining
    });

    broadcastLobbyUpdate();

    // If game is in progress, send current question
    if (gameState.status === 'playing' && gameState.currentQuestionIndex >= 0) {
      const question = gameState.questions[gameState.currentQuestionIndex];
      socket.emit('game:new_question', {
        question,
        timeRemaining: gameState.timeRemaining,
        questionNumber: gameState.currentQuestionIndex + 1,
        totalQuestions: gameState.questions.length
      });
    }
  });

  socket.on('student:answer', (data) => {
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

    // Store answer with timestamp
    player.answers.set(gameState.currentQuestionIndex, {
      answer: data.answer,
      timestamp: Date.now(),
      questionStartTime: gameState.questionStartTime
    });

    socket.emit('student:answer_received');
  });

  socket.on('disconnect', () => {
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

  // Broadcast new question
  io.emit('game:new_question', {
    question,
    timeRemaining: gameState.timeRemaining,
    questionNumber: index + 1,
    totalQuestions: gameState.questions.length
  });

  // Start countdown
  gameState.timer = setInterval(() => {
    gameState.timeRemaining--;
    
    // Broadcast time update
    io.emit('game:timer_update', { timeRemaining: gameState.timeRemaining });

    if (gameState.timeRemaining <= 0) {
      clearInterval(gameState.timer);
      gameState.timer = null;
      endQuestion();
    }
  }, 1000);
}

function continueQuestion() {
  if (gameState.currentQuestionIndex >= 0) {
    const question = gameState.questions[gameState.currentQuestionIndex];
    gameState.timer = setInterval(() => {
      gameState.timeRemaining--;
      io.emit('game:timer_update', { timeRemaining: gameState.timeRemaining });
      if (gameState.timeRemaining <= 0) {
        clearInterval(gameState.timer);
        gameState.timer = null;
        endQuestion();
      }
    }, 1000);
  }
}

function endQuestion() {
  // Lock inputs
  io.emit('game:time_up');

  // Calculate scores
  calculateScores();

  // Broadcast leaderboard
  const leaderboard = Array.from(gameState.players.values())
    .sort((a, b) => b.score - a.score)
    .map((p, index) => ({
      rank: index + 1,
      nickname: p.nickname,
      score: p.score
    }));

  io.emit('game:leaderboard_update', { leaderboard });

  // Wait 3-5 seconds then move to next question
  setTimeout(() => {
    if (gameState.status === 'playing') {
      startQuestion(gameState.currentQuestionIndex + 1);
    }
  }, 4000);
}

function calculateScores() {
  const question = gameState.questions[gameState.currentQuestionIndex];
  if (!question) return;

  gameState.players.forEach((player, socketId) => {
    const answerData = player.answers.get(gameState.currentQuestionIndex);
    if (!answerData) return;

    let points = 0;

    if (question.type === 'mcq') {
      if (answerData.answer === question.correctAnswer) {
        points = 10;
      }
    } else if (question.type === 'multi_select') {
      const correctSet = new Set(question.correctAnswers);
      const answerSet = new Set(answerData.answer);
      const correctCount = [...answerSet].filter(a => correctSet.has(a)).length;
      const totalCorrect = question.correctAnswers.length;
      if (correctCount === totalCorrect && answerSet.size === correctSet.size) {
        points = 10;
      } else if (correctCount > 0) {
        points = Math.round((correctCount / totalCorrect) * 10);
      }
    } else if (question.type === 'match_following') {
      const correctMap = question.correctMap || {};
      const userMap = answerData.answer || {};
      let correctPairs = 0;
      let totalPairs = Object.keys(correctMap).length;

      for (const [left, right] of Object.entries(userMap)) {
        if (correctMap[left] === right) {
          correctPairs++;
        }
      }

      if (totalPairs > 0) {
        points = Math.round((correctPairs / totalPairs) * 10);
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
      nickname: p.nickname,
      score: p.score
    }));

  io.emit('game:finished', { leaderboard: finalLeaderboard });
}

function broadcastLobbyUpdate() {
  const players = Array.from(gameState.players.values()).map(p => ({
    nickname: p.nickname,
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

