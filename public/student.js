const socket = io();
let currentQuestion = null;
let hasAnswered = false;
let timerInterval = null;
let totalTime = 0;
let timeRemaining = 0;
let matchPairs = {};
let activeLeftItem = null;
let currentRound = 1;
let playerStatus = 'active'; // active, spectator, eliminated

// Screen management
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Join functionality
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

// Socket Listeners
socket.on('login_ack', (data) => {
    if (data.success) {
        currentRound = data.round || 1;
        playerStatus = data.status || 'active';
        updateSidebar();

        if (playerStatus === 'spectator' || playerStatus === 'eliminated') {
            // If joining mid-game as spectator
            showScreen('gameScreen');
            updateStatusBadge();
            document.getElementById('questionContainer').innerHTML = '<div class="waiting-text"><h3>Spectating Mode</h3><p>Waiting for next question...</p></div>';
        } else {
            showScreen('waitingScreen');
        }
    } else {
        showError(data.msg);
    }
});

socket.on('round:started', (data) => {
    currentRound = data.round;
    updateSidebar();
    // If we were waiting (active), now we wait for question
    // If spectator, we just watch
});

socket.on('new_question', (question) => {
    currentQuestion = question;
    hasAnswered = false;
    currentRound = question.round || currentRound;
    totalTime = question.duration || 30;
    timeRemaining = totalTime;
    matchPairs = {};
    activeLeftItem = null;

    updateSidebar(); // Ensure round info matches
    showScreen('gameScreen');
    displayQuestion(question);

    // Only start timer and enable inputs if ACTIVE
    if (playerStatus === 'active') {
        startTimer();
        enableInputs();
        // Hide time up overlay if visible
        document.getElementById('timeUpOverlay').style.display = 'none';
    } else {
        // Spectator: Show question but disable inputs immediately
        disableInputs();
        document.getElementById('timerText').textContent = 'Spectating';
        document.getElementById('timerProgress').style.width = '100%';
        document.getElementById('timerProgress').style.background = '#6c757d';
    }
});

socket.on('time_up', () => {
    clearTimer();
    showTimeUpOverlay();
    disableInputs();

    // Submit any pending match answer if active
    if (playerStatus === 'active' && currentQuestion && currentQuestion.type === 'match' && Object.keys(matchPairs).length > 0) {
        submitAnswer(matchPairs);
    }
});

socket.on('answer_result', (data) => {
    // Show right/wrong + points
    const correct = !!data.correct;
    const points = Number.isFinite(data.points) ? data.points : 0;
    const sign = points >= 0 ? '+' : '';
    const colorClass = correct ? 'answer-confirmed' : 'time-up';

    let msg = correct ? '✓ Correct' : '✗ Wrong';
    if (points !== 0) msg += ` (${sign}${points} pts)`;

    // Bonus Feedback
    let extraMsg = '';
    if (data.speedBonus) extraMsg += '<br>⚡ SPEED BONUS!';
    if (data.firstBlood) extraMsg += '<br>🩸 FIRST BLOOD!';
    if (data.penalty) extraMsg += '<br>⚠️ NEGATIVE MARKING APPLIED';

    document.getElementById('answerStatus').innerHTML = `<p class="${colorClass}">${msg}${extraMsg}</p>`;
});

