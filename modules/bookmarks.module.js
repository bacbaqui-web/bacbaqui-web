import { auth, db, storage } from "../firebaseClient.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

let unsubscribe = null;
let currentEditing = null;
let currentPreviewFile = null;

function isProbablyUrl(txt) {
  if (!txt) return false;
  const s = txt.trim();

  // http/https 포함하면 무조건 허용
  if (/^https?:\/\//i.test(s)) return true;

  // 도메인 형태 허용 (naver.com, youtube.com 등)
  if (/@/.test(s)) return false;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+([\/?#:]|$)/i.test(s);
}

function normalizeUrl(url) {
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) {
    u = "https://" + u;
  }
  return u;
}

export async function mount(container) {

  container.innerHTML = `
    <div class="bookmark-sticky">
      <div id="drag-area" class="plus-only cursor-pointer">+</div>
    </div>
    <div id="image-grid"></div>
  `;

  const dragArea = container.querySelector("#drag-area");
  const grid = container.querySelector("#image-grid");

  const user = auth.currentUser;
  if (!user) return;

  const imagesCol = collection(db, `users/${user.uid}/images`);

  unsubscribe = onSnapshot(imagesCol, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render(grid, docs);
  });

  // 붙여넣기
  dragArea.addEventListener("paste", async e => {
    const text = e.clipboardData.getData("text");
    if (isProbablyUrl(text)) {
      const url = normalizeUrl(text);
      await addDoc(imagesCol, {
        pageUrl: url,
        type: "link",
        timestamp: serverTimestamp()
      });
    }
  });

  dragArea.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (isProbablyUrl(text)) {
        const url = normalizeUrl(text);
        await addDoc(imagesCol, {
          pageUrl: url,
          type: "link",
          timestamp: serverTimestamp()
        });
      }
    } catch {}
  });
}

function render(grid, data) {
  grid.innerHTML = "";

  data.forEach(item => {
    const card = document.createElement("div");
    card.className = "bookmark-card";

    card.innerHTML = `
      ${item.previewImageUrl
        ? `<img src="${item.previewImageUrl}" class="img-fit-cover">`
        : `<div style="height:180px;display:flex;align-items:center;justify-content:center;font-size:28px;">🔗</div>`}

      <div class="bookmark-actions">
        <button data-edit>✏️</button>
        <button data-delete>❌</button>
      </div>

      <div class="p-3 text-sm break-all">${item.title || item.pageUrl}</div>
    `;

    card.querySelector("[data-delete]").onclick = () => deleteBookmark(item);
    card.querySelector("[data-edit]").onclick = () => openEditModal(item);

    grid.appendChild(card);
  });
}

async function deleteBookmark(item) {
  const user = auth.currentUser;
  if (!user) return;

  const docRef = doc(db, `users/${user.uid}/images`, item.id);

  if (item.previewStoragePath) {
    try {
      await deleteObject(ref(storage, item.previewStoragePath));
    } catch {}
  }

  await deleteDoc(docRef);
}

function openEditModal(item) {
  currentEditing = item;
  currentPreviewFile = null;

  const modal = document.getElementById("editTitleModal");
  const input = document.getElementById("editTitleInput");
  const urlLabel = document.getElementById("currentUrlDisplay");
  const previewArea = document.getElementById("preview-drop-area");

  input.value = item.title || "";
  urlLabel.textContent = item.pageUrl || "";
  modal.style.display = "flex";

  previewArea.onclick = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipboardItem of clipboardItems) {
        const type = clipboardItem.types.find(t => t.startsWith("image/"));
        if (type) {
          currentPreviewFile = await clipboardItem.getType(type);
        }
      }
    } catch {}
  };

  previewArea.onpaste = e => {
    const file = e.clipboardData.files[0];
    if (file) currentPreviewFile = file;
  };

  document.getElementById("removePreviewBtn").onclick = async () => {
    await updateBookmark(currentEditing.id, {
      previewImageUrl: null,
      previewStoragePath: null
    });
  };

  document.getElementById("saveTitleBtn").onclick = async () => {
    if (!currentEditing) return;

    const updates = { title: input.value };

    if (currentPreviewFile) {
      const path = `bookmark_previews/${currentEditing.id}_${Date.now()}.png`;
      const storageRef = ref(storage, path);
      const upload = await uploadBytes(storageRef, currentPreviewFile);
      const url = await getDownloadURL(upload.ref);
      updates.previewImageUrl = url;
      updates.previewStoragePath = path;
    }

    await updateBookmark(currentEditing.id, updates);
    modal.style.display = "none";
  };

  document.getElementById("cancelTitleBtn").onclick = () => {
    modal.style.display = "none";
  };
}

async function updateBookmark(id, updates) {
  const user = auth.currentUser;
  if (!user) return;

  const docRef = doc(db, `users/${user.uid}/images`, id);
  await updateDoc(docRef, updates);
}

export function unmount() {
  if (unsubscribe) unsubscribe();
}
