# Quick Start Guide

## First Time Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```

3. **Find Your Local IP Address** (for LAN access)
   - Windows: Open Command Prompt and run `ipconfig`
   - Look for "IPv4 Address" under your active network adapter
   - Example: `192.168.1.50`

## Running the Application

### For Administrators

1. Open `http://localhost:3000/admin` (or use your local IP)
2. **Create a Quiz**:
   - Enter a quiz name
   - Click "Create Quiz"
   - Add questions:
     - Select question type (MCQ, Multi-Select, or Match the Following)
     - Enter question text
     - Set timer (in seconds)
     - Add options/items based on question type
     - Mark correct answer(s)
     - Optionally add code snippet or upload image
     - Click "Add Question"
3. **Start the Game**:
   - Switch to "Game Control" tab
   - Wait for students to join
   - Click "Start Game"

### For Students

1. Open `http://localhost:3000` (or use the admin's local IP)
2. Enter a nickname
3. Click "Join Game"
4. Wait for questions and answer them!

## Question Types

### MCQ (Multiple Choice)
- Add 2+ options
- Select one correct answer
- Students click to answer

### Multi-Select
- Add 2+ options
- Mark multiple options as correct
- Students check boxes and click "Submit Answer"

### Match the Following
- Add items to left column
- Add items to right column
- Create match pairs by selecting correct matches
- Students click left item, then right item to match

## Tips

- **Code Snippets**: Paste code in the code field - it will be syntax highlighted automatically
- **Images**: Upload diagrams, UML charts, or any visual aids
- **Timer**: Set appropriate times (30s for theory, 60s+ for code questions)
- **Pause/Resume**: Use these controls if you need to pause the game

## Troubleshooting

- **Students can't connect**: Make sure they're using the correct IP address and port
- **Questions not loading**: Make sure you've created and loaded a quiz before starting
- **Timer not syncing**: Check that all devices are on the same network

