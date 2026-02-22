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

// 1. الدالة المسؤولة عن بناء المكتبة بنظام الرفوف
function renderLibrary() {
  const content = document.getElementById("content");
  if (!content) return;
  content.innerHTML = ""; // تنظيف الصفحة

  if (!currentGrade) {
    // عرض نظام الرفوف (عندما لا يكون هناك فلتر)
    for (let grade in booksData) {
      const booksInGrade = Object.keys(booksData[grade]);
      if (booksInGrade.length === 0) continue;

      const shelf = document.createElement("div");
      shelf.className = "shelf-container";

      // هنا يتم تجميع بطاقات الكتب داخل الرف
      let booksCardsHtml = "";
      booksInGrade.forEach(title => {
        booksCardsHtml += createBookCard(grade, title);
      });

      shelf.innerHTML = `
        <div class="shelf-header">
          <h2 class="shelf-title">📚 ${grade}</h2>
          <span class="shelf-count">${booksInGrade.length} كتب</span>
        </div>
        <div class="books-grid">
          ${booksCardsHtml}
        </div>
      `;
      content.appendChild(shelf);
    }
  } else {
    // عرض صف معين عند استخدام الفلترة
    const books = booksData[currentGrade] || {};
    const titles = Object.keys(books);
    let booksCardsHtml = "";
    titles.forEach(t => {
      booksCardsHtml += createBookCard(currentGrade, t);
    });

    content.innerHTML = `
      <div class="shelf-header">
        <h2 class="shelf-title">نتائج البحث: ${currentGrade}</h2>
      </div>
      <div class="books-grid">
        ${booksCardsHtml}
      </div>
    `;
  }
}

// 2. الدالة المسؤولة عن بناء "كارت" الكتاب الواحد
function createBookCard(grade, title) {
  const book = booksData[grade][title];
  const isCompleted = localStorage.getItem(bkey(grade, title) + "__completed") === "true";
  const progress = getProgressOrNull(grade, title);

  return `
    <div class="book-card" style="background:#fff; border:1px solid #ddd; padding:15px; border-radius:10px; display:flex; flex-direction:column; justify-content:space-between; min-height:150px;">
      <div>
        <h4 style="margin:0; color:#1f4068; font-size:1.1rem;">${title}</h4>
        <p style="font-size:0.85rem; color:#666; margin:5px 0;">🏷️ ${book.topic || "عام"}</p>
        ${isCompleted ? '<span style="color:green; font-size:0.8rem;">✅ مكتمل</span>' : ''}
      </div>
      <div style="margin-top:10px;">
        <button class="primary" onclick="openBook('${grade}', '${title}')" style="width:100%; padding:8px; cursor:pointer;">
          ${progress !== null ? "استكمال" : "قراءة"}
        </button>
      </div>
    </div>
  `;
}

function loadLibrary() { 
  currentGrade = null; // إضافة هذا السطر لتصفير الفلتر عند العودة
  renderLibrary(); 
}

