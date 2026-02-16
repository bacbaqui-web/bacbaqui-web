import {
  auth,
  userRefs,
  db
} from "../firebaseClient.js";
import {
  ensureLogin,
  showAlert,
  showFeedbackMessage,
  ymdKST,
  toKST
} from "../utils.js";

import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let rootEl = null;
let styleEl = null;
let unsubs = [];

// module state
let currentDate = new Date();
let customTasks = [];
let taskStatus = {};
let isReady = false;

function injectStyle() {
  styleEl = document.createElement("style");
  styleEl.id = "calendar-module-style";
  styleEl.textContent = `
    .calendar-header{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px}
    .calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
    .day-label,.calendar-day{text-align:center;padding:8px 2px;border-radius:8px;background:#2a2a2a;position:relative;overflow:hidden;word-wrap:break-word}
    .day-label{background:#444;font-weight:700;color:#fff;font-size:.8rem;padding:8px 0}
    .calendar-day{min-height:160px;padding-top:16px;padding-left:2px;padding-right:2px;display:flex;flex-direction:column;gap:2px}
    .calendar-day.today{border:2px solid #ccc}
    .day-number{position:absolute;top:8px;left:8px;font-size:.85rem;font-weight:700;color:#aaa;z-index:10}
    .task-item{font-size:.85rem;padding:5px 6px;border-radius:8px;margin-top:4px;word-wrap:break-word;cursor:pointer;text-align:left}
    .task-item.custom-task{background:#4c78a8}
    .task-item.episode-task{background:#444;color:#ddd}
    .task-item.complete{background:#888;text-decoration:line-through;color:#ccc}
    .add-task-btn{background:#666;transition:.2s}
    .add-task-btn:hover{background:#777;transform:scale(1.02)}

    .daily-check-group{display:flex;width:100%;gap:2px;margin-top:2px}
    .daily-check-btn{flex:1;text-align:center;font-size:.75rem;padding:4px 0;border-radius:4px;background:#444;color:#ccc;cursor:pointer;transition:background .2s,color .2s;font-weight:500}
    .daily-check-btn:hover{opacity:.9}
    .daily-check-btn.shorts.active{background:#dc2626;color:#fff;font-weight:700}
    .daily-check-btn.webtoon.active{background:#eab308;color:#000;font-weight:700}

    @media (max-width:768px){
      .calendar-day{min-height:120px;padding:1.5rem .2rem .2rem;gap:1px}
      .day-number{font-size:.75rem;top:.5rem;left:.5rem}
      .task-item{font-size:.85rem;padding:2px 4px;margin-top:2px}
      .calendar-grid,.calendar-header{gap:0}
      .add-task-btn{width:100%;font-size:.9rem}
    }
    .calendar-grid{grid-gap:4px}
    @media (max-width:768px){.calendar-grid{grid-gap:0}}
  `;
  document.head.appendChild(styleEl);
}

function buildUI(container) {
  container.innerHTML = `
    <div class="section-card" id="calendar-section">
      <div class="flex justify-between items-center mb-4">
        <button id="prevMonthBtn" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">&lt; 이전 달</button>
        <h2 id="currentMonthYear" class="text-lg font-bold"></h2>
        <button id="nextMonthBtn" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">다음 달 &gt;</button>
      </div>
      <div class="calendar-header mb-2">
        <div class="day-label">일</div><div class="day-label">월</div><div class="day-label">화</div>
        <div class="day-label">수</div><div class="day-label">목</div><div class="day-label">금</div><div class="day-label">토</div>
      </div>
      <div class="calendar-grid" id="calendarGrid"></div>
      <div class="mt-8 text-center">
        <button id="addTaskBtn" class="add-task-btn px-6 py-3 rounded-full font-bold text-white shadow-md">+ 개인 작업 추가</button>
      </div>
    </div>

    <div class="modal" id="taskModal">
      <div class="modal-content">
        <h2 class="text-2xl font-bold mb-4" id="modalTitle">새 작업</h2>
        <label class="block mb-2">제목:</label>
        <input id="taskTitle" type="text" class="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 mb-4" />
        <label class="block mb-2">설명:</label>
        <textarea id="taskDescription" class="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 mb-4 h-24"></textarea>
        <label class="block mb-2">날짜:</label>
        <input id="taskDate" type="date" class="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 mb-4" />
        <div class="flex justify-end gap-2">
          <button id="saveTaskBtn" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">저장</button>
          <button id="cancelBtn" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">취소</button>
          <button id="deleteTaskBtn" class="bg-gray-700 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded-lg hidden">삭제</button>
        </div>
      </div>
    </div>
  `;
}

