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

  /** =========================
   *  0) UI: 검색 입력(자동 생성)
   *  ========================= */
  let searchQuery = "";
  let typeFilter = "all"; // all | image | link | video | instagram

  function ensureControls() {
    // 이미 만들었으면 스킵
    if (document.getElementById("bm-search")) return;

    const section = document.getElementById("bookmarks-section");
    if (!section) return;

    // 정렬 select가 있는 라인(첫 번째 flex)을 찾아 그 아래에 컨트롤 박스 삽입
    const firstFlex = section.querySelector(".flex.justify-between.items-center.mb-4");
    const controls = document.createElement("div");
    controls.className = "flex flex-col gap-2 mb-4";

    controls.innerHTML = `
      <div class="flex gap-2 items-center">
        <input id="bm-search" class="bg-gray-700 p-2 rounded text-white w-full focus:outline-none"
               placeholder="검색 (제목/URL/도메인)" />
        <select id="bm-type" class="bg-gray-700 p-2 rounded text-white focus:outline-none">
          <option value="all">전체</option>
          <option value="image">이미지</option>
          <option value="link">링크</option>
          <option value="video">동영상</option>
          <option value="instagram">인스타</option>
        </select>
      </div>
      <div class="text-xs opacity-70 leading-5">
        링크 미리보기는 사이트 정책(CORS) 때문에 일부는 제목/썸네일을 가져오지 못할 수 있습니다. 가능한 범위에서 자동 보완합니다.
      </div>
    `;

    if (firstFlex) firstFlex.insertAdjacentElement("afterend", controls);
    else section.insertAdjacentElement("afterbegin", controls);

    const searchEl = document.getElementById("bm-search");
    const typeEl = document.getElementById("bm-type");

    searchEl.addEventListener("input", (e) => {
      searchQuery = (e.target.value || "").trim().toLowerCase();
      render();
    });

    typeEl.addEventListener("change", (e) => {
      typeFilter = e.target.value;
      render();
    });
  }

  /** =========================
   *  1) 모달(이미지 / 제목편집)
   *  ========================= */
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
  imageModal?.addEventListener("click", (e) => {
    if (e.target === imageModal) closeImageModal();
  });
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
    editTitleInput.focus();
    editTitleInput.select();
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
  editTitleModal?.addEventListener("click", (e) => {
    if (e.target === editTitleModal) closeEditModal();
  });
  editTitleInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditedTitle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeEditModal();
    }
  });

  /** =========================
   *  2) 링크 미리보기(최대한) + 캐시
   *  ========================= */

  // localStorage 캐시 (성공률 낮은 사이트도 있으므로, "성공한 것"을 재사용)
  const PREVIEW_CACHE_KEY = "bm_preview_cache_v2";
  const previewCache = new Map();

  function loadPreviewCache() {
    try {
      const raw = localStorage.getItem(PREVIEW_CACHE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return;
      for (const [k, v] of Object.entries(obj)) previewCache.set(k, v);
    } catch {}
  }

  function savePreviewCache() {
    try {
      const obj = Object.fromEntries(previewCache.entries());
      localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(obj));
    } catch {}
  }

  // 너무 자주 저장하지 않도록
  let cacheSaveTimer = null;
  function scheduleCacheSave() {
    clearTimeout(cacheSaveTimer);
    cacheSaveTimer = setTimeout(savePreviewCache, 800);
  }

  // YouTube 썸네일
  function getYoutubeThumbnail(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        const id = u.pathname.replace("/", "");
        return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
      }
      if (u.hostname.includes("youtube.com")) {
        const id = u.searchParams.get("v");
        return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
      }
    } catch {}
    return null;
  }

  function normalizeUrl(u) {
    try {
      const urlObj = new URL(u.includes("://") ? u : "https://" + u);
      // hash 제거(미리보기에는 불필요)
      urlObj.hash = "";
      return urlObj.toString();
    } catch {
      return u;
    }
  }

  // 정적 사이트에서 가장 현실적인 “가능하면 되는” 방식:
  // 1) 직접 fetch 시도 (CORS 허용 사이트면 성공)
  // 2) 실패하면 r.jina.ai 프록시를 통한 HTML 텍스트 접근 시도
  //    (일부 사이트는 이것도 차단될 수 있음)
  async function fetchHtmlForPreview(url) {
    const target = normalizeUrl(url);

    // 1) direct fetch
    try {
      const res = await fetch(target, { method: "GET", mode: "cors" });
      if (res.ok) return await res.text();
    } catch {}

    // 2) jina.ai read proxy (CORS 회피용)
    // - 형식: https://r.jina.ai/http(s)://example.com
    try {
      const proxy = "https://r.jina.ai/" + target;
      const res = await fetch(proxy, { method: "GET" });
      if (res.ok) return await res.text();
    } catch {}

    return null;
  }

  function extractMeta(html, nameOrProp) {
    // property="og:title" 또는 name="description" 등
    // 아주 단순/보수적으로 구현
    const re1 = new RegExp(
      `<meta[^>]+property=["']${escapeRegExp(nameOrProp)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const re2 = new RegExp(
      `<meta[^>]+name=["']${escapeRegExp(nameOrProp)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const m1 = html.match(re1);
    if (m1?.[1]) return decodeHtml(m1[1]).trim();
    const m2 = html.match(re2);
    if (m2?.[1]) return decodeHtml(m2[1]).trim();
    return null;
  }

  function extractTitle(html) {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m?.[1] ? decodeHtml(m[1]).trim() : null;
  }

  function decodeHtml(str) {
    // 브라우저 내장 디코더 사용
    try {
      const t = document.createElement("textarea");
      t.innerHTML = str;
      return t.value;
    } catch {
      return str;
    }
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async function getLinkPreview(url) {
    const key = normalizeUrl(url);

    if (previewCache.has(key)) return previewCache.get(key);

    // YouTube는 자체 생성(가장 안정적)
    const ytThumb = getYoutubeThumbnail(key);
    if (ytThumb) {
      const p = {
        title: null,
        description: null,
        image: ytThumb,
        siteName: "YouTube"
      };
      previewCache.set(key, p);
      scheduleCacheSave();
      return p;
    }

    const html = await fetchHtmlForPreview(key);
    if (!html) {
      const p = { title: null, description: null, image: null, siteName: null };
      previewCache.set(key, p);
      scheduleCacheSave();
      return p;
    }

    const ogTitle = extractMeta(html, "og:title");
    const ogDesc = extractMeta(html, "og:description") || extractMeta(html, "description");
    const ogImage = extractMeta(html, "og:image");
    const ogSite = extractMeta(html, "og:site_name");
    const title = ogTitle || extractTitle(html);

    const p = {
      title: title || null,
      description: ogDesc || null,
      image: ogImage || null,
      siteName: ogSite || null
    };

    previewCache.set(key, p);
    scheduleCacheSave();
    return p;
  }

  /** =========================
   *  3) Instagram: embedCode 직접 삽입 대신 URL→iframe 우선
   *  ========================= */
  function getInstagramCiteFromEmbed(embedCode) {
    if (!embedCode) return null;
    try {
      const parser = new DOMParser();
      const doc2 = parser.parseFromString(embedCode, "text/html");
      const blockquote = doc2.querySelector("blockquote.instagram-media");
      if (blockquote?.cite) return blockquote.cite;
    } catch {}
    return null;
  }

  function makeInstagramEmbedUrl(citeUrl) {
    // 보통 https://www.instagram.com/p/SHORTCODE/ 형태
    try {
      const u = new URL(citeUrl);
      // embed는 /embed/ 또는 /embed 이 형태가 대부분 동작
      let p = u.pathname;
      if (!p.endsWith("/")) p += "/";
      return `${u.origin}${p}embed/`;
    } catch {
      return null;
    }
  }

  /** =========================
   *  4) 입력 감지(붙여넣기/드롭)
   *  ========================= */
  function isImageUrl(u) {
    try { new URL(u); } catch { return false; }
    return /\.(jpe?g|png|gif|webp|svg|avif)(\?|$)/i.test(u);
  }

  function isVideoUrl(u) {
    if (!u) return false;
    try { new URL(u); } catch { return false; }
    return /youtu\.be|youtube\.com|vimeo\.com|\.(mp4|webm|ogg|mov)(\?|$)/i.test(u);
  }

  function isInstagramEmbed(text) {
    return /<blockquote class="instagram-media"[\s\S]*<\/blockquote>/i.test(text);
  }

  function isGenericUrl(u) {
    if (!u) return false;
    try { new URL(u); } catch { return false; }
    return !isImageUrl(u) && !isVideoUrl(u);
  }

  async function handleTextInput(text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;

    if (isInstagramEmbed(trimmed)) {
      await addInstagramBookmark(trimmed);
      return;
    }

    // 여러 줄/여러 토큰 중 첫 URL만
    const parts = trimmed.split(/\s+/);
    const maybeUrl = parts.find((p) => {
      try { new URL(p); return true; } catch { return false; }
    });

    if (!maybeUrl) {
      showAlert("URL/인스타 퍼가기 코드로 인식되지 않았습니다.");
      return;
    }

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

    // 클릭하면 클립보드 텍스트 읽기(권한 필요)
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

  /** =========================
   *  5) 렌더
   *  ========================= */
  function tsToMillis(ts) {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    const d = new Date(ts);
    const n = d.valueOf();
    return Number.isFinite(n) ? n : 0;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function matchesFilter(item) {
    const isVideo = item.type === "video";
    const isLink = item.type === "link";
    const isInstagram = item.type === "instagram";
    const isImage = item.type === "imgbb" || item.type === "firebase_storage" || item.type === "remote";

    if (typeFilter === "image" && !isImage) return false;
    if (typeFilter === "link" && !isLink) return false;
    if (typeFilter === "video" && !isVideo) return false;
    if (typeFilter === "instagram" && !isInstagram) return false;

    if (!searchQuery) return true;

    const hay = [
      item.title,
      item.pageUrl,
      item.url,
      item.sourceDomain,
      item.type
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return hay.includes(searchQuery);
  }

  function buildLinkPreviewCard({ title, description, image, siteName, displayUrl }) {
    // 카드 안에 “미리보기” 레이아웃(가능하면 이미지, 아니면 아이콘)
    const safeTitle = escapeHtml(title || "링크");
    const safeDesc = escapeHtml(description || "");
    const safeSite = escapeHtml(siteName || "");
    const safeUrl = escapeHtml(displayUrl || "");

    if (image) {
      return `
        <div class="w-full">
          <img src="${escapeHtml(image)}" alt="미리보기" loading="lazy" decoding="async" class="img-fit-cover"
            onerror="this.onerror=null;this.style.display='none';" />
          <div class="p-3 text-left">
            <div class="text-sm font-bold mb-1">${safeTitle}</div>
            ${safeDesc ? `<div class="text-xs opacity-80 line-clamp-3">${safeDesc}</div>` : ""}
            <div class="text-[11px] opacity-60 mt-2">${safeSite ? safeSite + " · " : ""}${safeUrl}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="link-title-overlay">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-blue-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.708l4-4a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.102-1.101" />
        </svg>
        <span class="link-title-text">${safeTitle}</span>
        <span class="link-url-text">${safeUrl}</span>
      </div>
    `;
  }

  async function render() {
    if (!imageGrid) return;
    ensureControls();

    const st = getState();
    const sortKey = st.bookmarkSortKey || "sourceDomain";
    if (sortSelect) sortSelect.value = sortKey;

    // 필터 적용
    const filtered = [...(st.imageBookmarks || [])].filter(matchesFilter);

    // 정렬
    if (sortKey === "sourceDomain") {
      filtered.sort((a, b) => {
        const da = a.sourceDomain || "Unknown Source";
        const db = b.sourceDomain || "Unknown Source";
        return da.localeCompare(db);
      });
    } else {
      filtered.sort((a, b) => tsToMillis(b.timestamp) - tsToMillis(a.timestamp));
    }

    imageGrid.innerHTML = "";
    const frag = document.createDocumentFragment();

    let lastDomain = null;

    // 렌더는 “일단 빠르게 그리고”, 링크 미리보기는 비동기로 채우는 전략
    const pendingPreviewJobs = [];

    for (const d of filtered) {
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
        frag.appendChild(header);
        lastDomain = sourceDomain;
      }

      let urlToOpen = pageUrl;
      let contentNode = document.createElement("div");
      contentNode.className = "content";

      // === 카드 본문 구성 ===
      if (isImage) {
        contentNode.innerHTML = `
          <img src="${escapeHtml(imageUrl)}" alt="북마크된 이미지" loading="lazy" decoding="async"
               onerror="this.onerror=null;this.src='https://placehold.co/100x120/444/fff?text=이미지+오류'"/>
        `;
      } else if (isVideo) {
        const thumb = getYoutubeThumbnail(pageUrl);
        const displayTitle = d.title || "동영상";

        if (thumb) {
          contentNode.innerHTML = `
            <img src="${escapeHtml(thumb)}" alt="동영상 썸네일" loading="lazy" decoding="async" class="img-fit-cover"
                 onerror="this.onerror=null;this.src='https://placehold.co/100x120/444/fff?text=동영상+썸네일'"/>
            <div class="icon-overlay flex-col">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4l12 8-12 8z"/></svg>
              <span class="text-xs mt-1 font-bold">${escapeHtml(displayTitle)}</span>
            </div>
          `;
        } else {
          // 일반 동영상 링크도 미리보기 시도(OG)
          const displayUrl = (pageUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
          contentNode.innerHTML = buildLinkPreviewCard({
            title: displayTitle,
            description: null,
            image: null,
            siteName: null,
            displayUrl
          });

          if (pageUrl) {
            pendingPreviewJobs.push(async () => {
              const preview = await getLinkPreview(pageUrl);
              const betterTitle = d.title || preview.title || "동영상";
              const displayUrl2 = (pageUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
              contentNode.innerHTML = buildLinkPreviewCard({
                title: betterTitle,
                description: preview.description,
                image: preview.image,
                siteName: preview.siteName,
                displayUrl: displayUrl2
              });
            });
          }
        }
      } else if (isInstagram) {
        // 가능한 경우: cite → iframe embed
        const cite = getInstagramCiteFromEmbed(d.embedCode);
        if (cite) urlToOpen = cite;
        const embedUrl = cite ? makeInstagramEmbedUrl(cite) : null;
        const displayTitle = d.title || "Instagram";

        if (embedUrl) {
          contentNode.innerHTML = `
            <div class="w-full h-full relative">
              <iframe
                src="${escapeHtml(embedUrl)}"
                style="width:100%;border:0;overflow:hidden;"
                scrolling="no"
                allowtransparency="true"
                loading="lazy"
                title="Instagram embed"
              ></iframe>
              <div class="absolute top-0 left-0 right-0 p-2 bg-black bg-opacity-70 text-white text-sm font-bold z-10">
                ${escapeHtml(displayTitle)}
              </div>
            </div>
          `;
        } else {
          // fallback: 기존 방식(최소 사용) — 그래도 title/URL 표시
          const displayUrl = (urlToOpen || "instagram.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
          contentNode.innerHTML = buildLinkPreviewCard({
            title: displayTitle,
            description: "임베드를 표시하지 못했습니다. 클릭하면 원본으로 이동합니다.",
            image: null,
            siteName: "Instagram",
            displayUrl
          });
        }
      } else if (isLink) {
        // 일반 링크: OG 미리보기 최대한
        const displayUrl = (pageUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
        const baseTitle = d.title || "링크";

        // 일단 기본 카드
        contentNode.innerHTML = buildLinkPreviewCard({
          title: baseTitle,
          description: null,
          image: null,
          siteName: null,
          displayUrl
        });

        // 비동기 미리보기
        if (pageUrl) {
          pendingPreviewJobs.push(async () => {
            const preview = await getLinkPreview(pageUrl);
            const betterTitle = d.title || preview.title || "링크";
            contentNode.innerHTML = buildLinkPreviewCard({
              title: betterTitle,
              description: preview.description,
              image: preview.image,
              siteName: preview.siteName,
              displayUrl
            });
          });
        }
      } else {
        // 알 수 없는 타입
        contentNode.innerHTML = `
          <div class="link-title-overlay">
            <span class="link-title-text">알 수 없는 북마크</span>
          </div>
        `;
      }

      // === 카드 wrapper ===
      const card = document.createElement("div");
      card.className = "bookmark-card relative group cursor-pointer";

      // 하단 도메인 바
      const domainBar = document.createElement("div");
      domainBar.className =
        "absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs px-2 py-1 truncate z-10 opacity-70";
      domainBar.textContent = sourceDomain;

      // 삭제 버튼
      const delBtn = document.createElement("button");
      delBtn.className =
        "absolute top-2 right-2 bg-[#424242] text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20";
      delBtn.title = "삭제";
      delBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      `;
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await deleteImage(d.id);
        } catch (err) {
          console.error(err);
          showAlert("북마크 삭제 중 오류가 발생했습니다.");
        }
      });

      // 편집 버튼(링크/비디오/인스타)
      let editBtn = null;
      if (isEditable) {
        editBtn = document.createElement("button");
        editBtn.className =
          "absolute top-2 right-9 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20";
        editBtn.title = "제목 수정";
        editBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        `;
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openEditModal(d);
        });
      }

      // 카드 클릭 행동
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;

        if (isLink || isVideo || isInstagram) {
          if (urlToOpen) window.open(urlToOpen, "_blank");
          return;
        }
        if (isImage) {
          openImageModal(imageUrl, pageUrl);
        }
      });

      card.appendChild(contentNode);
      card.appendChild(domainBar);
      card.appendChild(delBtn);
      if (editBtn) card.appendChild(editBtn);

      frag.appendChild(card);
    }

    imageGrid.appendChild(frag);

    // 링크 미리보기 채우기(순차 실행: 과부하 방지)
    // 많으면 한 번에 다 fetch하지 않도록 제한
    const MAX_PREVIEW_PER_RENDER = 12;
    const jobs = pendingPreviewJobs.slice(0, MAX_PREVIEW_PER_RENDER);

    for (const job of jobs) {
      try {
        await job();
      } catch {}
    }
  }

  // 정렬 변경
  sortSelect?.addEventListener("change", (e) => {
    setState({ bookmarkSortKey: e.target.value });
    render();
  });

  /** =========================
   *  6) 초기화
   *  ========================= */
  loadPreviewCache();
  ensureControls();
  attachDnD();
  render();

  return { render };
}
