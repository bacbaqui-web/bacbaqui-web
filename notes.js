export function initNotes(){

  const notesArea=document.getElementById('notesArea');
  const tabs=document.querySelectorAll('#notes-section .notepad-tab');

  tabs.forEach(tab=>{
    tab.addEventListener('click',()=>{
      tabs.forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');

      const key=tab.dataset.tab;
      notesArea.value=(window.__notesTabs||{})[key]||'';
    });
  });

  if(notesArea){
    notesArea.addEventListener('input',()=>{
      window.cloudSaveNotesDebounced && window.cloudSaveNotesDebounced();
    });
    notesArea.addEventListener('blur',()=>{
      window.cloudSaveNotes && window.cloudSaveNotes();
    });
  }
}
