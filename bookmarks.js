export function initBookmarks(){
  const imageGrid = document.getElementById('image-grid');
  const dragArea = document.getElementById('drag-area');

  if(!imageGrid) return;

  // ===== 링크 프리뷰 이미지 붙여넣기 모달 =====
  const ensurePreviewModal = ()=>{
    let modal = document.getElementById('bookmarkPreviewModal');
    if(modal) return modal;

    modal = document.createElement('div');
    modal.id = 'bookmarkPreviewModal';
    modal.className = 'fixed inset-0 hidden items-center justify-center';
    modal.style.zIndex = '9999';
    modal.innerHTML = `
      <div class="absolute inset-0" style="background:rgba(0,0,0,0.65)"></div>
      <div class="relative bg-[#1f1f1f] rounded-xl p-6 w-[420px] max-w-[92vw] border border-[#333]">
        <div class="flex items-center justify-between mb-4">
          <div class="text-white font-bold">미리보기 이미지 붙여넣기</div>
          <button id="bookmarkPreviewCloseBtn" class="text-[#bbb] text-xl leading-none" aria-label="닫기">×</button>
        </div>
        <div id="bookmarkPreviewPasteZone"
             class="rounded-lg border border-dashed border-[#555] bg-[#141414] h-[220px] flex items-center justify-center cursor-default select-none">
          <div class="text-5xl font-bold text-[#777] leading-none">+</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // close handlers
    modal.querySelector('#bookmarkPreviewCloseBtn')?.addEventListener('click', ()=>hidePreviewModal());
    modal.addEventListener('click', (e)=>{ if(e.target === modal) hidePreviewModal(); });

    return modal;
  };

  let currentPreviewBookmarkId = null;

  const showPreviewModal = (bookmarkId)=>{
    currentPreviewBookmarkId = bookmarkId;
    const modal = ensurePreviewModal();
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Paste handler (modal open 동안만)
    const onPaste = async (e)=>{
      if(!currentPreviewBookmarkId) return;
      const items = e.clipboardData?.items || [];
      for(const it of items){
        if(it.kind === 'file' && it.type && it.type.startsWith('image/')){
          const blob = it.getAsFile();
          if(!blob) continue;
          const fileName = (blob.name && String(blob.name).trim()) ? blob.name : `preview_${Date.now()}.png`;
          const file = new File([blob], fileName, { type: blob.type || 'image/png' });
          try{
            if(typeof window.uploadBookmarkPreviewImage === 'function'){
              await window.uploadBookmarkPreviewImage(currentPreviewBookmarkId, file);
            }else{
              throw new Error('업로드 함수를 찾을 수 없습니다.');
            }
            hidePreviewModal();
          }catch(err){
            console.error(err);
            if(typeof window.showAlert === 'function') window.showAlert('미리보기 이미지 업로드 중 오류가 발생했습니다.');
            else alert('미리보기 이미지 업로드 중 오류가 발생했습니다.');
          }
          return;
        }
      }
      // 이미지가 아니면 무시
    };

    // 기존 리스너 제거 후 등록
    window.__bookmarkPreviewPasteHandler && window.removeEventListener('paste', window.__bookmarkPreviewPasteHandler);
    window.__bookmarkPreviewPasteHandler = onPaste;
    window.addEventListener('paste', onPaste);
  };

  const hidePreviewModal = ()=>{
    const modal = document.getElementById('bookmarkPreviewModal');
    if(modal){
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    currentPreviewBookmarkId = null;
    if(window.__bookmarkPreviewPasteHandler){
      window.removeEventListener('paste', window.__bookmarkPreviewPasteHandler);
      window.__bookmarkPreviewPasteHandler = null;
    }
  };

  // ===== 렌더 =====
  const escapeHtml = (s)=> String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");

  const getTs = (d)=>{
    const t = d?.timestamp;
    if(!t) return 0;
    // Firestore Timestamp or Date
    if(typeof t.toMillis === 'function') return t.toMillis();
    if(t.seconds) return Number(t.seconds) * 1000;
    const dt = new Date(t);
    return isNaN(dt.getTime()) ? 0 : dt.getTime();
  };

  window.renderImageBookmarks = function(){
    imageGrid.innerHTML = '';
    const list = [...(window.imageBookmarks || [])]
      .sort((a,b)=> getTs(b) - getTs(a)); // 최신순 고정

    list.forEach((d)=>{
      const card = document.createElement('div');
      card.className = 'bookmark-card';

      // 공통 툴바(삭제)
      const toolbar = document.createElement('div');
      toolbar.className = 'bookmark-toolbar';
      toolbar.innerHTML = `
        <button class="bm-del" title="삭제" aria-label="삭제">🗑</button>
      `;
      toolbar.querySelector('.bm-del')?.addEventListener('click', async (e)=>{
        e.stopPropagation();
        if(typeof window.deleteImage === 'function'){
          await window.deleteImage(d.id);
        }
      });

      // 링크 북마크: 제목/URL 숨김, 프리뷰 이미지만(있으면) + 연필 아이콘으로 프리뷰 업로드
      if(d.type === 'link'){
        const content = document.createElement('div');
        content.className = 'content';

        const hasPreview = !!d.previewImageUrl;
        content.innerHTML = hasPreview
          ? `<img src="${escapeHtml(d.previewImageUrl)}" alt="preview" style="width:100%;height:220px;object-fit:cover;display:block;" />`
          : `<div style="height:220px;display:flex;align-items:center;justify-content:center;color:#666;font-weight:700;">(미리보기 없음)</div>`;

        // pencil
        const editBtn = document.createElement('button');
        editBtn.className = 'bm-edit';
        editBtn.title = '미리보기 이미지 붙여넣기';
        editBtn.setAttribute('aria-label','미리보기 편집');
        editBtn.textContent = '✎';
        editBtn.addEventListener('click', (e)=>{
          e.stopPropagation();
          showPreviewModal(d.id);
        });

        card.appendChild(toolbar);
        card.appendChild(editBtn);
        card.appendChild(content);
        imageGrid.appendChild(card);
        return;
      }

      // 인스타그램: embedCode 있으면 그대로
      if(d.type === 'instagram' && d.embedCode){
        const content = document.createElement('div');
        content.className = 'content';
        content.innerHTML = d.embedCode;
        card.appendChild(toolbar);
        card.appendChild(content);
        imageGrid.appendChild(card);
        return;
      }

      // 동영상: video 태그
      if(d.type === 'video' && d.pageUrl){
        const content = document.createElement('div');
        content.className = 'content';
        content.innerHTML = `
          <video controls style="width:100%;height:220px;object-fit:cover;background:#000">
            <source src="${escapeHtml(d.pageUrl)}">
          </video>
        `;
        card.appendChild(toolbar);
        card.appendChild(content);
        imageGrid.appendChild(card);
        return;
      }

      // 이미지(파이어베이스/remote 등): url을 이미지로 표시
      if(d.url){
        const content = document.createElement('div');
        content.className = 'content';
        content.innerHTML = `<img src="${escapeHtml(d.url)}" alt="bookmark" style="width:100%;height:220px;object-fit:cover;display:block;" />`;
        card.appendChild(toolbar);
        card.appendChild(content);
        imageGrid.appendChild(card);
        return;
      }

      // 기타 fallback
      const content = document.createElement('div');
      content.className='content';
      content.innerHTML = `<div style="padding:20px;text-align:center;color:#777;">${escapeHtml(d.sourceDomain || 'Bookmark')}</div>`;
      card.appendChild(toolbar);
      card.appendChild(content);
      imageGrid.appendChild(card);
    });

    // 인스타 embed re-render
    if(window.instgrm?.Embeds?.process){
      try{ window.instgrm.Embeds.process(); }catch(_){}
    }
  };

  // ===== 입력 영역(+) UI는 유지하되 설명글 없이 동작만 유지 =====
  if(dragArea){
    // 클릭으로 파일 선택 기능은 제거(요청사항: +만 보이되 기존 붙여넣기/드래그는 유지)
    dragArea.addEventListener('click', async ()=>{
      // 이미지 붙여넣기 유도: 사용자가 Ctrl/Cmd+V로 입력
      // (의도적으로 아무 동작 안 함)
    });
  }

  window.renderImageBookmarks();
}
