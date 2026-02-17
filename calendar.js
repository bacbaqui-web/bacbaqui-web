export function initCalendar() {
  // 달력은 '날짜(연/월/일)' 기반으로 요일을 계산합니다.
  // (시간대/브라우저 로컬 타임존에 영향받지 않도록) 순수한 달력 알고리즘을 사용합니다.
  const TZ = 'Asia/Seoul';

  // 오늘 날짜를 KST 기준으로 가져와 "현재 보고 있는 월"을 정합니다.
  function getKSTParts(date = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const [y, m, d] = fmt.format(date).split('-').map(Number);
    return { y, m, d };
  }

  // 요일 계산(0=일 ... 6=토): Tomohiko Sakamoto 알고리즘 (그레고리력)
  // 시간대와 무관하게 "그 날짜의 요일"을 안정적으로 계산합니다.
  function weekdaySun0(y, m1to12, d) {
    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let y2 = y;
    if (m1to12 < 3) y2 -= 1;
    return (y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) + t[m1to12 - 1] + d) % 7;
  }

  function getDaysInMonth(y, monthIndex) {
    // monthIndex: 0-11
    return new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
  }

  function ymdKSTFromParts(y, monthIndex, day) {
    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }

  const now = getKSTParts();
  let viewYear = now.y;
  let viewMonth = now.m - 1; // 0-11

  function stepMonth(delta) {
    const total = viewYear * 12 + viewMonth + delta;
    viewYear = Math.floor(total / 12);
    viewMonth = total % 12;
    if (viewMonth < 0) {
      viewMonth += 12;
      viewYear -= 1;
    }
  }

  window.renderCalendar = function () {
    const currentMonthYear = document.getElementById('currentMonthYear');
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;

    if (currentMonthYear) {
      currentMonthYear.textContent = `${viewYear}년 ${viewMonth + 1}월`;
    }

    calendarGrid.innerHTML = '';

    // 월요일 시작 표기: Mon=0 ... Sun=6
    // 먼저 그 달 1일의 요일을 0=일..6=토로 구한 뒤, 월요일 시작으로 쉬프트합니다.
    const firstDowSun0 = weekdaySun0(viewYear, viewMonth + 1, 1); // 0=일..6=토
    const firstDowMon0 = firstDowSun0; // Sunday start // Mon=0 ... Sun=6

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);

    for (let i = 0; i < firstDowMon0; i++) {
      const empty = document.createElement('div');
      empty.className = 'calendar-day';
      calendarGrid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayDiv = document.createElement('div');
      dayDiv.classList.add('calendar-day', 'relative');

      // 호환용(다른 기능에서 날짜키로 쓸 수 있음)
      const fullDate = ymdKSTFromParts(viewYear, viewMonth, day);
      void fullDate;

      const dayNumberSpan = document.createElement('span');
      dayNumberSpan.classList.add('day-number');
      dayNumberSpan.textContent = day;
      dayDiv.appendChild(dayNumberSpan);

      calendarGrid.appendChild(dayDiv);
    }

    // 🔁 Re-attach dynamic contents after month change
    if (window.renderTasks) window.renderTasks();
    if (window.renderEpisodes) window.renderEpisodes();
    if (window.renderAll) window.renderAll();

  };

  document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
    stepMonth(-1);
    window.renderCalendar();
  });

  document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
    stepMonth(1);
    window.renderCalendar();
  });

  window.renderCalendar();
}
