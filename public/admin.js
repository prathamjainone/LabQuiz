const socket = io();
let currentQuiz = null;
let currentQuizId = null;
let uploadedImageUrl = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('serverUrl').textContent = window.location.origin;
    loadQuizzes();
    setupEventListeners();
    setupSocketListeners();
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
    document.getElementById('createQuizBtn').addEventListener('click', createQuiz);
    document.getElementById('loadQuizBtn').addEventListener('click', loadQuiz);
    document.getElementById('questionType').addEventListener('change', handleQuestionTypeChange);
    document.getElementById('addQuestionBtn').addEventListener('click', addQuestion);
    document.getElementById('startGameBtn').addEventListener('click', startGame);
    document.getElementById('pauseGameBtn').addEventListener('click', pauseGame);
    document.getElementById('resumeGameBtn').addEventListener('click', resumeGame);
    document.getElementById('questionImage').addEventListener('change', handleImageUpload);
    
    // MCQ options
    document.getElementById('addMcqOption').addEventListener('click', () => addMcqOption());
    document.getElementById('addMultiSelectOption').addEventListener('click', () => addMultiSelectOption());
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
    socket.on('admin:quiz_loaded', (data) => {
        currentQuiz = data.questions;
        displayQuestions();
        alert('Quiz loaded successfully!');
    });

    socket.on('admin:error', (data) => {
        alert('Error: ' + data.message);
    });

    socket.on('admin:state', (data) => {
        updateGameStatus(data);
    });

    socket.on('lobby:update', (data) => {
        updatePlayersList(data.players);
        document.getElementById('startGameBtn').disabled = data.players.length === 0 || currentQuiz === null || currentQuiz.length === 0;
    });

    socket.on('game:leaderboard_update', (data) => {
        updateLeaderboard(data.leaderboard);
    });

    socket.on('game:finished', (data) => {
        updateLeaderboard(data.leaderboard);
        alert('Game finished!');
        document.getElementById('startGameBtn').disabled = false;
        document.getElementById('pauseGameBtn').disabled = true;
        document.getElementById('resumeGameBtn').disabled = true;
    });
}

// Quiz Management
async function loadQuizzes() {
    try {
        const response = await fetch('/api/quizzes');
        const quizzes = await response.json();
        const select = document.getElementById('quizSelect');
        select.innerHTML = '<option value="">-- Select a Quiz --</option>';
        quizzes.forEach(quiz => {
            const option = document.createElement('option');
            option.value = quiz.id;
            option.textContent = quiz.name;
            select.appendChild(option);
        });
        if (quizzes.length > 0) {
            document.getElementById('quizListSection').style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading quizzes:', error);
    }
}

async function createQuiz() {
    const name = document.getElementById('quizName').value.trim();
    if (!name) {
        alert('Please enter a quiz name');
        return;
    }

    try {
        const response = await fetch('/api/quizzes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, questions: [] })
        });
        const quiz = await response.json();
        currentQuizId = quiz.id;
        currentQuiz = [];
        document.getElementById('questionBuilder').style.display = 'block';
        document.getElementById('questionsList').style.display = 'block';
        loadQuizzes();
    } catch (error) {
        console.error('Error creating quiz:', error);
        alert('Error creating quiz');
    }
}

async function loadQuiz() {
    const quizId = document.getElementById('quizSelect').value;
    if (!quizId) {
        alert('Please select a quiz');
        return;
    }

    currentQuizId = quizId;
    socket.emit('admin:load_quiz', { quizId });
}

// Question Type Handling
function handleQuestionTypeChange() {
    const type = document.getElementById('questionType').value;
    document.querySelectorAll('.question-type-fields').forEach(field => {
        field.style.display = 'none';
    });

    if (type === 'mcq') {
        document.getElementById('mcqFields').style.display = 'block';
        updateMcqCorrectOptions();
    } else if (type === 'multi_select') {
        document.getElementById('multiSelectFields').style.display = 'block';
    } else if (type === 'match_following') {
        document.getElementById('matchFields').style.display = 'block';
        updateMatchPairs();
    }
}

function addMcqOption() {
    const container = document.getElementById('mcqOptions');
    const div = document.createElement('div');
    div.className = 'option-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'option-input';
    input.placeholder = 'Option';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-option';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
        div.remove();
        updateMcqCorrectOptions();
    });
    
    div.appendChild(input);
    div.appendChild(removeBtn);
    container.appendChild(div);
    updateMcqCorrectOptions();
}

function addMultiSelectOption() {
    const container = document.getElementById('multiSelectOptions');
    const div = document.createElement('div');
    div.className = 'option-row';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'option-input';
    input.placeholder = 'Option';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'correct-checkbox';
    
    const label = document.createElement('label');
    label.textContent = 'Correct';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-option';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
        div.remove();
    });
    
    div.appendChild(input);
    div.appendChild(checkbox);
    div.appendChild(label);
    div.appendChild(removeBtn);
    container.appendChild(div);
}

function updateMcqCorrectOptions() {
    const select = document.getElementById('mcqCorrect');
    const options = Array.from(document.querySelectorAll('#mcqOptions .option-input'))
        .map((input, index) => ({ value: String.fromCharCode(65 + index), text: input.value || `Option ${String.fromCharCode(65 + index)}` }));
    
    select.innerHTML = '';
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
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

// Make function globally accessible for inline handlers (if any remain)
window.updateMatchPairs = updateMatchPairs;

function updateMatchPairs() {
    const leftItems = Array.from(document.querySelectorAll('#leftItems .match-input')).map(i => i.value);
    const rightItems = Array.from(document.querySelectorAll('#rightItems .match-input')).map(i => i.value);
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

// Image Upload
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        uploadedImageUrl = data.url;
        
        const preview = document.getElementById('imagePreview');
        preview.innerHTML = `<img src="${data.url}" alt="Preview" style="max-width: 300px; margin-top: 10px;">`;
    } catch (error) {
        console.error('Error uploading image:', error);
        alert('Error uploading image');
    }
}

