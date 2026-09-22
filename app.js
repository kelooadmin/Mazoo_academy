// ============================================================
// MAZOO ACADEMY — asosiy ilova mantiqi (Auth bilan)
// ============================================================

window.addEventListener('error', function (e) {
  const trailEl = document.getElementById('trail');
  if (trailEl) {
    trailEl.innerHTML = '<p style="text-align:center;color:#E8544C;padding:30px 18px;font-weight:600;">XATO: ' + e.message + '</p>';
  }
});

if (typeof supabase === 'undefined') {
  document.body.innerHTML = '<p style="text-align:center;color:#E8544C;padding:30px 18px;font-weight:600;">XATO: Supabase kutubxonasi yuklanmadi (CDN muammosi)</p>';
  throw new Error('supabase is undefined');
}

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- AUTH STATE ----------
let currentUser = null;
let profile = null;
let authMode = 'signup'; // yoki 'signin'

async function initAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (session && session.user) {
    await onLoggedIn(session.user);
  } else {
    showView('auth');
  }
}

db.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session && session.user) {
    onLoggedIn(session.user);
  }
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    profile = null;
    document.getElementById('topbar').style.display = 'none';
    showView('auth');
  }
});

async function onLoggedIn(user) {
  currentUser = user;
  await loadOrCreateProfile(user.id);
  document.getElementById('topbar').style.display = 'block';
  showView('path');
  loadPath();
}

async function loadOrCreateProfile(userId) {
  let { data, error } = await db.from('profiles').select('*').eq('id', userId).single();
  if (error || !data) {
    const { data: created } = await db
      .from('profiles')
      .insert({ id: userId, xp: 0, streak: 0, done_lessons: [] })
      .select()
      .single();
    data = created;
  }
  profile = data || { xp: 0, streak: 0, last_active: null, done_lessons: [] };
  renderStats();
}

async function syncProfile(fields) {
  if (!currentUser) return;
  await db.from('profiles').update(fields).eq('id', currentUser.id);
}

function renderStats() {
  if (!profile) return;
  document.getElementById('xpVal').textContent = profile.xp || 0;
  document.getElementById('streakVal').textContent = profile.streak || 0;
  updateRankBadge();
  updateDailyButtonState();
}

function getRank(xp) {
  if (xp >= 1000) return { emoji: '🏆', title: 'Chempion' };
  if (xp >= 600) return { emoji: '⭐', title: 'Usta' };
  if (xp >= 300) return { emoji: '🧠', title: 'Bilimdon' };
  if (xp >= 100) return { emoji: '📘', title: "O'rganuvchi" };
  return { emoji: '🌱', title: 'Boshlovchi' };
}

function updateRankBadge() {
  const el = document.getElementById('rankBadge');
  if (!el || !profile) return;
  const rank = getRank(profile.xp || 0);
  el.textContent = `${rank.emoji} ${rank.title}`;
}

function updateDailyButtonState() {
  const btn = document.getElementById('dailyChallengeBtn');
  const title = document.getElementById('dailyTitle');
  const sub = document.getElementById('dailySub');
  if (!btn || !profile) return;

  const today = new Date().toISOString().slice(0, 10);
  if (profile.last_daily_challenge === today) {
    btn.disabled = true;
    title.textContent = "Bugungi mashq bajarildi ✅";
    sub.textContent = "Ertaga yana keling!";
  } else {
    btn.disabled = false;
    title.textContent = "Kunlik mashq";
    sub.textContent = "5 ta aralash savol — bugun sinab ko'ring";
  }
}

async function markDailyChallengeDone() {
  if (!profile) return;
  const today = new Date().toISOString().slice(0, 10);
  profile.last_daily_challenge = today;
  updateDailyButtonState();
  syncProfile({ last_daily_challenge: today });
}

let isDailyMode = false;

async function startDailyChallenge() {
  const { data: allQ, error } = await db.from('questions').select('*');
  if (error || !allQ || allQ.length === 0) return;

  const picked = shuffleArray(allQ).slice(0, 5);

  isDailyMode = true;
  currentLesson = null;
  currentQuestions = picked;
  currentIndex = 0;
  correctCount = 0;
  hearts = 5;
  comboCount = 0;

  showView('quiz');
  renderQuestion();
}

document.getElementById('dailyChallengeBtn').addEventListener('click', startDailyChallenge);

function addXp(amount) {
  if (!profile) return;
  profile.xp = (profile.xp || 0) + amount;
  renderStats();
  syncProfile({ xp: profile.xp });
}

