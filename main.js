import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

import { initCalendar } from "./calendar.js";
import { initNotes } from "./notes.js";
import { initBookmarks } from "./bookmarks.js";

/** =========================
 *  0) 앱 공통 유틸/상태
 *  ========================= */

const TZ = "Asia/Seoul";

function showFeedbackMessage(message) {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText =
    "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
    "background:rgba(0,0,0,.85);color:#fff;padding:16px 20px;border-radius:10px;" +
    "z-index:2000;max-width:90%";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function showAlert(msg) {
  const m = document.getElementById("modal-message");
  const modal = document.getElementById("alert-modal");
  if (!m || !modal) {
    alert(msg);
    return;
  }
  m.textContent = msg;
  modal.classList.remove("hidden");
}

function hideAlert() {
  const modal = document.getElementById("alert-modal");
  modal?.classList.add("hidden");
}

document.getElementById("modal-close-btn")?.addEventListener("click", hideAlert);

function extractDomain(url) {
  if (!url) return "Unknown";
  try {
    const urlObj = new URL(url.includes("://") ? url : "https://" + url);
    let domain = urlObj.hostname;
    if (domain.startsWith("www.")) domain = domain.substring(4);
    return domain;
  } catch {
    return "Unknown";
  }
}

/** 앱 상태(전역 window 없이 main 내부에서 관리) */
const state = {
  // auth
  isAuthReady: false,
  user: null,

  // calendar
  customTasks: [],
  taskStatus: {},

  // notes
  notesTabList: [],
  notesById: {},
  notesActiveTabId: null,

  // bookmarks
  imageBookmarks: [],
  bookmarkSortKey: "sourceDomain"
};

const getState = () => state;
const setState = (patch) => Object.assign(state, patch);

/** =========================
 *  1) Firebase 초기화
 *  ========================= */

const firebaseConfig = {
  apiKey: "AIzaSyCiwzde40jsz17CEz-rrMmmBrn-S6brdlE",
  authDomain: "comicschedule-dfec7.firebaseapp.com",
  projectId: "comicschedule-dfec7",
  storageBucket: "comicschedule-dfec7.firebasestorage.app",
  messagingSenderId: "1004611276816",
  appId: "1:1004611276816:web:aca83237bafa971ed1fa95",
  measurementId: "G-ZNZZQRJZF9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const userInfoEl = document.getElementById("userInfo");
const loadingOverlay = document.getElementById("loading-overlay");

async function doSignIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/unauthorized-domain") {
      await signInWithRedirect(auth, provider);
    } else {
      showAlert("로그인 오류: " + (e.message || e.code));
    }
  }
}
getRedirectResult(auth).catch(() => {});

signInBtn?.addEventListener("click", doSignIn);
signOutBtn?.addEventListener("click", () => signOut(auth));

function ensureLogin() {
  if (!state.isAuthReady) {
    showAlert("데이터 로딩 중입니다.");
    return false;
  }
  if (!auth.currentUser) {
    showAlert("로그인 후 이용해 주세요.");
    return false;
  }
  return true;
}

async function cloudRefs() {
  const uid = auth.currentUser.uid;
  const userPath = `users/${uid}`;
  return {
    tasksCol: collection(db, `${userPath}/customTasks`),
    stateDoc: doc(db, `${userPath}/meta/appState`),
    imagesCol: collection(db, `${userPath}/images`)
  };
}

/** =========================
 *  2) Cloud 저장 API (모듈에 주입)
 *  ========================= */

async function cloudSaveAll() {
  if (!ensureLogin()) return;

  const { tasksCol, stateDoc } = await cloudRefs();
  await setDoc(stateDoc, { taskStatus: state.taskStatus }, { merge: true });

  // tasks: id를 doc id로 저장
  const ops = (state.customTasks || []).map((t) =>
    setDoc(doc(tasksCol, String(t.id)), t, { merge: true })
  );
  await Promise.all(ops);
}

async function cloudSaveStateOnly() {
  if (!ensureLogin()) return;
  const { stateDoc } = await cloudRefs();
  await setDoc(stateDoc, { taskStatus: state.taskStatus }, { merge: true });
}

let notesTimer = null;
function cloudSaveNotesDebounced() {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => cloudSaveNotesModel(), 800);
}

