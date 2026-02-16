export function initCalendar() {

  const TZ='Asia/Seoul';

  function ymdKST(date){
    return new Intl.DateTimeFormat('en-CA',{
      timeZone:TZ,
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).format(date);
  }

  function toKST(date){
    return new Date(date.toLocaleString('en-US',{timeZone:TZ}));
  }

  function countWeekdaysBetweenKST(a,b){
    let c=0;
    let start=toKST(new Date(Math.min(a,b)));
    let end=toKST(new Date(Math.max(a,b)));
    let cur=new Date(start);
    while(cur<=end){
      const d=cur.getDay();
      if(d>=0 && d<=4) c++;
      cur.setDate(cur.getDate()+1);
    }
    return c;
  }

  let currentDate = new Date();

  window.renderCalendar = function(){

    const year=currentDate.getFullYear();
    const month=currentDate.getMonth();

    const currentMonthYear=document.getElementById('currentMonthYear');
    const calendarGrid=document.getElementById('calendarGrid');
    if(!calendarGrid) return;

    currentMonthYear.textContent=`${year}년 ${month+1}월`;
    calendarGrid.innerHTML='';

    const firstDay=toKST(new Date(year,month,1)).getDay();
    const daysInMonth=new Date(year,month+1,0).getDate();

    for(let i=0;i<firstDay;i++){
      const empty=document.createElement('div');
      empty.className='calendar-day';
      calendarGrid.appendChild(empty);
    }

    for(let day=1;day<=daysInMonth;day++){
      const dayDiv=document.createElement('div');
      dayDiv.classList.add('calendar-day','relative');

      const thisDate=new Date(year,month,day);
      const fullDate=ymdKST(thisDate);

      const dayNumberSpan=document.createElement('span');
      dayNumberSpan.classList.add('day-number');
      dayNumberSpan.textContent=day;
      dayDiv.appendChild(dayNumberSpan);

      calendarGrid.appendChild(dayDiv);
    }
  }

  document.getElementById('prevMonthBtn')
    ?.addEventListener('click',()=>{
      currentDate.setMonth(currentDate.getMonth()-1);
      renderCalendar();
    });

  document.getElementById('nextMonthBtn')
    ?.addEventListener('click',()=>{
      currentDate.setMonth(currentDate.getMonth()+1);
      renderCalendar();
    });

  renderCalendar();
}
