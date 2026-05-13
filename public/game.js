const socket = io();
let myName = '';
let myRoomCode = '';
let currentAnswer = null;
let timerInterval = null;
let nextCountdownInterval = null;

// ---- SCREENS ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ---- STARS ----
(function initParticles() {
  const c = document.getElementById('particles');
  const style = document.createElement('style');
  style.textContent = '@keyframes twinkle { 0%,100%{opacity:0.1;transform:scale(1)} 50%{opacity:0.85;transform:scale(1.4)} }';
  document.head.appendChild(style);
  for (let i = 0; i < 90; i++) {
    const s = document.createElement('div');
    const sz = Math.random() * 2.5 + 0.8;
    s.style.cssText = `position:absolute;width:${sz}px;height:${sz}px;background:white;border-radius:50%;top:${Math.random()*100}%;left:${Math.random()*100}%;opacity:${Math.random()*0.6+0.1};animation:twinkle ${Math.random()*4+2}s ease-in-out infinite ${Math.random()*4}s`;
    c.appendChild(s);
  }
})();

// ---- HOME EVENTS ----
document.getElementById('createRoomBtn').addEventListener('click', () => {
  const name = document.getElementById('playerName').value.trim();
  if (!name) { showError('נא להכניס שם שחקן'); return; }
  myName = name;
  socket.emit('create_room', { playerName: name });
});

document.getElementById('showJoinBtn').addEventListener('click', () => {
  document.getElementById('joinSection').classList.toggle('hidden');
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!name) { showError('נא להכניס שם שחקן'); return; }
  if (code.length < 4) { showError('נא להכניס קוד חדר תקין'); return; }
  myName = name;
  myRoomCode = code;
  socket.emit('join_room', { playerName: name, roomCode: code });
});

document.getElementById('copyCodeBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(myRoomCode).then(() => {
    const btn = document.getElementById('copyCodeBtn');
    btn.textContent = 'הועתק! ✅';
    setTimeout(() => { btn.textContent = '📋 העתק קוד'; }, 2000);
  });
});

document.getElementById('playAgainBtn').addEventListener('click', () => {
  stopTimer();
  clearInterval(nextCountdownInterval);
  document.getElementById('playerName').value = '';
  document.getElementById('roomCode').value = '';
  document.getElementById('joinSection').classList.add('hidden');
  document.getElementById('errorMsg').classList.add('hidden');
  showScreen('screen-home');
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const joinSec = document.getElementById('joinSection');
  if (!joinSec.classList.contains('hidden')) {
    document.getElementById('joinRoomBtn').click();
  } else {
    document.getElementById('createRoomBtn').click();
  }
});

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ---- SOCKET EVENTS ----
socket.on('room_created', ({ roomCode }) => {
  myRoomCode = roomCode;
  document.getElementById('displayRoomCode').textContent = roomCode;
  showScreen('screen-lobby');
});

socket.on('error', ({ message }) => {
  showError(message);
});

socket.on('game_starting', ({ players }) => {
  const display = document.getElementById('playersDisplay');
  display.innerHTML = '';
  players.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.textContent = p.name;
    display.appendChild(chip);
    if (i === 0) {
      const vs = document.createElement('div');
      vs.className = 'vs-badge';
      vs.textContent = 'VS';
      display.appendChild(vs);
    }
  });

  showScreen('screen-starting');
  let count = 3;
  const el = document.getElementById('countdown');
  el.textContent = count;
  const iv = setInterval(() => {
    count--;
    if (count <= 0) { clearInterval(iv); return; }
    el.textContent = count;
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = 'cpulse 1s ease-out';
  }, 1000);
});

socket.on('question', ({ questionNumber, totalQuestions, question, options, scores, timeLimit }) => {
  updateScores(scores);
  document.getElementById('questionNumber').textContent = 'שאלה ' + questionNumber + '/' + totalQuestions;
  document.getElementById('questionText').textContent = question;

  const buttons = document.querySelectorAll('.answer-btn');
  buttons.forEach((btn, i) => {
    btn.textContent = options[i];
    btn.className = 'answer-btn';
    btn.disabled = false;
  });

  document.getElementById('waitingMsg').classList.add('hidden');
  currentAnswer = null;
  startTimer(timeLimit);
  showScreen('screen-question');
});

socket.on('answer_received', ({ isCorrect }) => {
  const btn = document.querySelector('.answer-btn[data-index="' + currentAnswer + '"]');
  if (btn) btn.classList.add(isCorrect ? 'correct' : 'incorrect');
  document.querySelectorAll('.answer-btn').forEach(b => { b.disabled = true; });
  document.getElementById('waitingMsg').classList.remove('hidden');
});

