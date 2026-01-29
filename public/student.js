const socket = io();
let currentQuestion = null;
let hasAnswered = false;
let timerInterval = null;
let totalTime = 0;
let timeRemaining = 0;
let matchPairs = {}; // For match type questions
let activeLeftItem = null; // For match type selection

// Screen management
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Join functionality - PRD compliant
document.getElementById('joinBtn').addEventListener('click', () => {
    const name = document.getElementById('fullNameInput').value.trim();
    const rollNumber = document.getElementById('rollNumberInput').value.trim().toUpperCase();
    
    if (!name) {
        showError('Please enter your Full Name');
        return;
    }
    if (!rollNumber) {
        showError('Please enter your Roll Number');
        return;
    }
    
    socket.emit('join_request', { name, rollNumber });
});

document.getElementById('rollNumberInput').addEventListener('keypress', (e) => {
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
    }, 5000);
}

// Socket Listeners - PRD compliant
socket.on('login_ack', (data) => {
    if (data.success) {
        showScreen('waitingScreen');
    } else {
        showError(data.msg);
    }
});

socket.on('new_question', (question) => {
    currentQuestion = question;
    hasAnswered = false;
    totalTime = question.duration || 30;
    timeRemaining = totalTime;
    matchPairs = {};
    activeLeftItem = null;
    
    showScreen('gameScreen');
    displayQuestion(question);
    startTimer();
    
    // Hide time up overlay if visible
    document.getElementById('timeUpOverlay').style.display = 'none';
});

socket.on('time_up', () => {
    clearTimer();
    showTimeUpOverlay();
    
    // Disable all inputs
    document.querySelectorAll('button, input, select').forEach(el => {
        el.disabled = true;
    });
    
    // Submit any pending match answer
    if (currentQuestion && currentQuestion.type === 'match' && Object.keys(matchPairs).length > 0) {
        submitAnswer(matchPairs);
    }
});

socket.on('answer_result', (data) => {
    // Show right/wrong + points after every question (no answer key shown)
    const correct = !!data.correct;
    const points = Number.isFinite(data.points) ? data.points : 0;
    document.getElementById('answerStatus').innerHTML = correct
        ? `<p class="answer-confirmed">✓ Correct (+${points})</p>`
        : `<p class="time-up">✗ Wrong (+${points})</p>`;
});

socket.on('leaderboard_update', (leaderboard) => {
    clearTimer();
    showScreen('leaderboardScreen');
    displayLeaderboard(leaderboard);
});

socket.on('game:finished', (data) => {
    clearTimer();
    showScreen('finalScreen');
    displayFinalLeaderboard(data.leaderboard);
});

socket.on('game:stopped', () => {
    clearTimer();
    showScreen('waitingScreen');
});

