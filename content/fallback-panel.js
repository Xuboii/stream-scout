// content/fallback-panel.js

let ssPanelRoot = null;
let ssPanelOpen = false;

function ensurePanel() {
  if (ssPanelRoot) return ssPanelRoot;

  const panel = document.createElement("div");
  panel.id = "ss-fallback-panel";
  panel.className = "ss-fallback-panel";

  // Inner frame container
  const frameWrap = document.createElement("div");
  frameWrap.className = "ss-panel-frame-wrap";

  const iframe = document.createElement("iframe");
  iframe.className = "ss-panel-iframe";
  iframe.src = chrome.runtime.getURL("sidepanel.html") + "#embedded=1";

  frameWrap.appendChild(iframe);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "ss-panel-close";
  closeBtn.title = "Close Stream Scout";
  closeBtn.textContent = "×";

  closeBtn.addEventListener("click", () => {
    togglePanel(false);
  });

  panel.appendChild(closeBtn);
  panel.appendChild(frameWrap);

  document.documentElement.appendChild(panel);
  ssPanelRoot = panel;
  return panel;
}

function togglePanel(forceState) {
  const panel = ensurePanel();
  if (typeof forceState === "boolean") {
    ssPanelOpen = forceState;
  } else {
    ssPanelOpen = !ssPanelOpen;
  }

  if (ssPanelOpen) {
    panel.classList.add("open");
  } else {
    panel.classList.remove("open");
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "STREAM_SCOUT_TOGGLE_PANEL") {
    togglePanel(true); // always open on page load
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

// Optional: keyboard shortcut to toggle panel manually (Ctrl+Shift+S)
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
    togglePanel();
  }
});
