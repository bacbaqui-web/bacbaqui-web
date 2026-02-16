export function initNotes({
  getState,
  setState,
  ensureLogin,
  cloudSaveNotesDebounced,
  cloudSaveNotesModel,
  showAlert
}) {
  const tabsWrap = document.getElementById("notesTabs");
  const notesArea = document.getElementById("notesArea");
  if (!tabsWrap || !notesArea) return { render() {} };

  // 모달
  const modal = document.getElementById("tabSettingsModal");
  const nameInput = document.getElementById("tabNameInput");
  const btnLeft = document.getElementById("tabMoveLeftBtn");
  const btnRight = document.getElementById("tabMoveRightBtn");
  const btnDelete = document.getElementById("tabDeleteBtn");
  const btnSave = document.getElementById("tabSaveBtn");
  const btnCancel = document.getElementById("tabCancelBtn");

  let editingTabId = null;
  const makeId = () => `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  function ensureModel() {
    const st = getState();

    let notesTabList = Array.isArray(st.notesTabList) ? st.notesTabList : [];
    let notesById = st.notesById && typeof st.notesById === "object" ? st.notesById : {};
    let notesActiveTabId = st.notesActiveTabId || null;

    // 탭이 없으면 기본 생성
    if (notesTabList.length === 0) {
      const defaults = ["바퀴멘터리", "짐승육아", "그거아세요", "메모"];
      notesTabList = defaults.map((name) => ({ id: makeId(), name }));
      const byId = {};
      notesTabList.forEach((t) => (byId[t.id] = ""));
      notesById = { ...byId, ...notesById };
      notesActiveTabId = notesTabList[0]?.id || null;

      setState({ notesTabList, notesById, notesActiveTabId });

      // 로그인 상태면 1회 저장
      if (ensureLogin()) cloudSaveNotesModel().catch(() => {});
      return;
    }

    // active 검증
    if (!notesTabList.some((t) => t.id === notesActiveTabId)) {
      notesActiveTabId = notesTabList[0]?.id || null;
      setState({ notesActiveTabId });
    }
  }

  function saveTextareaToModel() {
    const st = getState();
    if (!st.notesActiveTabId) return;
    const notesById = { ...(st.notesById || {}) };
    notesById[st.notesActiveTabId] = notesArea.value ?? "";
    setState({ notesById });
  }

  function loadTextareaFromModel() {
    const st = getState();
    if (!st.notesActiveTabId) {
      notesArea.value = "";
      return;
    }
    notesArea.value = (st.notesById && st.notesById[st.notesActiveTabId]) ? st.notesById[st.notesActiveTabId] : "";
  }

  function openSettings(tabId) {
    ensureModel();
    if (!ensureLogin()) return;

    const st = getState();
    const tab = (st.notesTabList || []).find((t) => t.id === tabId);
    if (!tab) return;

    editingTabId = tabId;
    nameInput.value = tab.name || "";

    const idx = st.notesTabList.findIndex((t) => t.id === tabId);
    btnLeft.disabled = idx <= 0;
    btnRight.disabled = idx < 0 || idx >= st.notesTabList.length - 1;

    modal.style.display = "flex";
    nameInput.focus();
    nameInput.select();
  }

  function closeSettings() {
    editingTabId = null;
    modal.style.display = "none";
  }

  function moveTab(delta) {
    const st = getState();
    if (!editingTabId) return;

    const list = [...(st.notesTabList || [])];
    const idx = list.findIndex((t) => t.id === editingTabId);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= list.length) return;

    [list[idx], list[nextIdx]] = [list[nextIdx], list[idx]];
    setState({ notesTabList: list });

    render();
    openSettings(editingTabId);
    cloudSaveNotesDebounced();
  }

  function deleteTab() {
    const st = getState();
    if (!editingTabId) return;

    if ((st.notesTabList || []).length <= 1) {
      showAlert("최소 1개의 탭은 남겨두어야 합니다.");
      return;
    }

    const tab = (st.notesTabList || []).find((t) => t.id === editingTabId);
    const ok = confirm(`'${tab?.name || "탭"}' 을(를) 삭제하시겠습니까?\n(해당 탭의 메모도 함께 삭제됩니다)`);
    if (!ok) return;

    saveTextareaToModel();

    const list = (st.notesTabList || []).filter((t) => t.id !== editingTabId);
    const byId = { ...(st.notesById || {}) };
    delete byId[editingTabId];

    let nextActive = st.notesActiveTabId;
    if (st.notesActiveTabId === editingTabId) nextActive = list[0]?.id || null;

    setState({ notesTabList: list, notesById: byId, notesActiveTabId: nextActive });

    closeSettings();
    render();
    loadTextareaFromModel();
    cloudSaveNotesDebounced();
  }

  function saveSettings() {
    const st = getState();
    if (!editingTabId) return;

    const list = [...(st.notesTabList || [])];
    const idx = list.findIndex((t) => t.id === editingTabId);
    if (idx < 0) return;

    const newName = (nameInput.value || "").trim();
    if (!newName) {
      showAlert("탭 이름을 입력해 주세요.");
      return;
    }

    const dup = list.some((t) => t.id !== editingTabId && (t.name || "").trim() === newName);
    if (dup) {
      showAlert("이미 같은 이름의 탭이 있습니다.");
      return;
    }

    list[idx] = { ...list[idx], name: newName };
    setState({ notesTabList: list });

    render();
    closeSettings();
    cloudSaveNotesDebounced();
  }

  function render() {
    ensureModel();
    const st = getState();

    tabsWrap.innerHTML = "";

    (st.notesTabList || []).forEach((tab) => {
      const btn = document.createElement("button");
      btn.className = "notepad-tab";
      btn.type = "button";
      btn.textContent = tab.name;

      if (tab.id === st.notesActiveTabId) btn.classList.add("active");

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
        setState({ notesActiveTabId: tab.id });
        loadTextareaFromModel();
        render();
        cloudSaveNotesDebounced();
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
      const st2 = getState();

      const id = makeId();
      const newTab = { id, name: "새 탭" };
      const list = [...(st2.notesTabList || []), newTab];
      const byId = { ...(st2.notesById || {}), [id]: "" };

      setState({ notesTabList: list, notesById: byId, notesActiveTabId: id });

      render();
      loadTextareaFromModel();
      openSettings(id);
      cloudSaveNotesDebounced();
    });

    tabsWrap.appendChild(addBtn);
  }

  // textarea 이벤트
  notesArea.addEventListener("input", () => {
    saveTextareaToModel();
    cloudSaveNotesDebounced();
  });

  notesArea.addEventListener("blur", () => {
    saveTextareaToModel();
    cloudSaveNotesModel().catch(() => {});
  });

  // 모달 버튼
  btnLeft?.addEventListener("click", () => moveTab(-1));
  btnRight?.addEventListener("click", () => moveTab(1));
  btnDelete?.addEventListener("click", deleteTab);
  btnSave?.addEventListener("click", saveSettings);
  btnCancel?.addEventListener("click", closeSettings);

  modal?.addEventListener("click", (e) => { if (e.target === modal) closeSettings(); });

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

  // 최초
  render();
  loadTextareaFromModel();

  return { render };
}