function registerActivityToday() {
  if (!profile) return;
  const today = new Date().toISOString().slice(0, 10);
  if (profile.last_active === today) return;
  let streak = profile.streak || 0;
  if (profile.last_active) {
    const diffDays = Math.round((new Date(today) - new Date(profile.last_active)) / 86400000);
    streak = diffDays === 1 ? streak + 1 : 1;
  } else {
    streak = 1;
  }
  profile.streak = streak;
  profile.last_active = today;
  renderStats();
  syncProfile({ streak: profile.streak, last_active: profile.last_active });
}

function markLessonDone(lessonId) {
  if (!profile) return;
  const done = profile.done_lessons || [];
  if (!done.includes(lessonId)) {
    done.push(lessonId);
    profile.done_lessons = done;
    syncProfile({ done_lessons: done });
  }
}

function isLessonDone(lessonId) {
  return profile && profile.done_lessons && profile.done_lessons.includes(lessonId);
}

// ---------- AUTH FORM ----------
function updateAuthUI() {
  const title = document.getElementById('authTitle');
  const sub = document.getElementById('authSub');
  const submitBtn = document.getElementById('authSubmitBtn');
  const toggleBtn = document.getElementById('authToggleBtn');
  document.getElementById('authError').style.display = 'none';

  if (authMode === 'signup') {
    title.textContent = "Xush kelibsiz!";
    sub.textContent = "Davom etish uchun ro'yxatdan o'ting";
    submitBtn.textContent = "Ro'yxatdan o'tish";
    toggleBtn.textContent = "Akkountingiz bormi? Kiring";
  } else {
    title.textContent = "Qaytganingizdan xursandmiz!";
    sub.textContent = "Hisobingizga kiring";
    submitBtn.textContent = "Kirish";
    toggleBtn.textContent = "Akkountingiz yo'qmi? Ro'yxatdan o'ting";
  }
}

document.getElementById('authToggleBtn').addEventListener('click', () => {
  authMode = authMode === 'signup' ? 'signin' : 'signup';
  updateAuthUI();
});

document.getElementById('authSubmitBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl = document.getElementById('authError');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = "Email va parolni to'ldiring";
    errEl.style.display = 'block';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = "Parol kamida 6 ta belgidan iborat bo'lishi kerak";
    errEl.style.display = 'block';
    return;
  }

  const submitBtn = document.getElementById('authSubmitBtn');
  submitBtn.disabled = true;

  let result;
  if (authMode === 'signup') {
    result = await db.auth.signUp({ email, password });
  } else {
    result = await db.auth.signInWithPassword({ email, password });
  }

  submitBtn.disabled = false;

  if (result.error) {
    errEl.textContent = result.error.message;
    errEl.style.display = 'block';
  }
  // Muvaffaqiyatli bo'lsa, onAuthStateChange avtomatik ishga tushadi
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  db.auth.signOut();
});

// ---------- SOUND EFFECTS ----------
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  return audioCtx;
}
function playTone(freq, duration, type) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch (e) {}
}
function playCorrectSound() {
  playTone(880, 120, 'sine');
  setTimeout(() => playTone(1175, 160, 'sine'), 90);
}
function playIncorrectSound() {
  playTone(220, 260, 'sawtooth');
}

// ---------- COMBO ----------
let comboCount = 0;
function showComboBadge(count) {
  const el = document.getElementById('comboBadge');
  if (!el) return;
  el.textContent = `🔥 ${count} ta ketma-ket!`;
  el.classList.add('show');
  clearTimeout(showComboBadge._t);
  showComboBadge._t = setTimeout(() => el.classList.remove('show'), 1100);
}

// ---------- CONFETTI ----------
function fireConfetti() {
  const colors = ['#0EA5A0', '#F2B705', '#E85D4C', '#5ED4CD', '#3CB878'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    piece.style.animationDuration = (2 + Math.random() * 1.5) + 's';
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 3600);
  }
}

// ---------- APP STATE ----------
let topicsWithLessons = [];
let currentLesson = null;
let currentQuestions = [];
let currentIndex = 0;
let correctCount = 0;
let hearts = 5;
let selectedOption = null;
let answered = false;

