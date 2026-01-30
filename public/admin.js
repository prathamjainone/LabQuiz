const socket = io();
let currentQuestions = [];
let isAdminAuthed = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('serverUrl').textContent = window.location.origin;
    setupEventListeners();
    setupSocketListeners();
    // Load questions silently on startup (no alert)
    loadQuestionsSilent();
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// Event Listeners
function setupEventListeners() {
    document.getElementById('uploadCsvBtn').addEventListener('click', uploadCSV);
    document.getElementById('questionType').addEventListener('change', handleQuestionTypeChange);
    document.getElementById('addQuestionBtn').addEventListener('click', addQuestion);

    // Round Buttons
    document.getElementById('startRound1Btn').addEventListener('click', () => startRound(1));
    document.getElementById('startRound2Btn').addEventListener('click', () => startRound(2));
    document.getElementById('startRound3Btn').addEventListener('click', () => startRound(3));

    document.getElementById('nextQuestionBtn').addEventListener('click', nextQuestion);
    document.getElementById('forceStopBtn').addEventListener('click', forceStop);
    document.getElementById('downloadLeaderboardBtn').addEventListener('click', downloadLeaderboard);
    document.getElementById('adminLoginBtn').addEventListener('click', adminLogin);

    // MCQ options
    document.getElementById('addLeftItem').addEventListener('click', () => addMatchItem('left'));
    document.getElementById('addRightItem').addEventListener('click', () => addMatchItem('right'));

    // Update MCQ correct answer dropdown when options change
    document.getElementById('mcqOptions').addEventListener('input', updateMcqCorrectOptions);

    // Event delegation for match input changes
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('match-input')) {
            updateMatchPairs();
        }
    });
}

function setupSocketListeners() {
    socket.on('admin:questions_loaded', (data) => {
        currentQuestions = data.questions;
        displayQuestions();
        if (currentQuestions.length > 0) setStatus(`Loaded ${currentQuestions.length} question(s).`, 'success', 2500);
        updateStartButtons();
    });

    socket.on('admin:error', (data) => {
        setStatus(data.message || 'Admin error', 'error', 4000);
    });

    socket.on('admin:auth_result', (data) => {
        if (data.success) {
            isAdminAuthed = true;
            document.getElementById('adminAuthModal').style.display = 'none';
            setStatus('Admin unlocked.', 'success', 2000);
            document.getElementById('downloadLeaderboardBtn').disabled = false;
            // load questions into server state once authenticated (if any exist)
            if (currentQuestions.length > 0) socket.emit('admin:load_questions');
        } else {
            showAdminAuthError(data.message || 'Invalid PIN');
        }
    });

    socket.on('admin:state', (data) => {
        updateGameStatus(data);
    });

    socket.on('lobby:update', (data) => {
        updatePlayersList(data.players);
    });

    socket.on('leaderboard_update', (data) => {
        updateLeaderboard(data);
    });

    socket.on('admin:question_progress', (data) => {
        // ensures question number updates instantly even if polling lags
        document.getElementById('currentQuestion').textContent = data.currentQuestionIndex + 1;
        document.getElementById('totalQuestions').textContent = data.totalQuestions;
    });
}

function updateStartButtons() {
    const hasQuestions = currentQuestions.length > 0;
    document.getElementById('startRound1Btn').disabled = !hasQuestions;
    document.getElementById('startRound2Btn').disabled = !hasQuestions;
    document.getElementById('startRound3Btn').disabled = !hasQuestions;
}

function setStatus(message, type = 'info', autoHideMs = 0) {
    const bar = document.getElementById('adminStatusBar');
    bar.textContent = message;
    bar.className = `status-message ${type}`;
    bar.style.display = 'block';
    if (autoHideMs > 0) {
        setTimeout(() => {
            bar.style.display = 'none';
        }, autoHideMs);
    }
}

function showAdminAuthError(message) {
    const el = document.getElementById('adminAuthError');
    el.textContent = message;
    el.style.display = 'block';
}

