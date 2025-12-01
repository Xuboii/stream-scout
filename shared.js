// shared.js

// Proxy base URL for backend API
export const PROXY_URL = "http://localhost:8080";

// Simple GET helper against the proxy
export async function pget(path, params = {}) {
  const url = new URL(PROXY_URL + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, v);
    }
  });
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error("Fetch failed with status " + res.status);
  }
  return res.json();
}

// ---------------------------------------------------------------------
// Chrome storage list helpers (watchlist / watched etc)
// ---------------------------------------------------------------------

export async function loadList(key) {
  const data = await chrome.storage.sync.get([key]);
  return data[key] || [];
}

export async function saveList(key, arr) {
  await chrome.storage.sync.set({ [key]: arr });
}

export async function addTo(key, item) {
  const arr = await loadList(key);
  if (!arr.find((x) => x.key === item.key)) {
    arr.push(item);
    await saveList(key, arr);
  }
}

export async function removeFrom(key, itemKey) {
  const arr = await loadList(key);
  const next = arr.filter((x) => x.key !== itemKey);
  await saveList(key, next);
}

// Save a personal score for an item across both watchlist and watched
export async function saveScore(itemKey, score) {
  const [watchlist, watched] = await Promise.all([
    loadList("watchlist"),
    loadList("watched"),
  ]);

  const newWatchlist = watchlist.map((x) =>
    x.key === itemKey ? { ...x, score } : x
  );
  const newWatched = watched.map((x) =>
    x.key === itemKey ? { ...x, score } : x
  );

  await chrome.storage.sync.set({
    watchlist: newWatchlist,
    watched: newWatched,
  });
}

// ---------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------

export function providerClass(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("netflix")) return "provider-netflix";
  if (n.includes("prime") || n.includes("amazon")) return "provider-prime";
  if (n.includes("hulu")) return "provider-hulu";
  if (n.includes("disney")) return "provider-disney";
  if (n.includes("crunchy")) return "provider-crunchyroll";
  if (n.includes("hbo") || n.includes("max")) return "provider-max";
  if (n.includes("apple")) return "provider-apple";
  if (n.includes("paramount")) return "provider-paramount";
  if (n.includes("peacock")) return "provider-peacock";
  if (n.includes("youtube")) return "provider-youtube";
  return "";
}

export function renderProviderTags(containerEl, providers = []) {
  if (!containerEl) return;
  containerEl.innerHTML = "";

  if (!providers.length) {
    const span = document.createElement("span");
    span.className = "provider-tag";
    span.textContent = "No providers found";
    containerEl.appendChild(span);
    return;
  }

  providers.slice(0, 8).forEach((p) => {
    const span = document.createElement("span");
    span.textContent = p;
    const cls = providerClass(p);
    span.className = "provider-tag" + (cls ? " " + cls : "");
    containerEl.appendChild(span);
  });
}

// ---------------------------------------------------------------------
// Item normalization
// ---------------------------------------------------------------------

export function normalizeItem(it) {
  if (!it) return null;
  const type = it.type === "tv" ? "tv" : "movie";
  const key = it.key || `${type}:${it.tmdbId || it.title || ""}`;

  return {
    key,
    type,
    tmdbId: it.tmdbId || null,
    imdbId: it.imdbId || null,
    title: it.title || "",
    year: it.year || "",
    imdbRating: it.imdbRating || "N/A",
    providers: it.providers || [],
    poster: it.poster || "",
    score: it.score || "N/A",
  };
}

// ---------------------------------------------------------------------
// Shared ctx-card creator
// ---------------------------------------------------------------------

/**
 * Create a unified ctx-card DOM element.
 *
 * @param {object} item - normalized item
 * @param {object} handlers
 * @param {boolean} handlers.isInWatchlist
 * @param {boolean} handlers.isInWatched
 * @param {function} handlers.onToggleWatchlist - async allowed
 * @param {function} handlers.onToggleWatched - async allowed
 * @param {function} handlers.onScoreChange - async allowed, receives newScore
 */
