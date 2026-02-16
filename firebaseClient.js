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
import { getFirestore, collection, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

export const TZ = "Asia/Seoul";

const firebaseConfig = {
  apiKey: "AIzaSyCiwzde40jsz17CEz-rrMmmBrn-S6brdlE",
  authDomain: "comicschedule-dfec7.firebaseapp.com",
  projectId: "comicschedule-dfec7",
  storageBucket: "comicschedule-dfec7.firebasestorage.app",
  messagingSenderId: "1004611276816",
  appId: "1:1004611276816:web:aca83237bafa971ed1fa95",
  measurementId: "G-ZNZZQRJZF9"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

const provider = new GoogleAuthProvider();

export async function signIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // 팝업 차단/도메인 문제 시 리다이렉트
    if (e?.code === "auth/popup-blocked" || e?.code === "auth/unauthorized-domain") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

// 리다이렉트 결과는 실패해도 무시
getRedirectResult(auth).catch(() => {});

export async function signOutNow() {
  await signOut(auth);
}

export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export function userRefs(uid) {
  const base = `users/${uid}`;
  return {
    tasksCol: collection(db, `${base}/customTasks`),
    stateDoc: doc(db, `${base}/meta/appState`),
    imagesCol: collection(db, `${base}/images`)
  };
}
