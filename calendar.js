export function initCalendar({
  TZ,
  getState,
  setState,
  ensureLogin,
  cloudSaveAll,
  cloudSaveStateOnly,
  showAlert,
  showFeedbackMessage
}) {
  let currentDate = new Date();

  function ymdKST(date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function toKST(date) {
    return new Date(date.toLocaleString("en-US", { timeZone: TZ }));
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

  // ===== 모달 =====
  const taskModal = document.getElementById("taskModal");
  const cancelBtn = document.getElementById("cancelBtn");
  const saveTaskBtn = document.getElementById("saveTaskBtn");
  const deleteTaskBtn = document.getElementById("deleteTaskBtn");
  const taskTitleInput = document.getElementById("taskTitle");
  const taskDescriptionInput = document.getElementById("taskDescription");
  const taskDateInput = document.getElementById("taskDate");

  let currentTask = null;

  function openModal(task = null) {
    currentTask = task;

    if (task && task.id) {
      document.getElementById("modalTitle").textContent = "작업 수정";
      taskTitleInput.value = task.title || "";
      taskDescriptionInput.value = task.description || "";
      taskDateInput.value = task.date || "";
      deleteTaskBtn.classList.remove("hidden");
    } else {
      document.getElementById("modalTitle").textContent = "새 작업";
      taskTitleInput.value = "";
      taskDescriptionInput.value = "";
      taskDateInput.value = task?.date || "";
      deleteTaskBtn.classList.add("hidden");
    }
    taskModal.style.display = "flex";
  }

  function closeModal() {
    taskModal.style.display = "none";
  }

  async function saveTask() {
    if (!ensureLogin()) return;

    const title = taskTitleInput.value.trim();
    const description = taskDescriptionInput.value.trim();
    const date = taskDateInput.value;

    if (!title) {
      showFeedbackMessage("제목을 입력해주세요.");
      return;
    }

    const st = getState();
    const data = {
      id: currentTask?.id ? currentTask.id : Date.now(),
      title,
      description,
      date,
      complete: currentTask?.complete ?? false
    };

    const list = [...(st.customTasks || [])];
    const idx = list.findIndex((t) => String(t.id) === String(data.id));
    if (idx > -1) list[idx] = data;
    else list.push(data);

    setState({ customTasks: list });

    await cloudSaveAll();
    closeModal();
    render();
  }

  async function deleteTask() {
    // Firestore 문서 삭제는 main.js에 있으나,
    // 여기서는 "목록에서 삭제 + cloudSaveAll로 덮어쓰기" 방식으로 처리합니다.
    // (기존 구조와 호환되며, 문서 삭제까지 완벽히 하려면 main.js에서 deleteTask API를 따로 주입하면 됩니다.)
    if (!ensureLogin()) return;
    if (!currentTask?.id) return closeModal();

    const st = getState();
    const list = (st.customTasks || []).filter((t) => String(t.id) !== String(currentTask.id));
    setState({ customTasks: list });

    await cloudSaveAll();
    closeModal();
    render();
  }

  cancelBtn?.addEventListener("click", closeModal);
  saveTaskBtn?.addEventListener("click", saveTask);
  deleteTaskBtn?.addEventListener("click", deleteTask);
  taskModal?.addEventListener("click", (e) => { if (e.target === taskModal) closeModal(); });

  document.getElementById("addTaskBtn")?.addEventListener("click", () => openModal());

  document.getElementById("prevMonthBtn")?.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    render();
  });
  document.getElementById("nextMonthBtn")?.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    render();
  });

  // ===== 렌더 =====
  function render() {
    const st = getState();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const currentMonthYear = document.getElementById("currentMonthYear");
    const calendarGrid = document.getElementById("calendarGrid");
    if (!currentMonthYear || !calendarGrid) return;

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

      // today border
      const today = toKST(new Date());
      if (ymdKST(thisDate) === ymdKST(today)) dayDiv.classList.add("today");

      // number
      const dayNumberSpan = document.createElement("span");
      dayNumberSpan.classList.add("day-number");
      dayNumberSpan.textContent = day;
      dayDiv.appendChild(dayNumberSpan);

      // 1) 에피소드(평일만)
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
        if ((st.taskStatus || {})[key]) epItem.classList.add("complete");

        epItem.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!ensureLogin()) return;

          const next = { ...(getState().taskStatus || {}) };
          next[key] = !next[key];
          setState({ taskStatus: next });

          await cloudSaveStateOnly();
          render();
        });

        dayDiv.appendChild(epItem);
      }

      // 2) 쇼츠/웹툰 일일 체크
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

      if ((st.taskStatus || {})[shortsKey]) shortsBtn.classList.add("active");
      if ((st.taskStatus || {})[webtoonKey]) webtoonBtn.classList.add("active");

      shortsBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!ensureLogin()) return;

        const next = { ...(getState().taskStatus || {}) };
        next[shortsKey] = !next[shortsKey];
        setState({ taskStatus: next });

        await cloudSaveStateOnly();
        render();
      });

      webtoonBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!ensureLogin()) return;

        const next = { ...(getState().taskStatus || {}) };
        next[webtoonKey] = !next[webtoonKey];
        setState({ taskStatus: next });

        await cloudSaveStateOnly();
        render();
      });

      checkGroup.appendChild(shortsBtn);
      checkGroup.appendChild(webtoonBtn);
      dayDiv.appendChild(checkGroup);

      // 3) 개인 작업(해당 날짜)
      const tasksForDay = (st.customTasks || []).filter((t) => t.date === fullDate);
      tasksForDay.forEach((t) => {
        const item = document.createElement("div");
        item.classList.add("task-item", "custom-task");
        if (t.complete) item.classList.add("complete");
        item.textContent = t.title;

        item.addEventListener("click", (e) => {
          e.stopPropagation();
          openModal(t);
        });

        dayDiv.appendChild(item);
      });

      // 빈칸 클릭하면 그 날짜로 새 작업
      dayDiv.addEventListener("dblclick", () => openModal({ date: fullDate }));

      calendarGrid.appendChild(dayDiv);
    }
  }

  // 최초 렌더
  render();

  return { render };
}