function toKstDateInputValue(ymd) {
  // ymd is yyyy-mm-dd
  return ymd;
}

function countWeekdaysBetweenKST(a, b) {
  let c = 0;
  const start = toKST(new Date(Math.min(a, b)));
  const end = toKST(new Date(Math.max(a, b)));
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d >= 0 && d <= 4) c++;
    cur.setDate(cur.getDate() + 1);
  }
  return c;
}

async function cloudSaveAll() {
  if (!ensureLogin()) return;
  const uid = auth.currentUser.uid;
  const { tasksCol, stateDoc } = userRefs(uid);

  await setDoc(stateDoc, { taskStatus }, { merge: true });
  const ops = customTasks.map((t) => setDoc(doc(tasksCol, String(t.id)), t, { merge: true }));
  await Promise.all(ops);
}

async function cloudSaveStateOnly() {
  if (!ensureLogin()) return;
  const uid = auth.currentUser.uid;
  const { stateDoc } = userRefs(uid);
  await setDoc(stateDoc, { taskStatus }, { merge: true });
}

let currentTask = null;
function openModal(task = null) {
  currentTask = task;
  const taskModal = document.getElementById("taskModal");
  const deleteTaskBtn = document.getElementById("deleteTaskBtn");
  const taskTitleInput = document.getElementById("taskTitle");
  const taskDescriptionInput = document.getElementById("taskDescription");
  const taskDateInput = document.getElementById("taskDate");

  if (!taskModal || !taskTitleInput || !taskDescriptionInput || !taskDateInput) return;

  if (task && task.id) {
    document.getElementById("modalTitle").textContent = "작업 수정";
    taskTitleInput.value = task.title || "";
    taskDescriptionInput.value = task.description || "";
    taskDateInput.value = toKstDateInputValue(task.date || "");
    deleteTaskBtn.classList.remove("hidden");
  } else {
    document.getElementById("modalTitle").textContent = "새 작업";
    taskTitleInput.value = "";
    taskDescriptionInput.value = "";
    taskDateInput.value = toKstDateInputValue(task?.date || "");
    deleteTaskBtn.classList.add("hidden");
  }
  taskModal.style.display = "flex";
}

function closeModal() {
  const taskModal = document.getElementById("taskModal");
  if (taskModal) taskModal.style.display = "none";
}

async function saveTask() {
  if (!ensureLogin()) return;
  const title = document.getElementById("taskTitle").value.trim();
  const description = document.getElementById("taskDescription").value.trim();
  const date = document.getElementById("taskDate").value;

  if (!title) {
    showFeedbackMessage("제목을 입력해주세요.");
    return;
  }

  const data = {
    id: currentTask?.id ? currentTask.id : Date.now(),
    title,
    description,
    date,
    complete: currentTask?.complete ?? false
  };

  const list = [...customTasks];
  const idx = list.findIndex((t) => String(t.id) === String(data.id));
  if (idx > -1) list[idx] = data;
  else list.push(data);
  customTasks = list;

  await cloudSaveAll();
  closeModal();
  render();
}

async function deleteTask() {
  if (!ensureLogin()) return;
  if (!currentTask?.id) return closeModal();

  // DB에서도 문서 삭제 (정리)
  try {
    const uid = auth.currentUser.uid;
    const { tasksCol } = userRefs(uid);
    await deleteDoc(doc(tasksCol, String(currentTask.id)));
  } catch {}

  customTasks = customTasks.filter((t) => String(t.id) !== String(currentTask.id));
  await cloudSaveAll();
  closeModal();
  render();
}

function wireEvents() {
  document.getElementById("cancelBtn")?.addEventListener("click", closeModal);
  document.getElementById("saveTaskBtn")?.addEventListener("click", saveTask);
  document.getElementById("deleteTaskBtn")?.addEventListener("click", deleteTask);

  const taskModal = document.getElementById("taskModal");
  taskModal?.addEventListener("click", (e) => { if (e.target === taskModal) closeModal(); });

  document.getElementById("addTaskBtn")?.addEventListener("click", () => openModal());
  document.getElementById("prevMonthBtn")?.addEventListener("click", () => { currentDate.setMonth(currentDate.getMonth() - 1); render(); });
  document.getElementById("nextMonthBtn")?.addEventListener("click", () => { currentDate.setMonth(currentDate.getMonth() + 1); render(); });
}

