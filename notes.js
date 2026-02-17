export function initNotes(){
  const notesArea = document.getElementById('notesArea');
  const tabsContainer = document.getElementById('notesTabsContainer');
  const addTabBtn = document.getElementById('addNotesTabBtn');
  const toggleEditBtn = document.getElementById('toggleNotesEditBtn');

  if(!tabsContainer || !notesArea) return;

  // Local UI state
  let editMode = false;

  // Helpers
  const genId = ()=> 'tab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);

  const getState = ()=>({
    tabs: (Array.isArray(window.__notesTabList) && window.__notesTabList.length>0) ? window.__notesTabList : [{ id:'memo', name:'메모', order:0 }],
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
    // if tabs list is empty or activeId missing, fallback to first tab
    const hasActive = Array.isArray(tabs) && tabs.some(t=>t.id===_activeId);
    let _activeId = hasActive ? activeId : ((Array.isArray(tabs) && tabs.length>0) ? tabs[0].id : 'memo');
    if(_activeId !== activeId){
      window.__notesActiveTabId = _activeId;
    }
    // normalize tabs ordering
    const sorted = [...tabs].sort((a,b)=>(a.order??0)-(b.order??0));
    tabsContainer.innerHTML = '';

    sorted.forEach((t)=>{
      const btn = document.createElement('button');
      btn.className = 'notes-tab' + (t.id===_activeId ? ' active' : '');
      btn.dataset.tabId = t.id;
      btn.draggable = editMode;
      btn.innerHTML = `
        <span class="tab-label">${escapeHtml(t.name || '')}</span>
        ${editMode ? `<span class="tab-del" title="삭제">×</span>` : ``}
      `;
      tabsContainer.appendChild(btn);
    });

    // Ensure textarea shows active note
    const activeExists = sorted.some(t=>t.id===_activeId);
    const useId = activeExists ? activeId : (sorted[0]?.id || 'memo');
    if(useId !== activeId){
      window.__notesActiveTabId = useId;
    }
    notesArea.value = notes[useId] || '';

    // Toggle button icon
    if(toggleEditBtn){
      toggleEditBtn.innerHTML = editMode
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
    }
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
    const tabBtn = e.target.closest('.notes-tab');
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
    const tabBtn = e.target.closest('.notes-tab');
    if(!tabBtn) return;
    const tabId = tabBtn.dataset.tabId;
    const { tabs } = getState();
    const cur = tabs.find(t=>t.id===tabId);
    const newName = promptName('탭 이름 변경', cur?.name || '');
    if(!newName) return;
    window.cloudRenameNotesTab && await window.cloudRenameNotesTab(tabId, newName);
  });

  // Drag reorder (edit mode only) - live reflow + smooth-ish
  let dragFromId = null;
  let draggingEl = null;
  let placeholderEl = null;

  function ensurePlaceholder(width){
    if(placeholderEl) return;
    placeholderEl = document.createElement('div');
    placeholderEl.className = 'notes-tab placeholder';
    placeholderEl.style.width = (width || 80) + 'px';
    placeholderEl.style.height = '32px';
    placeholderEl.style.borderRadius = '10px 10px 0 0';
    placeholderEl.style.border = '1px dashed rgba(255,255,255,.25)';
    placeholderEl.style.background = 'transparent';
  }

  function getDragAfterElement(container, x){
    const els = [...container.querySelectorAll('.notes-tab:not(.dragging):not(.placeholder)')];
    let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
    for(const child of els){
      const box = child.getBoundingClientRect();
      const offset = x - (box.left + box.width/2);
      if(offset < 0 && offset > closest.offset){
        closest = { offset, element: child };
      }
    }
    return closest.element;
  }

  tabsContainer.addEventListener('dragstart', (e)=>{
    if(!editMode) return;
    const tabBtn = e.target.closest('.notes-tab');
    if(!tabBtn) return;
    dragFromId = tabBtn.dataset.tabId;
    draggingEl = tabBtn;
    draggingEl.classList.add('dragging');

    // placeholder for live layout
    const w = tabBtn.getBoundingClientRect().width;
    ensurePlaceholder(w);
    placeholderEl.style.width = w + 'px';
    tabBtn.after(placeholderEl);

    // Better drag image (avoid huge ghost)
    if(e.dataTransfer){
      e.dataTransfer.effectAllowed = 'move';
      try{
        const img = tabBtn.cloneNode(true);
        img.style.position = 'absolute';
        img.style.top = '-9999px';
        img.style.left = '-9999px';
        img.style.opacity = '0.9';
        document.body.appendChild(img);
        e.dataTransfer.setDragImage(img, 10, 10);
        setTimeout(()=>img.remove(), 0);
      }catch(_){}
    }
  });

  tabsContainer.addEventListener('dragover', (e)=>{
    if(!editMode || !draggingEl) return;
    e.preventDefault();
    const afterEl = getDragAfterElement(tabsContainer, e.clientX);
    if(!afterEl){
      tabsContainer.appendChild(placeholderEl);
    }else{
      tabsContainer.insertBefore(placeholderEl, afterEl);
    }
  });

  async function finalizeReorder(){
    if(!draggingEl || !placeholderEl) return;
    placeholderEl.replaceWith(draggingEl);
    draggingEl.classList.remove('dragging');

    // compute order from DOM
    const ids = [...tabsContainer.querySelectorAll('.notes-tab')].filter(el=>!el.classList.contains('placeholder')).map(el=>el.dataset.tabId).filter(Boolean);
    const { tabs } = getState();
    const map = new Map(tabs.map(t=>[t.id, t]));
    const next = ids.map((id,i)=>({ ...map.get(id), order: i*10 })).filter(Boolean);
    window.cloudReorderNotesTabs && await window.cloudReorderNotesTabs(next);

    dragFromId = null;
    draggingEl = null;
    placeholderEl = null;
  }

  tabsContainer.addEventListener('drop', async (e)=>{
    if(!editMode) return;
    e.preventDefault();
    await finalizeReorder();
  });

  tabsContainer.addEventListener('dragend', async ()=>{
    if(!editMode) return;
    // If dropped outside, still finalize to clean placeholder
    if(placeholderEl && draggingEl){
      await finalizeReorder();
    }
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
