import { auth, db } from "../firebaseClient.js";
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let unsub = null;
let styleEl = null;

function ensureStyle() {
  if (styleEl) return;
  styleEl = document.createElement("style");
  styleEl.id = "notes-module-style";
  styleEl.textContent = `
    /* 노트 모듈은 index의 공통 스타일을 최대한 존중하면서, "꽉 차는" 레이아웃만 보강 */
    .notes-module-root{
      display:flex;
      flex-direction:column;
      gap:12px;
      /* 상단 헤더/탭 영역 제외하고 화면을 넓게 사용 */
      height: calc(100vh - 150px);
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
      resize:none;
      min-height: 320px;
    }
    .notes-hint{
      font-size:.8rem;
      opacity:.75;
    }
    .notes-btn{
      background:#2563eb;
      border:1px solid #1d4ed8;
      color:#fff;
      border-radius:10px;
      padding:8px 12px;
      font-size:.9rem;
      cursor:pointer;
    }
    .notes-btn:hover{ filter:brightness(1.05); }
  `;
  document.head.appendChild(styleEl);
}

function safeText(v) {
  return typeof v === "string" ? v : "";
}

/**
 * 기존 DB 구조 (스크린샷 기준):
 * users/{uid}/meta/appState
 *  - notesActiveTabId: string
 *  - notesById: { [noteId]: string }
 */
function appStateRef(uid) {
  return doc(db, `users/${uid}/meta/appState`);
}

export async function mount(container) {
  ensureStyle();

  const user = auth.currentUser;
  if (!user) {
    container.innerHTML = `<div class="text-sm opacity-80">로그인 후 메모를 사용할 수 있습니다.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="notes-module-root">
      <div class="notes-module-top">
        <div class="notes-tabs" id="notesTabs"></div>
        <button class="notes-btn" id="saveNotesBtn">저장</button>
      </div>

      <textarea id="notesArea" class="notes-area" placeholder="메모를 입력하세요..."></textarea>
      <div class="notes-hint">자동 저장은 입력 후 잠시 멈추면 반영됩니다. (또는 저장 버튼)</div>
    </div>
  `;

  const tabsEl = container.querySelector("#notesTabs");
  const areaEl = container.querySelector("#notesArea");
  const saveBtn = container.querySelector("#saveNotesBtn");

  const ref = appStateRef(user.uid);

  let notesById = {};
  let activeId = null;

  // 디바운스 자동 저장
  let t = null;
  const debouncedSave = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (!activeId) return;
      try {
        const patch = {
          notesById: { ...notesById, [activeId]: areaEl.value },
          notesActiveTabId: activeId,
          updatedAt: serverTimestamp()
        };
        // notesById는 객체 전체를 갱신하는 편이 안전합니다(merge 사용)
        await setDoc(ref, patch, { merge: true });
        notesById[activeId] = areaEl.value;
      } catch (e) {
        console.error("notes autosave failed:", e);
      }
    }, 600);
  };

  areaEl.addEventListener("input", debouncedSave);

  saveBtn.addEventListener("click", async () => {
    if (!activeId) return;
    try {
      const patch = {
        notesById: { ...notesById, [activeId]: areaEl.value },
        notesActiveTabId: activeId,
        updatedAt: serverTimestamp()
      };
      await setDoc(ref, patch, { merge: true });
      notesById[activeId] = areaEl.value;
    } catch (e) {
      console.error("notes save failed:", e);
      alert("저장 중 오류가 발생했습니다.");
    }
  });

  const renderTabs = () => {
    // 탭이 하나도 없으면 기본 탭을 생성
    const ids = Object.keys(notesById || {});
    if (ids.length === 0) {
      // 기존 시스템과 충돌 없게 legacy_ 스타일 유지
      const newId = `legacy_0_${Date.now()}`;
      notesById[newId] = "";
      activeId = newId;
      // DB에도 즉시 반영
      setDoc(ref, { notesById, notesActiveTabId: activeId, createdAt: serverTimestamp() }, { merge: true }).catch(()=>{});
    }

    // activeId가 없거나 사라졌으면 첫 탭으로
    if (!activeId || !notesById[activeId]) {
      activeId = Object.keys(notesById)[0];
    }

    tabsEl.innerHTML = "";
    const keys = Object.keys(notesById);

    // 기존 UI 감성: 메모1/2/3처럼 보이게 (실제 id는 유지)
    keys.forEach((id, idx) => {
      const btn = document.createElement("button");
      btn.className = "notes-tab" + (id === activeId ? " active" : "");
      btn.textContent = `메모${idx + 1}`;
      btn.dataset.id = id;
      btn.addEventListener("click", async () => {
        // 현재 내용 반영 후 전환
        if (activeId) notesById[activeId] = areaEl.value;
        activeId = id;
        areaEl.value = safeText(notesById[activeId]);

        // activeId 저장
        try {
          await updateDoc(ref, { notesActiveTabId: activeId, updatedAt: serverTimestamp() });
        } catch (e) {
          console.error("active tab update failed:", e);
        }

        renderTabs();
      });
      tabsEl.appendChild(btn);
    });

    areaEl.value = safeText(notesById[activeId]);
  };

  // 실시간 동기화: 기존 appState 문서를 그대로 구독
  unsub = onSnapshot(ref, (snap) => {
    const data = snap.exists() ? (snap.data() || {}) : {};
    notesById = data.notesById || {};
    activeId = data.notesActiveTabId || activeId;
    renderTabs();
  });
}

export function unmount() {
  if (unsub) {
    try { unsub(); } catch (_) {}
    unsub = null;
  }
  // 스타일은 공통으로 남겨도 되지만, “모듈 완전 분리” 원칙이면 제거
  if (styleEl) {
    try { styleEl.remove(); } catch (_) {}
    styleEl = null;
  }
}