// Question Display
function displayQuestion(question) {
    const container = document.getElementById('questionContainer');
    container.innerHTML = '';
    
    // Question text
    const questionText = document.createElement('div');
    questionText.className = 'question-text';
    questionText.innerHTML = `<h3>${question.text}</h3>`;
    container.appendChild(questionText);
    
    // Code snippet (for 'code' type)
    if (question.codeSnippet) {
        const codeBlock = document.createElement('div');
        codeBlock.className = 'code-block';
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = 'language-cpp';
        code.textContent = question.codeSnippet;
        pre.appendChild(code);
        codeBlock.appendChild(pre);
        container.appendChild(codeBlock);
        // Trigger Prism highlighting
        if (window.Prism) {
            Prism.highlightElement(code);
        }
    }
    
    // Answer interface based on type
    const answerContainer = document.createElement('div');
    answerContainer.className = 'answer-container';
    
    if (question.type === 'mcq' || question.type === 'code') {
        answerContainer.innerHTML = createMcqInterface(question);
    } else if (question.type === 'match') {
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
            <button class="answer-btn mcq-btn" data-answer="${index}">
                <span class="option-letter">${letter}</span>
                <span class="option-text">${option}</span>
            </button>
        `;
    }).join('');
}

function createMatchInterface(question) {
    // Extract left and right items from matchMap
    const matchMap = question.matchMap || {};
    const leftItems = Object.keys(matchMap);
    const rightItems = Object.values(matchMap);
    
    // Create unique right items list
    const uniqueRightItems = [...new Set(rightItems)];
    
    let html = '<div class="match-container">';
    html += '<div class="match-column"><h4>Left</h4>';
    leftItems.forEach((item, index) => {
        html += `
            <div class="match-item" data-side="left" data-item="${item}">
                <span class="match-text">${item}</span>
                <span class="match-arrow">→</span>
                <span class="match-selected" data-left-item="${item}"></span>
            </div>
        `;
    });
    html += '</div>';
    
    html += '<div class="match-column"><h4>Right</h4>';
    uniqueRightItems.forEach((item, index) => {
        html += `
            <div class="match-item" data-side="right" data-item="${item}">
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
    
    // MCQ/Code answer
    if (e.target.closest('.mcq-btn')) {
        const btn = e.target.closest('.mcq-btn');
        const answer = parseInt(btn.dataset.answer);
        submitAnswer(answer);
        // Visual feedback
        document.querySelectorAll('.mcq-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    }
    
    // Match following - left item click
    if (e.target.closest('.match-item[data-side="left"]')) {
        const leftItem = e.target.closest('.match-item[data-side="left"]');
        const leftValue = leftItem.dataset.item;
        
        // Remove previous selection for this left item
        document.querySelectorAll('.match-item[data-side="right"]').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Highlight this left item
        document.querySelectorAll('.match-item[data-side="left"]').forEach(item => {
            item.classList.remove('active');
        });
        leftItem.classList.add('active');
        activeLeftItem = leftValue;
    }
    
    // Match following - right item click (after left is selected)
    if (e.target.closest('.match-item[data-side="right"]')) {
        if (!activeLeftItem) return;
        
        const rightItem = e.target.closest('.match-item[data-side="right"]');
        const rightValue = rightItem.dataset.item;
        
        // Update selected match display
        const selectedSpan = document.querySelector(`.match-selected[data-left-item="${activeLeftItem}"]`);
        selectedSpan.textContent = rightValue;
        selectedSpan.dataset.rightItem = rightValue;
        
        // Store the pair
        matchPairs[activeLeftItem] = rightValue;
        
        // Visual feedback with color coding
        const colorIndex = Object.keys(matchPairs).length - 1;
        const colors = ['#28a745', '#007acc', '#ffc107', '#dc3545', '#6f42c1', '#20c997'];
        const color = colors[colorIndex % colors.length];
        rightItem.style.borderColor = color;
        rightItem.style.backgroundColor = color + '20';
        document.querySelector(`.match-item[data-side="left"][data-item="${activeLeftItem}"]`).style.borderColor = color;
        
        // Reset active state
        document.querySelectorAll('.match-item[data-side="left"]').forEach(item => {
            item.classList.remove('active');
        });
        activeLeftItem = null;
    }
    
    // Submit match
    if (e.target.closest('.submit-match')) {
        if (Object.keys(matchPairs).length === 0) {
            alert('Please create at least one match');
            return;
        }
        submitAnswer(matchPairs);
    }
});

function submitAnswer(answerPayload) {
    if (hasAnswered) return;
    
    socket.emit('submit_answer', {
        q_id: currentQuestion.id,
        answerPayload: answerPayload
    });
    
    hasAnswered = true;
    document.getElementById('answerStatus').innerHTML = '<p class="answer-confirmed">✓ Answer submitted!</p>';
}

// Timer
function startTimer() {
    clearTimer();
    updateTimer();
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimer();
        if (timeRemaining <= 0) {
            clearTimer();
        }
    }, 1000);
}

function updateTimer() {
    const progress = (timeRemaining / totalTime) * 100;
    document.getElementById('timerProgress').style.width = `${progress}%`;
    document.getElementById('timerText').textContent = `${timeRemaining}s`;
    
    // Color coding - gradient from green to red
    const progressBar = document.getElementById('timerProgress');
    if (progress < 20) {
        progressBar.style.background = 'linear-gradient(90deg, #dc3545, #c82333)';
    } else if (progress < 50) {
        progressBar.style.background = 'linear-gradient(90deg, #ffc107, #ff9800)';
    } else {
        progressBar.style.background = 'linear-gradient(90deg, #28a745, #20c997)';
    }
}

function clearTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function showTimeUpOverlay() {
    const overlay = document.getElementById('timeUpOverlay');
    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 2000);
}

// Leaderboard
function displayLeaderboard(leaderboard) {
    const container = document.getElementById('leaderboardList');
    container.innerHTML = leaderboard.map((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        return `
            <div class="leaderboard-entry ${index < 3 ? 'top-three' : ''}">
                <span class="rank">${medal} #${entry.rank}</span>
                <span class="name">
                    <strong>${entry.name}</strong>
                    <span class="muted">(${entry.rollNumber || '-'})</span>
                </span>
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
                <span class="name">
                    <strong>${entry.name}</strong>
                    <span class="muted">(${entry.rollNumber || '-'})</span>
                </span>
                <span class="score">${entry.score} pts</span>
            </div>
        `;
    }).join('');
}
