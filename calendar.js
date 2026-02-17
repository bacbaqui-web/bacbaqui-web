
// Simplified Calendar Logic (Korea local time based)
// No custom algorithms, no timezone shifting.
// Uses native JS Date only.

export function renderCalendar(year, month, onDayClick) {
  const container = document.getElementById("calendar-days");
  container.innerHTML = "";

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const lastDate = new Date(year, month + 1, 0).getDate();

  // Fill empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-cell empty";
    container.appendChild(empty);
  }

  // Fill days
  for (let day = 1; day <= lastDate; day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    cell.textContent = day;

    cell.addEventListener("click", () => {
      if (onDayClick) onDayClick(year, month, day);
    });

    container.appendChild(cell);
  }
}

// Episode calculation (Weekdays only, simple & stable)
export function calculateEpisode(baseDateStr, baseEpisode, year, month, day) {
  const baseDate = new Date(baseDateStr);
  const currentDate = new Date(year, month, day);

  const diffDays = Math.floor((currentDate - baseDate) / (1000 * 60 * 60 * 24));

  let weekdayCount = 0;

  for (let i = 0; i <= diffDays; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const dayOfWeek = d.getDay(); // 0=Sun

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      weekdayCount++;
    }
  }

  return baseEpisode + weekdayCount - 1;
}
