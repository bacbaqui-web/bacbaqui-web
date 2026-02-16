export function initBookmarks({
  getState,
  setState,
  ensureLogin,
  showAlert,
  showFeedbackMessage,
  addImage,
  addRemoteImage,
  addVideoBookmark,
  addGenericBookmark,
  addInstagramBookmark,
  updateBookmarkTitle,
  deleteImage
}) {
  const dragArea = document.getElementById("drag-area");
  const imageGrid = document.getElementById("image-grid");
  const sortSelect = document.getElementById("bookmarkSortSelect");

  // 이미지 모달
  const imageModal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  const closeImageModalBtn = document.getElementById("closeImageModalBtn");
  const goToPageBtn = document.getElementById("goToPageBtn");

  // 제목 수정 모달
  const editTitleModal = document.getElementById("editTitleModal");
  const editTitleInput = document.getElementById("editTitleInput");
  const saveTitleBtn = document.getElementById("saveTitleBtn");
  const cancelTitleBtn = document.getElementById("cancelTitleBtn");
  const currentUrlDisplay = document.getElementById("currentUrlDisplay");

  let currentEditingBookmark = null;

  function openImageModal(url, pageUrl) {
    modalImage.src = url;
    if (pageUrl) {
      goToPageBtn.style.display = "block";
      goToPageBtn.onclick = () => window.open(pageUrl, "_blank");
    } else {
      goToPageBtn.style.display = "none";
    }
    imageModal.style.display = "flex";
  }

  function closeImageModal() {
    imageModal.style.display = "none";
  }

  closeImageModalBtn?.addEventListener("click", closeImageModal);
  imageModal?.addEventListener("click", (e) => { if (e.target === imageModal) closeImageModal(); });
  document.querySelector("#imageModal .modal-content")?.addEventListener("click", (e) => {
    if (!e.target.closest("#closeImageModalBtn") && !e.target.closest("#goToPageBtn")) {
      closeImageModal();
    }
  });

  function openEditModal(bookmark) {
    currentEditingBookmark = bookmark;
    const displayUrl =
      (bookmark.pageUrl || "").length > 50
        ? bookmark.pageUrl.substring(0, 47) + "..."
        : (bookmark.pageUrl || "");
    currentUrlDisplay.textContent = `URL: ${displayUrl}`;
    editTitleInput.value = bookmark.title || "";
    editTitleModal.style.display = "flex";
  }

  function closeEditModal() {
    currentEditingBookmark = null;
    editTitleModal.style.display = "none";
  }

  async function saveEditedTitle() {
    if (!currentEditingBookmark) return;
    if (!ensureLogin()) return;

    const newTitle = editTitleInput.value.trim();
    await updateBookmarkTitle(currentEditingBookmark.id, newTitle);

    closeEditModal();
    showFeedbackMessage("제목이 저장되었습니다.");
  }

  cancelTitleBtn?.addEventListener("click", closeEditModal);
  saveTitleBtn?.addEventListener("click", saveEditedTitle);
  editTitleModal?.addEventListener("click", (e) => { if (e.target === editTitleModal) closeEditModal(); });
  editTitleInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditedTitle();
    }
  });

  // ===== Instagram embed =====
  function initializeInstagramEmbeds() {
    if (window.instgrm && window.instgrm.Embeds) {
      window.instgrm.Embeds.process();
      return;
    }
    const scriptId = "instagram-embed-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.async = true;
      script.src = "//www.instagram.com/embed.js";
      document.head.appendChild(script);
      script.onload = () => {
        if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process();
      };
    }
  }

  function getYoutubeThumbnail(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      // youtu.be/<id>
      if (u.hostname.includes("youtu.be")) {
        const id = u.pathname.replace("/", "");
        return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
      }
      // youtube.com/watch?v=<id>
      if (u.hostname.includes("youtube.com")) {
        const id = u.searchParams.get("v");
        return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
      }
    } catch {}
    return null;
  }

  function isImageUrl(u) {
    try { new URL(u); } catch { return false; }
    return /\.(jpe?g|png|gif|webp|svg|avif)(\?|$)/i.test(u);
  }

  function isVideoUrl(u) {
    if (!u) return false;
    try { new URL(u); } catch { return false; }
    return /youtu\.be|youtube\.com|vimeo\.com|\.(mp4|webm|ogg|mov)(\?|$)|missav\.com/i.test(u);
  }

  function isInstagramEmbed(text) {
    return /<blockquote class="instagram-media".*<\/blockquote>/s.test(text);
  }

  function isGenericUrl(u) {
    if (!u) return false;
    try { new URL(u); } catch { return false; }
    return !isImageUrl(u) && !isVideoUrl(u);
  }

  // ===== 붙여넣기/드래그 처리 =====
  async function handleTextInput(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;

    if (isInstagramEmbed(trimmed)) {
      await addInstagramBookmark(trimmed);
      return;
    }

    // URL 처리
    const parts = trimmed.split(/\s+/);
    const maybeUrl = parts[0];

    if (isImageUrl(maybeUrl)) {
      await addRemoteImage(maybeUrl, maybeUrl);
      return;
    }
    if (isVideoUrl(maybeUrl)) {
      await addVideoBookmark(maybeUrl);
      return;
    }
    if (isGenericUrl(maybeUrl)) {
      await addGenericBookmark(maybeUrl);
      return;
    }

    showAlert("붙여넣은 내용이 이미지/동영상/URL/인스타 퍼가기 코드로 인식되지 않았습니다.");
  }

  async function handlePaste(e) {
    if (!ensureLogin()) return;

    const items = e.clipboardData?.items || [];
    let handled = false;

    // 1) 이미지 파일
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file && file.type.startsWith("image/")) {
          handled = true;
          await addImage(file, null);
        }
      }
    }

    // 2) 텍스트(링크/퍼가기)
    const text = e.clipboardData?.getData("text/plain");
    if (text && text.trim()) {
      handled = true;
      await handleTextInput(text);
    }

    if (handled) e.preventDefault();
  }

  async function handleDrop(e) {
    e.preventDefault();
    dragArea?.classList.remove("active");
    if (!ensureLogin()) return;

    const dt = e.dataTransfer;
    if (!dt) return;

    // 파일 드롭(이미지)
    if (dt.files && dt.files.length > 0) {
      for (const file of dt.files) {
        if (file.type.startsWith("image/")) {
          await addImage(file, null);
        }
      }
      return;
    }

    // 텍스트 드롭(URL)
    const text = dt.getData("text/plain");
    if (text && text.trim()) {
      await handleTextInput(text);
    }
  }

  function attachDnD() {
    if (!dragArea) return;

    dragArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      dragArea.classList.add("active");
    });
    dragArea.addEventListener("dragleave", () => dragArea.classList.remove("active"));
    dragArea.addEventListener("drop", handleDrop);

    // 클릭하면 “클립보드 텍스트 읽기” 시도(브라우저 권한 필요)
    dragArea.addEventListener("click", async () => {
      if (!ensureLogin()) return;
      try {
        const t = await navigator.clipboard.readText();
        if (t && t.trim()) {
          await handleTextInput(t);
          showFeedbackMessage("클립보드 내용을 붙여넣었습니다.");
        } else {
          showAlert("클립보드에 텍스트가 없습니다.");
        }
      } catch {
        showAlert("브라우저 정책상 자동 읽기가 막혔습니다. Ctrl/Cmd+V로 붙여넣어 주세요.");
      }
    });

    // paste는 전체 document에서 받는 편이 안정적
    document.addEventListener("paste", handlePaste);
  }

  // ===== 렌더 =====
  function tsToMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis(); // Firestore Timestamp
    const d = new Date(ts);
    const n = d.valueOf();
    return Number.isFinite(n) ? n : 0;
  }

  function render() {
    if (!imageGrid) return;

    const st = getState();
    const sortKey = st.bookmarkSortKey || "sourceDomain";
    if (sortSelect) sortSelect.value = sortKey;

    imageGrid.innerHTML = "";

    const sorted = [...(st.imageBookmarks || [])];

    if (sortKey === "sourceDomain") {
      sorted.sort((a, b) => {
        const da = a.sourceDomain || "Unknown Source";
        const db = b.sourceDomain || "Unknown Source";
        return da.localeCompare(db);
      });
    } else {
      sorted.sort((a, b) => tsToMillis(b.timestamp) - tsToMillis(a.timestamp));
    }

    let lastDomain = null;

    sorted.forEach((d) => {
      const isVideo = d.type === "video";
      const isLink = d.type === "link";
      const isInstagram = d.type === "instagram";
      const isImage = d.type === "imgbb" || d.type === "firebase_storage" || d.type === "remote";
      const isEditable = isVideo || isLink || isInstagram;

      const imageUrl = d.url;
      const pageUrl = d.pageUrl;
      const sourceDomain = d.sourceDomain || "Unknown Source";

      if (sortKey === "sourceDomain" && sourceDomain !== lastDomain) {
        const header = document.createElement("h3");
        header.className = "domain-header";
        header.textContent = sourceDomain;
        imageGrid.appendChild(header);
        lastDomain = sourceDomain;
      }

      let urlToOpen = pageUrl;
      let iconHtml = "";

      if (isLink) {
        const displayTitle = d.title || "일반 페이지 링크";
        const displayUrl = (pageUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

        iconHtml = `
          <div class="link-title-overlay">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-blue-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.708l4-4a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.102-1.101" />
            </svg>
            <span class="link-title-text">${escapeHtml(displayTitle)}</span>
            <span class="link-url-text">${escapeHtml(displayUrl)}</span>
          </div>`;
      } else if (isInstagram) {
        // 퍼가기 코드에서 원본 URL 추출(가능하면)
        try {
          const parser = new DOMParser();
          const doc2 = parser.parseFromString(d.embedCode || "", "text/html");
          const blockquote = doc2.querySelector("blockquote.instagram-media");
          if (blockquote && blockquote.cite) urlToOpen = blockquote.cite;
        } catch {}

        const displayTitle = d.title || "Instagram Post (클릭 시 원본 이동)";
        iconHtml = `
          <div class="w-full h-full relative z-0">
            ${d.embedCode || ""}
            <div class="absolute top-0 left-0 right-0 p-2 bg-black bg-opacity-70 text-white text-sm font-bold z-10">
              ${escapeHtml(displayTitle)}
            </div>
          </div>`;
      } else if (isVideo) {
        const thumb = getYoutubeThumbnail(pageUrl);
        const displayTitle = d.title || "동영상";

        if (!thumb) {
          const displayUrl = (pageUrl || "").replace(/^https?:\/\//, "").substring(0, 30) + "...";
          iconHtml = `
            <div class="video-title-overlay">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-red-400 mb-2" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4l12 8-12 8z"/></svg>
              <span class="video-title-text">${escapeHtml(displayTitle)}</span>
              <span class="video-url-text">${escapeHtml(displayUrl)}</span>
            </div>`;
        } else {
          iconHtml = `
            <img src="${thumb}" alt="동영상 썸네일" loading="lazy" decoding="async" class="img-fit-cover"
              onerror="this.onerror=null;this.src='https://placehold.co/100x120/444/fff?text=동영상+썸네일'"/>
            <div class="icon-overlay flex-col">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4l12 8-12 8z"/></svg>
              <span class="text-xs mt-1 font-bold">${escapeHtml(displayTitle)}</span>
            </div>`;
        }
      } else if (isImage) {
        iconHtml = `
          <img src="${imageUrl}" alt="북마크된 이미지" loading="lazy" decoding="async"
            onerror="this.onerror=null;this.src='https://placehold.co/100x120/444/fff?text=이미지+오류'"/>`;
      } else {
        iconHtml = `
          <div class="link-title-overlay">
            <span class="link-title-text">알 수 없는 북마크</span>
          </div>`;
      }

      const card = document.createElement("div");
      card.className = "bookmark-card relative group cursor-pointer";
      card.innerHTML = `
        <div class="content">${iconHtml}</div>
        <div class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs px-2 py-1 truncate z-10 opacity-70">
          ${escapeHtml(sourceDomain)}
        </div>

        <button class="absolute top-2 right-2 bg-[#424242] text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"
          data-id="${d.id}" data-action="delete" title="삭제">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>

        ${isEditable ? `
        <button class="absolute top-2 right-9 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"
          data-id="${d.id}" data-action="edit" title="제목 수정">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        ` : ""}
      `;

      // 카드 클릭
      card.addEventListener("click", (e) => {
        if (e.target.closest("button[data-action]")) return;

        if (isVideo || isLink || isInstagram) {
          window.open(urlToOpen, "_blank");
          return;
        }
        if (isImage) {
          openImageModal(imageUrl, pageUrl);
        }
      });

      imageGrid.appendChild(card);
    });

    // 버튼 이벤트
    imageGrid.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        const st2 = getState();
        const bookmark = (st2.imageBookmarks || []).find((x) => x.id === id);

        if (action === "delete") {
          try {
            await deleteImage(id);
          } catch (err) {
            console.error(err);
            showAlert("북마크 삭제 중 오류가 발생했습니다.");
          }
        } else if (action === "edit" && bookmark) {
          openEditModal(bookmark);
        }
      });
    });

    initializeInstagramEmbeds();
  }

  // 정렬 변경
  sortSelect?.addEventListener("change", (e) => {
    setState({ bookmarkSortKey: e.target.value });
    render();
  });

  // XSS 최소화용(링크 제목 등)
  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // DnD/paste init
  attachDnD();

  // 최초 렌더
  render();

  return { render };
}