socket.on('round:status', (data) => {
    const { qualified, message, roundScore } = data;
    // Show overlay or modal
    if (!qualified) {
        playerStatus = 'spectator';
        alert(`❌ ROUND ENDED\n${message}\nYour Score: ${roundScore}`);
    } else {
        alert(`✅ ROUND ENDED\n${message}\nYour Score: ${roundScore}`);
    }
    updateStatusBadge();
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

// UI Updates
function updateSidebar() {
    document.getElementById('roundTitle').textContent = `Round ${currentRound}`;
    const rulesList = document.getElementById('roundRules');
    rulesList.innerHTML = '';

    const rules = [
        { label: 'Correct Answer', val: '+1 Point' }
    ];

    if (currentRound === 1) {
        rules.push({ label: '⚡ Speed Bonus', val: '+2 Pts (First 5s)' });
        rules.push({ label: '🎯 Target', val: '50% Score to Qualify' });
    } else if (currentRound === 2) {
        rules.push({ label: '🩸 First Blood', val: '+3 Pts (1st Global)' });
        rules.push({ label: '🎯 Target', val: '50% Score to Qualify' });
    } else if (currentRound === 3) {
        rules.push({ label: '⚠️ Negative Marking', val: '-2 Pts for Wrong' });
        rules.push({ label: '🏆 Goal', val: 'Highest Score Wins' });
    }

    rules.forEach(r => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${r.label}</strong>${r.val}`;
        rulesList.appendChild(li);
    });

    updateStatusBadge();
}

function updateStatusBadge() {
    const badge = document.getElementById('playerStatusBadge');
    badge.textContent = playerStatus.toUpperCase();
    badge.className = 'badge';
    if (playerStatus === 'active') badge.classList.add('badge-success');
    else if (playerStatus === 'spectator') badge.classList.add('badge-spectator');
    else badge.classList.add('badge-danger');
}

// Question Display
function displayQuestion(question) {
    const container = document.getElementById('questionContainer');
    container.innerHTML = '';

    if (question.currentQuestion && question.totalQuestions) {
        document.getElementById('questionNumber').textContent = `Question ${question.currentQuestion} of ${question.totalQuestions}`;
    }

    const questionText = document.createElement('div');
    questionText.className = 'question-text';
    questionText.innerHTML = `<h3>${question.text}</h3>`;
    container.appendChild(questionText);

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
        if (window.Prism) Prism.highlightElement(code);
    }

    const answerContainer = document.createElement('div');
    answerContainer.className = 'answer-container';

    if (question.type === 'mcq' || question.type === 'code') {
        answerContainer.innerHTML = createMcqInterface(question);
    } else if (question.type === 'match') {
        answerContainer.innerHTML = createMatchInterface(question);
    }

    container.appendChild(answerContainer);
    document.getElementById('answerStatus').innerHTML = '';
}

function createMcqInterface(question) {
    const options = question.options || [];
    return options.map((option, index) => {
        const letter = String.fromCharCode(65 + index);
        // Escape HTML tags to prevent invisible options (e.g. <a>, <p>)
        const displayOpt = option.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return `
            <button class="answer-btn mcq-btn" data-answer="${index}">
                <span class="option-letter">${letter}</span>
                <span class="option-text">${displayOpt}</span>
            </button>
        `;
    }).join('');
}

function createMatchInterface(question) {
    const matchMap = question.matchMap || {};
    const leftItems = Object.keys(matchMap);
    const rightItems = Object.values(matchMap);
    const uniqueRightItems = [...new Set(rightItems)]; // Show unique options? Or all? Usually scrambled.
    // For simplicity, showing unique values if multiple left map to same right.
    // Ideally right side should be shuffled.

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

function disableInputs() {
    document.querySelectorAll('button, input, select').forEach(el => {
        el.disabled = true;
    });
}

function enableInputs() {
    document.querySelectorAll('button, input, select').forEach(el => {
        el.disabled = false;
    });
}

// Answer handling
document.addEventListener('click', (e) => {
    // Global check: if spectator or answered, ignore
    if (playerStatus !== 'active' || hasAnswered || !currentQuestion) return;

    // MCQ/Code answer
    if (e.target.closest('.mcq-btn')) {
        const btn = e.target.closest('.mcq-btn');
        const answer = parseInt(btn.dataset.answer);
        submitAnswer(answer);
        document.querySelectorAll('.mcq-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    }

    // Match logic (omitted details for brevity, assumed same as before but respecting disableInputs)
    // Left item click
    if (e.target.closest('.match-item[data-side="left"]')) {
        const leftItem = e.target.closest('.match-item[data-side="left"]');
        const leftValue = leftItem.dataset.item;
        document.querySelectorAll('.match-item[data-side="right"]').forEach(item => item.classList.remove('selected'));
        document.querySelectorAll('.match-item[data-side="left"]').forEach(item => item.classList.remove('active'));
        leftItem.classList.add('active');
        activeLeftItem = leftValue;
    }

    // Right item click
    if (e.target.closest('.match-item[data-side="right"]')) {
        if (!activeLeftItem) return;
        const rightItem = e.target.closest('.match-item[data-side="right"]');
        const rightValue = rightItem.dataset.item;

        const selectedSpan = document.querySelector(`.match-selected[data-left-item="${activeLeftItem}"]`);
        selectedSpan.textContent = rightValue;
        selectedSpan.dataset.rightItem = rightValue;
        matchPairs[activeLeftItem] = rightValue;

        // Visuals
        rightItem.style.backgroundColor = '#007acc20';
        document.querySelector(`.match-item[data-side="left"][data-item="${activeLeftItem}"]`).style.borderColor = '#007acc';

        document.querySelectorAll('.match-item[data-side="left"]').forEach(item => item.classList.remove('active'));
        activeLeftItem = null;
    }

    if (e.target.closest('.submit-match')) {
        if (Object.keys(matchPairs).length === 0) {
            alert('Please create at least one match');
            return;
        }
        submitAnswer(matchPairs);
    }
});

function submitAnswer(answerPayload) {
    if (playerStatus !== 'active') return;
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
    if (playerStatus === 'active') { // Only show time up loud if they were playing
        const overlay = document.getElementById('timeUpOverlay');
        overlay.style.display = 'flex';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 2000);
    }
}

// Leaderboards
function displayLeaderboard(leaderboard) {
    const container = document.getElementById('leaderboardList');
    container.innerHTML = leaderboard.map((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
        const statusBadge = entry.status === 'active' ? '' : ' <small style="color:red">(Eliminated)</small>';
        return `
            <div class="leaderboard-entry ${index < 3 ? 'top-three' : ''}">
                <span class="rank">${medal} #${entry.rank}</span>
                <span class="name">
                    <strong>${entry.name}</strong>${statusBadge}
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
