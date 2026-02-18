/* منصة القراءة العربية - نسخة مستقرة
   - بحث + فلترة (صف/موضوع)
   - صفحة إنجازاتي (نقاط/شارات/كتب مكتملة)
   - تسجيل دخول محلي (LocalStorage)
   - فتح كتب Archive.org داخل إطار إن أمكن + زر فتح في تبويب جديد
*/

let booksData = {};
let currentGrade = null;
let currentBook = null;
let currentPage = 0;

// -------------------- User (LocalStorage) --------------------
let currentUser = localStorage.getItem("rp_user") || "زائر";

function userPrefix() { return `rp_${currentUser}__`; }
function uk(name) { return userPrefix() + name; }

function getPoints() {
  return parseInt(localStorage.getItem(uk("points")) || "0", 10);
}
function setPoints(v) {
  localStorage.setItem(uk("points"), String(v));
}

function getBadges() {
  try { return JSON.parse(localStorage.getItem(uk("badges")) || "[]"); }
  catch { return []; }
}
function setBadges(arr) {
  localStorage.setItem(uk("badges"), JSON.stringify(arr));
}

function bkey(grade, title) { return uk(`book__${grade}__${title}`); }

function getProgressOrNull(grade, title) {
  const k = bkey(grade, title) + "__page";
  const v = localStorage.getItem(k);
  if (v === null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}
function setProgress(grade, title, page) {
  localStorage.setItem(bkey(grade, title) + "__page", String(page));
}

function isCompleted(grade, title) {
  return localStorage.getItem(bkey(grade, title) + "__completed") === "true";
}
function setCompleted(grade, title, val) {
  localStorage.setItem(bkey(grade, title) + "__completed", val ? "true" : "false");
}

// -------------------- Helpers --------------------
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function safeSplitText(text) {
  const t = String(text || "").trim();
  if (!t) return [""]; // prevent null issues
  const parts = t.match(/.{1,650}/gs);
  return (parts && parts.length) ? parts : [t];
}

// books.json may be object-of-objects; normalize fields
function normalizeBooksData(data) {
  const out = {};
  for (const grade of Object.keys(data || {})) {
    out[grade] = {};
    const g = data[grade] || {};
    for (const title of Object.keys(g)) {
      const raw = g[title] || {};
      out[grade][title] = {
        topic: (raw.topic || raw.category || "عام"),
        url: raw.url || "",
        file: raw.file || "",
        content: raw.content || "",
        quiz: Array.isArray(raw.quiz) ? raw.quiz : [],
        // optional flags
        ready: raw.ready !== false, // default true unless explicitly false
      };
    }
  }
  return out;
}

// -------------------- Filters --------------------
const filters = { grade: "all", topic: "all", q: "" };

function allGrades() {
  const keys = Object.keys(booksData || {});
  const gradeNumber = (key) => {
    const m = String(key).match(/\d+/);  // يدعم "الصف 9" أو "9"
    return m ? parseInt(m[0], 10) : 9999;
  };
  return keys.sort((a, b) => gradeNumber(a) - gradeNumber(b));
}


function topicsForGrade(grade) {
  const s = new Set();
  const g = booksData[grade] || {};
  Object.values(g).forEach((b) => s.add(String(b.topic || "عام").trim()));
  return Array.from(s).sort();
}
function topicsAll() {
  const s = new Set();
  for (const g of allGrades()) {
    Object.values(booksData[g] || {}).forEach((b) => s.add(String(b.topic || "عام").trim()));
  }
  return Array.from(s).sort();
}

function renderLibrary() {
  const grades = allGrades();
  if (!grades.length) {
    $("content").innerHTML = "<p>لا توجد كتب. تأكد من ملف books.json</p>";
    return;
  }

  // Build filter UI
  const gradeOptions = [`<option value="all">كل الصفوف</option>`]
    .concat(grades.map((g) => `<option value="${esc(g)}"${filters.grade === g ? " selected" : ""}>${esc(g)}</option>`))
    .join("");

  const topicList = (filters.grade === "all") ? topicsAll() : topicsForGrade(filters.grade);
  const topicOptions = [`<option value="all">عام / الكل</option>`]
    .concat(topicList.map((t) => `<option value="${esc(t)}"${filters.topic === t ? " selected" : ""}>${esc(t)}</option>`))
    .join("");

  let html = `
    <div class="library-head">
      <h2>📚 المكتبة</h2>
      <div class="filters">
        <button class="secondary" id="resetBtn">إعادة ضبط</button>
        <select class="input" id="filterTopic">${topicOptions}</select>
        <select class="input" id="filterGrade">${gradeOptions}</select>
        <input class="input" id="searchInput" type="text" placeholder="ابحث عن كتاب..." value="${esc(filters.q)}">
      </div>
    </div>
  `;

  const wantedGrades = (filters.grade === "all") ? grades : [filters.grade];
  let any = false;

  for (const grade of wantedGrades) {
    const g = booksData[grade] || {};
    const titles = Object.keys(g).filter((title) => {
      const b = g[title] || {};
      const topic = String(b.topic || "عام").trim();
      const qok = !filters.q || title.toLowerCase().includes(filters.q.toLowerCase());
      const tok = (filters.topic === "all") || (topic === filters.topic);
      return qok && tok;
    });

    if (!titles.length) continue;
    any = true;

    html += `<h3 class="grade-title">${esc(grade)}</h3>`;

    for (const title of titles) {
      const b = g[title] || {};
      const done = isCompleted(grade, title);

      // Progress bar behavior:
      // - External links: 0% unless completed
      // - Text content: 0% if no saved progress yet
      let percent = 0;
      const isExternal = !!(b.url || b.file);

      if (isExternal) {
        percent = done ? 100 : 0;
      } else {
        const pages = safeSplitText(b.content);
        const saved = getProgressOrNull(grade, title);
        if (saved === null) {
          percent = done ? 100 : 0;
        } else {
          const page = Math.max(0, Math.min(saved, pages.length - 1));
          percent = Math.round(((page + 1) / Math.max(1, pages.length)) * 100);
        }
      }

      const ready = b.ready !== false;

      html += `
        <div class="book ${ready ? "" : "not-ready"}" data-grade="${esc(grade)}" data-title="${esc(title)}">
          <div class="book-row">
            <div class="book-title">📖 ${esc(title)} ${done ? '<span class="badge-pill">✅ مكتمل</span>' : ''}</div>
            <div class="book-meta-inline">${esc(b.topic || "عام")}${!ready ? ' <span class="badge-pill warn">⏳ قيد الإعداد</span>' : ''}</div>
          </div>
          <div class="progress-bar"><div class="progress" style="width:${percent}%"></div></div>
        </div>
      `;
    }
  }

  if (!any) {
    html += `<p class="muted" style="margin-top:12px;">لا توجد نتائج مطابقة.</p>`;
  }

  $("content").innerHTML = html;

  // Events
  $("filterGrade").addEventListener("change", (e) => {
    filters.grade = e.target.value;
    filters.topic = "all";
    renderLibrary();
  });
  $("filterTopic").addEventListener("change", (e) => {
    filters.topic = e.target.value;
    renderLibrary();
  });
  $("searchInput").addEventListener("input", (e) => {
    filters.q = e.target.value.trim();
    renderLibrary();
  });
  $("resetBtn").addEventListener("click", () => {
    filters.grade = "all";
    filters.topic = "all";
    filters.q = "";
    renderLibrary();
  });

  // Click delegation (prevents cursor "blocked" issues)
  $("content").querySelectorAll(".book").forEach((el) => {
    el.addEventListener("click", () => {
      const grade = el.getAttribute("data-grade");
      const title = el.getAttribute("data-title");
      const b = (booksData[grade] && booksData[grade][title]) ? booksData[grade][title] : null;
      if (!b) return;
      if (b.ready === false) {
        alert("⏳ هذا الكتاب قيد الإعداد حالياً.");
        return;
      }
      openBook(grade, title);
    });
  });
}

function loadLibrary() { renderLibrary(); }

// -------------------- Reader --------------------
function isMobile() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function openBook(grade, title) {
  const book = booksData[grade][title];
  const url = book.url || "";

  // إذا ما في رابط أصلاً
  if (!url) {
    alert("لا يوجد رابط لهذا الكتاب في books.json");
    return;
  }

  // على الهاتف: افتح الكتاب مباشرة (أفضل حل لتوافق PDF)
  if (isMobile()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  // كمبيوتر: حاول embed
  let embedUrl = url;

  // تحويل archive details -> embed
  if (url.includes("archive.org/details/")) {
    embedUrl = url.replace("archive.org/details/", "archive.org/embed/");
  }
  // تحويل archive download -> embed (حسب الـ id)
  else if (url.includes("archive.org/download/")) {
    const parts = url.split("/");
    const id = parts[4];
    if (id) embedUrl = `https://archive.org/embed/${id}`;
  }

  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="reader-container" style="text-align:center;">
      <div style="display:flex; gap:10px; margin-bottom:20px; justify-content:center; flex-wrap:wrap;">
        <button class="primary" onclick="loadLibrary()" style="background:#555;">◀ العودة للمكتبة</button>
        <a href="${url}" target="_blank" rel="noopener noreferrer"
           class="primary" style="background:#28a745; text-decoration:none; display:inline-block; padding:10px 20px; color:white; border-radius:8px; font-weight:bold;">
          📖 ابدأ القراءة الآن (شاشة كاملة)
        </a>
      </div>

      <div class="iframe-wrapper" style="border:2px solid #ddd; border-radius:12px; overflow:hidden; background:#f9f9f9; height:70vh;">
        <iframe src="${embedUrl}" width="100%" height="100%" frameborder="0" allowfullscreen>
          <p>متصفحك لا يدعم عرض الإطارات، يرجى الضغط على زر القراءة أعلاه.</p>
        </iframe>
      </div>
    </div>
  `;

  window.scrollTo(0, 0);
}


function showBook() {
  const b = (booksData[currentGrade] && booksData[currentGrade][currentBook]) ? booksData[currentGrade][currentBook] : null;
  if (!b) {
    $("content").innerHTML = `
      <h2>📘 ${esc(currentBook)}</h2>
      <p class="muted">لم يتم العثور على بيانات هذا الكتاب في books.json.</p>
      <button class="secondary" onclick="loadLibrary()">العودة للمكتبة</button>
    `;
    return;
  }

  // External (Archive/PDF)
  if (b.url || b.file) {
    const src = b.file || b.url;
    const done = isCompleted(currentGrade, currentBook);

    // Archive embed if /details/
    let embedSrc = src;
    if (src.includes("archive.org/details/")) {
      embedSrc = src.replace("archive.org/details/", "archive.org/embed/");
    }

    $("content").innerHTML = `
      <h2>📘 ${esc(currentBook)} <span class="muted">(${esc(currentGrade)})</span></h2>
      <div class="book-meta" style="margin-bottom:10px">
        <span>🏷️ ${esc(b.topic || "عام")}</span>
        ${done ? `<span class="badge-pill">✅ مكتمل</span>` : ``}
      </div>

      <div class="reader-controls" style="margin-bottom:10px">
        <button class="secondary" onclick="loadLibrary()">⬅️ رجوع للمكتبة</button>
        <a class="primary link-btn" href="${esc(src)}" target="_blank" rel="noopener noreferrer">فتح في تبويب جديد</a>
        ${done ? `` : `<button class="primary" onclick="markCompleted()">اعتماد كمكتمل</button>`}
        ${(Array.isArray(b.quiz) && b.quiz.length) ? `<button class="primary" onclick="startQuiz()">ابدأ الاختبار</button>` : ``}
      </div>

      <iframe class="pdf-frame" src="${esc(embedSrc)}" loading="lazy" referrerpolicy="no-referrer"></iframe>
      <p class="muted" style="margin-top:10px;"> إذا لم يظهر الكتاب، استخدم زر “فتح في تبويب جديد”.</p>
    `;
    return;
  }

  // Text reader
  const pages = safeSplitText(b.content);
  const saved = getProgressOrNull(currentGrade, currentBook);
  currentPage = Math.max(0, Math.min(saved ?? 0, pages.length - 1));

  const percent = (saved === null) ? 0 : Math.round(((currentPage + 1) / Math.max(1, pages.length)) * 100);

  $("content").innerHTML = `
    <h2>📖 ${esc(currentBook)} <span class="muted">(${esc(currentGrade)})</span></h2>
    <div class="book-meta" style="margin-bottom:10px">
      <span>🏷️ ${esc(b.topic || "عام")}</span>
      <span>📄 صفحة ${currentPage + 1} من ${pages.length}</span>
    </div>

    <div class="reader-text">${esc(pages[currentPage] || "")}</div>

    <div class="progress-bar"><div class="progress" style="width:${percent}%"></div></div>

    <div class="reader-controls">
      <button class="secondary" onclick="loadLibrary()">⬅️ رجوع للمكتبة</button>
      <button class="primary" onclick="prevPage(${pages.length})">السابق</button>
      <button class="primary" onclick="nextPage(${pages.length})">التالي</button>
      ${(Array.isArray(b.quiz) && b.quiz.length) ? `<button class="primary" onclick="startQuiz()">ابدأ الاختبار</button>` : ``}
    </div>
  `;
}

function nextPage(total) {
  if (currentPage < total - 1) currentPage++;
  setProgress(currentGrade, currentBook, currentPage);
  showBook();
}
function prevPage(total) {
  if (currentPage > 0) currentPage--;
  setProgress(currentGrade, currentBook, currentPage);
  showBook();
}

// -------------------- Completion / Points / Badges --------------------
function addPoints(n) {
  setPoints(getPoints() + n);
  displayStats();
}

function markCompleted() {
  if (isCompleted(currentGrade, currentBook)) return;
  setCompleted(currentGrade, currentBook, true);
  addPoints(10);
  checkBadges();
  alert("✅ تم اعتماد الكتاب كمكتمل (+10 نقاط)");
  loadLibrary();
}

function checkBadges() {
  const badges = getBadges();
  let completedBooks = 0;

  for (const g of Object.keys(booksData || {})) {
    for (const t of Object.keys(booksData[g] || {})) {
      if (isCompleted(g, t)) completedBooks++;
    }
  }

  const newBadges = [];
  if (completedBooks >= 1 && !badges.includes("🥇 أول كتاب مكتمل")) { badges.push("🥇 أول كتاب مكتمل"); newBadges.push("🥇 أول كتاب مكتمل"); }
  if (completedBooks >= 3 && !badges.includes("🥈 متعلم متوسط")) { badges.push("🥈 متعلم متوسط"); newBadges.push("🥈 متعلم متوسط"); }
  if (completedBooks >= 5 && !badges.includes("🥉 خبير القراءة")) { badges.push("🥉 خبير القراءة"); newBadges.push("🥉 خبير القراءة"); }

  setBadges(badges);
  if (newBadges.length) alert("🎉 حصلت على شارة جديدة: " + newBadges.join("، "));
  displayStats();
}

function displayStats() {
  $("userDisplay").innerText = currentUser;
  $("pointsDisplay").innerText = String(getPoints());
  const badges = getBadges();
  $("badgesDisplay").innerHTML = badges.map((b) => `<span class="badge-emoji">${esc(b)}</span>`).join("");
}

// -------------------- Quiz (optional) --------------------
function startQuiz() {
  const b = booksData[currentGrade][currentBook] || {};
  const qlist = b.quiz || [];
  if (!qlist.length) { alert("لا يوجد اختبار لهذا الكتاب بعد."); return; }

  const quiz = qlist[0];
  let html = `<h3>${esc(quiz.question)}</h3>`;
  (quiz.options || []).forEach((opt, idx) => {
    html += `<button class="primary" onclick="checkAnswer(${idx},${quiz.answer})">${esc(opt)}</button><br>`;
  });
  html += `<div style="margin-top:10px"><button class="secondary" onclick="showBook()">⬅️ رجوع للكتاب</button></div>`;
  $("content").innerHTML = html;
}

function checkAnswer(selected, correct) {
  if (selected === correct) {
    addPoints(10);
    alert("✅ إجابة صحيحة! +10 نقاط");
  } else {
    alert("❌ إجابة خاطئة");
  }
  loadLibrary();
}

// -------------------- Achievements page --------------------
function showAchievements() {
  const points = getPoints();
  const badges = getBadges();

  const completed = [];
  for (const g of Object.keys(booksData || {})) {
    for (const t of Object.keys(booksData[g] || {})) {
      if (isCompleted(g, t)) completed.push({ grade: g, title: t, topic: (booksData[g][t].topic || "عام") });
    }
  }

  let html = `
    <h2>🏅 إنجازاتي</h2>
    <p>🏆 النقاط: <strong>${points}</strong></p>
    <p>🎖 الشارات: ${badges.length ? badges.map((b) => `<span class="badge-emoji">${esc(b)}</span>`).join("") : '<span class="muted">لا توجد شارات بعد</span>'}</p>
    <h3 style="margin-top:18px">✅ الكتب المكتملة (${completed.length})</h3>
  `;

  if (!completed.length) {
    html += `<p class="muted">لا توجد كتب مكتملة بعد.</p>`;
  } else {
    const by = {};
    completed.forEach((x) => (by[x.grade] = by[x.grade] || []).push(x));
    for (const g of Object.keys(by).sort((a, b) => {
      const n = (k) => {
        const m = String(k).match(/\d+/);   // يدعم "الصف 9" أو "9"
        return m ? parseInt(m[0], 10) : 9999;
      };
      return n(a) - n(b);
    })) {
      html += `<h4 class="grade-title">${esc(g)}</h4>`;
      by[g].forEach((x) => {
        html += `<div class="book completed-book">✅ ${esc(x.title)} <span class="muted">(${esc(x.topic)})</span></div>`;
      });
    }
  }

  html += `<div style="margin-top:14px"><button class="secondary" onclick="loadLibrary()">⬅️ رجوع للمكتبة</button></div>`;
  $("content").innerHTML = html;
}

// -------------------- Login modal --------------------
function openLogin() {
  const modal = $("loginModal");
  if (!modal) { alert("نافذة تسجيل الدخول غير موجودة في index.html"); return; }
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  const inp = $("usernameInput");
  if (inp) { inp.value = (currentUser === "زائر") ? "" : currentUser; inp.focus(); }
}

function closeLogin() {
  const modal = $("loginModal");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
}

function login() {
  const inp = $("usernameInput");
  if (!inp) { alert("حقل اسم المستخدم غير موجود."); return; }
  const name = (inp.value || "").trim();
  if (!name) { alert("اكتب اسم مستخدم."); return; }

  currentUser = name;
  localStorage.setItem("rp_user", currentUser);
  closeLogin();
  displayStats();
  loadLibrary();
}

function logout() {
  currentUser = "زائر";
  localStorage.setItem("rp_user", currentUser);
  displayStats();
  loadLibrary();
}

// -------------------- Dark mode --------------------
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
}

// Expose for inline onclick (index.html uses them)
window.openLogin = openLogin;
window.closeLogin = closeLogin;
window.login = login;
window.logout = logout;
window.loadLibrary = loadLibrary;
window.showAchievements = showAchievements;
window.toggleDarkMode = toggleDarkMode;
window.openBook = openBook;
window.markCompleted = markCompleted;
window.startQuiz = startQuiz;
window.checkAnswer = checkAnswer;
window.nextPage = nextPage;
window.prevPage = prevPage;

async function updateVisitorCounter() {
  const el = document.getElementById("visitorCounterText");
  if (!el) return;

  try {
    // ns: يفضّل يكون دومين موقعك لتفادي التعارض
    const ns = "kuferabeel2026.github.io";
    // action: اسم نوع الحدث (مثلاً view)
    const action = "view";
    // key: اسم ثابت لعداد واحد للموقع كله (مثلاً homepage)
    const key = "arabic-reading";

    const url = `https://counterapi.com/api/${encodeURIComponent(ns)}/${encodeURIComponent(action)}/${encodeURIComponent(key)}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    el.textContent = data.value;
  } catch (e) {
    el.textContent = "غير متاح";
    console.error(e);
  }
}


// -------------------- Load books --------------------
async function loadBooks() {
  try {
   
    const res = await fetch(`books.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    booksData = normalizeBooksData(data);
    displayStats();
    loadLibrary();
  } catch (e) {
    console.error(e);
    $("content").innerHTML = `
      <h2>خطأ في تحميل الكتب</h2>
      <p class="muted">تأكد أن ملف <code>books.json</code> موجود وصيغته JSON صحيحة، وأنك تشغل الموقع عبر خادم (مثل: <code>python -m http.server 8080</code>).</p>
      <pre class="muted" style="white-space:pre-wrap">${esc(String(e))}</pre>
    `;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateVisitorCounter();
  loadBooks();
});


