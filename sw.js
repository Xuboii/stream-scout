const PROXY = "http://localhost:8080";

// Omnibox: type "ss dune"
chrome.omnibox.setDefaultSuggestion({ description: "Search Stream Scout" });
chrome.omnibox.onInputEntered.addListener(async (text) => {
  const url = chrome.runtime.getURL("sidepanel.html") + `#q=${encodeURIComponent(text)}`;
  await chrome.windows.create({ url, type: "popup", width: 480, height: 720 });
});

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ssLookup",
    title: "Stream Scout: lookup \"%s\"",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "ssLookup") return;
  const url = chrome.runtime.getURL("popup.html") + `#q=${encodeURIComponent(info.selectionText)}`;
  await chrome.windows.create({ url, type: "popup", width: 380, height: 620 });
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
