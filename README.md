# LabQuiz - LAN-Based Real-Time Assessment Platform

A robust, offline-capable, real-time quiz platform designed for university laboratory LAN environments. This system eliminates the need for internet connectivity, ensuring low-latency gameplay for 30-50 simultaneous users.

## Features

### Admin Dashboard (CMS)
- **Dynamic Question Creation**: Support for MCQ, Multi-Select, and Match the Following question types
- **Timer Control**: Set specific duration (in seconds) for each question
- **Content Support**: 
  - Code snippets with syntax highlighting
  - Image uploads for diagrams (UML/Topologies)
- **Session Control**: Lobby view to see joined students, Start/Pause/Resume game controls
- **User Management**: Kick users from the game

### Student Interface
- **No Login Required**: Simple nickname entry
- **Real-Time Updates**: Instant synchronization with server state
- **Visual Timer**: CSS progress bar that syncs with question duration
- **Code Rendering**: Syntax-highlighted code display using Prism.js
- **Match UI**: Click-to-match interface (two columns) for compatibility with older lab PCs
- **Leaderboard**: Real-time score updates between questions

### Game Engine
- **Automated Question Loop**: Server broadcasts questions, manages timers, and auto-advances
- **Scoring Logic**:
  - MCQ: +10 for correct, 0 for wrong
  - Match: Partial marking (points per correct pair)
  - Multi-Select: Partial credit for partially correct answers
- **State Management**: Server is the source of truth for all game state

## Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```

3. **Access the Application**
   - Admin Dashboard: `http://localhost:3000/admin`
   - Student Interface: `http://localhost:3000`
   - For LAN access, use your local IP: `http://192.168.1.50:3000` (replace with your actual IP)

## Usage

### For Administrators

1. **Create a Quiz**
   - Navigate to the Admin Dashboard
   - Enter a quiz name and click "Create Quiz"
   - Select question type (MCQ, Multi-Select, or Match the Following)
   - Fill in question details:
     - Question text
     - Timer duration
     - Options/items (depending on question type)
     - Correct answer(s)
     - Optional: Code snippet or image
   - Click "Add Question" to save

2. **Start a Game**
   - Switch to the "Game Control" tab
   - Wait for students to join (they'll appear in the lobby)
   - Click "Start Game" to begin
   - Use "Pause" and "Resume" buttons as needed

### For Students

1. **Join the Game**
   - Open the student interface URL
   - Enter a nickname
   - Click "Join Game"

2. **Answer Questions**
   - Wait for questions to appear
   - Select your answer(s)
   - For Match the Following: Click a left item, then click its match on the right
   - Answers are submitted automatically (MCQ) or via Submit button (Multi-Select/Match)

## Technical Stack

- **Runtime**: Node.js
- **Communication**: Socket.io (real-time WebSocket)
- **Database**: JSON file storage (no complex setup required)
- **Frontend**: Vanilla HTML/JS/CSS (lightweight, no build steps)
- **Code Display**: Prism.js for syntax highlighting

## Project Structure

```
.
├── server.js          # Main server file with Socket.io logic
├── package.json       # Dependencies and scripts
├── data/              # JSON file storage (created automatically)
├── uploads/           # Uploaded images (created automatically)
└── public/            # Frontend files
    ├── index.html     # Student interface
    ├── admin.html     # Admin dashboard
    ├── student.js     # Student client logic
    ├── admin.js       # Admin client logic
    └── styles.css     # Shared styles
```

## Data Models

### Question Object
```json
{
  "id": "uuid_v4",
  "type": "match_following",
  "questionText": "Match the OOP Concept to its Definition",
  "timer": 45,
  "code": "optional code snippet",
  "image": "optional image URL",
  "data": {
    "left": ["Polymorphism", "Encapsulation"],
    "right": ["Many Forms", "Data Hiding"]
  },
  "correctMap": {
    "Polymorphism": "Many Forms",
    "Encapsulation": "Data Hiding"
  }
}
```

## Success Metrics

- **Latency**: < 100ms response time on LAN
- **Concurrency**: Stable with 50+ clients connected
- **Usability**: Admin can create a 10-question quiz in under 5 minutes

## License

ISC