function render() {
  const currentMonthYear = document.getElementById("currentMonthYear");
  const calendarGrid = document.getElementById("calendarGrid");
  if (!currentMonthYear || !calendarGrid) return;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  currentMonthYear.textContent = `${year}년 ${month + 1}월`;
  calendarGrid.innerHTML = "";

  const firstDay = toKST(new Date(year, month, 1)).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day";
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayDiv = document.createElement("div");
    dayDiv.classList.add("calendar-day", "relative");

    const thisDate = new Date(year, month, day);
    const fullDate = ymdKST(thisDate);
    const dayOfWeek = toKST(thisDate).getDay();

    const today = toKST(new Date());
    if (ymdKST(thisDate) === ymdKST(today)) dayDiv.classList.add("today");

    const dayNumberSpan = document.createElement("span");
    dayNumberSpan.classList.add("day-number");
    dayNumberSpan.textContent = day;
    dayDiv.appendChild(dayNumberSpan);

    // 평일 에피소드
    if (dayOfWeek >= 0 && dayOfWeek <= 4) {
      const milestoneDate = new Date("2025-09-01");
      const weekdaysBetween = countWeekdaysBetweenKST(milestoneDate.getTime(), thisDate.getTime());
      const milestoneEpisode = 2014;
      const episodeNumber =
        toKST(thisDate) >= toKST(milestoneDate)
          ? milestoneEpisode + weekdaysBetween - 1
          : milestoneEpisode - (weekdaysBetween - 1);

      const epItem = document.createElement("div");
      epItem.classList.add("task-item", "episode-task");
      epItem.textContent = `${episodeNumber}화`;

      const key = `${fullDate}_바퀴멘터리 ${episodeNumber}화`;
      if (taskStatus[key]) epItem.classList.add("complete");

      epItem.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!ensureLogin()) return;
        taskStatus = { ...taskStatus, [key]: !taskStatus[key] };
        await cloudSaveStateOnly();
        render();
      });

      dayDiv.appendChild(epItem);
    }

    // 쇼츠/웹툰 체크
    const checkGroup = document.createElement("div");
    checkGroup.className = "daily-check-group";

    const shortsKey = `${fullDate}_DAILY_SHORTS`;
    const webtoonKey = `${fullDate}_DAILY_WEBTOON`;

    const shortsBtn = document.createElement("div");
    shortsBtn.className = "daily-check-btn shorts";
    shortsBtn.textContent = "쇼츠";

    const webtoonBtn = document.createElement("div");
    webtoonBtn.className = "daily-check-btn webtoon";
    webtoonBtn.textContent = "웹툰";

    if (taskStatus[shortsKey]) shortsBtn.classList.add("active");
    if (taskStatus[webtoonKey]) webtoonBtn.classList.add("active");

    shortsBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!ensureLogin()) return;
      taskStatus = { ...taskStatus, [shortsKey]: !taskStatus[shortsKey] };
      await cloudSaveStateOnly();
      render();
    });

    webtoonBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!ensureLogin()) return;
      taskStatus = { ...taskStatus, [webtoonKey]: !taskStatus[webtoonKey] };
      await cloudSaveStateOnly();
      render();
    });

    checkGroup.appendChild(shortsBtn);
    checkGroup.appendChild(webtoonBtn);
    dayDiv.appendChild(checkGroup);

    // 개인 작업
    const tasksForDay = customTasks.filter((t) => t.date === fullDate);
    tasksForDay.forEach((t) => {
      const item = document.createElement("div");
      item.classList.add("task-item", "custom-task");
      if (t.complete) item.classList.add("complete");
      item.textContent = t.title;
      item.addEventListener("click", (e) => { e.stopPropagation(); openModal(t); });
      dayDiv.appendChild(item);
    });

    dayDiv.addEventListener("dblclick", () => openModal({ date: fullDate }));

    calendarGrid.appendChild(dayDiv);
  }
}

function startSync() {
  // cleanup
  unsubs.forEach((fn) => { try { fn(); } catch {} });
  unsubs = [];

  isReady = false;

  if (!auth.currentUser) {
    customTasks = [];
    taskStatus = {};
    render();
    isReady = true;
    return;
  }

  const { tasksCol, stateDoc } = userRefs(auth.currentUser.uid);

  const u1 = onSnapshot(tasksCol, (snap) => {
    customTasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  unsubs.push(u1);

  const u2 = onSnapshot(stateDoc, (ds) => {
    const data = ds.exists() ? (ds.data() || {}) : {};
    taskStatus = data.taskStatus || {};
    render();
  });
  unsubs.push(u2);

  isReady = true;
}

export function mount(container) {
  rootEl = container;
  injectStyle();
  buildUI(container);
  wireEvents();
  startSync();
  render();
}

export function unmount() {
  unsubs.forEach((fn) => { try { fn(); } catch {} });
  unsubs = [];
  if (styleEl) styleEl.remove();
  styleEl = null;
  rootEl = null;
}
