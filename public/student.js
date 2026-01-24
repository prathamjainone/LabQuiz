const socket = io();
let currentQuestion = null;
let hasAnswered = false;
let timerInterval = null;
let totalTime = 0;
let timeRemaining = 0;

// Screen management
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Join functionality
document.getElementById('joinBtn').addEventListener('click', () => {
    const nickname = document.getElementById('nicknameInput').value.trim();
    if (!nickname) {
        showError('Please enter a nickname');
        return;
    }
    socket.emit('student:join', { nickname });
});

document.getElementById('nicknameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('joinBtn').click();
    }
});

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => {
        errorEl.style.display = 'none';
    }, 3000);
}

// Socket Listeners
socket.on('student:joined', (data) => {
    if (data.status === 'playing') {
        // Game already in progress, will receive question
        showScreen('gameScreen');
    } else {
        showScreen('waitingScreen');
    }
});

socket.on('student:error', (data) => {
    showError(data.message);
});

socket.on('student:answer_received', () => {
    hasAnswered = true;
    document.getElementById('answerStatus').innerHTML = '<p class="answer-confirmed">✓ Answer submitted!</p>';
});

socket.on('game:new_question', (data) => {
    currentQuestion = data.question;
    hasAnswered = false;
    totalTime = data.question.timer || 30;
    timeRemaining = data.timeRemaining || totalTime;
    
    showScreen('gameScreen');
    displayQuestion(data.question, data.questionNumber, data.totalQuestions);
    startTimer();
});

socket.on('game:timer_update', (data) => {
    timeRemaining = data.timeRemaining;
    updateTimer();
});

socket.on('game:time_up', () => {
    clearTimer();
    document.getElementById('answerStatus').innerHTML = '<p class="time-up">Time\'s up!</p>';
    // Disable all inputs
    document.querySelectorAll('button, input, select').forEach(el => {
        el.disabled = true;
    });
});

socket.on('game:leaderboard_update', (data) => {
    clearTimer();
    showScreen('leaderboardScreen');
    displayLeaderboard(data.leaderboard);
});

socket.on('game:finished', (data) => {
    clearTimer();
    showScreen('finalScreen');
    displayFinalLeaderboard(data.leaderboard);
});

socket.on('game:paused', () => {
    clearTimer();
    document.getElementById('answerStatus').innerHTML = '<p class="paused">Game Paused</p>';
});

socket.on('kicked', () => {
    alert('You have been kicked from the game');
    location.reload();
});

// Question Display
function displayQuestion(question, questionNumber, totalQuestions) {
    document.getElementById('questionNumber').textContent = `Question ${questionNumber}`;
    document.getElementById('totalQuestions').textContent = `/ ${totalQuestions}`;
    
    const container = document.getElementById('questionContainer');
    container.innerHTML = '';
    
    // Question text
    const questionText = document.createElement('div');
    questionText.className = 'question-text';
    questionText.innerHTML = `<h3>${question.questionText}</h3>`;
    container.appendChild(questionText);
    
    // Code snippet
    if (question.code) {
        const codeBlock = document.createElement('div');
        codeBlock.className = 'code-block';
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = 'language-javascript';
        code.textContent = question.code;
        pre.appendChild(code);
        codeBlock.appendChild(pre);
        container.appendChild(codeBlock);
        // Trigger Prism highlighting
        if (window.Prism) {
            Prism.highlightElement(code);
        }
    }
    
    // Image
    if (question.image) {
        const imageBlock = document.createElement('div');
        imageBlock.className = 'image-block';
        const img = document.createElement('img');
        img.src = question.image;
        img.alt = 'Question image';
        imageBlock.appendChild(img);
        container.appendChild(imageBlock);
    }
    
    // Answer interface based on type
    const answerContainer = document.createElement('div');
    answerContainer.className = 'answer-container';
    
    if (question.type === 'mcq') {
        answerContainer.innerHTML = createMcqInterface(question);
    } else if (question.type === 'multi_select') {
        answerContainer.innerHTML = createMultiSelectInterface(question);
    } else if (question.type === 'match_following') {
        answerContainer.innerHTML = createMatchInterface(question);
    }
    
    container.appendChild(answerContainer);
    
    // Reset answer status
    document.getElementById('answerStatus').innerHTML = '';
    
    // Enable inputs
    document.querySelectorAll('button, input, select').forEach(el => {
        el.disabled = false;
    });
}

function createMcqInterface(question) {
    const options = question.options || [];
    return options.map((option, index) => {
        const letter = String.fromCharCode(65 + index);
        return `
            <button class="answer-btn mcq-btn" data-answer="${letter}">
                <span class="option-letter">${letter}</span>
                <span class="option-text">${option}</span>
            </button>
        `;
    }).join('');
}

function createMultiSelectInterface(question) {
    const options = question.options || [];
    return options.map((option, index) => {
        const letter = String.fromCharCode(65 + index);
        return `
            <label class="multi-select-option">
                <input type="checkbox" class="multi-checkbox" value="${option}">
                <span class="option-letter">${letter}</span>
                <span class="option-text">${option}</span>
            </label>
        `;
    }).join('') + '<button class="btn btn-primary submit-multi" style="margin-top: 15px;">Submit Answer</button>';
}

