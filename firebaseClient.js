// firebaseClient.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

export const firebaseConfig = {
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

// Auth helpers
export const provider = new GoogleAuthProvider();

export async function doSignIn() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e?.code === "auth/popup-blocked" || e?.code === "auth/unauthorized-domain") {
      await signInWithRedirect(auth, provider);
    } else {
      throw e;
    }
  }
}

export async function doSignOut() {
  await signOut(auth);
}

export async function consumeRedirectResult() {
  try { await getRedirectResult(auth); } catch { /* ignore */ }
}

export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}