// ---------- DATA LOADING ----------
async function loadPath() {
  const trailEl = document.getElementById('trail');
  trailEl.innerHTML = '<p style="text-align:center;color:#8592A0;padding:30px 0;">Yuklanmoqda...</p>';

  try {
    const { data: topics, error: topicsErr } = await db
      .from('topics')
      .select('*')
      .eq('grade', 5)
      .order('book_part', { ascending: true })
      .order('order_index', { ascending: true });

    if (topicsErr) {
      trailEl.innerHTML = `<p style="text-align:center;color:#E8544C;padding:30px 18px;font-weight:600;">Xatolik: ${topicsErr.message}</p>`;
      return;
    }
    if (!topics || topics.length === 0) {
      trailEl.innerHTML = `<p style="text-align:center;color:#8592A0;padding:30px 18px;">Hozircha mavzular topilmadi.</p>`;
      return;
    }

    const topicIds = topics.map(t => t.id);

    const { data: allLessons } = await db
      .from('lessons')
      .select('*')
      .in('topic_id', topicIds)
      .order('order_index', { ascending: true });

    const lessonByTopic = {};
    (allLessons || []).forEach(l => {
      if (!lessonByTopic[l.topic_id]) lessonByTopic[l.topic_id] = l;
    });
    const lessonIds = (allLessons || []).map(l => l.id);

    let countByLesson = {};
    if (lessonIds.length > 0) {
      const { data: allQuestions } = await db
        .from('questions')
        .select('lesson_id')
        .in('lesson_id', lessonIds);
      (allQuestions || []).forEach(q => {
        countByLesson[q.lesson_id] = (countByLesson[q.lesson_id] || 0) + 1;
      });
    }

    topicsWithLessons = topics.map(topic => {
      const lesson = lessonByTopic[topic.id] || null;
      const questionCount = lesson ? (countByLesson[lesson.id] || 0) : 0;
      return { topic, lesson, questionCount };
    });

    renderTrail();
  } catch (err) {
    trailEl.innerHTML = `<p style="text-align:center;color:#E8544C;padding:30px 18px;font-weight:600;">Kutilmagan xato: ${err.message}</p>`;
  }
}

function renderTrail() {
  const trailEl = document.getElementById('trail');
  trailEl.innerHTML = '';

  topicsWithLessons.forEach((item, idx) => {
    const wrap = document.createElement('div');
    const side = idx % 3 === 0 ? '' : (idx % 3 === 1 ? 'offset-right' : 'offset-left');
    wrap.className = `node-wrap ${side}`;

    const done = item.lesson && isLessonDone(item.lesson.id);
    const hasQuestions = item.questionCount > 0;

    const btn = document.createElement('button');
    btn.className = `node ${done ? 'done' : ''}`;
    btn.style.animationDelay = `${idx * 0.06}s`;
    btn.textContent = done ? '⭐' : (hasQuestions ? '✏️' : '📖');
    btn.addEventListener('click', () => openLessonModal(item));

    const label = document.createElement('div');
    label.className = 'node-label';
    label.textContent = item.topic.title;

    const count = document.createElement('div');
    count.className = 'node-count';
    count.textContent = hasQuestions ? `${item.questionCount} ta test` : 'testlar tez orada';

    wrap.appendChild(btn);
    wrap.appendChild(label);
    wrap.appendChild(count);
    trailEl.appendChild(wrap);
  });
}

// ---------- LESSON MODAL ----------
function openLessonModal(item) {
  document.getElementById('lessonBadge').textContent = item.topic.title.toUpperCase();
  document.getElementById('lessonTitle').textContent = item.lesson ? item.lesson.title : item.topic.title;
  document.getElementById('lessonContent').textContent = item.lesson ? item.lesson.content : 'Kontent tez orada qo\'shiladi.';

  const startBtn = document.getElementById('startQuizBtn');
  const emptyMsg = document.getElementById('lessonEmpty');

  if (item.questionCount > 0) {
    startBtn.style.display = 'block';
    emptyMsg.style.display = 'none';
    startBtn.onclick = () => startQuiz(item.lesson);
  } else {
    startBtn.style.display = 'none';
    emptyMsg.style.display = 'block';
  }

  document.getElementById('lessonBackdrop').classList.add('show');
}

document.getElementById('closeLessonModal').addEventListener('click', () => {
  document.getElementById('lessonBackdrop').classList.remove('show');
});
document.getElementById('lessonBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'lessonBackdrop') e.target.classList.remove('show');
});