async function cloudSaveNotesModel() {
  if (!ensureLogin()) return;
  const { stateDoc } = await cloudRefs();

  // UI가 모델을 이미 업데이트했다고 가정 (그래도 안전 보정)
  const notesTabList = Array.isArray(state.notesTabList) ? state.notesTabList : [];
  const notesById =
    state.notesById && typeof state.notesById === "object" ? state.notesById : {};
  const notesActiveTabId =
    state.notesActiveTabId || (notesTabList[0]?.id ?? null);

  await setDoc(
    stateDoc,
    { notesTabList, notesById, notesActiveTabId },
    { merge: true }
  );
}

/** ====== 북마크: 추가/삭제/제목 ====== */
async function addVideoBookmark(url) {
  if (!ensureLogin()) return;
  const { imagesCol } = await cloudRefs();
  await addDoc(imagesCol, {
    pageUrl: url,
    url: null,
    type: "video",
    title: null,
    sourceDomain: extractDomain(url),
    timestamp: serverTimestamp()
  });
}

async function addGenericBookmark(url) {
  if (!ensureLogin()) return;
  const { imagesCol } = await cloudRefs();
  await addDoc(imagesCol, {
    pageUrl: url,
    url: null,
    type: "link",
    title: null,
    sourceDomain: extractDomain(url),
    timestamp: serverTimestamp()
  });
}

async function addInstagramBookmark(embedCode) {
  if (!ensureLogin()) return;
  const { imagesCol } = await cloudRefs();

  // 퍼가기 코드에서 원본 URL 추출
  let pageUrl = "인스타그램 게시물";
  try {
    const parser = new DOMParser();
    const doc2 = parser.parseFromString(embedCode, "text/html");
    const blockquote = doc2.querySelector("blockquote.instagram-media");
    if (blockquote && blockquote.cite) pageUrl = blockquote.cite;
  } catch {}

  await addDoc(imagesCol, {
    pageUrl,
    embedCode,
    url: null,
    type: "instagram",
    title: null,
    sourceDomain: extractDomain(pageUrl),
    timestamp: serverTimestamp()
  });
}

async function addRemoteImage(url, pageUrl) {
  if (!ensureLogin()) return;
  const { imagesCol } = await cloudRefs();
  await addDoc(imagesCol, {
    url,
    pageUrl: pageUrl || null,
    type: "remote",
    sourceDomain: extractDomain(pageUrl || url),
    timestamp: serverTimestamp()
  });
}

async function addImage(file, pageUrl) {
  if (!ensureLogin()) return;

  // string이면 원격 이미지로 처리
  if (typeof file === "string") {
    return addRemoteImage(file, pageUrl || file);
  }

  try {
    const { imagesCol } = await cloudRefs();
    const user = auth.currentUser;
    if (!user) throw new Error("로그인이 필요합니다.");

    const storagePath = `users/${user.uid}/uploads/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, storagePath);

    showFeedbackMessage("이미지 업로드 중...");
    const uploadResult = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(uploadResult.ref);

    await addDoc(imagesCol, {
      url: downloadURL,
      pageUrl: pageUrl || null,
      type: "firebase_storage",
      storagePath,
      title: null,
      sourceDomain: extractDomain(pageUrl || "Uploaded (Firebase)"),
      timestamp: serverTimestamp()
    });

    showFeedbackMessage("이미지가 업로드되었습니다.");
  } catch (err) {
    console.error(err);
    showAlert("이미지 추가 실패: " + (err?.message || "오류"));
  }
}

async function updateBookmarkTitle(id, newTitle) {
  if (!ensureLogin()) return;
  const { imagesCol } = await cloudRefs();
  await updateDoc(doc(imagesCol, id), { title: newTitle || null });
}

async function deleteImage(id) {
  if (!ensureLogin()) return;

  try {
    const { imagesCol } = await cloudRefs();
    const row = (state.imageBookmarks || []).find((d) => d.id === id);
    if (!row) throw new Error("북마크 항목을 찾을 수 없습니다.");

    // 스토리지 파일 삭제(해당 타입일 때)
    if (row.type === "firebase_storage" && row.storagePath) {
      try {
        const fileRef = ref(storage, row.storagePath);
        await deleteObject(fileRef);
      } catch (e) {
        console.warn("Storage 파일 삭제 실패(무시):", e);
      }
    }

    await deleteDoc(doc(imagesCol, id));
    showFeedbackMessage("북마크가 삭제되었습니다.");
  } catch (e) {
    showAlert("북마크 삭제 중 오류: " + (e?.message || "unknown"));
  }
}

/** =========================
 *  3) 탭(달력/메모/북마크) UI는 main이 담당
 *  ========================= */

function initMainTabs() {
  const tabButtons = document.querySelectorAll("#main-tabs .notepad-tab");
  const tabContents = document.querySelectorAll(".tab-content");

  function showTab(tabId) {
    tabContents.forEach((c) => c.classList.remove("active"));
    tabButtons.forEach((b) => b.classList.remove("active"));

    document.getElementById(`${tabId}-section`)?.classList.add("active");
    document
      .querySelector(`#main-tabs .notepad-tab[data-tab="${tabId}"]`)
      ?.classList.add("active");
  }

  showTab("calendar");
  tabButtons.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
}

