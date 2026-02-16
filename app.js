import { onAuth, signIn, signOutNow } from "./firebaseClient.js";
import { hideAlert, setLoading, showAlert } from "./utils.js";

document.getElementById("modal-close-btn")?.addEventListener("click", hideAlert);

const signInBtn = document.getElementById("signInBtn");
const signOutBtn = document.getElementById("signOutBtn");
const userInfoEl = document.getElementById("userInfo");

signInBtn?.addEventListener("click", async () => {
  try {
    await signIn();
  } catch (e) {
    showAlert("로그인 오류: " + (e?.message || e?.code || "unknown"));
  }
});

signOutBtn?.addEventListener("click", async () => {
  try {
    await signOutNow();
  } catch (e) {
    showAlert("로그아웃 오류: " + (e?.message || e?.code || "unknown"));
  }
});

const appRoot = document.getElementById("appRoot");

let current = { key: null, mod: null };

async function loadModule(key) {
  if (!appRoot) return;

  // unmount old
  if (current.mod?.unmount) {
    try { current.mod.unmount(); } catch {}
  }
  appRoot.innerHTML = "";

  let mod;
  if (key === "calendar") {
    mod = await import("./modules/calendar.module.js");
  } else if (key === "notes") {
    mod = await import("./modules/notes.module.js");
  } else {
    mod = await import("./modules/bookmarks.module.js");
  }

  current = { key, mod };
  mod.mount(appRoot);
}

function setActiveTab(key) {
  document.querySelectorAll("#main-tabs .notepad-tab").forEach((btn) => {
    const isOn = btn.dataset.tab === key;
    btn.classList.toggle("active", isOn);
  });
}

// tab click
document.getElementById("main-tabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  const key = btn.dataset.tab;
  setActiveTab(key);
  loadModule(key);
});

// auth state
setLoading(true);
onAuth(async (user) => {
  setLoading(true);
  if (user) {
    userInfoEl.textContent = `${user.displayName || "로그인됨"} (${user.email || ""})`;
    signInBtn?.classList.add("hidden");
    signOutBtn?.classList.remove("hidden");
  } else {
    userInfoEl.textContent = "";
    signOutBtn?.classList.add("hidden");
    signInBtn?.classList.remove("hidden");
  }

  // 현재 탭 유지하면서 리로드
  const active = document.querySelector("#main-tabs .notepad-tab.active")?.dataset.tab || "calendar";
  await loadModule(active);
  setActiveTab(active);

  setLoading(false);
});

// initial
setActiveTab("calendar");
loadModule("calendar").catch(() => {});
