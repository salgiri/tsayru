// Options page logic: load/save inbox-server settings in chrome.storage.local.
// The background service worker reads the same key on every server request.

const KEY = "tsayru_settings";

const $ = (id) => document.getElementById(id);

const load = async () => {
  const data = await chrome.storage.local.get(KEY);
  const s = data?.[KEY] || {};
  $("serverUrl").value = s.serverUrl || "";
  $("token").value = s.token || "";
};

const save = async () => {
  const status = $("status");
  const serverUrl = $("serverUrl").value.trim();
  const token = $("token").value.trim();

  if (serverUrl) {
    try {
      const u = new URL(serverUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      status.textContent = "invalid URL";
      status.style.color = "#c0392b";
      return;
    }
  }

  await chrome.storage.local.set({ [KEY]: { serverUrl, token } });
  status.textContent = "saved ✓";
  status.style.color = "#2e7d4f";
  setTimeout(() => (status.textContent = ""), 1500);
};

document.addEventListener("DOMContentLoaded", () => {
  load();
  $("save").addEventListener("click", save);
});
