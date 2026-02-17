export function initCalendar() {
  // Calendar rendering is based on Korea Standard Time (Asia/Seoul),
  // regardless of the user's local browser timezone.
  const TZ = 'Asia/Seoul';

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

  // Weekday in KST as number: 0=Sun ... 6=Sat
  // Uses Intl with a "safe" UTC time (noon) to avoid day-boundary issues.
  function getKSTWeekday(y, monthIndex, day) {
    const dt = new Date(Date.UTC(y, monthIndex, day, 12, 0, 0)); // 12:00 UTC
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(dt);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[wd];
  }

  // Days in month in (y, monthIndex)
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
    const firstDowSun0 = getKSTWeekday(viewYear, viewMonth, 1); // 0=Sun..6=Sat (KST)
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
