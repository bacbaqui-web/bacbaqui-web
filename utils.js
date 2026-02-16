import { auth, TZ } from "./firebaseClient.js";

export function setLoading(isOn) {
  const el = document.getElementById("loading-overlay");
  if (!el) return;
  if (isOn) el.classList.remove("hidden");
  else el.classList.add("hidden");
}

export function showAlert(msg) {
  const m = document.getElementById("modal-message");
  const modal = document.getElementById("alert-modal");
  if (!m || !modal) {
    alert(msg);
    return;
  }
  m.textContent = msg;
  modal.classList.remove("hidden");
}

export function hideAlert() {
  document.getElementById("alert-modal")?.classList.add("hidden");
}

export function showFeedbackMessage(message) {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText =
    "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
    "background:rgba(0,0,0,.85);color:#fff;padding:16px 20px;border-radius:10px;" +
    "z-index:2000;max-width:90%";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

export function ensureLogin() {
  if (!auth.currentUser) {
    showAlert("로그인 후 이용해 주세요.");
    return false;
  }
  return true;
}

export function extractDomain(url) {
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

export function ymdKST(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function toKST(date) {
  return new Date(date.toLocaleString("en-US", { timeZone: TZ }));
}
