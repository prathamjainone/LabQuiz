# Product Requirements Document (PRD)
**Project Name:** LabQuiz (LAN Edition)  
**Version:** 1.0 (MVP)  
**Type:** Real-time Offline Assessment Platform  
**Target Environment:** University Computer Lab (Local Area Network)

## 1. Executive Summary

**Objective:** Build a lightweight, offline-capable quiz platform where an Admin (Professor) can host real-time quizzes for 30-50 students connected via LAN.

**Key Differentiator:** Operates entirely without internet access, uses a "Server Authority" model to prevent cheating, and supports complex engineering question types (Code Snippets, Match the Following).

## 2. Tech Stack Requirements

- **Runtime:** Node.js (LTS) + Express.js
- **Real-Time Engine:** Socket.io (v4.x)
- **Database:** Local JSON File (Persistence) + In-Memory Objects (Active Session). No external SQL/Mongo required.
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (No Frameworks).
- **Libraries:**
  - `csv-parser`: For bulk uploading questions via Excel/CSV.
  - `multer`: For handling file uploads.
  - `prismjs`: For client-side syntax highlighting of code questions.

## 3. User Flows & Features

### 3.1 Authentication (Strict Session Control)

**Login:** Students join via `http://<SERVER_IP>:3000`.

**Input Fields:** Full Name and Roll Number.

**Validation Logic:**
- **Format Check:** Roll Number must match pattern (e.g., `^[0-9A-Z]+$`).
- **Uniqueness Check:** Server rejects login if the Roll Number is currently active in the session (prevents duplicate logins).
- **Reconnection:** If a student disconnects and reconnects with the same Roll Number, restore their previous score.

### 3.2 Admin Dashboard (The CMS)

**Question Management:**
- **Manual Entry:** Form to add Single Question (Type: MCQ / Code / Match).
- **Bulk Upload:** Upload a `.csv` file to replace/append the question bank.

**Game Control:**
- **Lobby View:** See list of connected students (Name + Roll No).
- **Flow Control:** "Start Game", "Next Question" (if manual), "Force Stop".
- **Timer Setting:** Input field to set duration (seconds) per question.

### 3.3 The Game Loop (Server Authority)

**State 1: Idle:** Students see "Waiting for Host".

**State 2: Question Broadcast:**
- Server emits `new_question` event.
- Client renders question + Starts CSS Progress Bar animation based on duration.

**State 3: Evaluation:**
- Server timer expires -> Emits `time_up`.
- Client disables all inputs immediately.

**State 4: Results:**
- Server calculates scores.
- Server emits `leaderboard_update` (Top 5 players).
- 5-second buffer pause before auto-starting next question.

## 4. Question Types & Scoring Logic

### 4.1 MCQ (Multiple Choice)
- **UI:** 4 Buttons.
- **Data:** `correctAnswer` is an index (0-3).
- **Scoring:** +10 points for exact match.

### 4.2 Code Snippet
- **UI:** Display text inside `<pre><code class="language-cpp">` block. Use Prism.js to highlight keywords.
- **Input:** 4 Buttons (Prediction of output).
- **Scoring:** +10 points for exact match.

### 4.3 Match The Following (Complex)
- **UI:** Two columns (Left and Right).
- **Interaction:** Click Left Item (Active State) -> Click Right Item (Paired State).
- **Visual:** Draw color connection or color code the pairs (e.g., Pair 1 is Green, Pair 2 is Blue).
- **Data Payload:** Client sends map: `{ "LeftA": "Right2", "LeftB": "Right1" }`.
- **Scoring (Partial Credit):**
  - Total for Question: 20 Points.
  - Formula: `(Correct Pairs / Total Pairs) * 20`.
  - Example: 2 out of 4 correct = 10 points.

## 5. Data Schema (JSON)

### 5.1 Question Object
```json
{
  "id": "uuid_v4",
  "type": "mcq" | "code" | "match",
  "text": "String",
  "timer": 30,
  "codeSnippet": "String (Raw code text)",
  "options": ["Option A", "Option B", "Option C", "Option D"], 
  "correctAnswer": 1, // Integer index for MCQ/Code
  "matchMap": { // Only for 'match' type
    "Left_Item_1": "Right_Item_A",
    "Left_Item_2": "Right_Item_B"
  }
}
```

### 5.2 CSV Upload Schema (Headers)
```
type, question, option1, option2, option3, option4, correctAnswer, timer, codeSnippet
```

## 6. API / Socket Event Contract

### Downstream (Server -> Client)
- `login_ack( { success: boolean, msg: string } )`
- `new_question( { id, type, text, options, codeSnippet, duration } )` Note: Never send the answer key.
- `time_up()`
- `leaderboard_update( [ { name, score, rank }, ... ] )`

### Upstream (Client -> Server)
- `join_request( { name, rollNumber } )`
- `submit_answer( { q_id, answerPayload } )`

## 7. UI/UX Guidelines ("The Vibe")

**Aesthetic:** "Cyber-Academic" Dark Mode.

**Colors:**
- Background: `#1e1e1e`
- Surface: `#252526`
- Primary Action: `#007acc` (Blue)
- Timer Bar: Gradient from Green to Red.

**Feedback:**
- Button Click: Instant visual state change (Active/Disabled).
- Time Up: Screen overlay "Time's Up!" with red tint.