function adminLogin() {
    const pin = document.getElementById('adminPinInput').value;
    document.getElementById('adminAuthError').style.display = 'none';
    socket.emit('admin:auth', { pin });
}

// CSV Upload
async function uploadCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a CSV file');
        return;
    }

    const formData = new FormData();
    formData.append('csv', file);
    const mode = document.querySelector('input[name="uploadMode"]:checked').value;
    formData.append('mode', mode);

    const statusEl = document.getElementById('csvUploadStatus');
    statusEl.textContent = 'Uploading...';
    statusEl.className = 'status-message info';

    try {
        const response = await fetch('/api/questions/upload-csv', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();

        if (data.success) {
            statusEl.textContent = `Success! Uploaded ${data.count} questions.`;
            statusEl.className = 'status-message success';
            fileInput.value = '';
            loadQuestions();
        } else {
            statusEl.textContent = 'Upload failed: ' + (data.error || 'Unknown error');
            statusEl.className = 'status-message error';
        }
    } catch (error) {
        console.error('Error uploading CSV:', error);
        statusEl.textContent = 'Error uploading CSV file';
        statusEl.className = 'status-message error';
    }
}

// Load Questions (with alert)
async function loadQuestions() {
    try {
        const response = await fetch('/api/questions');
        currentQuestions = await response.json();
        displayQuestions();
        updateStartButtons();

        // Also load questions into server's game state
        if (isAdminAuthed && currentQuestions.length > 0) socket.emit('admin:load_questions');
    } catch (error) {
        console.error('Error loading questions:', error);
        setStatus('Failed to load questions.', 'error', 3000);
    }
}

// Load Questions silently (no alert) - for initial load
async function loadQuestionsSilent() {
    try {
        const response = await fetch('/api/questions');
        currentQuestions = await response.json();
        displayQuestions();
        updateStartButtons();

        // Only load into server if there are questions
        if (isAdminAuthed && currentQuestions.length > 0) {
            socket.emit('admin:load_questions');
        }
    } catch (error) {
        console.error('Error loading questions:', error);
    }
}

// Question Type Handling
function handleQuestionTypeChange() {
    const type = document.getElementById('questionType').value;
    document.querySelectorAll('.question-type-fields').forEach(field => {
        field.style.display = 'none';
    });

    if (type === 'mcq' || type === 'code') {
        document.getElementById('mcqFields').style.display = 'block';
        if (type === 'code') {
            document.getElementById('codeFields').style.display = 'block';
        }
        updateMcqCorrectOptions();
    } else if (type === 'match') {
        document.getElementById('matchFields').style.display = 'block';
        updateMatchPairs();
    }
}

function updateMcqCorrectOptions() {
    const select = document.getElementById('mcqCorrect');
    const options = Array.from(document.querySelectorAll('#mcqOptions .option-input'))
        .map((input, index) => ({ value: index, text: input.value || `Option ${String.fromCharCode(65 + index)}` }));

    select.innerHTML = '';
    options.forEach((opt, index) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = `${String.fromCharCode(65 + index)} (Index ${opt.value})`;
        select.appendChild(option);
    });
}

function addMatchItem(side) {
    const container = side === 'left' ? document.getElementById('leftItems') : document.getElementById('rightItems');
    const div = document.createElement('div');
    div.className = 'match-item-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'match-input';
    input.placeholder = side === 'left' ? 'Left item' : 'Right item';
    input.addEventListener('input', updateMatchPairs);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-item';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
        div.remove();
        updateMatchPairs();
    });

    div.appendChild(input);
    div.appendChild(removeBtn);
    container.appendChild(div);
    updateMatchPairs();
}

window.updateMatchPairs = updateMatchPairs;

