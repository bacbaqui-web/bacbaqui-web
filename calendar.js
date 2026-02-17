export function initCalendar() {
  // Calendar rendering is based on Korea Standard Time (Asia/Seoul),
  // regardless of the user's local browser timezone.
  const TZ = 'Asia/Seoul';
  const KST_OFFSET_MIN = 9 * 60; // UTC+9

  // Get today's date parts in KST.
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

  // Create a timestamp for KST midnight of (y, monthIndex, day).
  // We compute in UTC so the result is stable in any browser timezone.
  function kstMidnightUTC(y, monthIndex, day) {
    // Date.UTC gives midnight UTC. KST midnight is 9 hours earlier in UTC.
    return Date.UTC(y, monthIndex, day, 0, 0, 0) - KST_OFFSET_MIN * 60 * 1000;
  }

  // Weekday in KST: 0=Sun ... 6=Sat
  function getKSTWeekday(y, monthIndex, day) {
    return new Date(kstMidnightUTC(y, monthIndex, day)).getUTCDay();
  }

  // Days in month in KST month/year (independent of timezone when using UTC)
  function getDaysInMonth(y, monthIndex) {
    return new Date(Date.UTC(y, monthIndex + 1, 0)).getUTCDate();
  }

  // Convert to a YYYY-MM-DD string in KST (kept for compatibility / future hooks)
  function ymdKSTFromParts(y, monthIndex, day) {
    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }

  // Track current view as year + month index (0-11), anchored to KST.
  const nowParts = getKSTParts();
  let viewYear = nowParts.y;
  let viewMonth = nowParts.m - 1;

  function stepMonth(delta) {
    const total = viewYear * 12 + viewMonth + delta;
    viewYear = Math.floor(total / 12);
    viewMonth = total % 12;
    if (viewMonth < 0) {
      viewMonth += 12;
      viewYear -= 1;
    }
  }

  // Keep the original global function name in case other modules call it.
  window.renderCalendar = function () {
    const currentMonthYear = document.getElementById('currentMonthYear');
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;

    if (currentMonthYear) {
      currentMonthYear.textContent = `${viewYear}년 ${viewMonth + 1}월`;
    }

    calendarGrid.innerHTML = '';

    // Monday-first display: Mon=0 ... Sun=6
    const firstDowSun0 = getKSTWeekday(viewYear, viewMonth, 1); // 0=Sun..6=Sat
    const firstDowMon0 = (firstDowSun0 + 6) % 7; // shift so Mon becomes 0

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);

    for (let i = 0; i < firstDowMon0; i++) {
      const empty = document.createElement('div');
      empty.className = 'calendar-day';
      calendarGrid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayDiv = document.createElement('div');
      dayDiv.classList.add('calendar-day', 'relative');

      // Preserve existing variables (even if unused) to avoid breaking any future hooks.
      const fullDate = ymdKSTFromParts(viewYear, viewMonth, day);
      void fullDate;

      const dayNumberSpan = document.createElement('span');
      dayNumberSpan.classList.add('day-number');
      dayNumberSpan.textContent = day;
      dayDiv.appendChild(dayNumberSpan);

      calendarGrid.appendChild(dayDiv);
    }
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