// -------------------- Reader --------------------
function isMobile() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function openBook(grade, title) {
  // لازم لضمان عمل markCompleted()
  currentGrade = grade;
  currentBook = title;

  const book = booksData[grade][title];
  const url = book.url || "";

  if (!url) {
    alert("لا يوجد رابط لهذا الكتاب في books.json");
    return;
  }

  const done = isCompleted(grade, title);

  // على الهاتف: افتح الكتاب مباشرة + اعرض زر المكتمل هنا (لأنه ما في واجهة قارئ)
  if (isMobile()) {
    currentGrade = grade;
    currentBook = title;

    const book = booksData[grade][title];
    const url = book.url || "";
    const done = isCompleted(grade, title);

    const content = document.getElementById("content");
    content.innerHTML = `
    <div class="btn-row">
      <button class="primary btn-gray" onclick="loadLibrary()">◀ العودة للمكتبة</button>

      <a href="${url}" target="_blank" rel="noopener noreferrer"
         class="primary link-btn btn-green">
         📖 ابدأ القراءة الآن (شاشة كاملة)
      </a>

      ${done
        ? `<div style="margin-top:10px; font-weight:bold;">✅ هذا الكتاب مكتمل</div>`
        : `<button class="primary" onclick="markCompleted()">✅ اعتماد كمكتمل</button>`
      }
    </div>
  `;
    return;
  }


  // كمبيوتر: حاول embed
  let embedUrl = url;

  if (url.includes("archive.org/details/")) {
    embedUrl = url.replace("archive.org/details/", "archive.org/embed/");
  } else if (url.includes("archive.org/download/")) {
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

        ${done ? "" : `<button class="primary" onclick="markCompleted()">✅ اعتماد كمكتمل</button>`}
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
  const content = document.getElementById("content");
  if (!content) return;

  const points = getPoints();
  const badges = getBadges();

  // جلب الكتب المكتملة من LocalStorage
  const completedBooks = [];
  for (let grade in booksData) {
    for (let title in booksData[grade]) {
      if (localStorage.getItem(bkey(grade, title) + "__completed") === "true") {
        completedBooks.push(title);
      }
    }
  }

  content.innerHTML = `
    <div class="achievements-page" style="text-align:center; padding:20px;">
      <h2 style="color:#1f4068;">🏅 لوحة إنجازات القارئ</h2>
      <div class="score-card" style="background:#78dae7; padding:20px; border-radius:15px; margin-bottom:20px;">
        <p style="font-size:1.2rem;">أهلاً بك يا <strong>${currentUser}</strong></p>
        <h3 style="font-size:2rem; margin:10px 0;">رصيدك: ${points} نقطة</h3>
      </div>
      
      <div class="badges-section">
        <h4>🎖 الشارات المستحقة</h4>
        <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
          ${badges.length > 0 ? badges.map(b => `<span class="badge-item" style="background:#ffd700; padding:10px; border-radius:10px;">${b}</span>`).join('') : "<p>اقرأ مزيداً من الكتب للحصول على شارات!</p>"}
        </div>
      </div>

      <div class="completed-list" style="margin-top:20px; text-align:right;">
        <h4>📚 الكتب التي أتممتها:</h4>
        ${completedBooks.length > 0 ? `<ul>${completedBooks.map(t => `<li>✅ ${t}</li>`).join('')}</ul>` : "<p>لم تنهِ أي كتاب بعد. ابدأ القراءة الآن!</p>"}
      </div>
      
      <button class="primary" onclick="loadLibrary()" style="margin-top:20px;">العودة للمكتبة</button>
    </div>
  `;
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
window.sendEmailToSchool = sendEmailToSchool;

// -------------------- Load books --------------------
async function loadBooks() {
  try {
    // تم إزالة كود تحديث العداد القديم من هنا لضمان الاستقرار

    const res = await fetch(`books.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    booksData = normalizeBooksData(data);
    displayStats();
    loadLibrary();
  } catch (e) {
    console.error(e);
    // ... بقية كود معالجة الخطأ الموجود 
  }
}

document.addEventListener("DOMContentLoaded", loadBooks);

function sendEmailToSchool() {
  const email = "kuferabeelschool@gmail.com";
  const name = (document.getElementById("cName")?.value || "").trim();
  const phone = (document.getElementById("cPhone")?.value || "").trim();
  const subject = (document.getElementById("cSubject")?.value || "التواصل مع المدرسة").trim();
  const msg = (document.getElementById("cMsg")?.value || "").trim();

  const body =
    `الاسم: ${name || "-"}
رقم الهاتف: ${phone || "-"}
----------------
الرسالة:
${msg || "-"}`;

  window.location.href =
    `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// دالة الفلترة الجديدة لربط القائمة المنسدلة بنظام الرفوف
function filterByGrade(grade) {
  currentGrade = grade || null; // تخزين الصف المختار أو إفراغه للعودة للرفوف
  renderLibrary(); // إعادة بناء المكتبة بناءً على الاختيار
  window.scrollTo({ top: 0, behavior: 'smooth' }); // العودة لأعلى الصفحة بسلاسة
}

// تصدير الدالة لتكون قابلة للاستدعاء من ملف HTML
window.filterByGrade = filterByGrade;

س