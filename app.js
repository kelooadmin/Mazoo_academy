// ============================================================
// MAZOO ACADEMY — asosiy ilova mantiqi
// ============================================================

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
  if (last === today) return; // bugun allaqachon hisoblangan
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
let topicsWithLessons = []; // [{topic, lesson, questionCount}]
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

  const { data: topics, error: topicsErr } = await db
    .from('topics')
    .select('*')
    .eq('grade', 5)
    .order('book_part', { ascending: true })
    .order('order_index', { ascending: true });

  if (topicsErr) {
    trailEl.innerHTML = `<p style="text-align:center;color:#E8544C;padding:30px 0;">Xatolik: ${topicsErr.message}</p>`;
    return;
  }

  const results = [];
  for (const topic of topics) {
    const { data: lessons } = await db
      .from('lessons')
      .select('*')
      .eq('topic_id', topic.id)
      .order('order_index', { ascending: true })
      .limit(1);

    const lesson = lessons && lessons[0] ? lessons[0] : null;
    let questionCount