/** =========================
 *  4) 모듈 초기화 (여기서 ui.js 역할 종료)
 *  ========================= */

const calendarAPI = initCalendar({
  TZ,
  getState,
  setState,
  ensureLogin,
  cloudSaveAll,
  cloudSaveStateOnly,
  showAlert,
  showFeedbackMessage
});

const notesAPI = initNotes({
  getState,
  setState,
  ensureLogin,
  cloudSaveNotesDebounced,
  cloudSaveNotesModel,
  showAlert,
  showFeedbackMessage
});

const bookmarksAPI = initBookmarks({
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
});

/** =========================
 *  5) 실시간 동기화(onSnapshot) - main이 데이터만 책임
 *  ========================= */

let unsubs = [];

async function setupRealtimeSync() {
  const { tasksCol, stateDoc, imagesCol } = await cloudRefs();
  unsubs.forEach((fn) => {
    try { fn(); } catch {}
  });
  unsubs = [];

  // tasks
  unsubs.push(
    onSnapshot(tasksCol, (snap) => {
      setState({ customTasks: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      calendarAPI.render();
    })
  );

  // stateDoc (taskStatus + notes)
  unsubs.push(
    onSnapshot(stateDoc, async (ds) => {
      const data = ds.exists() ? ds.data() || {} : {};
      setState({ taskStatus: data.taskStatus || {} });

      // ===== Notes: 새 구조 =====
      let tabList = Array.isArray(data.notesTabList) ? data.notesTabList : null;
      let byId =
        data.notesById && typeof data.notesById === "object" ? data.notesById : null;
      let activeId = data.notesActiveTabId || null;

      // 레거시(notesTabs) -> 1회 마이그레이션
      if (!tabList || !byId) {
        const legacy =
          data.notesTabs && typeof data.notesTabs === "object" ? data.notesTabs : null;

        if (legacy) {
          const names = Object.keys(legacy);
          tabList = names.map((name, i) => ({ id: `legacy_${i}_${Date.now()}`, name }));
          byId = {};
          tabList.forEach((t) => { byId[t.id] = legacy[t.name] ?? ""; });
          activeId = tabList[0]?.id || null;

          // 로그인 상태면 새 구조로 저장(백그라운드)
          if (auth.currentUser) {
            setDoc(
              stateDoc,
              { notesTabList: tabList, notesById: byId, notesActiveTabId: activeId },
              { merge: true }
            ).catch(() => {});
          }
        }
      }

      setState({
        notesTabList: tabList || state.notesTabList || [],
        notesById: byId || state.notesById || {},
        notesActiveTabId:
          activeId ||
          state.notesActiveTabId ||
          (tabList?.[0]?.id ?? null)
      });

      notesAPI.render();
      calendarAPI.render();
    })
  );

  // images
  unsubs.push(
    onSnapshot(imagesCol, (snap) => {
      setState({ imageBookmarks: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      bookmarksAPI.render();
    })
  );
}

/** =========================
 *  6) Auth 상태
 *  ========================= */

onAuthStateChanged(auth, async (user) => {
  loadingOverlay?.classList.remove("hidden");
  setState({ isAuthReady: false, user: user || null });

  if (user) {
    userInfoEl.textContent = `${user.displayName || "로그인됨"} (${user.email || ""})`;
    signInBtn?.classList.add("hidden");
    signOutBtn?.classList.remove("hidden");
    await setupRealtimeSync();
  } else {
    userInfoEl.textContent = "";
    signOutBtn?.classList.add("hidden");
    signInBtn?.classList.remove("hidden");

    unsubs.forEach((fn) => {
      try { fn(); } catch {}
    });
    unsubs = [];

    // 로컬 상태 초기화
    setState({
      customTasks: [],
      taskStatus: {},
      imageBookmarks: [],
      notesTabList: [],
      notesById: {},
      notesActiveTabId: null
    });

    calendarAPI.render();
    notesAPI.render();
    bookmarksAPI.render();
  }

  loadingOverlay?.classList.add("hidden");
  setState({ isAuthReady: true });
});

/** =========================
 *  7) 앱 시작
 *  ========================= */
initMainTabs();
