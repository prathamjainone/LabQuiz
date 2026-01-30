# Product Requirements Document (PRD) v2.0
**Project Name:** LabQuiz (LAN Edition) - Tournament Update
**Version:** 2.0
**Type:** 3-Round Elimination Tournament

## 1. Executive Summary
**Objective:** Transform the standard quiz into a high-stakes, 3-round elimination tournament.
**Core Loop:** Admin uploads a master question bank containing 3 levels. Players compete to survive each round.
**Key Change:** Only qualified players advance to the next round. Eliminated players become spectators.

## 2. Tournament Structure & Rules

### **Round 1: "The Sprint"**
- **Content:** 10 Questions.
- **Duration:** Speed-focused (e.g., 30s/question).
- **Qualification:** Must score **≥ 50%** of Round 1 points to advance.
- **Scoring Rules:**
  - **Correct Answer:** +1 Point.
  - **Speed Bonus (Per Question):** If answered correctly within the **first 5 seconds**, award **+2 Points** (Total 3).
  - *Note:* The speed bonus applies to every single question in this round independently.

### **Round 2: "The Clash"**
- **Content:** 15 Questions.
- **Duration:** Moderate (e.g., 45s/question).
- **Qualification:** Must score **≥ 50%** of Round 2 points to advance.
- **Scoring Rules:**
  - **Correct Answer:** +1 Point.
  - **First Blood Bonus (Per Question):** The **very first player globally** to answer a specific question correctly gets **+3 Points** (Total 4).
  - *Note:* This bonus resets for every question. Only one person gets it per question.

### **Round 3: "The Deep Dive"** (Finals)
- **Content:** 5 Questions.
- **Duration:** Long form (e.g., 3-5 mins/question).
- **Qualification:** N/A (Final Round).
- **Scoring Rules:**
  - **Correct Answer:** +1 Point.
  - **Negative Marking:** Incorrect answer results in **-2 Points**.

## 3. New User Flows

### 3.1 The "Rules Sidebar"
Instead of a toggle, a **persistent sidebar** (or collapsible drawer) displays the active rules for the current round.
- **Example Text:** 
  > **ROUND 1 ACTIVE**
  > ⚡ **Speed Bonus:** Answer in < 5s for +2 pts!
  > 🎯 **Goal:** Score 50% to Qualify.

### 3.2 Elimination & Spectating
- **End of Round:** Server calculates scores.
- **Qualified:** Student sees "Round X Complete! You Qualified! Waiting for next round..."
- **Eliminated:** Student sees "You did not reach the cutoff. You are now a Spectator."
- **Spectator UI:** Can see the current question and live leaderboard but **cannot submit answers**.

### 3.3 Admin Dashboard Updates
- **CSV Upload:** Support a single CSV file with a `level` column (1, 2, or 3).
- **Stage Control:** Buttons to "Start Round 1", "Start Round 2", "Start Round 3".
- **Leaderboard:** View Qualified vs Eliminated counts.

## 4. Data Schema Updates

### 4.1 CSV Format
**New Column:** `level`
```csv
level, type, question, option1, option2, option3, option4, correctAnswer, timer, codeSnippet
1, mcq, "Easy Q", A, B, C, D, 1, 30,
1, mcq, "Fast Q", A, B, C, D, 2, 30,
2, code, "Medium Q", 1, 2, 3, 4, 1, 45, "console.log(x)"
3, match, "Hard Q",,,, 0, 180,
```

### 4.2 Game State Tracking
- `currentRound` (1, 2, 3)
- `playerState`: Map of `socketId` -> `{ status: 'active' | 'eliminated' | 'spectator' }`

## 5. Implementation Plan (Tech Stack preserved)
- **Backend:** Node.js + Socket.io (Modify `gameState` and scoring functions).
- **Frontend:** Vanilla JS (Update UI to show Sidebar and Spectator view).
- **Logic:**
  - Implement `calculateScore()` switch case based on `currentRound`.
  - Implement `checkQualification()` at the end of rounds.