function updateMatchPairs() {
    const leftItems = Array.from(document.querySelectorAll('#leftItems .match-input')).map(i => i.value).filter(v => v);
    const rightItems = Array.from(document.querySelectorAll('#rightItems .match-input')).map(i => i.value).filter(v => v);
    const container = document.getElementById('matchPairs');

    container.innerHTML = '';

    leftItems.forEach((left, leftIndex) => {
        if (!left) return;
        const div = document.createElement('div');
        div.className = 'match-pair-row';
        div.innerHTML = `
            <span>${left}</span>
            <select class="match-select" data-left-index="${leftIndex}">
                <option value="">-- Select Match --</option>
                ${rightItems.map((right, rightIndex) =>
            `<option value="${rightIndex}">${right}</option>`
        ).join('')}
            </select>
        `;
        container.appendChild(div);
    });
}

// Add Question
async function addQuestion() {
    const type = document.getElementById('questionType').value;
    const text = document.getElementById('questionText').value.trim();
    const timer = parseInt(document.getElementById('questionTimer').value) || 30;

    if (!text) {
        setStatus('Please enter question text.', 'error', 2500);
        return;
    }

    // Default to Level 1 if added manually, or add field. For now default 1.
    let questionData = {
        level: 1,
        type,
        text,
        timer
    };

    if (type === 'mcq' || type === 'code') {
        const options = Array.from(document.querySelectorAll('#mcqOptions .option-input'))
            .map(input => input.value.trim())
            .filter(v => v);
        const correctAnswer = parseInt(document.getElementById('mcqCorrect').value);

        if (options.length !== 4) {
            setStatus('Please provide exactly 4 options.', 'error', 3000);
            return;
        }
        if (isNaN(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) {
            alert('Please select a valid correct answer');
            return;
        }

        questionData.options = options;
        questionData.correctAnswer = correctAnswer;

        if (type === 'code') {
            const codeSnippet = document.getElementById('codeSnippet').value.trim();
            if (!codeSnippet) {
                setStatus('Please enter code snippet.', 'error', 3000);
                return;
            }
            questionData.codeSnippet = codeSnippet;
        }
    } else if (type === 'match') {
        const leftItems = Array.from(document.querySelectorAll('#leftItems .match-input')).map(i => i.value.trim()).filter(v => v);
        const rightItems = Array.from(document.querySelectorAll('#rightItems .match-input')).map(i => i.value.trim()).filter(v => v);
        const matchSelects = Array.from(document.querySelectorAll('#matchPairs .match-select'));

        if (leftItems.length === 0 || rightItems.length === 0) {
            setStatus('Please add items to both columns.', 'error', 3000);
            return;
        }

        const matchMap = {};
        matchSelects.forEach((select, index) => {
            const rightIndex = parseInt(select.value);
            if (rightIndex >= 0 && rightIndex < rightItems.length) {
                matchMap[leftItems[index]] = rightItems[rightIndex];
            }
        });

        if (Object.keys(matchMap).length === 0) {
            setStatus('Please create at least one match pair.', 'error', 3000);
            return;
        }

        questionData.matchMap = matchMap;
    }

    try {
        const response = await fetch('/api/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(questionData)
        });
        const question = await response.json();

        currentQuestions.push(question);
        displayQuestions();

        // Reset form
        document.getElementById('questionText').value = '';
        if (document.getElementById('codeSnippet')) document.getElementById('codeSnippet').value = '';
        document.getElementById('questionTimer').value = '30';
        document.querySelectorAll('.match-input').forEach(input => {
            const row = input.closest('.match-item-row');
            if (row && row !== row.parentElement.firstElementChild) {
                row.remove();
            } else {
                input.value = '';
            }
        });
        updateMatchPairs();

        setStatus('Question added (Level 1 default).', 'success', 2000);
        // auto-sync server after adding (if authed)
        if (isAdminAuthed) socket.emit('admin:load_questions');
    } catch (error) {
        console.error('Error adding question:', error);
        setStatus('Error adding question.', 'error', 3000);
    }
}

