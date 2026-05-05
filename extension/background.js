chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TSAYRU_TOGGLE" });
  } catch (err) {
    console.warn("[tsayru] toggle failed:", err);
  }
});