socket.on('question_result', ({ correctAnswer, explanation, results, correctText }) => {
  stopTimer();
  updateScores(results.map(r => ({ name: r.name, score: r.score })));

  const buttons = document.querySelectorAll('.answer-btn');
  buttons.forEach((btn, i) => {
    btn.className = 'answer-btn' + (i === correctAnswer ? ' correct' : '');
    btn.disabled = true;
  });

  setTimeout(() => {
    document.getElementById('correctAnswerText').textContent = correctText;
    document.getElementById('explanationText').textContent = explanation;

    const myResult = results.find(r => r.name === myName);
    const titleEl = document.getElementById('resultTitle');
    if (myResult && myResult.isCorrect) {
      titleEl.textContent = '✅ נכון!';
      titleEl.style.color = '#4dbb6d';
    } else if (myResult && myResult.answered) {
      titleEl.textContent = '❌ לא נכון';
      titleEl.style.color = '#e05555';
    } else {
      titleEl.textContent = '⏰ הזמן עבר';
      titleEl.style.color = '#f0c040';
    }

    const container = document.getElementById('playersResults');
    container.innerHTML = results.map(r => {
      const cls = r.isCorrect ? 'correct' : (r.answered ? 'incorrect' : '');
      const icon = r.isCorrect ? '✅' : (r.answered ? '❌' : '⏰');
      const pts = r.isCorrect ? ('+' + r.pointsEarned + ' נקודות') : (r.answered ? 'ענה לא נכון' : 'לא ענה בזמן');
      return '<div class="player-result-card ' + cls + '"><div class="player-result-status">' + icon + '</div><div class="player-result-name">' + r.name + '</div><div class="player-result-points">' + pts + '</div><div class="player-result-score">סה"כ: ' + r.score + '</div></div>';
    }).join('');

    let secs = 5;
    document.getElementById('nextCountdown').textContent = secs;
    clearInterval(nextCountdownInterval);
    nextCountdownInterval = setInterval(() => {
      secs--;
      document.getElementById('nextCountdown').textContent = secs;
      if (secs <= 0) clearInterval(nextCountdownInterval);
    }, 1000);

    showScreen('screen-result');
  }, 700);
});

socket.on('game_over', ({ players, winner, isTie }) => {
  stopTimer();
  clearInterval(nextCountdownInterval);

  const sorted = [...players].sort((a, b) => b.score - a.score);
  document.getElementById('finalScores').innerHTML = sorted.map(p => {
    const isWinner = p.name === winner;
    return '<div class="final-score-card ' + (isWinner ? 'winner' : '') + '"><div class="final-player-name">' + (isWinner ? '👑 ' : '') + p.name + '</div><div class="final-player-score">' + p.score + '</div><div class="final-player-label">נקודות</div></div>';
  }).join('');

  const titleEl = document.getElementById('winnerTitle');
  const trophyEl = document.getElementById('trophyIcon');
  if (isTie) {
    titleEl.textContent = 'תיקו! 🤝';
    trophyEl.textContent = '🤝';
  } else if (winner === myName) {
    titleEl.textContent = 'ניצחת! 🏆';
    startConfetti();
  } else {
    titleEl.textContent = winner + ' ניצח/ה! 🏅';
    trophyEl.textContent = '🏅';
  }

  showScreen('screen-gameover');
});

socket.on('player_disconnected', () => {
  stopTimer();
  clearInterval(nextCountdownInterval);
  alert('השחקן האחר התנתק מהמשחק.');
  showScreen('screen-home');
});

// ---- ANSWER BUTTONS ----
document.querySelectorAll('.answer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (currentAnswer !== null || btn.disabled) return;
    currentAnswer = parseInt(btn.dataset.index);
    btn.classList.add('selected');
    socket.emit('answer', { answerIndex: currentAnswer });
  });
});

// ---- TIMER ----
function startTimer(seconds) {
  const bar = document.getElementById('timerBar');
  const txt = document.getElementById('timerText');
  let remaining = seconds;
  bar.style.width = '100%';
  bar.style.backgroundPosition = '0% 50%';
  txt.textContent = seconds;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    remaining -= 0.1;
    const pct = Math.max(0, (remaining / seconds) * 100);
    bar.style.width = pct + '%';
    const bgPos = ((1 - remaining / seconds) * 100).toFixed(0) + '% 50%';
    bar.style.backgroundPosition = bgPos;
    txt.textContent = Math.ceil(Math.max(0, remaining));
    if (remaining <= 0) stopTimer();
  }, 100);
}

function stopTimer() {
  clearInterval(timerInterval);
}

// ---- SCORES ----
function updateScores(scores) {
  if (scores[0]) {
    document.getElementById('score-name1').textContent = scores[0].name;
    const v1 = document.getElementById('score-val1');
    if (v1.textContent !== String(scores[0].score)) {
      v1.textContent = scores[0].score;
      v1.classList.add('score-bump');
      setTimeout(() => v1.classList.remove('score-bump'), 500);
    }
  }
  if (scores[1]) {
    document.getElementById('score-name2').textContent = scores[1].name;
    const v2 = document.getElementById('score-val2');
    if (v2.textContent !== String(scores[1].score)) {
      v2.textContent = scores[1].score;
      v2.classList.add('score-bump');
      setTimeout(() => v2.classList.remove('score-bump'), 500);
    }
  }
}

// ---- CONFETTI ----
function startConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#f0c040','#4dbb6d','#5a9fd4','#e05555','#a855f7','#fb923c','#ffffff'];
  const pieces = Array.from({ length: 160 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 200,
    size: Math.random() * 12 + 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: (Math.random() - 0.5) * 7,
    vy: Math.random() * 3 + 2,
    rot: Math.random() * 360,
    vr: (Math.random() - 0.5) * 12,
    circle: Math.random() > 0.5
  }));
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.rot += p.vr;
      if (p.y < canvas.height + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.y / canvas.height);
      if (p.circle) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      ctx.restore();
    });
    if (alive) requestAnimationFrame(draw);
  }
  draw();
}
