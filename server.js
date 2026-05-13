const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { questions } = require('./questions');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ playerName }) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id, name: playerName, score: 0, answered: false }],
      questions: shuffleArray(questions).slice(0, 15),
      currentQuestion: 0,
      questionActive: false,
      questionStartTime: null,
      questionTimer: null
    };
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.emit('room_created', { roomCode });
  });

  socket.on('join_room', ({ playerName, roomCode }) => {
    const room = rooms[roomCode];
    if (!room) { socket.emit('error', { message: 'חדר לא נמצא. בדוק את הקוד.' }); return; }
    if (room.players.length >= 2) { socket.emit('error', { message: 'החדר מלא' }); return; }

    room.players.push({ id: socket.id, name: playerName, score: 0, answered: false });
    socket.join(roomCode);
    socket.roomCode = roomCode;

    io.to(roomCode).emit('game_starting', {
      players: room.players.map(p => ({ name: p.name, score: p.score }))
    });

    setTimeout(() => startGame(roomCode), 4000);
  });

  socket.on('answer', ({ answerIndex }) => {
    const room = rooms[socket.roomCode];
    if (!room || !room.questionActive) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.answered) return;

    player.answered = true;
    player.answerIndex = answerIndex;
    player.answerTime = Date.now();

    const isCorrect = answerIndex === room.questions[room.currentQuestion].correct;
    socket.emit('answer_received', { isCorrect });

    if (room.players.every(p => p.answered)) {
      clearTimeout(room.questionTimer);
      resolveQuestion(socket.roomCode);
    }
  });

  socket.on('disconnect', () => {
    const roomCode = socket.roomCode;
    if (roomCode && rooms[roomCode]) {
      clearTimeout(rooms[roomCode].questionTimer);
      io.to(roomCode).emit('player_disconnected');
      delete rooms[roomCode];
    }
  });
});

function startGame(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.currentQuestion = 0;
  sendQuestion(roomCode);
}

function sendQuestion(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  if (room.currentQuestion >= room.questions.length) {
    endGame(roomCode);
    return;
  }

  const q = room.questions[room.currentQuestion];
  room.questionActive = true;
  room.questionStartTime = Date.now();
  room.players.forEach(p => { p.answered = false; p.answerIndex = null; p.answerTime = null; });

  io.to(roomCode).emit('question', {
    questionNumber: room.currentQuestion + 1,
    totalQuestions: room.questions.length,
    question: q.question,
    options: q.options,
    scores: room.players.map(p => ({ name: p.name, score: p.score })),
    timeLimit: 20
  });

  room.questionTimer = setTimeout(() => resolveQuestion(roomCode), 20000);
}

function resolveQuestion(roomCode) {
  const room = rooms[roomCode];
  if (!room || !room.questionActive) return;
  room.questionActive = false;

  const currentQ = room.questions[room.currentQuestion];

  const results = room.players.map(player => {
    let pointsEarned = 0;
    const isCorrect = player.answered && player.answerIndex === currentQ.correct;
    if (isCorrect && player.answerTime) {
      const elapsed = (player.answerTime - room.questionStartTime) / 1000;
      pointsEarned = Math.max(40, Math.round(100 - elapsed * 3));
      player.score += pointsEarned;
    }
    return {
      name: player.name,
      answered: player.answered,
      answerIndex: player.answered ? player.answerIndex : null,
      isCorrect,
      score: player.score,
      pointsEarned
    };
  });

  io.to(roomCode).emit('question_result', {
    correctAnswer: currentQ.correct,
    explanation: currentQ.explanation || '',
    results,
    correctText: currentQ.options[currentQ.correct]
  });

  room.currentQuestion++;
  setTimeout(() => sendQuestion(roomCode), 5000);
}

function endGame(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  const winner = room.players.reduce((a, b) => a.score > b.score ? a : b);
  const isTie = room.players[0].score === room.players[1].score;
  io.to(roomCode).emit('game_over', {
    players: room.players.map(p => ({ name: p.name, score: p.score })),
    winner: isTie ? null : winner.name,
    isTie
  });
  delete rooms[roomCode];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port ' + PORT));
