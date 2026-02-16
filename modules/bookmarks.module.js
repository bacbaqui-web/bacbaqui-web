import { auth, userRefs, storage } from "../firebaseClient.js";
import { ensureLogin, extractDomain, showAlert, showFeedbackMessage, setLoading } from "../utils.js";

import {
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

let styleEl = null;
let rootEl = null;
let unsubs = [];

let imageBookmarks = [];
let sortKey = "sourceDomain"; // sourceDomain | timestamp

let currentEditing = null; // bookmark object

function injectStyle() {
  styleEl = document.createElement("style");
  styleEl.id = "bookmarks-module-style";
  styleEl.textContent = `
    /* Masonry */
    #image-grid{column-count:2;column-gap:1rem;margin-top:1.5rem;display:block}
    @media (min-width:640px){#image-grid{column-count:3}}
    @media (min-width:1024px){#image-grid{column-count:4}}

    .domain-header{column-span:all;width:100%;margin:20px 0 10px;padding:8px 0;color:#fff;font-size:1.25rem;font-weight:700;border-bottom:2px solid #555;text-align:left}
    @media (max-width:768px){.domain-header{font-size:1rem}}

    .bookmark-card{position:relative;transition:transform .2s ease-in-out;background:#333;border-radius:8px;overflow:hidden;margin-bottom:1rem;break-inside:avoid;width:100%;display:block}
    .bookmark-card:hover{transform:translateY(-5px)}

    .bookmark-card .content{display:block;width:100%;height:auto;overflow:hidden;background-color:#1a1a1a;min-height:80px;position:relative}
    .bookmark-card img{position:static;width:100%;height:auto;display:block;object-fit:contain}
    .bookmark-card .img-fit-cover{object-fit:cover;height:100%}

    .bookmark-card .overlay-title{position:absolute;inset:0;background:rgba(0,0,0,0.72);display:flex;flex-direction:column;justify-content:center;align-items:center;color:#fff;padding:10px;text-align:center}
    .bookmark-card .overlay-title .t{font-size:1rem;font-weight:700;margin-bottom:5px;word-break:break-all}
    .bookmark-card .overlay-title .u{font-size:.75rem;opacity:.7;word-break:break-all}

    .bookmark-card .overlay-video{position:absolute;inset:0;background:rgba(80,0,0,0.70);display:flex;flex-direction:column;justify-content:center;align-items:center;color:#fff;padding:10px;text-align:center}

    /* 카드 우상단 버튼 */
    .bm-actions{position:absolute;top:8px;right:8px;display:flex;gap:6px;z-index:5}
    .bm-action-btn{width:28px;height:28px;border-radius:9999px;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;cursor:pointer}
    .bm-action-btn:hover{background:rgba(0,0,0,0.75)}

    /* + 영역(고정) */
    .bm-sticky{position:sticky;top:0;z-index:20;background:#2a2a2a;padding-top:12px}

    .bm-plus{
      width:56px;height:56px;border-radius:14px;
      border:2px dashed #4b4b4b;
      display:flex;align-items:center;justify-content:center;
      font-size:28px;color:#bbb;
      margin:0 auto;
      background:#1a1a1a;
      transition:all .2s ease;
    }
    .bm-plus:hover{border-color:#6b6b6b;background:#222;color:#fff}

    /* 이미지 모달(기존 느낌 유지) */
    #imageModal.modal{background:rgba(0,0,0,.7);display:none;position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999}
    #imageModal .modal-content{background-color:transparent;padding:0;box-shadow:none;max-width:90vw;max-height:90vh;width:auto;height:auto;display:flex;justify-content:center;align-items:center;cursor:pointer}
    #modalImage{width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain}

    /* 편집 모달 */
    #editBookmarkModal.modal{z-index:1001}
    #editBookmarkModal .modal-content{background:#2a2a2a;max-width:520px;box-shadow:0 10px 30px rgba(0,0,0,.5)}

    .bm-preview-drop{border:2px dashed #4b4b4b;border-radius:12px;padding:14px;text-align:center;color:#aaa;cursor:pointer;transition:.2s}
    .bm-preview-drop:hover{border-color:#6b6b6b;background:#252525}
    .bm-preview-thumb{width:100%;max-height:220px;object-fit:cover;border-radius:10px;display:block}
  `;
  document.head.appendChild(styleEl);
}

function buildUI(container) {
  container.innerHTML = `
    <div class="section-card text-left" id="bookmarks-section">
      <div class="bm-sticky">
        <div class="flex justify-between items-center mb-4">
          <div class="flex gap-2 items-center text-sm">
            <span class="text-gray-400">정렬 기준:</span>
            <select id="bookmarkSortSelect" class="bg-gray-700 p-1 rounded text-white focus:outline-none">
              <option value="timestamp">최신순</option>
              <option value="sourceDomain" selected>사이트별 정렬</option>
            </select>
          </div>
        </div>

        <section id="drag-area" class="drag-area rounded-lg p-4 flex items-center justify-center text-center cursor-pointer" title="클릭하면 붙여넣기 / 드롭 가능">
          <div class="bm-plus">+</div>
        </section>
      </div>

      <section id="image-grid"></section>
    </div>

    <!-- 이미지 모달 -->
    <div class="modal" id="imageModal">
      <div class="modal-content relative">
        <button id="closeImageModalBtn" class="absolute top-2 right-2 text-white bg-black bg-opacity-50 rounded-full p-1 z-50" title="닫기">
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
        </button>
        <img id="modalImage" alt="확대 이미지" src=""/>
        <button id="goToPageBtn" class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg z-50">원본 페이지로 이동</button>
      </div>
    </div>

    <!-- 북마크 편집 모달 (제목 + 대표이미지 업로드) -->
    <div class="modal" id="editBookmarkModal">
      <div class="modal-content">
        <h2 class="text-xl font-bold mb-4">북마크 편집</h2>

        <div class="text-xs opacity-80 mb-2" id="editBookmarkUrl"></div>

        <label class="block mb-2 text-sm opacity-80">제목</label>
        <input id="editBookmarkTitle" type="text" class="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 mb-4 text-white" />

        <label class="block mb-2 text-sm opacity-80">대표 이미지 (선택)</label>
        <div id="previewDrop" class="bm-preview-drop mb-3">여기를 클릭하거나, 이미지 붙여넣기/드롭</div>
        <div id="previewArea" class="mb-4 hidden">
          <img id="previewImg" class="bm-preview-thumb" alt="대표 이미지" />
          <div class="flex justify-end mt-2">
            <button id="removePreviewBtn" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg">대표 이미지 제거</button>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button id="saveBookmarkBtn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">저장</button>
          <button id="cancelBookmarkBtn" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">취소</button>
        </div>
      </div>
    </div>
  `;
}

function openImageModal(url, pageUrl) {
  const imageModal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  const goToPageBtn = document.getElementById("goToPageBtn");

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
  document.getElementById("imageModal").style.display = "none";
}

function openEditModal(bm) {
  currentEditing = bm;
  document.getElementById("editBookmarkUrl").textContent = bm.pageUrl ? `URL: ${bm.pageUrl}` : (bm.url ? `URL: ${bm.url}` : "");
  const input = document.getElementById("editBookmarkTitle");
  input.value = bm.title || "";

  // preview
  const area = document.getElementById("previewArea");
  const img = document.getElementById("previewImg");
  if (bm.previewImageUrl) {
    img.src = bm.previewImageUrl;
    area.classList.remove("hidden");
  } else {
    img.src = "";
    area.classList.add("hidden");
  }

  document.getElementById("editBookmarkModal").style.display = "flex";
  input.focus();
  input.select();
}

function closeEditModal() {
  currentEditing = null;
  document.getElementById("editBookmarkModal").style.display = "none";
}

async function uploadImageToStorage(file, pathPrefix) {
  if (!ensureLogin()) return null;
  const uid = auth.currentUser.uid;
  const safeName = (file.name || "image.png").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `users/${uid}/${pathPrefix}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, storagePath);

  setLoading(true);
  try {
    showFeedbackMessage("이미지 업로드 중...");
    const up = await uploadBytes(storageRef, file);
    const url = await getDownloadURL(up.ref);
    return { url, storagePath };
  } finally {
    setLoading(false);
  }
}

function isProbablyUrl(txt) {
  if (!txt) return false;
  return /^https?:\/\//i.test(txt.trim()) || /^[\w-]+\.[\w.-]+\//.test(txt.trim());
}

function isInstagramEmbed(txt) {
  return typeof txt === "string" && txt.includes("instagram-media");
}

function isVideoUrl(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.includes("youtube.com") || u.includes("youtu.be") || u.endsWith(".mp4") || u.endsWith(".webm");
}

async function addByText(text) {
  if (!ensureLogin()) return;
  const { imagesCol } = userRefs(auth.currentUser.uid);

  const raw = (text || "").trim();
  if (!raw) return;

  // instagram embed
  if (isInstagramEmbed(raw)) {
    // 퍼가기 코드에서 cite 추출
    let pageUrl = "인스타그램 게시물";
    try {
      const parser = new DOMParser();
      const d = parser.parseFromString(raw, "text/html");
      const blockquote = d.querySelector("blockquote.instagram-media");
      if (blockquote?.cite) pageUrl = blockquote.cite;
    } catch {}

    await addDoc(imagesCol, {
      type: "instagram",
      embedCode: raw,
      pageUrl,
      title: null,
      sourceDomain: extractDomain(pageUrl),
      timestamp: new Date()
    });

    showFeedbackMessage("인스타 북마크가 추가되었습니다.");
    return;
  }

  // url
  if (isProbablyUrl(raw)) {
    const url = raw.includes("://") ? raw : "https://" + raw;
    const type = isVideoUrl(url) ? "video" : "link";

    await addDoc(imagesCol, {
      type,
      pageUrl: url,
      url: null,
      title: null,
      sourceDomain: extractDomain(url),
      timestamp: new Date()
    });

    showFeedbackMessage("링크가 추가되었습니다.");
    return;
  }

  showAlert("인식할 수 없는 형식입니다.\nURL 또는 이미지/인스타 퍼가기 코드를 사용해 주세요.");
}

async function addByFile(file, pageUrl = null) {
  if (!ensureLogin()) return;
  const { imagesCol } = userRefs(auth.currentUser.uid);

  // 업로드
  const up = await uploadImageToStorage(file, "uploads");
  if (!up) return;

  await addDoc(imagesCol, {
    type: "firebase_storage",
    url: up.url,
    storagePath: up.storagePath,
    pageUrl: pageUrl || null,
    title: null,
    sourceDomain: extractDomain(pageUrl || up.url),
    timestamp: new Date()
  });

  showFeedbackMessage("이미지가 업로드되었습니다.");
}

async function deleteBookmark(id) {
  if (!ensureLogin()) return;
  const { imagesCol } = userRefs(auth.currentUser.uid);
  const row = imageBookmarks.find((d) => d.id === id);
  if (!row) return;

  // storage cleanup
  const paths = [];
  if (row.storagePath) paths.push(row.storagePath);
  if (row.previewStoragePath) paths.push(row.previewStoragePath);

  for (const p of paths) {
    try {
      await deleteObject(ref(storage, p));
    } catch {
      // ignore
    }
  }

  await deleteDoc(doc(imagesCol, id));
  showFeedbackMessage("북마크가 삭제되었습니다.");
}

async function saveBookmarkEdits() {
  if (!ensureLogin()) return;
  if (!currentEditing) return;
  const { imagesCol } = userRefs(auth.currentUser.uid);
  const id = currentEditing.id;

  const newTitle = (document.getElementById("editBookmarkTitle").value || "").trim();
  try {
    await updateDoc(doc(imagesCol, id), { title: newTitle || null });
    showFeedbackMessage("저장되었습니다.");
    closeEditModal();
  } catch (e) {
    console.error(e);
    showAlert("저장 중 오류가 발생했습니다.");
  }
}

async function removePreview() {
  if (!ensureLogin()) return;
  if (!currentEditing) return;
  const { imagesCol } = userRefs(auth.currentUser.uid);
  const id = currentEditing.id;

  // delete preview file
  if (currentEditing.previewStoragePath) {
    try {
      await deleteObject(ref(storage, currentEditing.previewStoragePath));
    } catch {}
  }

  await updateDoc(doc(imagesCol, id), { previewImageUrl: null, previewStoragePath: null });
  showFeedbackMessage("대표 이미지가 제거되었습니다.");

  // UI
  document.getElementById("previewArea").classList.add("hidden");
  document.getElementById("previewImg").src = "";
}

async function setPreviewFromFile(file) {
  if (!ensureLogin()) return;
  if (!currentEditing) {
    showAlert("편집할 항목을 먼저 선택해 주세요.");
    return;
  }

  const up = await uploadImageToStorage(file, "bookmark_previews");
  if (!up) return;

  // 기존 preview 삭제
  if (currentEditing.previewStoragePath) {
    try { await deleteObject(ref(storage, currentEditing.previewStoragePath)); } catch {}
  }

  const { imagesCol } = userRefs(auth.currentUser.uid);
  await updateDoc(doc(imagesCol, currentEditing.id), { previewImageUrl: up.url, previewStoragePath: up.storagePath });

  // UI
  document.getElementById("previewImg").src = up.url;
  document.getElementById("previewArea").classList.remove("hidden");
  showFeedbackMessage("대표 이미지가 저장되었습니다.");
}

function renderCard(bm) {
  const card = document.createElement("div");
  card.className = "bookmark-card";

  // actions
  const actions = document.createElement("div");
  actions.className = "bm-actions";

  const editBtn = document.createElement("div");
  editBtn.className = "bm-action-btn";
  editBtn.title = "편집";
  editBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  `;
  editBtn.addEventListener("click", (e) => { e.stopPropagation(); openEditModal(bm); });

  const delBtn = document.createElement("div");
  delBtn.className = "bm-action-btn";
  delBtn.title = "삭제";
  delBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  `;
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = confirm("이 북마크를 삭제하시겠습니까?");
    if (!ok) return;
    await deleteBookmark(bm.id);
  });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  const content = document.createElement("div");
  content.className = "content";

  // choose preview
  if (bm.previewImageUrl) {
    const img = document.createElement("img");
    img.src = bm.previewImageUrl;
    img.alt = bm.title || "preview";
    img.className = "img-fit-cover";
    content.appendChild(img);
  } else if (bm.type === "firebase_storage" || bm.type === "remote") {
    const img = document.createElement("img");
    img.src = bm.url;
    img.alt = bm.title || "image";
    content.appendChild(img);
  } else if (bm.type === "instagram") {
    const overlay = document.createElement("div");
    overlay.className = "overlay-title";
    overlay.innerHTML = `<div class="t">${escapeHtml(bm.title || "Instagram")}</div><div class="u">${escapeHtml(bm.pageUrl || "")}</div>`;
    content.appendChild(overlay);
  } else if (bm.type === "video") {
    const overlay = document.createElement("div");
    overlay.className = "overlay-video";
    overlay.innerHTML = `<div class="t">${escapeHtml(bm.title || "Video")}</div><div class="u">${escapeHtml(bm.pageUrl || "")}</div>`;
    content.appendChild(overlay);
  } else {
    const overlay = document.createElement("div");
    overlay.className = "overlay-title";
    overlay.innerHTML = `<div class="t">${escapeHtml(bm.title || "Link")}</div><div class="u">${escapeHtml(bm.pageUrl || "")}</div>`;
    content.appendChild(overlay);
  }

  card.appendChild(content);
  card.appendChild(actions);

  // click behavior
  card.addEventListener("click", () => {
    if (bm.type === "firebase_storage" || bm.type === "remote") {
      openImageModal(bm.url, bm.pageUrl);
      return;
    }

    // link/video/instagram open pageUrl
    const url = bm.pageUrl || bm.url;
    if (url) window.open(url, "_blank");
  });

  return card;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  const grid = document.getElementById("image-grid");
  if (!grid) return;

  let list = [...imageBookmarks];

  // sort
  if (sortKey === "timestamp") {
    list.sort((a, b) => {
      const at = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const bt = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return bt - at;
    });
  } else {
    list.sort((a, b) => {
      const da = (a.sourceDomain || "").toLowerCase();
      const db = (b.sourceDomain || "").toLowerCase();
      if (da < db) return -1;
      if (da > db) return 1;
      // domain 내부는 최신순
      const at = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const bt = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return bt - at;
    });
  }

  grid.innerHTML = "";

  if (sortKey === "sourceDomain") {
    let cur = null;
    for (const bm of list) {
      const d = bm.sourceDomain || "Unknown";
      if (d !== cur) {
        cur = d;
        const h = document.createElement("div");
        h.className = "domain-header";
        h.textContent = cur;
        grid.appendChild(h);
      }
      grid.appendChild(renderCard(bm));
    }
    return;
  }

  list.forEach((bm) => grid.appendChild(renderCard(bm)));
}

function startSync() {
  unsubs.forEach((fn) => { try { fn(); } catch {} });
  unsubs = [];

  imageBookmarks = [];
  render();

  if (!auth.currentUser) return;

  const { imagesCol } = userRefs(auth.currentUser.uid);
  const unsub = onSnapshot(imagesCol, (snap) => {
    imageBookmarks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  unsubs.push(unsub);
}

function wireEvents() {
  // sort
  document.getElementById("bookmarkSortSelect")?.addEventListener("change", (e) => {
    sortKey = e.target.value;
    render();
  });

  // image modal
  document.getElementById("closeImageModalBtn")?.addEventListener("click", closeImageModal);
  const imageModal = document.getElementById("imageModal");
  imageModal?.addEventListener("click", (e) => { if (e.target === imageModal) closeImageModal(); });
  document.querySelector("#imageModal .modal-content")?.addEventListener("click", (e) => {
    if (!e.target.closest("#closeImageModalBtn") && !e.target.closest("#goToPageBtn")) closeImageModal();
  });

  // edit modal
  document.getElementById("cancelBookmarkBtn")?.addEventListener("click", closeEditModal);
  document.getElementById("saveBookmarkBtn")?.addEventListener("click", saveBookmarkEdits);
  document.getElementById("removePreviewBtn")?.addEventListener("click", removePreview);

  const editModal = document.getElementById("editBookmarkModal");
  editModal?.addEventListener("click", (e) => { if (e.target === editModal) closeEditModal(); });

  // preview drop/paste
  const drop = document.getElementById("previewDrop");
  drop?.addEventListener("click", async () => {
    // 클립보드에서 이미지 읽기 시도
    try {
      if (!navigator.clipboard?.read) {
        showAlert("이 브라우저에서는 '클립보드 이미지 읽기'를 지원하지 않습니다.\nCtrl/Cmd+V로 붙여넣기 해주세요.");
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const file = new File([blob], `clipboard.${type.split("/")[1] || "png"}`, { type });
            await setPreviewFromFile(file);
            return;
          }
        }
      }
      showAlert("클립보드에 이미지가 없습니다.");
    } catch {
      showAlert("클립보드 접근이 거부되었습니다.\nCtrl/Cmd+V로 붙여넣기 해주세요.");
    }
  });

  // paste into edit modal
  document.addEventListener("paste", async (e) => {
    // 편집 모달이 열려있을 때만 처리
    const modal = document.getElementById("editBookmarkModal");
    if (!modal || modal.style.display !== "flex") return;

    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          await setPreviewFromFile(file);
          return;
        }
      }
    }
  });

  // drop into edit modal
  drop?.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("active"); });
  drop?.addEventListener("dragleave", () => drop.classList.remove("active"));
  drop?.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.classList.remove("active");
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      await setPreviewFromFile(file);
    }
  });

  // main + area
  const dragArea = document.getElementById("drag-area");

  dragArea?.addEventListener("click", async () => {
    if (!ensureLogin()) return;

    // 1) 클립보드 텍스트 시도
    try {
      const txt = await navigator.clipboard.readText();
      if (txt && txt.trim()) {
        await addByText(txt);
        return;
      }
    } catch {
      // ignore
    }

    showAlert("여기에 URL을 붙여넣거나, 이미지를 붙여넣기/드롭해 주세요.\n(붙여넣기: Ctrl/Cmd+V)");
  });

  // drag drop for adding
  dragArea?.addEventListener("dragover", (e) => { e.preventDefault(); dragArea.classList.add("active"); });
  dragArea?.addEventListener("dragleave", () => dragArea.classList.remove("active"));
  dragArea?.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragArea.classList.remove("active");

    if (!ensureLogin()) return;

    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      await addByFile(file);
      return;
    }

    const text = e.dataTransfer?.getData("text/plain") || "";
    if (text.trim()) {
      await addByText(text);
      return;
    }
  });

  // paste for adding
  document.addEventListener("paste", async (e) => {
    // bookmarks 탭이 열려있을 때만
    const sect = document.getElementById("bookmarks-section");
    if (!sect) return;

    // 편집 모달이 열려있으면 위 리스너가 처리
    const editModal = document.getElementById("editBookmarkModal");
    if (editModal?.style.display === "flex") return;

    if (!ensureLogin()) return;

    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          await addByFile(file);
          return;
        }
      }
    }

    const txt = e.clipboardData?.getData("text") || "";
    if (txt.trim()) {
      e.preventDefault();
      await addByText(txt);
    }
  });
}

export function mount(container) {
  rootEl = container;
  injectStyle();
  buildUI(container);
  wireEvents();
  startSync();
  render();
}

export function unmount() {
  unsubs.forEach((fn) => { try { fn(); } catch {} });
  unsubs = [];
  if (styleEl) styleEl.remove();
  styleEl = null;
  rootEl = null;
}
