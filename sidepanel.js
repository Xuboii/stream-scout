// sidepanel.js
// AI powered contextual helper for the current page

import {
  PROXY_URL,
  pget,
  loadList,
  addTo,
  removeFrom,
  saveScore,
  normalizeItem,
  createItemCard,
} from "./shared.js";

const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const COUNTRY = "US";

const state = {
  currentItem: null,
  watchItems: [],
  watchedItems: [],
  watchKeys: new Set(),
  watchedKeys: new Set(),
  aiSuggestions: [],
  aiLoading: false,
};

// DOM refs
const badgeEl = document.getElementById("contextBadge");
const subtitleEl = document.getElementById("contextSubtitle");

const contextCardEl = document.getElementById("contextCard");

const aiPromptEl = document.getElementById("aiPrompt");
const aiStatusEl = document.getElementById("aiStatus");
const btnAskAi = document.getElementById("btnAskAi");
const aiEmptyEl = document.getElementById("aiEmpty");
const aiResultsEl = document.getElementById("aiResults");

const watchlistContainerEl = document.getElementById("watchlistContainer");
const watchedContainerEl = document.getElementById("watchedContainer");

const tabButtons = document.querySelectorAll(".sp-tab-btn");
const tabPanels = {
  search: document.getElementById("tab-search"),
  watchlist: document.getElementById("tab-watchlist"),
  watched: document.getElementById("tab-watched"),
};

const tplProvider = document.getElementById("provider-pill-tpl");
const tplSuggestion = document.getElementById("suggestion-tpl");

// Membership sets

async function updateMembershipSets() {
  const [watchlist, watched] = await Promise.all([
    loadList("watchlist"),
    loadList("watched"),
  ]);

  state.watchItems = watchlist;
  state.watchedItems = watched;
  state.watchKeys = new Set(watchlist.map((x) => x.key));
  state.watchedKeys = new Set(watched.map((x) => x.key));
}

// Context detection

async function detectContextFromTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.url) {
      badgeEl.textContent = "No active tab";
      subtitleEl.textContent = "Open an IMDb title page to get started.";
      return null;
    }

    const url = tab.url;

    // Basic IMDb title detection
    const imdbMatch = url.match(/imdb\.com\/title\/(tt\d{5,10})/i);
    if (imdbMatch) {
      const imdbId = imdbMatch[1];
      badgeEl.textContent = "IMDb title detected";
      subtitleEl.textContent = imdbId;
      return { kind: "imdb-title", imdbId };
    }

    badgeEl.textContent = "No title detected";
    subtitleEl.textContent = "Navigate to an IMDb title page.";
    return null;
  } catch (err) {
    console.error("tabs.query failed", err);
    badgeEl.textContent = "Cannot read tab";
    subtitleEl.textContent =
      "Check extension permissions for tabs access.";
    return null;
  }
}

// Load current item using OMDb + TMDB

async function loadItemForImdbId(imdbId) {
  try {
    // OMDb for title metadata
    const omdb = await pget("/omdb", { i: imdbId });

    if (!omdb || omdb.Response === "False") {
      renderEmptyContext("Could not resolve this title via OMDb.");
      return;
    }

    const title = omdb.Title || "";
    const year = omdb.Year || "";
    const type = omdb.Type === "series" ? "tv" : "movie";

    // TMDB search to map to TMDB id
    const tmdbSearch = await pget("/tmdb_search", {
      type,
      query: title,
      include_adult: "false",
      language: "en-US",
      page: "1",
    });

    const first = (tmdbSearch.results || [])[0];
    if (!first) {
      renderEmptyContext("No TMDB match found for this title.");
      return;
    }

    const tmdbId = first.id;
    const yearField =
      first.release_date || first.first_air_date || year || "";
    const yearResolved = yearField.slice(0, 4);

    // Providers
    let providers = [];
    try {
      const prov = await pget("/tmdb_providers", {
        type,
        id: tmdbId,
      });
      const us = (prov.results && prov.results[COUNTRY]) || {};
      const offers = [
        ...(us.flatrate || []),
        ...(us.ads || []),
        ...(us.rent || []),
        ...(us.buy || []),
      ];
      providers = offers.map((o) => o.provider_name);
    } catch (err) {
      console.warn("providers lookup failed for", tmdbId, err);
    }

    const imdbRating =
      omdb.imdbRating && omdb.imdbRating !== "N/A"
        ? omdb.imdbRating
        : null;

    let item = normalizeItem({
      key: `${type}:${tmdbId}`,
      tmdbId,
      imdbId,
      type,
      title,
      year: yearResolved,
      imdbRating,
      providers,
      poster: first.poster_path ? TMDB_IMG + first.poster_path : "",
    });

    await updateMembershipSets();

    // If we have a stored score in watchlist/watched, reuse it
    const stored =
      state.watchItems.find((x) => x.key === item.key) ||
      state.watchedItems.find((x) => x.key === item.key);

    if (stored && stored.score) {
      item.score = stored.score;
    }

    state.currentItem = item;
    renderContextCard();
    btnAskAi.disabled = false;
  } catch (err) {
    console.error("loadItemForImdbId failed", err);
    renderEmptyContext("Failed to load data for this title.");
  }
}

