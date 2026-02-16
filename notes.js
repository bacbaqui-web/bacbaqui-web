// notes.js
// 동적 노트 탭(추가/이름변경/순서/삭제) + Firebase 저장 구조(notesTabList/notesById/notesActiveTabId) 기반 UI

export function initNotes() {
  const tabsWrap = document.getElementById("notesTabs");
  const notesArea = document.getElementById("notesArea");

  if (!tabsWrap || !notesArea) return;

  // ----- 탭 설정 모달 DOM -----
  const modal = document.getElementById("tabSettingsModal");
  const nameInput = document.getElementById("tabNameInput");
  const btnLeft = document.getElementById("tabMoveLeftBtn");
  const btnRight = document.getElementById("tabMoveRightBtn");
  const btnDelete = document.getElementById("tabDeleteBtn");
  const btnSave = document.getElementById("tabSaveBtn");
  const btnCancel = document.getElementById("tabCancelBtn");

  // ----- 내부 상태 -----
  let editingTabId = null;

  // ----- 유틸 -----
  const makeId = () => `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  function ensureModel() {
    if (!Array.isArray(window.notesTabList)) window.notesTabList = [];
    if (!window.notesById || typeof window.notesById !== "object") window.notesById = {};
    if (!window.notesActiveTabId) window.notesActiveTabId = null;

    // 탭이 아예 없으면 기본 4개 생성
    if (window.notesTabList.length === 0) {
      const defaults = ["바퀴멘터리", "짐승육아", "그거아세요", "메모"];
      const list = defaults.map((name) => ({ id: makeId(), name }));
      const byId = {};
      list.forEach((t) => (byId[t.id] = ""));
      window.notesTabList = list;
      window.notesById = { ...byId, ...(window.notesById || {}) };
      window.notesActiveTabId = list[0]?.id || null;

      // 로그인 상태면 바로 저장(1회)
      if (typeof window.cloudSaveNotesModel === "function") {
        window.cloudSaveNotesModel();
      }
    }

    // active가 유효하지 않으면 첫 탭으로
    if (!window.notesTabList.some((t) => t.id === window.notesActiveTabId)) {
      window.notesActiveTabId = window.notesTabList[0]?.id || null;
    }
  }

  function saveTextareaToModel() {
    const id = window.notesActiveTabId;
    if (!id) return;
    window.notesById = window.notesById || {};
    window.notesById[id] = notesArea.value ?? "";
  }

  function loadTextareaFromModel() {
    const id = window.notesActiveTabId;
    if (!id) {
      notesArea.value = "";
      return;
    }
    notesArea.value = (window.notesById && window.notesById[id]) ? window.notesById[id] : "";
  }

  function debouncedSave() {
    if (typeof window.cloudSaveNotesDebounced === "function") {
      window.cloudSaveNotesDebounced();
    } else if (typeof window.cloudSaveNotesModel === "function") {
      window.cloudSaveNotesModel();
    }
  }

  // ----- 탭 UI 렌더 -----
  function renderTabs() {
    ensureModel();
    tabsWrap.innerHTML = "";

    window.notesTabList.forEach((tab) => {
      const btn = document.createElement("button");
      btn.className = "notepad-tab";
      btn.dataset.tabId = tab.id;
      btn.type = "button";
      btn.textContent = tab.name;

      if (tab.id === window.notesActiveTabId) btn.classList.add("active");

      // 톱니(설정)
      const gear = document.createElement("span");
      gear.className = "tab-gear";
      gear.textContent = "⚙︎";
      gear.title = "탭 설정";
      gear.addEventListener("click", (e) => {
        e.stopPropagation();
        openSettings(tab.id);
      });

      btn.appendChild(gear);

      // 탭 클릭 = 탭 전환
      btn.addEventListener("click", () => {
        saveTextareaToModel();
        window.notesActiveTabId = tab.id;
        loadTextareaFromModel();
        renderTabs();
        debouncedSave();
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
      if (!window.ensureLogin || !window.ensureLogin()) return;

      saveTextareaToModel();

      const id = makeId();
      const newTab = { id, name: "새 탭" };

      window.notesTabList = [...window.notesTabList, newTab];
      window.notesById = { ...(window.notesById || {}), [id]: "" };
      window.notesActiveTabId = id;

      renderTabs();
      loadTextareaFromModel();

      // 바로 이름 설정 열기
      openSettings(id);

      debouncedSave();
    });

    tabsWrap.appendChild(addBtn);
  }

  // ----- 설정 모달 -----
  function openSettings(tabId) {
    ensureModel();

    const tab = window.notesTabList.find((t) => t.id === tabId);
    if (!tab) return;

    if (!window.ensureLogin || !window.ensureLogin()) return;

    editingTabId = tabId;
    nameInput.value = tab.name || "";

    const idx = window.notesTabList.findIndex((t) => t.id === tabId);
    btnLeft.disabled = idx <= 0;
    btnRight.disabled = idx < 0 || idx >= window.notesTabList.length - 1;

    modal.style.display = "flex";
    nameInput.focus();
    nameInput.select();
  }

  function closeSettings() {
    editingTabId = null;
    modal.style.display = "none";
  }

  function moveTab(delta) {
    ensureModel();
    if (!editingTabId) return;

    const list = [...window.notesTabList];
    const idx = list.findIndex((t) => t.id === editingTabId);
    const nextIdx = idx + delta;

    if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return;

    const tmp = list[idx];
    list[idx] = list[nextIdx];
    list[nextIdx] = tmp;

    window.notesTabList = list;

    renderTabs();
    openSettings(editingTabId); // enable 상태 갱신
    debouncedSave();
  }

  function deleteTab() {
    ensureModel();
    if (!editingTabId) return;

    if (window.notesTabList.length <= 1) {
      (window.showAlert ? window.showAlert : alert)("최소 1개의 탭은 남겨두어야 합니다.");
      return;
    }

    const tab = window.notesTabList.find((t) => t.id === editingTabId);
    const ok = confirm(`'${tab?.name || "탭"}' 을(를) 삭제하시겠습니까?\n(해당 탭의 메모도 함께 삭제됩니다)`);
    if (!ok) return;

    saveTextareaToModel();

    const list = window.notesTabList.filter((t) => t.id !== editingTabId);
    const byId = { ...(window.notesById || {}) };
    delete byId[editingTabId];

    let nextActive = window.notesActiveTabId;
    if (window.notesActiveTabId === editingTabId) {
      nextActive = list[0]?.id || null;
    }

    window.notesTabList = list;
    window.notesById = byId;
    window.notesActiveTabId = nextActive;

    closeSettings();
    renderTabs();
    loadTextareaFromModel();
    debouncedSave();
  }

  function saveSettings() {
    ensureModel();
    if (!editingTabId) return;

    const list = [...window.notesTabList];
    const idx = list.findIndex((t) => t.id === editingTabId);
    if (idx < 0) return;

    const newName = (nameInput.value || "").trim();
    if (!newName) {
      (window.showAlert ? window.showAlert : alert)("탭 이름을 입력해 주세요.");
      return;
    }

    const dup = list.some((t) => t.id !== editingTabId && (t.name || "").trim() === newName);
    if (dup) {
      (window.showAlert ? window.showAlert : alert)("이미 같은 이름의 탭이 있습니다.");
      return;
    }

    list[idx] = { ...list[idx], name: newName };
    window.notesTabList = list;

    renderTabs();
    closeSettings();
    debouncedSave();
  }

  // ----- 이벤트 바인딩 -----
  notesArea.addEventListener("input", () => {
    saveTextareaToModel();
    debouncedSave();
  });

  notesArea.addEventListener("blur", () => {
    saveTextareaToModel();
    if (typeof window.cloudSaveNotesModel === "function") window.cloudSaveNotesModel();
  });

  btnLeft?.addEventListener("click", () => moveTab(-1));
  btnRight?.addEventListener("click", () => moveTab(1));
  btnDelete?.addEventListener("click", deleteTab);
  btnSave?.addEventListener("click", saveSettings);
  btnCancel?.addEventListener("click", closeSettings);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeSettings();
  });

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

  // main.js가 snapshot 갱신 후 호출할 수 있도록
  window.renderNotesUI = () => {
    renderTabs();
    loadTextareaFromModel();
  };

  // 최초 렌더
  renderTabs();
  loadTextareaFromModel();
}
