import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

import { initBookmarks } from "./bookmarks.js";

const firebaseConfig = {
  apiKey: "AIzaSyCiwzde40jsz17CEz-rrMmmBrn-S6brdlE",
  authDomain: "comicschedule-dfec7.firebaseapp.com",
  projectId: "comicschedule-dfec7",
  storageBucket: "comicschedule-dfec7.firebasestorage.app",
  messagingSenderId: "1004611276816",
  appId: "1:1004611276816:web:aca83237bafa971ed1fa95"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

let bookmarks = [];

async function cloudRefs() {
  const uid = auth.currentUser.uid;
  return {
    imagesCol: collection(db, `users/${uid}/images`)
  };
}

async function addGenericBookmark(url) {
  const { imagesCol } = await cloudRefs();
  await addDoc(imagesCol, {
    pageUrl: url,
    type: "link",
    timestamp: new Date()
  });
}

async function deleteImage(id) {
  const { imagesCol } = await cloudRefs();
  const row = bookmarks.find(b => b.id === id);

  if (row?.previewStoragePath) {
    try { await deleteObject(ref(storage, row.previewStoragePath)); }
    catch {}
  }

  await deleteDoc(doc(imagesCol, id));
}

async function updateBookmarkTitle(id, title) {
  const { imagesCol } = await cloudRefs();
  await updateDoc(doc(imagesCol, id), { title });
}

async function setBookmarkPreviewImage(id, file) {
  const { imagesCol } = await cloudRefs();

  const path = `bookmark_previews/${id}_${Date.now()}.png`;
  const storageRef = ref(storage, path);

  const upload = await uploadBytes(storageRef, file);
  const url = await getDownloadURL(upload.ref);

  await updateDoc(doc(imagesCol, id), {
    previewImageUrl: url,
    previewStoragePath: path
  });
}

function initRealtime() {
  auth.onAuthStateChanged(async user => {
    if (!user) return;

    const { imagesCol } = await cloudRefs();

    onSnapshot(imagesCol, snap => {
      bookmarks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      bookmarksAPI.render(bookmarks);
    });
  });
}

const bookmarksAPI = initBookmarks({
  addGenericBookmark,
  deleteImage,
  updateBookmarkTitle,
  setBookmarkPreviewImage
});

initRealtime();
