export function initNotes(){
  const notesArea = document.getElementById('notesArea');
  const tabsContainer = document.getElementById('notesTabsContainer');
  const addTabBtn = document.getElementById('addNotesTabBtn');
  const toggleEditBtn = document.getElementById('toggleNotesEditBtn');

  if(!tabsContainer || !notesArea) return;

  // 아이콘 버튼 UI (텍스트 제거)
  if(addTabBtn){ addTabBtn.innerHTML = '<span class="text-xl leading-none">＋</span>'; addTabBtn.setAttribute('aria-label','탭 추가'); }
  if(toggleEditBtn){ toggleEditBtn.innerHTML = '<span class="text-xl leading-none">⚙︎</span>'; toggleEditBtn.setAttribute('aria-label','탭 편집'); }


  // Local UI state
  let editMode = false;

  const ICON_PLUS = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const ICON_GEAR = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a7.97 7.97 0 0 0 .1-6l-2.1.8a6 6 0 0 0-1.3-1.3l.8-2.1a7.97 7.97 0 0 0-6-.1l.8 2.1a6 6 0 0 0-1.3 1.3L6 8.9a7.97 7.97 0 0 0-.1 6l2.1-.8a6 6 0 0 0 1.3 1.3l-.8 2.1a7.97 7.97 0 0 0 6 .1l-.8-2.1a6 6 0 0 0 1.3-1.3l2.4.8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // Set icon buttons
  if(addTabBtn) addTabBtn.innerHTML = ICON_PLUS;
  if(toggleEditBtn) toggleEditBtn.innerHTML = ICON_GEAR;

  // Helpers
  const genId = ()=> 'tab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);

  const getState = ()=>({
    tabs: window.__notesTabList || [{ id:'memo', name:'메모', order:0 }],
    notes: window.__notesTabs || {},
    activeId: window.__notesActiveTabId || 'memo'
  });

  const setActive = async (tabId)=>{
    window.__notesActiveTabId = tabId;
    // Persist active tab id in cloud (best-effort)
    try{
      window.cloudSetActiveNotesTab && await window.cloudSetActiveNotesTab(tabId);
    }catch(_){}
    render();
    // Update textarea
    const { notes } = getState();
    notesArea.value = notes[tabId] || '';
  };

  const render = ()=>{
    const { tabs, activeId, notes } = getState();
    // normalize tabs ordering
    const sorted = [...tabs].sort((a,b)=>(a.order??0)-(b.order??0));
    tabsContainer.innerHTML = '';

    sorted.forEach((t)=>{
      const btn = document.createElement('button');
      btn.className = 'memo-tab' + (t.id===activeId ? ' active' : '');
      btn.dataset.tabId = t.id;
      btn.draggable = editMode;
      btn.innerHTML = `
        <span class="tab-label">${escapeHtml(t.name || '')}</span>
        ${editMode ? `<span class="tab-del" title="삭제">×</span>` : ``}
      `;
      tabsContainer.appendChild(btn);
    });

    // Ensure textarea shows active note
    const activeExists = sorted.some(t=>t.id===activeId);
    const useId = activeExists ? activeId : (sorted[0]?.id || 'memo');
    if(useId !== activeId){
      window.__notesActiveTabId = useId;
    }
    notesArea.value = notes[useId] || '';

    // Toggle button label
    if(toggleEditBtn){ toggleEditBtn.innerHTML = editMode ? '<span class="text-xl leading-none">✓</span>' : '<span class="text-xl leading-none">⚙︎</span>'; toggleEditBtn.setAttribute('aria-label', editMode ? '편집 완료' : '탭 편집'); }
  };

  const escapeHtml = (s)=> String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");

  const promptName = (title, current='')=>{
    const name = window.prompt(title, current);
    if(name===null) return null;
    const trimmed = name.trim();
    if(!trimmed) return null;
    return trimmed.slice(0, 20);
  };

  // Events: select / rename / delete
  tabsContainer.addEventListener('click', async (e)=>{
    const tabBtn = e.target.closest('.notepad-tab');
    if(!tabBtn) return;
    const tabId = tabBtn.dataset.tabId;

    // delete in edit mode
    if(editMode && e.target.classList.contains('tab-del')){
      if(!confirm('이 탭과 탭 안의 메모를 삭제할까요?')) return;
      window.cloudDeleteNotesTab && await window.cloudDeleteNotesTab(tabId);
      return;
    }

    // select
    await setActive(tabId);
  });

  tabsContainer.addEventListener('dblclick', async (e)=>{
    const tabBtn = e.target.closest('.notepad-tab');
    if(!tabBtn) return;
    const tabId = tabBtn.dataset.tabId;
    const { tabs } = getState();
    const cur = tabs.find(t=>t.id===tabId);
    const newName = promptName('탭 이름 변경', cur?.name || '');
    if(!newName) return;
    window.cloudRenameNotesTab && await window.cloudRenameNotesTab(tabId, newName);
  });

  // Drag reorder (edit mode only)
  let dragFromId = null;

  tabsContainer.addEventListener('dragstart', (e)=>{
    if(!editMode) return;
    const tabBtn = e.target.closest('.notepad-tab');
    if(!tabBtn) return;
    dragFromId = tabBtn.dataset.tabId;
    e.dataTransfer && (e.dataTransfer.effectAllowed = 'move');
  });

  tabsContainer.addEventListener('dragover', (e)=>{
    if(!editMode) return;
    e.preventDefault();
    e.dataTransfer && (e.dataTransfer.dropEffect = 'move');
  });

  tabsContainer.addEventListener('drop', async (e)=>{
    if(!editMode) return;
    e.preventDefault();
    const tabBtn = e.target.closest('.notepad-tab');
    if(!tabBtn || !dragFromId) return;
    const dropId = tabBtn.dataset.tabId;
    if(dropId === dragFromId) return;

    const { tabs } = getState();
    const sorted = [...tabs].sort((a,b)=>(a.order??0)-(b.order??0));
    const fromIdx = sorted.findIndex(t=>t.id===dragFromId);
    const toIdx = sorted.findIndex(t=>t.id===dropId);
    if(fromIdx<0 || toIdx<0) return;

    const [moved] = sorted.splice(fromIdx,1);
    sorted.splice(toIdx,0,moved);

    // reassign orders in steps of 10
    const next = sorted.map((t,i)=>({ ...t, order: i*10 }));
    window.cloudReorderNotesTabs && await window.cloudReorderNotesTabs(next);
    dragFromId = null;
  });

  // Add tab
  if(addTabBtn){
    addTabBtn.addEventListener('click', async ()=>{
      const name = promptName('새 탭 이름', '새 탭');
      if(!name) return;
      const id = genId();
      window.cloudAddNotesTab && await window.cloudAddNotesTab({ id, name });
      await setActive(id);
    });
  }

  // Toggle edit mode
  if(toggleEditBtn){
    toggleEditBtn.addEventListener('click', ()=>{
      editMode = !editMode;
      render();
    });
  }

  // Save note content
  if(notesArea){
    notesArea.addEventListener('input', ()=>{
      window.cloudSaveNotesDebounced && window.cloudSaveNotesDebounced();
    });
    notesArea.addEventListener('blur', ()=>{
      window.cloudSaveNotes && window.cloudSaveNotes();
    });
  }

  // Expose renderer for realtime updates
  window.renderNotesUI = render;

  // Initial render
  render();
}