export function createItemCard(item, handlers = {}) {
  const {
    isInWatchlist = false,
    isInWatched = false,
    onToggleWatchlist,
    onToggleWatched,
    onScoreChange,
  } = handlers;

  const card = document.createElement("article");
  card.className = "suggest-card ctx-card";

  const main = document.createElement("div");
  main.className = "suggest-main";

  const titleEl = document.createElement("h2");
  titleEl.className = "ctx-title-centered";

  if (item.imdbId) {
    const link = document.createElement("a");
    link.href = `https://www.imdb.com/title/${item.imdbId}/`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.title;
    link.className = "s-title-link"; // already defined in sidepanel.css
    titleEl.appendChild(link);
  } else {
    titleEl.textContent = item.title;
  }


  const metaEl = document.createElement("div");
  metaEl.className = "ctx-meta-centered";
  const typeLabel = item.type === "movie" ? "Movie" : "TV";
  metaEl.textContent = item.year ? `${typeLabel} • ${item.year}` : typeLabel;

  const scoreRow = document.createElement("div");
  scoreRow.className = "ctx-score-row";

  const scoreGroup = document.createElement("div");
  scoreGroup.className = "ctx-score-group";

  const imdbBlock = document.createElement("div");
  imdbBlock.className = "ctx-score-vertical";
  imdbBlock.innerHTML = `
    <div class="ctx-score-label">IMDb</div>
    <div class="ctx-score-value">${item.imdbRating || "N/A"}</div>
  `;

  const scoreBlock = document.createElement("div");
  scoreBlock.className = "ctx-score-vertical";

  const scoreLabel = document.createElement("div");
  scoreLabel.className = "ctx-score-label";
  scoreLabel.textContent = "Score";

  const scoreSelect = document.createElement("select");
  scoreSelect.className = "ctx-rating-select";
  const scoreOptions = ["N/A", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  scoreOptions.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    scoreSelect.appendChild(opt);
  });
  scoreSelect.value = item.score || "N/A";

  scoreSelect.addEventListener("change", async () => {
    const newScore = scoreSelect.value;
    if (onScoreChange) {
      await onScoreChange(newScore);
    }
  });

  scoreBlock.appendChild(scoreLabel);
  scoreBlock.appendChild(scoreSelect);

  scoreGroup.appendChild(imdbBlock);
  scoreGroup.appendChild(scoreBlock);

  const actionsInline = document.createElement("div");
  actionsInline.className = "ctx-actions-inline";

  const btnWatchlist = document.createElement("button");
  btnWatchlist.className = "btn-icon btn-watchlist";
  btnWatchlist.innerHTML = "☆";

  const btnWatched = document.createElement("button");
  btnWatched.className = "btn-icon btn-watched";
  btnWatched.innerHTML = "✓";

  if (isInWatchlist) {
    btnWatchlist.classList.add("active");
    btnWatchlist.title = "Remove from watchlist";
  } else {
    btnWatchlist.title = "Add to watchlist";
  }

  if (isInWatched) {
    btnWatched.classList.add("active");
    btnWatched.title = "Remove from watched";
  } else {
    btnWatched.title = "Mark as watched";
  }

  btnWatchlist.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (onToggleWatchlist) {
      await onToggleWatchlist();
    }
  });

  btnWatched.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (onToggleWatched) {
      await onToggleWatched();
    }
  });

  actionsInline.appendChild(btnWatchlist);
  actionsInline.appendChild(btnWatched);

  scoreRow.appendChild(scoreGroup);
  scoreRow.appendChild(actionsInline);

  const providersWrap = document.createElement("div");
  providersWrap.className = "suggest-providers";

  const providerLabel = document.createElement("span");
  providerLabel.className = "providers-label";
  providerLabel.textContent = "Available on";

  const providerContainer = document.createElement("div");
  providerContainer.className = "providers";

  providersWrap.appendChild(providerLabel);
  providersWrap.appendChild(providerContainer);

  renderProviderTags(providerContainer, item.providers);

  main.appendChild(titleEl);
  main.appendChild(metaEl);
  main.appendChild(scoreRow);
  main.appendChild(providersWrap);

  card.appendChild(main);
  return card;
}
