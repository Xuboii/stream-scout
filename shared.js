// shared.js

// Change this to your actual proxy URL
const PROXY_URL = "http://localhost:8080";

// Wrapper for GET requests to your proxy
export async function pget(path, params = {}) {
  const url = new URL(PROXY_URL + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const r = await fetch(url.toString());
  if (!r.ok) throw new Error("Fetch failed with status " + r.status);
  return r.json();
}

// Load a list from chrome storage
export async function loadList(key) {
  const data = await chrome.storage.sync.get([key]);
  return data[key] || [];
}

// Save a list to chrome storage
export async function saveList(key, arr) {
  return chrome.storage.sync.set({ [key]: arr });
}

// Add an item to a list only if it is not already there
export async function addTo(key, item) {
  const arr = await loadList(key);
  if (!arr.find(x => x.key === item.key)) {
    arr.push(item);
    await saveList(key, arr);
  }
}

// Remove an item by its key
export async function removeFrom(key, itemKey) {
  const arr = await loadList(key);
  const next = arr.filter(x => x.key !== itemKey);
  await saveList(key, next);
}

// Save score for an item across watchlist and watched
export async function saveScore(itemKey, score) {
  const watchlist = await loadList("watchlist");
  const watched = await loadList("watched");

  const newWatchlist = watchlist.map(x =>
    x.key === itemKey ? { ...x, score } : x
  );

  const newWatched = watched.map(x =>
    x.key === itemKey ? { ...x, score } : x
  );

  await chrome.storage.sync.set({
    watchlist: newWatchlist,
    watched: newWatched
  });
}
