  // ImgBB API Key (이미지 업로드용)
    // const IMGBB_API_KEY = "f64175972f4e4178332db9ae8559969b"; // [수정 1] 더 이상 필요 없으므로 주석 처리
    
    // (이 아래 UI 스크립트 내용은 변경 사항 없음)
    
    // 전역 상태
    window.customTasks = window.customTasks || [];
    window.taskStatus = window.taskStatus || {};
    window.__notesTabs = window.__notesTabs || {};
    window.imageBookmarks = window.imageBookmarks || []; // 북마크는 이미지와 동영상, 일반 링크 모두 포함
    window.currentTask = null;
    window.currentEditingBookmark = null; // 현재 편집 중인 북마크 항목
    let currentDate = new Date();
    window.isAuthReady = false;
    // 북마크는 최신순 고정(정렬 UI 제거)
    window.bookmarkSortKey = 'timestamp';

    // DOM 요소
    const tabButtons = document.querySelectorAll('#main-tabs .notepad-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    // 메모 탭 UI는 notes.js가 관리 (여기서는 관여하지 않음)
    const notesArea = document.getElementById('notesArea');
    const dragArea = document.getElementById('drag-area');
    const imageGrid = document.getElementById('image-grid');
    const imageModal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const closeImageModalBtn = document.getElementById('closeImageModalBtn');
    const goToPageBtn = document.getElementById('goToPageBtn');
    // 제목 수정 모달 요소
    const editTitleModal = document.getElementById('editTitleModal');
    const editTitleInput = document.getElementById('editTitleInput');
    const saveTitleBtn = document.getElementById('saveTitleBtn');
    const cancelTitleBtn = document.getElementById('cancelTitleBtn');
    const currentUrlDisplay = document.getElementById('currentUrlDisplay');
    // 정렬 선택 요소(현재는 UI 제거됨)
    const bookmarkSortSelect = document.getElementById('bookmarkSortSelect');

    // 링크 미리보기(붙여넣기) 모달
    const previewUploadModal = document.getElementById('previewUploadModal');
    const closePreviewUploadBtn = document.getElementById('closePreviewUploadBtn');
    let currentPreviewEditingBookmark = null;


    // 유틸리티 함수
    const showFeedbackMessage = (message) => {
      const el = document.createElement('div');
      el.textContent = message;
      el.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.8);color:#fff;padding:16px 20px;border-radius:10px;z-index:2000;max-width:90%";
      document.body.appendChild(el); setTimeout(()=>el.remove(),2000);
    };
    const showAlert = (msg) => { document.getElementById('modal-message').textContent = msg; document.getElementById('alert-modal').classList.remove('hidden'); };
    const hideAlert = () => { document.getElementById('alert-modal').classList.add('hidden'); };
    document.getElementById('modal-close-btn').addEventListener('click', hideAlert);

    const openImageModal = (imageUrl, pageUrl) => {
      modalImage.src = imageUrl;
      if (pageUrl){ goToPageBtn.style.display='block'; goToPageBtn.onclick=()=>window.open(pageUrl,'_blank'); }
      else goToPageBtn.style.display='none';
      imageModal.style.display='flex';
    };
    const closeImageModal = () => { imageModal.style.display = 'none'; };

    // 북마크 제목 수정 모달
    const openEditModal = (bookmark) => {
        window.currentEditingBookmark = bookmark;
        const currentTitle = bookmark.title || '';
        const displayUrl = bookmark.pageUrl.length > 50 ? bookmark.pageUrl.substring(0, 47) + '...' : bookmark.pageUrl;
        
        currentUrlDisplay.textContent = `URL: ${displayUrl}`;
        editTitleInput.value = currentTitle;
        editTitleModal.style.display = 'flex';
    };

    const closeEditModal = () => {
        window.currentEditingBookmark = null;
        editTitleModal.style.display = 'none';
    };

    const saveEditedTitle = async () => {
        if (!window.currentEditingBookmark || !window.ensureLogin()) return;

        const newTitle = editTitleInput.value.trim();
        const bookmark = window.currentEditingBookmark;

        if (bookmark.type === 'link' || bookmark.type === 'video' || bookmark.type === 'instagram') {
            await window.updateBookmarkTitle(bookmark.id, newTitle);
        }
        
        closeEditModal();
        showFeedbackMessage('제목이 저장되었습니다.');
        // onSnapshot이 Firestore 업데이트를 감지하고 renderImageBookmarks를 호출할 것입니다.
    };


    function showTab(tabId){
      tabContents.forEach(c=>c.classList.remove('active'));
      tabButtons.forEach(b=>b.classList.remove('active'));
      document.getElementById(`${tabId}-section`).classList.add('active');
      const btn=document.querySelector(`#main-tabs .notepad-tab[data-tab="${tabId}"]`); if(btn) btn.classList.add('active');
    }
    showTab('calendar');
    tabButtons.forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
    // (주의) 과거 메모 탭 선택 로직은 제거됨. notes.js가 담당.

    // 시간/날짜 관련 유틸리티
    const TZ='Asia/Seoul';
    function ymdKST(date){ return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
    function toKST(date){ return new Date(date.toLocaleString('en-US',{timeZone:TZ})); }
    function countWeekdaysBetweenKST(a,b){ let c=0,start=toKST(new Date(Math.min(a,b))),end=toKST(new Date(Math.max(a,b))),cur=new Date(start); while(cur<=end){ const d=cur.getDay(); if(d>=0&&d<=4)c++; cur.setDate(cur.getDate()+1);} return c;}

    // const fixedSchedules=[{title:'쇼츠',daysOfWeek:[1,3,5],colorClass:'recurring-shorts'},{title:'웹툰',daysOfWeek:[2,4,6],colorClass:'recurring-instatoon'}];

    // 모달 관련 DOM
    const taskModal=document.getElementById('taskModal');
    const cancelBtn=document.getElementById('cancelBtn');
    const saveTaskBtn=document.getElementById('saveTaskBtn');
    const deleteTaskBtn=document.getElementById('deleteTaskBtn');
    const taskTitleInput=document.getElementById('taskTitle');
    const taskDescriptionInput=document.getElementById('taskDescription');
    const taskDateInput=document.getElementById('taskDate');

    // 이벤트 리스너 부착
    const attachEventListeners=()=>{
      const prevMonthBtn=document.getElementById('prevMonthBtn');
      const nextMonthBtn=document.getElementById('nextMonthBtn');
      const addTaskBtn=document.getElementById('addTaskBtn');
      prevMonthBtn?.addEventListener('click',()=>{ currentDate.setMonth(currentDate.getMonth()-1); renderCalendar(); });
      nextMonthBtn?.addEventListener('click',()=>{ currentDate.setMonth(currentDate.getMonth()+1); renderCalendar(); });
      addTaskBtn?.addEventListener('click',()=>openModal());
      if(notesArea){
        notesArea.addEventListener('input',()=>window.cloudSaveNotesDebounced&&window.cloudSaveNotesDebounced());
        notesArea.addEventListener('blur',()=>window.cloudSaveNotes&&window.cloudSaveNotes());
      }
      cancelBtn.addEventListener('click',closeModal);
      saveTaskBtn.addEventListener('click',saveTask);
      // window.deleteTask는 Firebase 스크립트에서 정의됨
      deleteTaskBtn.addEventListener('click',()=>window.deleteTask&&window.deleteTask());
      taskModal.addEventListener('click',(e)=>{ if(e.target===taskModal) closeModal(); });

      closeImageModalBtn.addEventListener('click', closeImageModal);
      // 이미지 모달 배경 클릭 시 닫기
      imageModal.addEventListener('click',(e)=>{ if(e.target===imageModal) closeImageModal(); }); 
      // 추가: 모달 내용 (이미지 포함) 클릭 시 닫기
      document.querySelector('#imageModal .modal-content').addEventListener('click', (e) => {
          // X 버튼, 원본 페이지 이동 버튼을 제외하고 닫기
          if (!e.target.closest('#closeImageModalBtn') && !e.target.closest('#goToPageBtn')) {
              closeImageModal();
          }
      });
      
      // 제목 수정 모달 이벤트 리스너
      cancelTitleBtn.addEventListener('click', closeEditModal);
      saveTitleBtn.addEventListener('click', saveEditedTitle);
      editTitleModal.addEventListener('click', (e) => { if (e.target === editTitleModal) closeEditModal(); });
      editTitleInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
              e.preventDefault();
              saveEditedTitle();
          }
      });
      
      // 정렬 UI는 제거됨 (최신순 고정)
    };

    // 달력 렌더링
    const renderCalendar=()=>{
      const year=currentDate.getFullYear(), month=currentDate.getMonth();
      const currentMonthYear=document.getElementById('currentMonthYear');
      const calendarGrid=document.getElementById('calendarGrid'); if(!currentMonthYear||!calendarGrid) return;
      currentMonthYear.textContent=`${year}년 ${month+1}월`; calendarGrid.innerHTML='';
      const firstDay=toKST(new Date(year,month,1)).getDay(); const daysInMonth=new Date(year,month+1,0).getDate();
      for(let i=0;i<firstDay;i++){ const empty=document.createElement('div'); empty.className='calendar-day'; calendarGrid.appendChild(empty); }
      for(let day=1;day<=daysInMonth;day++){
        const dayDiv=document.createElement('div'); dayDiv.classList.add('calendar-day','relative');
        const thisDate=new Date(year,month,day); const fullDate=ymdKST(thisDate); const dayOfWeek=toKST(thisDate).getDay();
        const today=toKST(new Date()); if(ymdKST(thisDate)===ymdKST(today)) dayDiv.classList.add('today');
        const dayNumberSpan=document.createElement('span'); dayNumberSpan.classList.add('day-number'); dayNumberSpan.textContent=day; dayDiv.appendChild(dayNumberSpan);

        // 1. 에피소드 정보 (평일만 표시)
        if(dayOfWeek>=0&&dayOfWeek<=4){
          const milestoneDate=new Date('2025-09-01'); const weekdaysBetween=countWeekdaysBetweenKST(milestoneDate.getTime(), thisDate.getTime());
          const milestoneEpisode=2014; const episodeNumber=(toKST(thisDate)>=toKST(milestoneDate))? milestoneEpisode+weekdaysBetween-1 : milestoneEpisode-(weekdaysBetween-1);
          const epItem=document.createElement('div'); epItem.classList.add('task-item','episode-task'); epItem.textContent=`${episodeNumber}화`;
          const key=`${fullDate}_바퀴멘터리 ${episodeNumber}화`; if((window.taskStatus||{})[key]) epItem.classList.add('complete');
          epItem.addEventListener('click',async(e)=>{ e.stopPropagation(); if(!window.ensureLogin||!window.ensureLogin()) return; window.taskStatus=window.taskStatus||{}; window.taskStatus[key]=!window.taskStatus[key]; await window.cloudSaveStateOnly(); renderCalendar();});
          dayDiv.appendChild(epItem);
        }

        // 2. [NEW] 매일 쇼츠/웹툰 체크 버튼 그룹
        const checkGroup = document.createElement('div');
        checkGroup.className = 'daily-check-group';

        // 쇼츠 버튼
        const shortsBtn = document.createElement('div');
        shortsBtn.className = 'daily-check-btn shorts';
        shortsBtn.textContent = '쇼츠';
        const shortsKey = `${fullDate}_daily_shorts`;
        if ((window.taskStatus || {})[shortsKey]) shortsBtn.classList.add('active');
        shortsBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!window.ensureLogin || !window.ensureLogin()) return;
            window.taskStatus = window.taskStatus || {};
            window.taskStatus[shortsKey] = !window.taskStatus[shortsKey];
            await window.cloudSaveStateOnly();
            renderCalendar();
        });

        // 웹툰 버튼
        const webtoonBtn = document.createElement('div');
        webtoonBtn.className = 'daily-check-btn webtoon';
        webtoonBtn.textContent = '웹툰';
        const webtoonKey = `${fullDate}_daily_webtoon`;
        if ((window.taskStatus || {})[webtoonKey]) webtoonBtn.classList.add('active');
        webtoonBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!window.ensureLogin || !window.ensureLogin()) return;
            window.taskStatus = window.taskStatus || {};
            window.taskStatus[webtoonKey] = !window.taskStatus[webtoonKey];
            await window.cloudSaveStateOnly();
            renderCalendar();
        });

        checkGroup.appendChild(shortsBtn);
        checkGroup.appendChild(webtoonBtn);
        dayDiv.appendChild(checkGroup);


        // 3. 사용자 커스텀 태스크
        (window.customTasks||[]).filter(t=>t.date===fullDate).forEach(task=>{
          const el=document.createElement('div'); el.classList.add('task-item','custom-task'); el.textContent=task.title;
          if(task.complete) el.classList.add('complete');
          el.addEventListener('click',async(e)=>{ if(e.detail===1){ if(!window.ensureLogin||!window.ensureLogin()) return; task.complete=!task.complete; await window.cloudSaveAll(); renderCalendar(); } else if(e.detail===2){ openModal(task); }});
          dayDiv.appendChild(el);
        });

        dayDiv.addEventListener('click',(e)=>{ if(e.target.classList.contains('calendar-day')||e.target.classList.contains('day-number')) openModal({date:fullDate});});
        calendarGrid.appendChild(dayDiv);
      }
    };

    // 유튜브 썸네일 URL 추출
    function getYoutubeThumbnail(url) {
        let videoId = null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            videoId = match[2];
        }
        if (videoId) {
            return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }
        return null;
    }
    
    // 인스타그램 임베드 스크립트를 로드하고 콘텐츠를 처리하는 함수
    function initializeInstagramEmbeds() {
        if (window.instgrm && window.instgrm.Embeds) {
            // 스크립트가 이미 로드된 경우, 새 게시물을 처리
            window.instgrm.Embeds.process();
            return;
        }

        // 스크립트 로드
        const scriptId = 'instagram-embed-script';
        if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.async = true;
            script.src = '//www.instagram.com/embed.js';
            document.head.appendChild(script);
            
            // 스크립트 로드 후에도 process를 한 번 더 호출할 수 있도록 window에 핸들러 등록
            script.onload = () => {
                if (window.instgrm && window.instgrm.Embeds) {
                    window.instgrm.Embeds.process();
                }
            };
        }
    }

    // 북마크 렌더링 (이미지 및 동영상 포함)
    const renderImageBookmarks=()=>{
      imageGrid.innerHTML='';
      
      let sortedBookmarks = [...(window.imageBookmarks || [])];

      // 최신순 고정
      sortedBookmarks.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

      sortedBookmarks.forEach(d=>{
        const isVideo = d.type === 'video';
        const isLink = d.type === 'link'; // 일반 페이지 링크
        const isInstagram = d.type === 'instagram'; // 인스타그램 게시물
        // [수정] type: 'imgbb' 또는 'firebase_storage' 또는 'remote'일 때가 이미지임
        const isImage = d.type === 'imgbb' || d.type === 'firebase_storage' || d.type === 'remote';
        
        const isEditable = isVideo || isLink || isInstagram; // 제목 수정 가능한 항목
        const imageUrl = d.url;
        const pageUrl = d.pageUrl; // 일반 URL, 동영상 URL 또는 인스타그램 게시물 URL
        const sourceDomain = d.sourceDomain || 'Unknown Source';

        // (사이트별 헤더 제거)
        
        let thumbnail = isVideo ? getYoutubeThumbnail(pageUrl) : imageUrl;
        let iconHtml = '';
        let urlToOpen = pageUrl;

        if (isLink) {
            // 일반 페이지 링크 북마크: 제목/URL 미표시. previewImageUrl이 있으면 그 이미지만 표시.
            const prevImg = d.previewImageUrl || null;
            if (prevImg) {
                iconHtml = `<img src="${prevImg}" alt="링크 미리보기" loading="lazy" decoding="async" class="img-fit-cover" onerror="this.onerror=null;this.src='https://placehold.co/100x120/444/fff?text=미리보기+오류'"/>`;
            } else {
                iconHtml = `<div class="icon-overlay">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:44px;height:44px;opacity:.9">
                                <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/>
                                <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20"/>
                              </svg>
                            </div>`;
            }
        } else if (isInstagram) {
             // 인스타그램 게시물 북마크 (퍼가기 코드 사용)
             // 원본 URL 추출 (클릭 시 이동용)
             const parser = new DOMParser();
             const doc = parser.parseFromString(d.embedCode || '', 'text/html');
             const blockquote = doc.querySelector('blockquote.instagram-media');
             if (blockquote && blockquote.cite) urlToOpen = blockquote.cite;
             else urlToOpen = pageUrl;
             
             const displayTitle = d.title || 'Instagram Post (클릭 시 원본 이동)';
             
             // Embed Code를 직접 삽입하여 인스타그램 미리보기가 렌더링되도록 함.
             // z-index를 사용하여 제목 오버레이가 임베드 위에 오도록 설정.
             // 인스타그램 임베드는 높이가 가변적이며, Masonry 레이아웃이 이를 처리하도록 기대함.
             iconHtml = `
                <div class="w-full h-full relative z-0">
                    ${d.embedCode || ''}
                    <div class="absolute top-0 left-0 right-0 p-2 bg-black bg-opacity-70 text-white text-sm font-bold z-10">${displayTitle}</div>
                </div>
             `;

        } else if (isVideo && !thumbnail) {
            // **수정된 부분: 썸네일 없는 비디오를 위한 새로운 제목 오버레이 스타일 적용**
            const displayTitle = d.title || '동영상 북마크 (제목 편집 가능)';
            const displayUrl = pageUrl.replace(/^https?:\/\//, '').substring(0, 30) + '...';
            
            iconHtml = `<div class="video-title-overlay">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-red-400 mb-2" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4l12 8-12 8z"/></svg>
                            <span class="video-title-text">${displayTitle}</span>
                            <span class="video-url-text">${displayUrl}</span>
                        </div>`;
        } else if (isImage) {
            // [수정] 이미지 북마크인 경우 (썸네일은 이미지 URL 자체)
            iconHtml = `<img src="${imageUrl}" alt="북마크된 이미지" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='https://placehold.co/100x120/444/fff?text=이미지+오류'"/>`;
        } else if (isVideo) {
            // [수정] 유튜브 동영상이고 썸네일이 있는 경우
            const displayTitle = d.title || 'YouTube 영상';
            iconHtml = `<img src="${thumbnail}" alt="동영상 썸네일" loading="lazy" decoding="async" class="img-fit-cover" onerror="this.onerror=null;this.src='https://placehold.co/100x120/444/fff?text=동영상+썸네일'"/>
                        <div class="icon-overlay flex-col">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4l12 8-12 8z"/></svg>
                            <span class="text-xs mt-1 font-bold">${displayTitle}</span>
                        </div>`;
        } else {
             // 예외 처리 (알 수 없는 타입)
             iconHtml = `<div class="link-title-overlay">
                            <span class="link-title-text">알 수 없는 북마크</span>
                        </div>`;
        }

        const card=document.createElement('div');
        card.className='bookmark-card relative group cursor-pointer';
        card.innerHTML=`
          <div class="content">
            ${iconHtml}
          </div>
          <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs px-2 py-1 truncate z-10 opacity-70">
              ${sourceDomain}
          </div>
          <button class="absolute top-2 right-2 bg-[#424242] text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20" data-id="${d.id}" data-action="delete">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          ${isEditable ? `
          <button class="absolute top-2 right-9 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20" data-id="${d.id}" data-action="edit">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          ` : ''}
          `;
        imageGrid.appendChild(card);
        
        // 클릭 이벤트 (Card Main Action)
        card.addEventListener('click',(e)=>{
            // 삭제나 편집 버튼을 누른 경우는 무시
            if (e.target.closest('button[data-action]')) return; 

            if (isVideo || isLink || isInstagram) {
                // 인스타그램의 경우 URLToOpen을 사용 (퍼가기 코드에서 추출된 원본 URL)
                window.open(urlToOpen, '_blank');
            } else if (isImage) {
                // [수정] 이미지일 경우 모달 열기
                openImageModal(imageUrl, pageUrl);
            }
        });
      });
      
      // 버튼 이벤트 리스너 부착
      imageGrid.querySelectorAll('button[data-action]').forEach(btn=>{
        btn.onclick=async(e)=>{ 
          e.stopPropagation(); 
          const id=e.currentTarget.dataset.id;
          const action=e.currentTarget.dataset.action;
          const bookmark = window.imageBookmarks.find(d => d.id === id);

          if (action === 'delete') {
             try{ 
                 if(window.deleteImage) await window.deleteImage(id);
             }catch(err){ 
                 console.error(err); 
                 showAlert('북마크 삭제 중 오류가 발생했습니다.'); 
             }
          } else if (action === 'edit' && bookmark) {
             // 링크 북마크는 제목 수정 대신 "미리보기 이미지 붙여넣기" 모달을 사용
             if (bookmark.type === 'link') {
                 openPreviewUploadModal(bookmark);
             } else {
                 openEditModal(bookmark);
             }
          }
        };
      });
      
      // 인스타그램 임베드 스크립트 초기화 및 렌더링
      initializeInstagramEmbeds();
    };

    // 작업 모달
    const openModal=(task=null)=>{
      window.currentTask=task;
      if(task&&task.id){ document.getElementById('modalTitle').textContent='작업 수정'; taskTitleInput.value=task.title; taskDescriptionInput.value=task.description||''; taskDateInput.value=task.date||''; deleteTaskBtn.classList.remove('hidden'); }
      else if(task&&task.date){ document.getElementById('modalTitle').textContent='새 작업'; taskTitleInput.value=''; taskDescriptionInput.value=''; taskDateInput.value=task.date; deleteTaskBtn.classList.add('hidden'); }
      else{ document.getElementById('modalTitle').textContent='새 작업'; taskTitleInput.value=''; taskDescriptionInput.value=''; taskDateInput.value=''; deleteTaskBtn.classList.add('hidden'); }
      taskModal.style.display='flex';
    };
    const closeModal=()=>{ taskModal.style.display='none'; };

    const saveTask=async ()=>{
      if(!window.ensureLogin||!window.ensureLogin()) return;
      window.customTasks=window.customTasks||[]; window.taskStatus=window.taskStatus||{};
      const title=taskTitleInput.value.trim(); const description=taskDescriptionInput.value.trim(); const date=taskDateInput.value;
      if(!title){ showFeedbackMessage('제목을 입력해주세요.'); return; }
      const data={ id: window.currentTask&&window.currentTask.id ? window.currentTask.id : Date.now(), title, description, date, complete: window.currentTask?.complete ?? false };
      const idx=window.customTasks.findIndex(t=>t.id===data.id); if(idx>-1) window.customTasks[idx]=data; else window.customTasks.push(data);
      await window.cloudSaveAll(); closeModal(); renderCalendar();
    };

    // 링크 미리보기 모달
    const openPreviewUploadModal = (bookmark) => {
        currentPreviewEditingBookmark = bookmark;
        if (previewUploadModal) previewUploadModal.style.display = 'flex';
    };
    const closePreviewUploadModal = () => {
        currentPreviewEditingBookmark = null;
        if (previewUploadModal) previewUploadModal.style.display = 'none';
    };
    closePreviewUploadBtn?.addEventListener('click', closePreviewUploadModal);
    previewUploadModal?.addEventListener('click', (e)=>{ if(e.target===previewUploadModal) closePreviewUploadModal(); });

    // 붙여넣기 처리(모달이 열려 있을 때만)
    document.addEventListener('paste', async (e)=>{
        if(!previewUploadModal || previewUploadModal.style.display !== 'flex') return;
        if(!currentPreviewEditingBookmark) return;
        const items = e.clipboardData?.items;
        if(!items) return;
        const imgItem = [...items].find(it=>it.type && it.type.startsWith('image/'));
        if(!imgItem) return;
        e.preventDefault();
        const blob = imgItem.getAsFile();
        if(!blob) return;
        const fileName = `preview_${currentPreviewEditingBookmark.id}.png`;
        const file = new File([blob], fileName, { type: blob.type || 'image/png' });
        try{
            showFeedbackMessage('미리보기 이미지 업로드 중...');
            await window.uploadBookmarkPreviewImage(currentPreviewEditingBookmark.id, file);
            showFeedbackMessage('미리보기 이미지가 저장되었습니다.');
            closePreviewUploadModal();
        }catch(err){
            console.error(err);
            showAlert('미리보기 이미지 업로드 중 오류가 발생했습니다.');
        }
    });

    (function init(){ 
        attachEventListeners(); 
        renderCalendar(); 
    })();

    // ===== D&D/붙여넣기/클릭-자동붙여넣기 =====
    function isImageUrl(u){
      try{ new URL(u); }catch{ return false; }
      return /\.(jpe?g|png|gif|webp|svg|avif)(\?|$)/i.test(u);
    }
    
    function isVideoUrl(u){
        if (!u) return false;
        try { new URL(u); } catch { return false; }
        // YouTube, Vimeo, 또는 일반적인 동영상 확장자 검사
        return /youtu\.be|youtube\.com|vimeo\.com|\.(mp4|webm|ogg|mov)(\?|$)|missav\.com/i.test(u);
    }
    
    // 인스타그램 퍼가기 코드 확인 (blockquote 태그를 포함하는지 확인)
    function isInstagramEmbed(text) {
        return /<blockquote class="instagram-media".*<\/blockquote>/.test(text);
    }
    
    // **신규: 도메인 추출 유틸리티**
    function extractDomain(url) {
        if (!url) return 'Unknown';
        try {
            const urlObj = new URL(url.includes('://') ? url : 'https://' + url);
            let domain = urlObj.hostname;
            if (domain.startsWith('www.')) domain = domain.substring(4);
            return domain;
        } catch {
            return 'Unknown';
        }
    }


    // 새로운 유틸리티: 이미지/동영상/인스타그램 URL이 아닌 일반 URL인지 확인
    function isGenericUrl(u) {
        if (!u) return false;
        try {
            const urlObj = new URL(u);
            // http 또는 https 프로토콜을 사용하며, 이미지/비디오/인스타그램 URL이 아닌 경우
            // **수정된 부분: URL에 . (점)이 포함되어야 유효한 도메인으로 간주합니다.**
            return (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') && urlObj.hostname.includes('.') && !isImageUrl(u) && !isVideoUrl(u) && !/instagram\.com/.test(u);
        } catch {
            return false;
        }
    }

    // 드래그앤드롭 핸들러
    dragArea.addEventListener('dragover',(e)=>{ e.preventDefault(); dragArea.classList.add('active'); });
    dragArea.addEventListener('dragleave',()=>{ dragArea.classList.remove('active'); });
    dragArea.addEventListener('drop',async(e)=>{
      e.preventDefault(); dragArea.classList.remove('active');
      const dt=e.dataTransfer;
      const html=dt.getData('text/html');
      const plainText = dt.getData('text/plain');

      let url=null, pageUrl=null;
      
      // 1. 드롭된 내용에서 인스타그램 퍼가기 코드 확인
      if(plainText && isInstagramEmbed(plainText)) {
          if(window.addInstagramBookmark) { await window.addInstagramBookmark(plainText); showFeedbackMessage('인스타그램 게시물 북마크됨'); return; }
      }
      
      // 2. 드롭된 내용에서 이미지 URL 추출 시도
      if(html){
        const doc=new DOMParser().parseFromString(html,'text/html');
        const img=doc.querySelector('img');
        if(img?.src){ url=img.src; pageUrl=dt.getData('text/uri-list')||dt.getData('URL')||null; }
      }
      // 3. 드롭된 내용에서 일반 URL 추출 시도
      if(!url){ const u=dt.getData('text/uri-list')||dt.getData('URL')||plainText; if(u) { url=u; pageUrl=u; } }

      // 4. 북마크 처리 (URL인 경우)
      if(url){
          if(isImageUrl(url)){ 
              // 이미지 URL 북마크
              if(window.addRemoteImage){ await window.addRemoteImage(url,pageUrl); showFeedbackMessage('이미지 URL 북마크됨'); } 
              return; 
          } else if(isVideoUrl(url)) {
              // 동영상 URL 북마크
              if(window.addVideoBookmark) { await window.addVideoBookmark(url); showFeedbackMessage('동영상 URL 북마크됨'); }
              return;
          } else if(isGenericUrl(url)) {
              // 일반 페이지 URL 북마크
              if(window.addGenericBookmark) { await window.addGenericBookmark(url); showFeedbackMessage('페이지 URL 북마크됨'); }
              return;
          }
      }

      // 5. 파일 드롭 처리 (캡쳐 이미지는 붙여넣기 안내)
      const files=[...(dt.files||[])].filter(f=>f.type.startsWith('image/'));
      if(files.length){ 
          // [수정] 파일 드롭 시 window.addImage 호출
          if(window.addImage){ await window.addImage(files[0], null); showFeedbackMessage('이미지 업로드됨'); return; }
      }

      showAlert('유효한 콘텐츠를 찾지 못했습니다.');
    });

    // 클릭: 클립보드 접근 및 자동 붙여넣기 시도
    dragArea.addEventListener('click', async ()=>{
      try{
        let processed = false;
        
        // 1. 클립보드 이미지 처리
        if(navigator.clipboard?.read){
          const items=await navigator.clipboard.read();
          for(const it of items){
            for(const type of it.types){
              if(type.startsWith('image/')){
                const blob=await it.getType(type);
                if(window.addImage){ await window.addImage(new File([blob],'clipboard-image',{type:blob.type}), null); showFeedbackMessage('클립보드 이미지 업로드됨'); processed=true; return; }
              }
            }
          }
        }
        
        // 2. 클립보드 텍스트 (URL/퍼가기 코드) 처리
        const t = await navigator.clipboard.readText();
        if(t){
            if (isInstagramEmbed(t)) {
                if(window.addInstagramBookmark) { await window.addInstagramBookmark(t); showFeedbackMessage('클립보드 인스타그램 게시물 북마크됨'); processed=true; return; }
            } else if(isImageUrl(t)){ 
                if(window.addRemoteImage){ await window.addRemoteImage(t,t); showFeedbackMessage('클립보드 이미지 URL 북마크됨'); processed=true; return; } 
            } else if(isVideoUrl(t)){
                if(window.addVideoBookmark) { await window.addVideoBookmark(t); showFeedbackMessage('클립보드 동영상 URL 북마크됨'); processed=true; return; }
            } else if(isGenericUrl(t)) {
                if(window.addGenericBookmark) { await window.addGenericBookmark(t); showFeedbackMessage('클립보드 페이지 URL 북마크됨'); processed=true; return; }
            }
        }
        
        if(!processed) showAlert('클립보드에서 유효한 콘텐츠를 읽지 못했습니다.');
      }catch(e){ console.error(e); showAlert('클립보드 권한을 허용하세요.'); }
    });

    // 붙여넣기 핸들러
    dragArea.addEventListener('paste', async (e)=>{
      e.preventDefault();
      const items=[...(e.clipboardData||e.originalEvent?.clipboardData)?.items||[]];
      let foundText = null;

      for(const item of items){
        // 1. 이미지 파일 처리
        if(item.kind==='file' && item.type.startsWith('image/')){
          const file=item.getAsFile(); 
          if(file && window.addImage){ await window.addImage(file,null); showFeedbackMessage('이미지 업로드됨'); return; }
        }
        // 2. 텍스트 처리
        if(item.kind==='string'){
          const txt=await new Promise(r=>item.getAsString(r));
          if(txt){
             if (isInstagramEmbed(txt)) {
                 if(window.addInstagramBookmark) { await window.addInstagramBookmark(txt); showFeedbackMessage('인스타그램 게시물 북마크됨'); return; }
             } else if(isImageUrl(txt)){ 
                if(window.addRemoteImage){ await window.addRemoteImage(txt,txt); showFeedbackMessage('URL 북마크됨'); return; } 
             } else if(isVideoUrl(txt)){
                 if(window.addVideoBookmark) { await window.addVideoBookmark(txt); showFeedbackMessage('동영상 URL 북마크됨'); return; }
             } else if(isGenericUrl(txt)){
                 if(window.addGenericBookmark) { await window.addGenericBookmark(txt); showFeedbackMessage('페이지 URL 북마크됨'); return; }
             }
             foundText = txt;
          }
        }
      }
      
      // Fallback: plain text
      if (!foundText) {
          const plain=e.clipboardData?.getData('text/plain');
          if(plain){
             if (isInstagramEmbed(plain)) {
                 if(window.addInstagramBookmark) { await window.addInstagramBookmark(plain); showFeedbackMessage('인스타그램 게시물 북마크됨'); return; }
             } else if(isImageUrl(plain)){ 
                if(window.addRemoteImage){ await window.addRemoteImage(plain,plain); showFeedbackMessage('URL 북마크됨'); return; } 
             } else if(isVideoUrl(plain)){
                if(window.addVideoBookmark) { await window.addVideoBookmark(plain); showFeedbackMessage('동영상 URL 북마크됨'); return; }
             } else if(isGenericUrl(plain)){
                if(window.addGenericBookmark) { await window.addGenericBookmark(plain); showFeedbackMessage('페이지 URL 북마크됨'); return; }
             }
          }
      }
      
      showAlert('붙여넣기한 항목에 유효한 이미지, 동영상 URL, 일반 페이지 URL 또는 인스타그램 퍼가기 코드가 없습니다.');
    });