function createMatchInterface(question) {
    const leftItems = question.data?.left || [];
    const rightItems = question.data?.right || [];
    const selectedMatches = {};
    
    let html = '<div class="match-container">';
    html += '<div class="match-column"><h4>Left</h4>';
    leftItems.forEach((item, index) => {
        html += `
            <div class="match-item" data-side="left" data-index="${index}">
                <span class="match-text">${item}</span>
                <span class="match-arrow">→</span>
                <span class="match-selected" data-left-index="${index}"></span>
            </div>
        `;
    });
    html += '</div>';
    
    html += '<div class="match-column"><h4>Right</h4>';
    rightItems.forEach((item, index) => {
        html += `
            <div class="match-item" data-side="right" data-index="${index}">
                <span class="match-text">${item}</span>
            </div>
        `;
    });
    html += '</div></div>';
    html += '<button class="btn btn-primary submit-match" style="margin-top: 15px;">Submit Answer</button>';
    
    return html;
}

// Answer handling
document.addEventListener('click', (e) => {
    if (hasAnswered || !currentQuestion) return;
    
    // MCQ answer
    if (e.target.closest('.mcq-btn')) {
        const btn = e.target.closest('.mcq-btn');
        const answer = btn.dataset.answer;
        socket.emit('student:answer', { answer });
        // Visual feedback
        document.querySelectorAll('.mcq-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    }
    
    // Match following - left item click
    if (e.target.closest('.match-item[data-side="left"]')) {
        const leftItem = e.target.closest('.match-item[data-side="left"]');
        const leftIndex = parseInt(leftItem.dataset.index);
        
        // Remove previous selection for this left item
        document.querySelectorAll('.match-item[data-side="right"]').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Highlight this left item
        document.querySelectorAll('.match-item[data-side="left"]').forEach(item => {
            item.classList.remove('active');
        });
        leftItem.classList.add('active');
    }
    
    // Match following - right item click (after left is selected)
    if (e.target.closest('.match-item[data-side="right"]')) {
        const activeLeft = document.querySelector('.match-item[data-side="left"].active');
        if (!activeLeft) return;
        
        const rightItem = e.target.closest('.match-item[data-side="right"]');
        const rightIndex = parseInt(rightItem.dataset.index);
        const leftIndex = parseInt(activeLeft.dataset.index);
        
        // Update selected match display
        const selectedSpan = document.querySelector(`.match-selected[data-left-index="${leftIndex}"]`);
        const rightItems = currentQuestion.data?.right || [];
        selectedSpan.textContent = rightItems[rightIndex];
        selectedSpan.dataset.rightIndex = rightIndex;
        
        // Visual feedback
        rightItem.classList.add('selected');
        activeLeft.classList.remove('active');
    }
    
    // Submit multi-select
    if (e.target.closest('.submit-multi')) {
        const checked = Array.from(document.querySelectorAll('.multi-checkbox:checked'))
            .map(cb => cb.value);
        if (checked.length === 0) {
            alert('Please select at least one option');
            return;
        }
        socket.emit('student:answer', { answer: checked });
    }
    
    // Submit match
    if (e.target.closest('.submit-match')) {
        const matches = {};
        document.querySelectorAll('.match-selected').forEach(span => {
            if (span.textContent && span.dataset.leftIndex !== undefined && span.dataset.rightIndex !== undefined) {
                const leftItems = currentQuestion.data?.left || [];
                const rightItems = currentQuestion.data?.right || [];
                matches[leftItems[parseInt(span.dataset.leftIndex)]] = rightItems[parseInt(span.dataset.rightIndex)];
            }
        });
        
        if (Object.keys(matches).length === 0) {
            alert('Please create at least one match');
            return;
        }
        socket.emit('student:answer', { answer: matches });
    }
});

// Timer
function startTimer() {
    clearTimer();
    updateTimer();
    timerInterval = setInterval(() => {
        updateTimer();
    }, 100);
}

function updateTimer() {
    const progress = (timeRemaining / totalTime) * 100;
    document.getElementById('timerProgress').style.width = `${progress}%`;
    document.getElementById('timerText').textContent = `${timeRemaining}s`;
    
    // Color coding
    const progressBar = document.getElementById('timerProgress');
    if (progress < 20) {
        progressBar.className = 'timer-progress danger';
    } else if (progress < 50) {
        progressBar.className = 'timer-progress warning';
    } else {
        progressBar.className = 'timer-progress';
    }
}

function clearTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// Leaderboard
function displayLeaderboard(leaderboard) {
    const container = document.getElementById('leaderboardList');
    container.innerHTML = leaderboard.map((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        return `
            <div class="leaderboard-entry ${index < 3 ? 'top-three' : ''}">
                <span class="rank">${medal} #${entry.rank}</span>
                <span class="name">${entry.nickname}</span>
                <span class="score">${entry.score} pts</span>
            </div>
        `;
    }).join('');
}

function displayFinalLeaderboard(leaderboard) {
    const container = document.getElementById('finalLeaderboard');
    container.innerHTML = leaderboard.map((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        return `
            <div class="leaderboard-entry ${index < 3 ? 'top-three' : ''}">
                <span class="rank">${medal} #${entry.rank}</span>
                <span class="name">${entry.nickname}</span>
                <span class="score">${entry.score} pts</span>
            </div>
        `;
    }).join('');
}

