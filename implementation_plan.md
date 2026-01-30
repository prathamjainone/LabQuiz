# Implementation Plan - Logic & UI Refinement

## Goal
Fix logic gaps allowing premature Round start, resolve UI visibility bugs (black text), and enhance feedback messages.

## User Review Required
> [!IMPORTANT]
> I will enforce that Round 2 cannot start until Round 1 is "Completed". This restricts testing flexibility slightly but ensures game integrity.

## Proposed Changes

### Backend
#### [MODIFY] [server.js](file:///c:/Users/jains/OneDrive/Desktop/Offline%20edugame/server.js)
- `admin:start_round` handler: Add check `if (round > gameState.currentRound + 1) return error`.
- Actually, allow re-playing rounds, but force sequential progress for the first run? User said "directly start round 2 without even round 1 done".
- I'll add a flag `gameState.roundsCompleted` or check `gameState.currentRound`.
- Logic:
    - Start R1: Always allowed.
    - Start R2: Allowed ONLY if R1 finished OR (Dev mode override? No). Allowed if `questions` for R2 exist?
    - User wants restriction. I'll check `if (requestedRound > 1 && !roundStatus[requestedRound-1].completed)`.

### Frontend
#### [MODIFY] [public/student.js](file:///c:/Users/jains/OneDrive/Desktop/Offline%20edugame/public/student.js)
- `socket.on('answer_result')`: Handle `bonus` fields (`speed`, `first_blood`) and populate alert text.
- HTML Escaping: When rendering options, use `.textContent` or simple replace logic to prevent `<` being interpreted as HTML tags (which might be why they are invisible/black).
    - The CSV question "Which tag is used for a link?" has options `<p>`, `<a>`. If rendered as innerHTML, browser hides them!

#### [MODIFY] [public/styles.css](file:///c:/Users/jains/OneDrive/Desktop/Offline%20edugame/public/styles.css)
- `mcq-btn`: Ensure `color: #fff`. The user said "options are all black" -> might be default browser stylesheet making definition list or something black? Or simply invisible due to HTML parsing.
- UI Polish:
    - Add `background: linear-gradient(135deg, #1e1e1e, #2a2a2a)` to body.
    - Glassmorphism on cards?
    - Better button gradients.

## Verification
- Start Server.
- Upload CSV.
- Try clicking "Start Round 2" immediately. Expect Error.
- Play "HTML Tag" question. Expect visible `<a>`.
- Score points. Expect "Speed Bonus!" popup.