// Add Question
async function addQuestion() {
    const type = document.getElementById('questionType').value;
    const questionText = document.getElementById('questionText').value.trim();
    const timer = parseInt(document.getElementById('questionTimer').value) || 30;
    const code = document.getElementById('questionCode').value.trim();

    if (!questionText) {
        alert('Please enter question text');
        return;
    }

    let questionData = {
        type,
        questionText,
        timer,
        code: code || undefined,
        image: uploadedImageUrl || undefined
    };

    if (type === 'mcq') {
        const options = Array.from(document.querySelectorAll('#mcqOptions .option-input'))
            .map(input => input.value.trim())
            .filter(v => v);
        const correctAnswer = document.getElementById('mcqCorrect').value;

        if (options.length < 2) {
            alert('Please add at least 2 options');
            return;
        }
        if (!correctAnswer) {
            alert('Please select correct answer');
            return;
        }

        questionData.options = options;
        questionData.correctAnswer = correctAnswer;
    } else if (type === 'multi_select') {
        const options = Array.from(document.querySelectorAll('#multiSelectOptions .option-row')).map(row => {
            const input = row.querySelector('.option-input');
            const checkbox = row.querySelector('.correct-checkbox');
            return {
                text: input.value.trim(),
                correct: checkbox.checked
            };
        }).filter(opt => opt.text);

        if (options.length < 2) {
            alert('Please add at least 2 options');
            return;
        }

        const correctAnswers = options.filter(opt => opt.correct).map(opt => opt.text);
        if (correctAnswers.length === 0) {
            alert('Please mark at least one option as correct');
            return;
        }

        questionData.options = options.map(opt => opt.text);
        questionData.correctAnswers = correctAnswers;
    } else if (type === 'match_following') {
        const leftItems = Array.from(document.querySelectorAll('#leftItems .match-input')).map(i => i.value.trim()).filter(v => v);
        const rightItems = Array.from(document.querySelectorAll('#rightItems .match-input')).map(i => i.value.trim()).filter(v => v);
        const matchSelects = Array.from(document.querySelectorAll('#matchPairs .match-select'));

        if (leftItems.length === 0 || rightItems.length === 0) {
            alert('Please add items to both columns');
            return;
        }

        const correctMap = {};
        matchSelects.forEach((select, index) => {
            const rightIndex = parseInt(select.value);
            if (rightIndex >= 0 && rightIndex < rightItems.length) {
                correctMap[leftItems[index]] = rightItems[rightIndex];
            }
        });

        if (Object.keys(correctMap).length === 0) {
            alert('Please create at least one match pair');
            return;
        }

        questionData.data = { left: leftItems, right: rightItems };
        questionData.correctMap = correctMap;
    }

    try {
        const response = await fetch(`/api/quizzes/${currentQuizId}/questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(questionData)
        });
        const question = await response.json();
        
        if (!currentQuiz) currentQuiz = [];
        currentQuiz.push(question);
        displayQuestions();
        
        // Reset form
        document.getElementById('questionText').value = '';
        document.getElementById('questionCode').value = '';
        document.getElementById('questionImage').value = '';
        document.getElementById('imagePreview').innerHTML = '';
        uploadedImageUrl = null;
        
        alert('Question added successfully!');
    } catch (error) {
        console.error('Error adding question:', error);
        alert('Error adding question');
    }
}

function displayQuestions() {
    const container = document.getElementById('questionsContainer');
    if (!currentQuiz || currentQuiz.length === 0) {
        container.innerHTML = '<p class="empty-state">No questions added yet</p>';
        return;
    }

    container.innerHTML = currentQuiz.map((q, index) => `
        <div class="question-card">
            <h4>Question ${index + 1}: ${q.type.toUpperCase()}</h4>
            <p>${q.questionText}</p>
            <p><small>Timer: ${q.timer}s</small></p>
        </div>
    `).join('');
}

// Game Control
function startGame() {
    if (!currentQuiz || currentQuiz.length === 0) {
        alert('Please load a quiz with questions first');
        return;
    }
    socket.emit('admin:start_game');
    document.getElementById('startGameBtn').disabled = true;
    document.getElementById('pauseGameBtn').disabled = false;
}

function pauseGame() {
    socket.emit('admin:pause_game');
    document.getElementById('pauseGameBtn').disabled = true;
    document.getElementById('resumeGameBtn').disabled = false;
}

function resumeGame() {
    socket.emit('admin:resume_game');
    document.getElementById('pauseGameBtn').disabled = false;
    document.getElementById('resumeGameBtn').disabled = true;
}

function updateGameStatus(data) {
    document.getElementById('statusText').textContent = data.status;
    document.getElementById('currentQuestion').textContent = data.currentQuestionIndex + 1;
    document.getElementById('totalQuestions').textContent = data.totalQuestions;
    document.getElementById('timeRemaining').textContent = data.timeRemaining;
}

function updatePlayersList(players) {
    const container = document.getElementById('playersList');
    if (players.length === 0) {
        container.innerHTML = '<p class="empty-state">No players joined yet</p>';
        return;
    }
    container.innerHTML = players.map(p => `
        <div class="player-item">
            <span>${p.nickname}</span>
            <span class="score">Score: ${p.score}</span>
        </div>
    `).join('');
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
            <span class="name">${p.nickname}</span>
            <span class="score">${p.score} pts</span>
        </div>
    `).join('');
}

// Request state update
setInterval(() => {
    socket.emit('admin:get_state');
}, 1000);

