// ============================================================
// MAZOO ACADEMY — asosiy ilova mantiqi
// ============================================================

// Har qanday xatoni sahifada ko'rsatish (debug uchun)
window.addEventListener('error', function (e) {
  const trailEl = document.getElementById('trail');
  if (trailEl) {
    trailEl.innerHTML = '<p style="text-align:center;color:#E8544C;padding:30px 18px;font-weight:600;">XATO: ' + e.message + '</p>';
  }
});

if (typeof supabase === 'undefined') {
  document.getElementById('trail').innerHTML = '<p style="text-align:center;color:#E8544C;padding:30px 18px;font-weight:600;">XATO: Supabase kutubxonasi yuklanmadi (CDN muammosi)</p>';
  throw new Error('supabase is undefined');
}

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- LOCAL STATE (XP / STREAK) ----------
const Storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
};

function getStreakAndXp() {
  return {
    xp: Storage.get('mazoo_xp', 0),
    streak: Storage.get('mazoo_streak', 0),
    lastActive: Storage.get('mazoo_last_active', null)
  };
}

function addXp(amount) {
  const cur = Storage.get('mazoo_xp', 0);
  Storage.set('mazoo_xp', cur + amount);
  renderStats();
}

function registerActivityToday() {
  const today = new Date().toISOString().slice(0, 10);
  const last = Storage.get('mazoo_last_active', null);
  if (last === today) return;
  let streak = Storage.get('mazoo_streak', 0);
  if (last) {
    const lastDate = new Date(last);
    const diffDays = Math.round((new Date(today) - lastDate) / 86400000);
    streak = diffDays === 1 ? streak + 1 : 1;
  } else {
    streak = 1;
  }
  Storage.set('mazoo_streak', streak);
  Storage.set('mazoo_last_active', today);
  renderStats();
}

function renderStats() {
  const { xp, streak } = getStreakAndXp();
  document.getElementById('xpVal').textContent = xp;
  document.getElementById('streakVal').textContent = streak;
}

function markLessonDone(lessonId) {
  const done = Storage.get('mazoo_done_lessons', []);
  if (!done.includes(lessonId)) {
    done.push(lessonId);
    Storage.set('mazoo_done_lessons', done);
  }
}

function isLessonDone(lessonId) {
  return Storage.get('mazoo_done_lessons', []).includes(lessonId);
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
  } else {
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
  if (currentLesson) markLessonDone(currentLesson.id);

  document.getElementById('resultCorrect').textContent = `${correctCount}/${currentQuestions.length}`;
  document.getElementById('resultXp').textContent = `+${xpEarned}`;

  const ratio = correctCount / currentQuestions.length;
  document.getElementById('resultEmoji').textContent = ratio >= 0.8 ? '🏆' : ratio >= 0.5 ? '🎉' : '💪';
  document.getElementById('resultTitle').textContent = ratio >= 0.8 ? 'Zo\'r natija!' : ratio >= 0.5 ? 'Yaxshi ish!' : 'Davom eting!';

  showView('result');
  renderTrail();
}

// ---------- VIEW SWITCHING ----------
function showView(name) {
  document.getElementById('pathView').style.display = name === 'path' ? 'block' : 'none';
  document.getElementById('quizView').style.display = name === 'quiz' ? 'flex' : 'none';
  document.getElementById('resultView').style.display = name === 'result' ? 'flex' : 'none';
  document.getElementById('gameOverView').style.display = name === 'gameOver' ? 'flex' : 'none';
  document.getElementById('topbar').style.display = name === 'path' ? 'block' : 'none';
  window.scrollTo(0, 0);
}

document.getElementById('quizExitBtn').addEventListener('click', () => showView('path'));
document.getElementById('backToPathBtn').addEventListener('click', () => showView('path'));
document.getElementById('giveUpBtn').addEventListener('click', () => showView('path'));
document.getElementById('retryBtn').addEventListener('click', () => startQuiz(currentLesson));

// ---------- INIT ----------
renderStats();
loadPath();
