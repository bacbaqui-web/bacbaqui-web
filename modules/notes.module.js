import { auth, userRefs } from "../firebaseClient.js";
import { ensureLogin, showAlert, showFeedbackMessage } from "../utils.js";
import {
  onSnapshot,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let styleEl = null;
let rootEl = null;
let unsubs = [];

let model = {
  notesTabList: [],
  notesById: {},
  notesActiveTabId: null
};

let saveTimer = null;

function injectStyle() {
  styleEl = document.createElement("style");
  styleEl.id = "notes-module-style";
  styleEl.textContent = `
    .notes-area{flex-grow:1;resize:vertical}
    textarea#notesArea::-webkit-scrollbar{width:8px;background-color:#2a2a2a;border-radius:10px}
    textarea#notesArea::-webkit-scrollbar-thumb{background-color:#555;border-radius:10px}

    .notepad-tab .tab-gear{margin-left:6px;opacity:.75;font-weight:700}
    .notepad-tab .tab-gear:hover{opacity:1}
    .notepad-tab.add-tab{min-width:40px;display:flex;justify-content:center;align-items:center}
  `;
  document.head.appendChild(styleEl);
}

function buildUI(container) {
  container.innerHTML = `
    <div class="section-card" id="notes-section">
      <div id="notesTabs" class="notepad-tabs"></div>
      <textarea id="notesArea" class="w-full notes-area p-4 bg-black text-white border border-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-500 rounded-lg" placeholder="메모..."></textarea>
    </div>

    <div id="tabSettingsModal" class="modal">
      <div class="modal-content">
        <h2 class="text-xl font-bold mb-4">탭 설정</h2>

        <label class="block mb-2 text-sm opacity-80">탭 이름</label>
        <input type="text" id="tabNameInput" class="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 mb-4 text-white">

        <div class="flex justify-between items-center mb-4">
          <div class="flex gap-2">
            <button id="tabMoveLeftBtn" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded-lg">←</button>
            <button id="tabMoveRightBtn" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded-lg">→</button>
          </div>
          <button id="tabDeleteBtn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">삭제</button>
        </div>

        <div class="flex justify-end gap-2">
          <button id="tabSaveBtn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">저장</button>
          <button id="tabCancelBtn" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">취소</button>
        </div>
      </div>
    </div>
  `;
}

function makeId() {
  return `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function setModel(patch) {
  model = { ...model, ...patch };
}

async function cloudSaveModel() {
  if (!ensureLogin()) return;
  const { stateDoc } = userRefs(auth.currentUser.uid);
  await setDoc(stateDoc, {
    notesTabList: model.notesTabList,
    notesById: model.notesById,
    notesActiveTabId: model.notesActiveTabId
  }, { merge: true });
}

function cloudSaveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    cloudSaveModel().catch(() => {});
  }, 800);
}

function ensureDefaultsIfEmpty() {
  if (model.notesTabList.length > 0) {
    if (!model.notesTabList.some(t => t.id === model.notesActiveTabId)) {
      setModel({ notesActiveTabId: model.notesTabList[0]?.id || null });
    }
    return;
  }

  const defaults = ["바퀴멘터리", "짐승육아", "그거아세요", "메모"];
  const list = defaults.map((name) => ({ id: makeId(), name }));
  const byId = {};
  list.forEach((t) => (byId[t.id] = ""));
  setModel({
    notesTabList: list,
    notesById: byId,
    notesActiveTabId: list[0]?.id || null
  });

  // 로그인 상태면 1회 저장
  if (auth.currentUser) cloudSaveModel().catch(() => {});
}

function saveTextareaToModel() {
  const notesArea = document.getElementById("notesArea");
  if (!notesArea) return;
  if (!model.notesActiveTabId) return;
  const next = { ...(model.notesById || {}) };
  next[model.notesActiveTabId] = notesArea.value ?? "";
  setModel({ notesById: next });
}

function loadTextareaFromModel() {
  const notesArea = document.getElementById("notesArea");
  if (!notesArea) return;
  if (!model.notesActiveTabId) {
    notesArea.value = "";
    return;
  }
  notesArea.value = (model.notesById && model.notesById[model.notesActiveTabId]) ? model.notesById[model.notesActiveTabId] : "";
}

let editingTabId = null;
function openSettings(tabId) {
  if (!ensureLogin()) return;
  const modal = document.getElementById("tabSettingsModal");
  const nameInput = document.getElementById("tabNameInput");
  const btnLeft = document.getElementById("tabMoveLeftBtn");
  const btnRight = document.getElementById("tabMoveRightBtn");

  const tab = model.notesTabList.find((t) => t.id === tabId);
  if (!tab || !modal || !nameInput) return;

  editingTabId = tabId;
  nameInput.value = tab.name || "";

  const idx = model.notesTabList.findIndex((t) => t.id === tabId);
  if (btnLeft) btnLeft.disabled = idx <= 0;
  if (btnRight) btnRight.disabled = idx < 0 || idx >= model.notesTabList.length - 1;

  modal.style.display = "flex";
  nameInput.focus();
  nameInput.select();
}

function closeSettings() {
  const modal = document.getElementById("tabSettingsModal");
  editingTabId = null;
  if (modal) modal.style.display = "none";
}

function moveTab(delta) {
  if (!editingTabId) return;
  const list = [...model.notesTabList];
  const idx = list.findIndex((t) => t.id === editingTabId);
  const nextIdx = idx + delta;
  if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return;
  [list[idx], list[nextIdx]] = [list[nextIdx], list[idx]];
  setModel({ notesTabList: list });
  render();
  openSettings(editingTabId);
  cloudSaveDebounced();
}

function deleteTab() {
  if (!editingTabId) return;

  if (model.notesTabList.length <= 1) {
    showAlert("최소 1개의 탭은 남겨두어야 합니다.");
    return;
  }

  const tab = model.notesTabList.find((t) => t.id === editingTabId);
  const ok = confirm(`'${tab?.name || "탭"}' 을(를) 삭제하시겠습니까?\n(해당 탭의 메모도 함께 삭제됩니다)`);
  if (!ok) return;

  saveTextareaToModel();

  const list = model.notesTabList.filter((t) => t.id !== editingTabId);
  const byId = { ...(model.notesById || {}) };
  delete byId[editingTabId];

  let nextActive = model.notesActiveTabId;
  if (model.notesActiveTabId === editingTabId) nextActive = list[0]?.id || null;

  setModel({ notesTabList: list, notesById: byId, notesActiveTabId: nextActive });

  closeSettings();
  render();
  loadTextareaFromModel();
  cloudSaveDebounced();
}

function saveSettings() {
  if (!editingTabId) return;
  const nameInput = document.getElementById("tabNameInput");
  const newName = (nameInput?.value || "").trim();
  if (!newName) {
    showAlert("탭 이름을 입력해 주세요.");
    return;
  }
  const dup = model.notesTabList.some((t) => t.id !== editingTabId && (t.name || "").trim() === newName);
  if (dup) {
    showAlert("이미 같은 이름의 탭이 있습니다.");
    return;
  }

  const list = [...model.notesTabList];
  const idx = list.findIndex((t) => t.id === editingTabId);
  if (idx < 0) return;
  list[idx] = { ...list[idx], name: newName };
  setModel({ notesTabList: list });

  render();
  closeSettings();
  cloudSaveDebounced();
}

function render() {
  ensureDefaultsIfEmpty();

  const tabsWrap = document.getElementById("notesTabs");
  if (!tabsWrap) return;

  tabsWrap.innerHTML = "";

  model.notesTabList.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className = "notepad-tab";
    btn.type = "button";
    btn.textContent = tab.name;

    if (tab.id === model.notesActiveTabId) btn.classList.add("active");

    const gear = document.createElement("span");
    gear.className = "tab-gear";
    gear.textContent = "⚙︎";
    gear.title = "탭 설정";
    gear.addEventListener("click", (e) => {
      e.stopPropagation();
      openSettings(tab.id);
    });

    btn.appendChild(gear);

    btn.addEventListener("click", () => {
      saveTextareaToModel();
      setModel({ notesActiveTabId: tab.id });
      loadTextareaFromModel();
      render();
      cloudSaveDebounced();
    });

    tabsWrap.appendChild(btn);
  });

  // + 탭
  const addBtn = document.createElement("button");
  addBtn.className = "notepad-tab add-tab";
  addBtn.type = "button";
  addBtn.textContent = "+";
  addBtn.title = "새 탭 추가";

  addBtn.addEventListener("click", () => {
    if (!ensureLogin()) return;

    saveTextareaToModel();

    const id = makeId();
    const newTab = { id, name: "새 탭" };
    const list = [...model.notesTabList, newTab];
    const byId = { ...(model.notesById || {}), [id]: "" };

    setModel({ notesTabList: list, notesById: byId, notesActiveTabId: id });

    render();
    loadTextareaFromModel();
    openSettings(id);
    cloudSaveDebounced();
  });

  tabsWrap.appendChild(addBtn);
}

function wireEvents() {
  const notesArea = document.getElementById("notesArea");
  notesArea?.addEventListener("input", () => {
    saveTextareaToModel();
    cloudSaveDebounced();
  });

  notesArea?.addEventListener("blur", () => {
    saveTextareaToModel();
    cloudSaveModel().catch(() => {});
  });

  document.getElementById("tabMoveLeftBtn")?.addEventListener("click", () => moveTab(-1));
  document.getElementById("tabMoveRightBtn")?.addEventListener("click", () => moveTab(1));
  document.getElementById("tabDeleteBtn")?.addEventListener("click", deleteTab);
  document.getElementById("tabSaveBtn")?.addEventListener("click", saveSettings);
  document.getElementById("tabCancelBtn")?.addEventListener("click", closeSettings);

  const modal = document.getElementById("tabSettingsModal");
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeSettings(); });

  const nameInput = document.getElementById("tabNameInput");
  nameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveSettings();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeSettings();
    }
  });
}

function startSync() {
  unsubs.forEach((fn) => { try { fn(); } catch {} });
  unsubs = [];

  if (!auth.currentUser) {
    model = { notesTabList: [], notesById: {}, notesActiveTabId: null };
    render();
    loadTextareaFromModel();
    return;
  }

  const { stateDoc } = userRefs(auth.currentUser.uid);

  const unsub = onSnapshot(stateDoc, (ds) => {
    const data = ds.exists() ? (ds.data() || {}) : {};
    setModel({
      notesTabList: Array.isArray(data.notesTabList) ? data.notesTabList : [],
      notesById: data.notesById && typeof data.notesById === "object" ? data.notesById : {},
      notesActiveTabId: data.notesActiveTabId || null
    });

    render();
    loadTextareaFromModel();
  });

  unsubs.push(unsub);
}

export function mount(container) {
  rootEl = container;
  injectStyle();
  buildUI(container);
  wireEvents();
  startSync();
  render();
  loadTextareaFromModel();
}

export function unmount() {
  clearTimeout(saveTimer);
  saveTimer = null;
  unsubs.forEach((fn) => { try { fn(); } catch {} });
  unsubs = [];
  if (styleEl) styleEl.remove();
  styleEl = null;
  rootEl = null;
}
