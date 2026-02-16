// modules/bookmarks.module.js
import { db, auth, storage } from "../firebaseClient.js";
import {
  collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc, serverTimestamp, getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

/**
 * 북마크 모듈 (요청사항 반영)
 * - 검색/안내문 제거
 * - 상단 + 입력 구역: 텍스트 없이 + 아이콘만, sticky 고정
 * - 모든 카드: 우상단 ✏️(편집) + ❌(삭제)
 * - 편집 모달: 제목 + 대표이미지(붙여넣기/드롭/클립보드 읽기) → Firebase Storage 업로드
 * - 링크 미리보기는 "대표이미지"를 사용자가 직접 지정하는 방식
 */

export async function mount(container, ctx) {
  const root = document.createElement("div");
  root.className = "section-card";
  root.innerHTML = `
    <style>
      #bm-sticky{position:sticky;top:0;z-index:50;background:rgba(42,42,42,.96);backdrop-filter:blur(6px);padding:10px 0}
      #bm-drop.plus-only{
        height:78px;display:flex;align-items:center;justify-content:center;
        font-size:38px;font-weight:800;color:#cfcfcf;
        border:2px dashed #4b4b4b;border-radius:12px;cursor:pointer;user-select:none
      }
      #bm-drop.plus-only.active{border-color:#6b6b6b;background:rgba(255,255,255,0.03)}
      #bm-grid{column-count:2;column-gap:1rem;margin-top:1rem}
      @media(min-width:1024px){#bm-grid{column-count:3}}
      .bm-card{position:relative;background:#333;border-radius:10px;overflow:hidden;margin:0 0 1rem 0;break-inside:avoid;display:block}
      .bm-thumb{width:100%;height:180px;object-fit:cover;display:block}
      .bm-thumbbox{width:100%;height:180px;display:flex;align-items:center;justify-content:center;background:#2a2a2a;color:#fff;font-size:28px}
      .bm-actions{position:absolute;top:8px;right:8px;display:flex;gap:6px;z-index:5}
      .bm-actions button{background:rgba(0,0,0,0.65);border:1px solid rgba(255,255,255,0.15);width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center}
      .bm-titlebar{padding:10px;font-size:13px;color:#e5e5e5;word-break:break-word}
      .bm-domain{column-span:all;margin:14px 0 6px 0;font-weight:800;color:#cfcfcf}
      /* edit modal preview drop */
      #bm-preview.plus-only{
        height:78px;display:flex;align-items:center;justify-content:center;
        font-size:38px;font-weight:800;color:#cfcfcf;
        border:2px dashed #4b4b4b;border-radius:12px;cursor:pointer;user-select:none
      }
      #bm-preview.plus-only.active{border-color:#6b6b6b;background:rgba(255,255,255,0.03)}
    </style>

    <div class="flex items-center justify-between">
      <div class="flex gap-2 items-center text-sm">
        <span class="text-gray-400">정렬:</span>
        <select id="bm-sort" class="bg-gray-700 p-1 rounded text-white focus:outline-none">
          <option value="timestamp">최신순</option>
          <option value="sourceDomain" selected>사이트별</option>
        </select>
      </div>
    </div>

    <div id="bm-sticky">
      <div id="bm-drop" class="plus-only" title="붙여넣기(Ctrl/Cmd+V) 또는 드래그&드롭">+</div>
    </div>

    <div id="bm-grid"></div>

    <!-- Edit modal -->
    <div class="modal" id="bm-edit-modal">
      <div class="modal-content">
        <h2 class="text-xl font-bold mb-4">북마크 편집</h2>
        <div class="text-xs opacity-70 mb-2" id="bm-edit-url"></div>

        <label class="block mb-2 text-sm opacity-80">제목</label>
        <input id="bm-edit-title" type="text" class="w-full p-2 rounded-lg bg-gray-800 border border-gray-700 mb-4 text-white"/>

        <div class="flex items-center justify-between mb-2">
          <label class="text-sm opacity-80">대표 이미지</label>
          <button id="bm-preview-remove" type="button" class="text-xs opacity-80 hover:opacity-100 underline">대표 이미지 제거</button>
        </div>
        <div id="bm-preview" class="plus-only mb-4" title="클릭 또는 붙여넣기(Ctrl/Cmd+V), 드래그&드롭">+</div>

        <div class="flex justify-end gap-2">
          <button id="bm-edit-save" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">저장</button>
          <button id="bm-edit-cancel" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg">취소</button>
        </div>
      </div>
    </div>

    <!-- Image modal -->
    <div class="modal" id="bm-image-modal">
      <div class="modal-content" style="max-width:860px;">
        <button id="bm-image-close" class="absolute top-4 right-4 bg-black bg-opacity-60 hover:bg-opacity-80 text-white rounded-full p-2 z-50">✕</button>
        <img id="bm-image-full" src="" alt="확대 이미지" style="width:100%;border-radius:10px;"/>
        <button id="bm-open-page" class="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">원본 페이지로 이동</button>
      </div>
    </div>
  `;
  container.appendChild(root);

  // DOM
  const drop = root.querySelector("#bm-drop");
  const grid = root.querySelector("#bm-grid");
  const sortSel = root.querySelector("#bm-sort");

  const editModal = root.querySelector("#bm-edit-modal");
  const editUrl = root.querySelector("#bm-edit-url");
  const editTitle = root.querySelector("#bm-edit-title");
  const editSave = root.querySelector("#bm-edit-save");
  const editCancel = root.querySelector("#bm-edit-cancel");
  const previewDrop = root.querySelector("#bm-preview");
  const previewRemove = root.querySelector("#bm-preview-remove");

  const imgModal = root.querySelector("#bm-image-modal");
  const imgFull = root.querySelector("#bm-image-full");
  const imgClose = root.querySelector("#bm-image-close");
  const openPageBtn = root.querySelector("#bm-open-page");

  function openModal(el) { el.classList.add("show"); }
  function closeModal(el) { el.classList.remove("show"); }

  // Helpers
  function ensureLogin() {
    if (!auth.currentUser) {
      ctx.showAlert("로그인 후 이용해 주세요.");
      return false;
    }
    return true;
  }

  function extractDomain(url) {
    if (!url) return "Unknown";
    try {
      const u = new URL(url.includes("://") ? url : "https://" + url);
      let d = u.hostname;
      if (d.startsWith("www.")) d = d.slice(4);
      return d;
    } catch {
      return "Unknown";
    }
  }

  async function imagesCol() {
    const uid = auth.currentUser?.uid;
    return collection(db, `users/${uid}/images`);
  }

  async function uploadToStorage(path, file) {
    const storageRef = ref(storage, path);
    const up = await uploadBytes(storageRef, file);
    return await getDownloadURL(up.ref);
  }

  // Add functions
  async function addLink(url) {
    if (!ensureLogin()) return;
    const col = await imagesCol();
    await addDoc(col, {
      type: "link",
      pageUrl: url,
      title: null,
      sourceDomain: extractDomain(url),
      timestamp: serverTimestamp(),
    });
  }

  async function addImageFile(file, pageUrl = null) {
    if (!ensureLogin()) return;
    const col = await imagesCol();
    const uid = auth.currentUser.uid;

    ctx.setLoading?.(true);
    try {
      const storagePath = `users/${uid}/uploads/${Date.now()}_${file.name}`;
      const url = await uploadToStorage(storagePath, file);
      await addDoc(col, {
        type: "firebase_storage",
        url,
        pageUrl: pageUrl || null,
        storagePath,
        title: null,
        sourceDomain: extractDomain(pageUrl || url),
        timestamp: serverTimestamp(),
      });
      ctx.showFeedbackMessage("이미지가 업로드되었습니다.");
    } finally {
      ctx.setLoading?.(false);
    }
  }

  // Preview image set/remove
  async function setPreviewImage(bookmarkId, file) {
    if (!ensureLogin()) return;
    const uid = auth.currentUser.uid;
    const col = await imagesCol();
    const dref = doc(col, bookmarkId);

    const snap = await getDoc(dref);
    const prev = snap.exists() ? (snap.data() || {}) : {};
    const oldPath = prev.previewStoragePath || null;

    ctx.setLoading?.(true);
    try {
      const storagePath = `users/${uid}/bookmark_previews/${bookmarkId}_${Date.now()}_${file.name}`;
      const url = await uploadToStorage(storagePath, file);
      await updateDoc(dref, {
        previewImageUrl: url,
        previewStoragePath: storagePath,
      });
      if (oldPath) {
        try { await deleteObject(ref(storage, oldPath)); } catch {}
      }
      ctx.showFeedbackMessage("대표 이미지가 저장되었습니다.");
    } finally {
      ctx.setLoading?.(false);
    }
  }

  async function removePreviewImage(bookmarkId) {
    if (!ensureLogin()) return;
    const col = await imagesCol();
    const dref = doc(col, bookmarkId);
    const snap = await getDoc(dref);
    const prev = snap.exists() ? (snap.data() || {}) : {};
    const oldPath = prev.previewStoragePath || null;

    await updateDoc(dref, { previewImageUrl: null, previewStoragePath: null });
    if (oldPath) {
      try { await deleteObject(ref(storage, oldPath)); } catch {}
    }
    ctx.showFeedbackMessage("대표 이미지가 제거되었습니다.");
  }

  async function deleteBookmark(row) {
    if (!ensureLogin()) return;
    const col = await imagesCol();
    // delete preview image
    if (row.previewStoragePath) {
      try { await deleteObject(ref(storage, row.previewStoragePath)); } catch {}
    }
    // delete main image if uploaded
    if (row.type === "firebase_storage" && row.storagePath) {
      try { await deleteObject(ref(storage, row.storagePath)); } catch {}
    }
    await deleteDoc(doc(col, row.id));
    ctx.showFeedbackMessage("삭제되었습니다.");
  }

  // Clipboard read on click (optional)
  async function tryReadClipboardImage() {
    // This may be blocked by browser permissions; we keep it best-effort.
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        for (const t of it.types) {
          if (t.startsWith("image/")) {
            const blob = await it.getType(t);
            return new File([blob], `clipboard.${t.split("/")[1] || "png"}`, { type: t });
          }
        }
      }
    } catch {}
    return null;
  }

  // Input handlers for drop area
  async function handleAddFromPasteOrDrop(file, text) {
    if (file && file.type?.startsWith("image/")) {
      await addImageFile(file, null);
      return;
    }
    const url = (text || "").trim();
    if (url) await addLink(url);
  }

  function markActive(el, on) { el.classList.toggle("active", !!on); }

  // Drop/paste on main +
  drop.addEventListener("dragover", (e) => { e.preventDefault(); markActive(drop, true); });
  drop.addEventListener("dragleave", () => markActive(drop, false));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    markActive(drop, false);
    const f = e.dataTransfer.files?.[0];
    const t = e.dataTransfer.getData("text") || "";
    await handleAddFromPasteOrDrop(f, t);
  });
  drop.addEventListener("paste", async (e) => {
    const f = e.clipboardData.files?.[0];
    const t = e.clipboardData.getData("text") || "";
    await handleAddFromPasteOrDrop(f, t);
  });
  drop.addEventListener("click", async () => {
    // best effort: if clipboard has image, upload it; otherwise show help
    const f = await tryReadClipboardImage();
    if (f) await addImageFile(f, null);
    else ctx.showAlert("이미지를 복사한 뒤 이 박스에서 Ctrl/Cmd+V로 붙여넣어 주세요.\n(또는 드래그&드롭도 가능합니다.)");
  });

  // Data + render
  let rows = [];
  let sortMode = "sourceDomain";

  function compareTs(a, b) {
    const ta = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0);
    const tb = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0);
    return tb - ta;
  }

  function iconFor(row) {
    if (row.type === "video") return "▶";
    if (row.type === "instagram") return "IG";
    if (row.type === "link") return "🔗";
    return "🔗";
  }

  function openImageViewer(imageUrl, pageUrl) {
    imgFull.src = imageUrl || "";
    openPageBtn.onclick = () => {
      if (pageUrl) window.open(pageUrl, "_blank", "noopener,noreferrer");
      else window.open(imageUrl, "_blank", "noopener,noreferrer");
    };
    openModal(imgModal);
  }
  imgClose.addEventListener("click", () => closeModal(imgModal));
  imgModal.addEventListener("click", (e) => { if (e.target === imgModal) closeModal(imgModal); });

  // Edit workflow
  let editing = null; // row
  function openEdit(row) {
    editing = row;
    editUrl.textContent = row.pageUrl || row.url || "";
    editTitle.value = row.title || "";
    openModal(editModal);
  }
  function closeEdit() {
    editing = null;
    closeModal(editModal);
  }
  editCancel.addEventListener("click", closeEdit);
  editModal.addEventListener("click", (e) => { if (e.target === editModal) closeEdit(); });

  editSave.addEventListener("click", async () => {
    if (!editing) return;
    if (!ensureLogin()) return;
    const col = await imagesCol();
    await updateDoc(doc(col, editing.id), { title: (editTitle.value || null) });
    ctx.showFeedbackMessage("저장되었습니다.");
    closeEdit();
  });

  // Preview drop in edit modal
  previewDrop.addEventListener("dragover", (e) => { e.preventDefault(); markActive(previewDrop, true); });
  previewDrop.addEventListener("dragleave", () => markActive(previewDrop, false));
  previewDrop.addEventListener("drop", async (e) => {
    e.preventDefault();
    markActive(previewDrop, false);
    if (!editing) return;
    const f = e.dataTransfer.files?.[0];
    if (f && f.type?.startsWith("image/")) await setPreviewImage(editing.id, f);
  });
  previewDrop.addEventListener("paste", async (e) => {
    if (!editing) return;
    const f = e.clipboardData.files?.[0];
    if (f && f.type?.startsWith("image/")) await setPreviewImage(editing.id, f);
  });
  previewDrop.addEventListener("click", async () => {
    if (!editing) return;
    const f = await tryReadClipboardImage();
    if (f) await setPreviewImage(editing.id, f);
    else ctx.showAlert("이미지를 복사한 뒤 여기서 Ctrl/Cmd+V로 붙여넣어 주세요.\n(또는 드래그&드롭)");
  });

  previewRemove.addEventListener("click", async () => {
    if (!editing) return;
    await removePreviewImage(editing.id);
  });

  function render() {
    grid.innerHTML = "";
    const mode = sortMode;
    const list = [...rows];

    if (mode === "timestamp") {
      list.sort(compareTs);
      list.forEach(row => grid.appendChild(makeCard(row)));
      return;
    }

    // group by domain
    const groups = new Map();
    for (const r of list) {
      const key = r.sourceDomain || "Unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    // domains sorted
    const domains = [...groups.keys()].sort((a, b) => a.localeCompare(b));
    domains.forEach(d => {
      const h = document.createElement("div");
      h.className = "bm-domain";
      h.textContent = d;
      grid.appendChild(h);

      const items = groups.get(d);
      items.sort(compareTs);
      items.forEach(r => grid.appendChild(makeCard(r)));
    });
  }

  function makeCard(row) {
    const card = document.createElement("div");
    card.className = "bm-card";

    const actions = document.createElement("div");
    actions.className = "bm-actions";
    const btnEdit = document.createElement("button");
    btnEdit.title = "편집";
    btnEdit.textContent = "✏️";
    const btnDel = document.createElement("button");
    btnDel.title = "삭제";
    btnDel.textContent = "❌";
    actions.appendChild(btnEdit);
    actions.appendChild(btnDel);

    btnEdit.addEventListener("click", (e) => { e.stopPropagation(); openEdit(row); });
    btnDel.addEventListener("click", (e) => { e.stopPropagation(); deleteBookmark(row); });

    // thumb
    let thumbEl;
    const isImage = row.type === "firebase_storage" || row.type === "remote" || row.type === "imgbb";
    const linkLike = !isImage;

    if (isImage) {
      thumbEl = document.createElement("img");
      thumbEl.className = "bm-thumb";
      thumbEl.src = row.url;
    } else {
      if (row.previewImageUrl) {
        thumbEl = document.createElement("img");
        thumbEl.className = "bm-thumb";
        thumbEl.src = row.previewImageUrl;
      } else {
        thumbEl = document.createElement("div");
        thumbEl.className = "bm-thumbbox";
        thumbEl.textContent = iconFor(row);
      }
    }

    // click behavior
    card.addEventListener("click", () => {
      if (isImage) {
        openImageViewer(row.url, row.pageUrl);
      } else {
        const url = row.pageUrl || row.url;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }
    });

    const title = document.createElement("div");
    title.className = "bm-titlebar";
    title.textContent = row.title || row.pageUrl || row.url || "";

    card.appendChild(actions);
    card.appendChild(thumbEl);
    card.appendChild(title);
    return card;
  }

  sortSel.addEventListener("change", () => {
    sortMode = sortSel.value;
    render();
  });

  // Realtime subscribe
  let unsub = null;
  async function start() {
    if (!ensureLogin()) return;
    const col = await imagesCol();
    unsub = onSnapshot(col, (snap) => {
      rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // ensure sourceDomain for old docs
      rows = rows.map(r => ({ ...r, sourceDomain: r.sourceDomain || extractDomain(r.pageUrl || r.url) }));
      render();
    });
  }

  const off = auth.onAuthStateChanged((user) => {
    try { unsub?.(); } catch {}
    unsub = null;
    rows = [];
    render();
    if (user) start();
  });

  function unmount() {
    try { off?.(); } catch {}
    try { unsub?.(); } catch {}
    container.removeChild(root);
  }

  return { unmount };
}
