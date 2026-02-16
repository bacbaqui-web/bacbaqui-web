import { auth, userRefs } from "../firebaseClient.js";
import { ensureLogin, showAlert, showFeedbackMessage, setLoading } from "../utils.js";
import {
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let styleEl = null;
let rootEl = null;
let unsubs = [];

let model = {
  notesById: {},          // { [id]: string }
  notesActiveTabId: null  // string
};

let saveTimer = null;

function injectStyle() {
  if (styleEl) return;
  styleEl = document.createElement("style");
  styleEl.id = "notes-module-style";
  styleEl.textContent = `
    /* ✅ 노트 모듈: 화면을 크게 쓰도록 레이아웃 보강 */
    .notes-module-wrap{
      display:flex;
      flex-direction:column;
      gap:12px;
      /* 상단 로그인바/탭/여백 고려: 필요하면 숫자만 조절 */
      height: calc(100vh - 170px);
      min-height: 520px;
    }
    .notes-module-top{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
    }
    .notes-tabs{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
      align-items:center;
    }
    .notes-tab{
      background:#2a2a2a;
      border:1px solid #333;
      border-radius:10px;
      padding:6px 10px;
      cursor:pointer;
      color:#cfcfcf;
      font-size:.9rem;
      user-select:none;
    }
    .notes-tab.active{
      background:#3b82f6;
      border-color:#2563eb;
      color:#fff;
    }
    .notes-area{
      flex:1;
      width:100%;
      background:#1f2937;
      border:1px solid #374151;
      border-radius:12px;
      padding:12px;
      outline:none;
      resize:none; /* ✅ 예전 느낌: 창 꽉차는 것 우선 */
      min-height: 320px;
      color:#fff;
    }
    .notes-btn{
      background:#2563eb;
      border:1px solid #1d4ed8;
      color:#fff;
      border-radius:10px;
      padding:8px 12px;
      font-size:.9rem;
      cursor:pointer;
      white-space:nowrap;
    }
    .notes-btn:hover{ filter:brightness(1.05); }
    .notes-hint{
      font-size:.8rem;
      opacity:.75;
    }
  `;
  document.head.appendChild(styleEl);
}

function cleanup() {
  unsubs.forEach(fn => { try { fn(); } catch {} });
  unsubs = [];
  if (styleEl) { try { styleEl.remove(); } catch {} }
  styleEl = null;
  rootEl = null;
  model = { notesById: {}, notesActiveTabId: null };
  saveTimer = null;
}

function makeDefaultIfEmpty(stateDoc) {
  const keys = Object.keys(model.notesById || {});
  if (keys.length > 0) return;

  // 기존 시스템과 충돌 안 나게 legacy_ prefix 유지
  const id = `legacy_0_${Date.now()}`;
  model.notesById = { [id]: "" };
  model.notesActiveTabId = id;

  // DB에도 바로 반영
  setDoc(stateDoc, {
    notesById: model.notesById,
    notesActiveTabId: model.notesActiveTabId,
    updatedAt: serverTimestamp()
  }, { merge: true }).catch(() => {});
}

function renderTabs(tabsEl, areaEl, stateDoc) {
  const ids = Object.keys(model.notesById || {});
  if (!model.notesActiveTabId || !(model.notesActiveTabId in model.notesById)) {
    model.notesActiveTabId = ids[0] || null;
  }

  tabsEl.innerHTML = "";
  ids.forEach((id, idx) => {
    const btn = document.createElement("button");
    btn.className = "notes-tab" + (id === model.notesActiveTabId ? " active" : "");
    btn.textContent = `메모${idx + 1}`;
    btn.addEventListener("click", async () => {
      // 현재 탭 내용 먼저 반영
      if (model.notesActiveTabId) {
        model.notesById[model.notesActiveTabId] = areaEl.value;
      }

      model.notesActiveTabId = id;

      // textarea 내용 교체
      areaEl.value = (model.notesById[id] ?? "");

      // active 탭 저장
      try {
        await updateDoc(stateDoc, { notesActiveTabId: id, updatedAt: serverTimestamp() });
      } catch (e) {
        console.error(e);
      }

      renderTabs(tabsEl, areaEl, stateDoc);
    });

    tabsEl.appendChild(btn);
  });

  // active 탭 내용 표시
  if (model.notesActiveTabId) {
    areaEl.value = (model.notesById[model.notesActiveTabId] ?? "");
  } else {
    areaEl.value = "";
  }
}

function scheduleAutoSave(stateDoc, areaEl) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!model.notesActiveTabId) return;

    // 모델에 반영
    model.notesById[model.notesActiveTabId] = areaEl.value;

    try {
      await setDoc(stateDoc, {
        notesById: model.notesById,
        notesActiveTabId: model.notesActiveTabId,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showFeedbackMessage("저장됨");
    } catch (e) {
      console.error(e);
      showAlert("메모 저장 중 오류가 발생했습니다.");
    }
  }, 600);
}

export async function mount(container) {
  injectStyle();

  rootEl = document.createElement("div");
  rootEl.className = "notes-module-wrap";

  rootEl.innerHTML = `
    <div class="notes-module-top">
      <div class="notes-tabs" id="notesTabs"></div>
      <button class="notes-btn" id="saveNotesBtn">저장</button>
    </div>
    <textarea id="notesArea" class="notes-area" placeholder="메모를 입력하세요..."></textarea>
    <div class="notes-hint">입력 후 잠시 멈추면 자동 저장됩니다.</div>
  `;

  container.innerHTML = "";
  container.appendChild(rootEl);

  if (!ensureLogin()) return;

  const uid = auth.currentUser.uid;
  const { stateDoc } = userRefs(uid);

  const tabsEl = rootEl.querySelector("#notesTabs");
  const areaEl = rootEl.querySelector("#notesArea");
  const saveBtn = rootEl.querySelector("#saveNotesBtn");

  // 입력 자동저장
  areaEl.addEventListener("input", () => scheduleAutoSave(stateDoc, areaEl));

  // 수동 저장
  saveBtn.addEventListener("click", async () => {
    if (!model.notesActiveTabId) return;
    model.notesById[model.notesActiveTabId] = areaEl.value;
    try {
      setLoading(true);
      await setDoc(stateDoc, {
        notesById: model.notesById,
        notesActiveTabId: model.notesActiveTabId,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showFeedbackMessage("저장됨");
    } catch (e) {
      console.error(e);
      showAlert("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  });

  // ✅ 실시간 구독: 기존 DB 구조(notesById/notesActiveTabId) 그대로 읽음
  const unsub = onSnapshot(stateDoc, (snap) => {
    const data = snap.exists() ? (snap.data() || {}) : {};

    // 기존 스키마: notesById / notesActiveTabId
    model.notesById = data.notesById || {};
    model.notesActiveTabId = data.notesActiveTabId || null;

    // 혹시 과거에 notesTabs가 있었다면(이전 버전 호환), 있는 경우만 병합
    // (기존 데이터가 notesById로 존재하니 일반적으로는 필요 없음)
    // data.notesTabs 가 존재해도 지금은 UI에 쓰지 않음.

    makeDefaultIfEmpty(stateDoc);
    renderTabs(tabsEl, areaEl, stateDoc);
  });

  unsubs.push(unsub);
}

export function unmount() {
  cleanup();
}
