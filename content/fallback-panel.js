// content/fallback-panel.js

let ssPanelRoot = null;
let ssPanelOpen = false;
let ssPanelCollapsed = false;

function ensurePanel() {
  if (ssPanelRoot) return ssPanelRoot;

  const panel = document.createElement("div");
  panel.id = "ss-fallback-panel";
  panel.className = "ss-fallback-panel";

  const frameWrap = document.createElement("div");
  frameWrap.className = "ss-panel-frame-wrap";

  const iframe = document.createElement("iframe");
  iframe.className = "ss-panel-iframe";
  iframe.src = chrome.runtime.getURL("sidepanel.html") + "#embedded=1";

  frameWrap.appendChild(iframe);

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

function toggleCollapse() {
  const panel = ensurePanel();
  ssPanelCollapsed = !ssPanelCollapsed;

  if (ssPanelCollapsed) {
    panel.classList.add("collapsed");
  } else {
    panel.classList.remove("collapsed");
  }
}

// Receive messages from the sidepanel iframe
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "STREAM_SCOUT_COLLAPSE_TOGGLE") {
    toggleCollapse();
    sendResponse({ ok: true });
    return true;
  }

  if (msg && msg.type === "STREAM_SCOUT_TOGGLE_PANEL") {
    togglePanel(true);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// Keyboard shortcut (optional)
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
    togglePanel();
  }
});

// Handle clicks on the collapsed arrow
document.addEventListener("click", (e) => {
  const panel = ssPanelRoot;
  if (!panel) return;

  if (panel.classList.contains("collapsed")) {
    const rect = panel.getBoundingClientRect();

    // Click within the arrow area
    if (
      e.clientX >= rect.left - 40 &&
      e.clientX <= rect.left &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    ) {
      toggleCollapse(); // expand again
    }
  }
});