// ---------- QUIZ FLOW ----------
async function startQuiz(lesson) {
  document.getElementById('lessonBackdrop').classList.remove('show');

  const { data: questions, error } = await db
    .from('questions')
    .select('*')
    .eq('lesson_id', lesson.id);

  if (error || !questions || questions.length === 0) return;

  currentLesson = lesson;
  currentQuestions = shuffleArray(questions);
  currentIndex = 0;
  correctCount = 0;
  hearts = 5;
  comboCount = 0;

  showView('quiz');
  renderQuestion();
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderQuestion() {
  answered = false;
  selectedOption = null;

  const q = currentQuestions[currentIndex];
  document.getElementById('qCounter').textContent = `Savol ${currentIndex + 1} / ${currentQuestions.length}`;
  document.getElementById('qText').textContent = q.question_text;

  const progressPct = (currentIndex / currentQuestions.length) * 100;
  document.getElementById('progressFill').style.width = `${progressPct}%`;
  document.getElementById('heartsDisplay').textContent = '❤️'.repeat(hearts) + '🖤'.repeat(5 - hearts);

  const optionsEl = document.getElementById('qOptions');
  optionsEl.innerHTML = '';

  let options = q.options;
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch (e) { options = []; }
  }
  options = shuffleArray(options); // har safar variantlar tartibini aralashtiramiz

  options.forEach((opt) => {
    const b = document.createElement('button');
    b.className = 'q-option';
    b.textContent = opt;
    b.addEventListener('click', () => selectOption(b, opt));
    optionsEl.appendChild(b);
  });

  const checkBtn = document.getElementById('checkBtn');
  checkBtn.disabled = true;
  checkBtn.textContent = 'Tekshirish';
  checkBtn.onclick = handleCheckOrNext;
}

function selectOption(btnEl, value) {
  if (answered) return;
  document.querySelectorAll('.q-option').forEach(b => b.classList.remove('selected'));
  btnEl.classList.add('selected');
  selectedOption = value;
  document.getElementById('checkBtn').disabled = false;
}

function handleCheckOrNext() {
  if (!answered) {
    checkAnswer();
  } else {
    goToNextQuestion();
  }
}

function checkAnswer() {
  answered = true;
  const q = currentQuestions[currentIndex];
  const isCorrect = String(selectedOption).trim() === String(q.correct_answer).trim();

  document.querySelectorAll('.q-option').forEach(b => {
    b.disabled = true;
    if (b.textContent === q.correct_answer) b.classList.add('correct');
    else if (b.classList.contains('selected') && !isCorrect) b.classList.add('incorrect');
  });

  if (isCorrect) {
    correctCount++;
    comboCount++;
    playCorrectSound();
    if (comboCount >= 2) showComboBadge(comboCount);
  } else {
    comboCount = 0;
    playIncorrectSound();
    hearts--;
    document.getElementById('heartsDisplay').textContent = '❤️'.repeat(Math.max(hearts,0)) + '🖤'.repeat(5 - Math.max(hearts,0));
  }

  const checkBtn = document.getElementById('checkBtn');
  checkBtn.disabled = false;
  checkBtn.textContent = currentIndex === currentQuestions.length - 1 ? 'Yakunlash' : 'Keyingisi';

  if (hearts <= 0) {
    setTimeout(() => showView('gameOver'), 900);
  }
}

function goToNextQuestion() {
  if (hearts <= 0) return;
  currentIndex++;
  if (currentIndex >= currentQuestions.length) {
    finishQuiz();
  } else {
    renderQuestion();
  }
}

function finishQuiz() {
  const xpEarned = correctCount * 10;
  addXp(xpEarned);
  registerActivityToday();

  if (isDailyMode) {
    markDailyChallengeDone();
    isDailyMode = false;
  } else if (currentLesson) {
    markLessonDone(currentLesson.id);
  }

  document.getElementById('resultCorrect').textContent = `${correctCount}/${currentQuestions.length}`;
  document.getElementById('resultXp').textContent = `+${xpEarned}`;

  const ratio = correctCount / currentQuestions.length;
  document.getElementById('resultEmoji').textContent = ratio >= 0.8 ? '🏆' : ratio >= 0.5 ? '🎉' : '💪';
  document.getElementById('resultTitle').textContent = ratio >= 0.8 ? 'Zo\'r natija!' : ratio >= 0.5 ? 'Yaxshi ish!' : 'Davom eting!';

  if (ratio === 1) fireConfetti();

  showView('result');
  renderTrail();
}

// ---------- VIEW SWITCHING ----------
function showView(name) {
  document.getElementById('authView').style.display = name === 'auth' ? 'flex' : 'none';
  document.getElementById('pathView').style.display = name === 'path' ? 'block' : 'none';
  document.getElementById('quizView').style.display = name === 'quiz' ? 'flex' : 'none';
  document.getElementById('resultView').style.display = name === 'result' ? 'flex' : 'none';
  document.getElementById('gameOverView').style.display = name === 'gameOver' ? 'flex' : 'none';
  window.scrollTo(0, 0);
}

document.getElementById('quizExitBtn').addEventListener('click', () => { isDailyMode = false; showView('path'); });
document.getElementById('backToPathBtn').addEventListener('click', () => showView('path'));
document.getElementById('giveUpBtn').addEventListener('click', () => { isDailyMode = false; showView('path'); });
document.getElementById('retryBtn').addEventListener('click', () => startQuiz(currentLesson));

// ---------- INIT ----------
updateAuthUI();
initAuth();