function displayQuestions() {
    const container = document.getElementById('questionsList');
    if (!currentQuestions || currentQuestions.length === 0) {
        container.innerHTML = '<p class="empty-state">No questions available</p>';
        return;
    }

    container.innerHTML = currentQuestions.map((q, index) => `
        <div class="question-card">
            <h4>#${index + 1} (L${q.level || 1}): ${q.type.toUpperCase()}</h4>
            <p>${q.text}</p>
            <p><small>Timer: ${q.timer}s</small></p>
        </div>
    `).join('');
}

// Game Control
function startRound(round) {
    if (!isAdminAuthed) {
        setStatus('Admin locked. Please login first.', 'error', 3000);
        return;
    }

    // Load questions into server (in case they weren't loaded yet)
    socket.emit('admin:load_questions');

    // Small delay to ensure questions are loaded on server
    setTimeout(() => {
        socket.emit('admin:start_round', { round: round });
        updateStartButtons(); // can also disable them
        document.getElementById('nextQuestionBtn').disabled = false;
        document.getElementById('forceStopBtn').disabled = false;
        setStatus(`Starting Round ${round}...`, 'success', 2000);
    }, 100);
}

function nextQuestion() {
    socket.emit('admin:next_question');
}

function forceStop() {
    if (confirm('Are you sure you want to force stop the game?')) {
        socket.emit('admin:force_stop');
        document.getElementById('nextQuestionBtn').disabled = true;
        document.getElementById('forceStopBtn').disabled = true;
        setStatus('Game stopped.', 'info', 2000);
    }
}

function updateGameStatus(data) {
    document.getElementById('statusText').textContent = `${data.status} (R${data.currentRound})`;
    document.getElementById('currentQuestion').textContent = data.currentQuestionIndex + 1;
    document.getElementById('totalQuestions').textContent = data.totalQuestions;
    document.getElementById('timeRemaining').textContent = data.timeRemaining;

    const isPlaying = data.status === 'playing';
    document.getElementById('startRound1Btn').disabled = isPlaying;
    document.getElementById('startRound2Btn').disabled = isPlaying;
    document.getElementById('startRound3Btn').disabled = isPlaying;
    document.getElementById('nextQuestionBtn').disabled = !isPlaying;
    document.getElementById('forceStopBtn').disabled = !isPlaying;
}

function updatePlayersList(players) {
    const container = document.getElementById('playersList');
    if (players.length === 0) {
        container.innerHTML = '<p class="empty-state">No players joined yet</p>';
        return;
    }
    container.innerHTML = players.map(p => {
        const badgeClass = p.status === 'active' ? 'badge-success' : 'badge-danger';
        const badgeText = p.status === 'active' ? 'Active' : (p.status === 'spectator' ? 'Spectator' : 'Eliminated');
        return `
        <div class="player-item">
            <span>
                <strong>${p.name}</strong> (${p.rollNumber})
                <span class="badge ${badgeClass}" style="margin-left:5px; font-size:0.8em; padding:2px 5px; border-radius:4px; background:#444;">${badgeText}</span>
            </span>
            <span class="score">Score: ${p.score}</span>
        </div>
    `}).join('');
}

function updateLeaderboard(leaderboard) {
    const container = document.getElementById('leaderboard');
    if (leaderboard.length === 0) {
        container.innerHTML = '<p class="empty-state">No scores yet</p>';
        return;
    }
    container.innerHTML = leaderboard.map(p => `
        <div class="leaderboard-item">
            <span class="rank">#${p.rank}</span>
            <span class="name">
                <strong>${p.name}</strong>
                <span class="muted">(${p.rollNumber || '-'})</span>
            </span>
            <span class="score">${p.score} pts</span>
        </div>
    `).join('');
}

function downloadLeaderboard() {
    // downloads the latest leaderboard snapshot from server
    window.location.href = '/api/leaderboard.csv';
}

// Request state update
setInterval(() => {
    socket.emit('admin:get_state');
}, 1000);