// Rendering helpers

function renderEmptyContext(message) {
  contextCardEl.classList.add("context-card-empty");
  contextCardEl.innerHTML = `
    <p class="context-empty-text">${message}</p>
  `;
}

// Context card renderer

function renderContextCard() {
  const item = state.currentItem;
  if (!item) {
    renderEmptyContext("No supported title detected.");
    return;
  }

  contextCardEl.classList.remove("context-card-empty");
  contextCardEl.innerHTML = "";

  const key = item.key;

  const card = createItemCard(item, {
    isInWatchlist: state.watchKeys.has(key),
    isInWatched: state.watchedKeys.has(key),

    onToggleWatchlist: async () => {
      if (state.watchKeys.has(key)) {
        await removeFrom("watchlist", key);
      } else {
        await addTo("watchlist", item);
      }
      await updateMembershipSets();
      renderContextCard();
      renderAiResults();
    },

    onToggleWatched: async () => {
      if (state.watchedKeys.has(key)) {
        await removeFrom("watched", key);
      } else {
        await addTo("watched", item);
        await removeFrom("watchlist", key);
      }
      await updateMembershipSets();
      renderContextCard();
      renderAiResults();
    },

    onScoreChange: async (newScore) => {
      item.score = newScore;
      await saveScore(key, newScore);
      await updateMembershipSets();
    },
  });

  contextCardEl.appendChild(card);
}

// Watchlist tab renderer

function renderWatchlist() {
  if (!watchlistContainerEl) return;

  watchlistContainerEl.innerHTML = "";

  if (!state.watchItems.length) {
    watchlistContainerEl.innerHTML = `
      <p class="context-empty-text">Your watchlist is empty.</p>
    `;
    return;
  }

  state.watchItems.forEach((raw) => {
    const item = normalizeItem(raw);
    const key = item.key;

    const card = createItemCard(item, {
      isInWatchlist: state.watchKeys.has(key),
      isInWatched: state.watchedKeys.has(key),

      onToggleWatchlist: async () => {
        if (state.watchKeys.has(key)) {
          await removeFrom("watchlist", key);
        } else {
          await addTo("watchlist", item);
        }
        await updateMembershipSets();
        renderWatchlist();
        renderWatched();
        renderContextCard();
        renderAiResults();
      },

      onToggleWatched: async () => {
        if (state.watchedKeys.has(key)) {
          await removeFrom("watched", key);
        } else {
          await addTo("watched", item);
          await removeFrom("watchlist", key);
        }
        await updateMembershipSets();
        renderWatchlist();
        renderWatched();
        renderContextCard();
        renderAiResults();
      },

      onScoreChange: async (newScore) => {
        item.score = newScore;
        await saveScore(key, newScore);
        await updateMembershipSets();
        renderWatchlist();
        renderWatched();
        renderContextCard();
        renderAiResults();
      },
    });

    watchlistContainerEl.appendChild(card);
  });
}

// Watched tab renderer

function renderWatched() {
  if (!watchedContainerEl) return;

  watchedContainerEl.innerHTML = "";

  if (!state.watchedItems.length) {
    watchedContainerEl.innerHTML = `
      <p class="context-empty-text">You have not marked anything as watched yet.</p>
    `;
    return;
  }

  state.watchedItems.forEach((raw) => {
    const item = normalizeItem(raw);
    const key = item.key;

    const card = createItemCard(item, {
      isInWatchlist: state.watchKeys.has(key),
      isInWatched: state.watchedKeys.has(key),

      onToggleWatchlist: async () => {
        if (state.watchKeys.has(key)) {
          await removeFrom("watchlist", key);
        } else {
          await addTo("watchlist", item);
        }
        await updateMembershipSets();
        renderWatched();
        renderWatchlist();
        renderContextCard();
        renderAiResults();
      },

      onToggleWatched: async () => {
        if (state.watchedKeys.has(key)) {
          await removeFrom("watched", key);
        } else {
          await addTo("watched", item);
          await removeFrom("watchlist", key);
        }
        await updateMembershipSets();
        renderWatched();
        renderWatchlist();
        renderContextCard();
        renderAiResults();
      },

      onScoreChange: async (newScore) => {
        item.score = newScore;
        await saveScore(key, newScore);
        await updateMembershipSets();
        renderWatched();
        renderWatchlist();
        renderContextCard();
        renderAiResults();
      },
    });

    watchedContainerEl.appendChild(card);
  });
}

