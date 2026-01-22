const PROXY = "https://proxyserver-production-6b19.up.railway.app";

// Omnibox: type "ss dune"
chrome.omnibox.setDefaultSuggestion({ description: "Search Stream Scout" });
chrome.omnibox.onInputEntered.addListener(async (text) => {
  const url =
    chrome.runtime.getURL("sidepanel.html") +
    `#q=${encodeURIComponent(text)}`;
  await chrome.windows.create({
    url,
    type: "popup",
    width: 480,
    height: 720
  });
});

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ssLookup",
    title: 'Stream Scout: lookup "%s"',
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "ssLookup") return;
  const url =
    chrome.runtime.getURL("popup.html") +
    `#q=${encodeURIComponent(info.selectionText)}`;
  await chrome.windows.create({
    url,
    type: "popup",
    width: 380,
    height: 620
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  sendResponse({ ok: true });
  return true;
});

// Auto open panel when visiting IMDb title pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab || !tab.url) return;

  const isImdbTitle = /imdb\.com\/title\/tt\d+/i.test(tab.url);
  if (!isImdbTitle) return;

  // If the real sidePanel API exists, use it
  if (chrome.sidePanel && chrome.sidePanel.setOptions && chrome.sidePanel.open) {
    console.log("Using real Chrome side panel for tab", tabId);
    chrome.sidePanel
      .setOptions({
        tabId,
        path: "sidepanel.html",
        enabled: true
      })
      .then(() => chrome.sidePanel.open({ tabId }))
      .catch((err) =>
        console.warn("sidePanel.setOptions/open failed", err)
      );
  } else {
    // Fallback: tell content script to open injected drawer
    console.log("Side panel API missing. Using fallback drawer.");
    chrome.tabs.sendMessage(
      tabId,
      { type: "STREAM_SCOUT_TOGGLE_PANEL" },
      () => {
        // Ignore errors like "no receiving end" when content script not yet loaded
        void chrome.runtime.lastError;
      }
    );
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "STREAM_SCOUT_COLLAPSE_TOGGLE") {
    // Relay message to the active tab so fallback-panel.js can respond
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return;
      chrome.tabs.sendMessage(tabs[0].id, msg);
    });
    sendResponse({ ok: true });
    return true;
  }
});

// Simple cache idea for providers or genres (extend as needed)
const cache = new Map();
async function cachedJson(key, fetcher, ttlMs = 3600_000) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < ttlMs) return hit.v;
  const v = await fetcher();
  cache.set(key, { v, t: now });
  return v;
}
