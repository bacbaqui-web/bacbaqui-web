// app.js
import { doSignIn, doSignOut, consumeRedirectResult, onAuth, auth } from "./firebaseClient.js";

const appEl = document.getElementById("app");
const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const userInfoEl = document.getElementById("userInfo");
const loadingOverlay = document.getElementById("loading-overlay");

const alertModal = document.getElementById("alert-modal");
const modalMsg = document.getElementById("modal-message");
document.getElementById("alertOkBtn").addEventListener("click", () => alertModal.classList.remove("show"));

function showAlert(msg) {
  modalMsg.textContent = msg || "";
  alertModal.classList.add("show");
}

function showFeedbackMessage(msg) {
  // 간단한 피드백: 알림 모달 재사용(원하시면 토스트로 바꿀 수 있습니다)
  showAlert(msg);
}

function setLoading(on) {
  loadingOverlay.classList.toggle("hidden", !on);
}

function setTabActive(route) {
  document.querySelectorAll("[data-route]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.route === route);
  });
}

let current = { route: null, mod: null, unmount: null };

async function loadModule(route) {
  if (current.route === route) return;
  setTabActive(route);
  setLoading(true);

  // 이전 모듈 정리
  try { current.unmount?.(); } catch {}
  appEl.innerHTML = "";

  try {
    let mod;
    if (route === "calendar") mod = await import("./modules/calendar.module.js");
    else if (route === "notes") mod = await import("./modules/notes.module.js");
    else mod = await import("./modules/bookmarks.module.js");

    const ctx = {
      auth,
      showAlert,
      showFeedbackMessage,
      setLoading,
    };

    const api = await mod.mount(appEl, ctx);
    current = { route, mod, unmount: api?.unmount || null };
  } catch (e) {
    console.error(e);
    showAlert("모듈 로딩 오류: " + (e?.message || e));
  } finally {
    setLoading(false);
  }
}

document.querySelectorAll("[data-route]").forEach(btn => {
  btn.addEventListener("click", () => loadModule(btn.dataset.route));
});

// Auth UI
signInBtn.addEventListener("click", async () => {
  try {
    await doSignIn();
  } catch (e) {
    showAlert("로그인 오류: " + (e?.message || e?.code || e));
  }
});
signOutBtn.addEventListener("click", async () => {
  try { await doSignOut(); } catch {}
});

await consumeRedirectResult();

let authReady = false;
onAuth((user) => {
  authReady = true;
  if (user) {
    userInfoEl.textContent = `${user.displayName || "로그인됨"} (${user.email || ""})`;
    signInBtn.classList.add("hidden");
    signOutBtn.classList.remove("hidden");
  } else {
    userInfoEl.textContent = "";
    signOutBtn.classList.add("hidden");
    signInBtn.classList.remove("hidden");
  }
  // 모듈은 auth 객체를 직접 보므로, 여기서는 UI만 갱신
});

// default route
loadModule("calendar");