// AI suggestions

function setAiLoading(loading) {
  state.aiLoading = loading;

  const loadingBox = document.getElementById("aiStatus");

  if (loading) {
    btnAskAi.disabled = true;
    btnAskAi.classList.add("loading");
    btnAskAi.textContent = "Searching...";

    loadingBox.classList.remove("hidden");
  } else {
    btnAskAi.disabled = !state.currentItem;
    btnAskAi.classList.remove("loading");
    btnAskAi.textContent = "Ask AI for similar picks";

    loadingBox.classList.add("hidden");
  }
}

function renderAiResults() {
  aiResultsEl.innerHTML = "";

  if (!state.aiSuggestions.length) {
    aiEmptyEl.style.display = "block";
    return;
  }
  aiEmptyEl.style.display = "none";

  state.aiSuggestions.forEach((raw) => {
    const item = normalizeItem(raw);
    const key = item.key;

    const card = createItemCard(item, {
      isInWatchlist: state.watchKeys.has(key),
      isInWatched: state.watchedKeys.has(key),

      onToggleWatchlist: async () => {
        if (state.watchKeys.has(key)) {
          await removeFrom("watchlist", key);
        } else {
          await addTo("watchlist", item);
        }
        await updateMembershipSets();
        renderAiResults();
        if (state.currentItem && state.currentItem.key === key) {
          renderContextCard();
        }
      },

      onToggleWatched: async () => {
        if (state.watchedKeys.has(key)) {
          await removeFrom("watched", key);
        } else {
          await addTo("watched", item);
          await removeFrom("watchlist", key);
        }
        await updateMembershipSets();
        renderAiResults();
        if (state.currentItem && state.currentItem.key === key) {
          renderContextCard();
        }
      },

      onScoreChange: async (newScore) => {
        item.score = newScore;
        await saveScore(key, newScore);
        await updateMembershipSets();
      },
    });

    aiResultsEl.appendChild(card);
  });
}

async function askAiForSuggestions() {
  const baseItem = state.currentItem;
  if (!baseItem) {
    aiStatusEl.textContent = "No title detected.";
    return;
  }

  setAiLoading(true);
  aiResultsEl.innerHTML = "";
  aiEmptyEl.style.display = "none";
  aiStatusEl.textContent = "";

  const payload = {
    title: baseItem.title,
    year: baseItem.year,
    type: baseItem.type,
    imdbRating: baseItem.imdbRating,
    providers: baseItem.providers,
    mood: aiPromptEl.value || "",
  };

  try {
    const res = await fetch(PROXY_URL + "/ai_recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error("AI request failed with status " + res.status);
    }

    const json = await res.json();
    const items = json.items || [];

    state.aiSuggestions = items.map((it) => {
      if (!it.key) {
        const type = it.type === "tv" ? "tv" : "movie";
        it.key = `${type}:${it.tmdbId || it.title}`;
      }
      return it;
    });

    await updateMembershipSets();
    renderAiResults();
    aiStatusEl.textContent = items.length
      ? "AI suggestions updated."
      : "AI did not find suitable matches.";
  } catch (err) {
    console.error("AI error", err);
    aiStatusEl.textContent = "AI request failed.";
  } finally {
    setAiLoading(false);
  }
}

// Tabs

function setActiveTab(name) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === name;
    btn.classList.toggle("active", isActive);
  });

  Object.entries(tabPanels).forEach(([key, panel]) => {
    if (!panel) return;
    panel.style.display = key === name ? "block" : "none";
  });

  if (name === "watchlist") {
    renderWatchlist();
  } else if (name === "watched") {
    renderWatched();
  }
}

// Collapsible panel

const collapseBtn = document.getElementById("sp-collapse-btn");

collapseBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "STREAM_SCOUT_COLLAPSE_TOGGLE" });
});

// Events

btnAskAi.addEventListener("click", () => {
  askAiForSuggestions();
});

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    setActiveTab(tab);
  });
});

// Init

(async () => {
  await updateMembershipSets();

  const ctx = await detectContextFromTab();
  if (ctx && ctx.kind === "imdb-title") {
    await loadItemForImdbId(ctx.imdbId);
  } else {
    renderEmptyContext("Open an IMDb title page to see details here.");
  }

  btnAskAi.disabled = !state.currentItem;
  setActiveTab("search");
})();
