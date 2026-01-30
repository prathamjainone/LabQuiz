# Tournament Update (v2.0) Walkthrough

We have successfully transformed LabQuiz into a **3-Round Elimination Tournament** platform! Here is what changed and how to use it.

## 1. New Game Structure

| Round | Name | Rules | Qualification |
| :--- | :--- | :--- | :--- |
| **Round 1** | The Sprint | +1 Correct<br>+2 Speed Bonus (<5s) | Top 50% advance to Round 2 |
| **Round 2** | The Clash | +1 Correct<br>+3 "First Blood" (Global 1st) | Top 50% advance to Round 3 |
| **Round 3** | Deep Dive | +1 Correct<br>-2 Negative Marking | Winner determined by highest score |

## 2. Admin Dashboard Changes
- **Round Controls:** Instead of a single "Start Game" button, you now have:
  - `Start Round 1`: Resets scores for everyone, starts clean.
  - `Start Round 2`: Only allows qualified players to play. Others become Spectators.
  - `Start Round 3`: The Final Showdown.
- **CSV Upload:** Format slightly updated to optional support `level` (default is 1).
  - `level, type, question, option1, option2, option3, option4, correct, timer, codeSnippet`

## 3. Student Interface Updates
- **Rules Sidebar:** A persistent sidebar now shows the current Round's name and its specific rules (e.g., "Speed Bonus Active").
- **Spectator Mode:** If a player is eliminated or joins late (during R2/R3), they enter **Spectator Mode**.
  - They can see the question.
  - They see "Spectating" instead of the timer.
  - Their inputs are disabled.
- **Feedback:** Score popups now explicitly show bonuses (e.g., `✓ Correct (+3 pts)`).

## 4. How to Run a Tournament
1.  **Open Admin:** Go to `/admin`.
2.  **Upload Questions:** Upload a CSV containing questions `level` 1, 2, and 3.
    *   *Tip: You can upload one big CSV with all levels.*
3.  **Wait for Joins:** Let students join via the main page.
4.  **Start Round 1:** Click `Start Round 1`.
5.  **Play:** Go through questions. When finished, the round ends automatically.
6.  **Elimination:** The system calculates the cutoff (50%).
    *   Students get a popup: "Qualified" or "Eliminated".
    *   Eliminated students' screens switch to Spectator mode.
7.  **Start Next Round:** Click `Start Round 2` when ready. Only active players can answer.
8.  **Repeat** for Round 3.
