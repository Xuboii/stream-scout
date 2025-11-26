// sidepanel.js
// AI powered contextual helper for the current page

import { pget, loadList, addTo, removeFrom } from "./shared.js";

const PROXY_URL = "http://localhost:8080";

const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const COUNTRY = "US";

const state = {
  currentItem: null,
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

const tplProvider = document.getElementById("provider-pill-tpl");
const tplSuggestion = document.getElementById("suggestion-tpl");

// Membership sets

async function updateMembershipSets() {
  const [watchlist, watched] = await Promise.all([
    loadList("watchlist"),
    loadList("watched"),
  ]);
  state.watchKeys = new Set(watchlist.map((x) => x.key));
  state.watchedKeys = new Set(watched.map((x) => x.key));
}

// Provider helpers

function providerClass(name) {
  const n = name.toLowerCase();
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

function renderProviderTags(container, providers) {
  container.innerHTML = "";
  if (!providers || !providers.length) {
    const span = document.createElement("span");
    span.className = "provider-tag";
    span.textContent = "No providers found";
    container.appendChild(span);
    return;
  }

  providers.slice(0, 8).forEach((p) => {
    const node = tplProvider.content.firstElementChild.cloneNode(true);
    node.textContent = p;
    const cls = providerClass(p);
    if (cls) node.classList.add(cls);
    container.appendChild(node);
  });
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

    state.currentItem = {
      key: `${type}:${tmdbId}`,
      tmdbId,
      imdbId,
      type,
      title,
      year: yearResolved,
      imdbRating,
      providers,
      poster: first.poster_path ? TMDB_IMG + first.poster_path : "",
    };

    await updateMembershipSets();
    renderContextCard();
  } catch (err) {
    console.error("loadItemForImdbId failed", err);
    renderEmptyContext("Failed to load data for this title.");
  }
}

// Rendering

function renderEmptyContext(message) {
  contextCardEl.classList.add("context-card-empty");
  contextCardEl.innerHTML = `
    <p class="context-empty-text">${message}</p>
  `;
}

function renderContextCard() {
  const item = state.currentItem;
  if (!item) {
    renderEmptyContext("No supported title detected.");
    return;
  }

  contextCardEl.classList.remove("context-card-empty");
  contextCardEl.innerHTML = "";

  // === Outer card ===
  const card = document.createElement("article");
  card.className = "suggest-card"; // identical style to AI cards

  // === Left column (suggest-main) ===
  const main = document.createElement("div");
  main.className = "suggest-main";

  // HEADER
  const header = document.createElement("div");
  header.className = "suggest-header";

  const titleBlock = document.createElement("div");
  titleBlock.className = "suggest-title-block";

  // TITLE LINK
  const titleLink = document.createElement("a");
  titleLink.className = "s-title-link";
  titleLink.href = `https://www.imdb.com/title/${item.imdbId}/`;
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";

  const titleSpan = document.createElement("span");
  titleSpan.className = "s-title";
  titleSpan.textContent = item.title;

  titleLink.appendChild(titleSpan);

  // META
  const meta = document.createElement("span");
  meta.className = "s-meta";

  const typeLabel = item.type === "movie" ? "Movie" : "TV";
  meta.textContent = item.year ? `${typeLabel} • ${item.year}` : typeLabel;

  titleBlock.appendChild(titleLink);
  titleBlock.appendChild(meta);

  // IMDb PILL
  const imdbPill = document.createElement("span");
  imdbPill.className = "imdb-pill";
  imdbPill.innerHTML = `
    <span class="imdb-label">IMDb</span>
    <span class="imdb-score">${item.imdbRating || "N/A"}</span>
  `;

  header.appendChild(titleBlock);
  header.appendChild(imdbPill);

  // PROVIDERS
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

  // Append header + providers into left side
  main.appendChild(header);
  main.appendChild(providersWrap);

  // === Right column (actions) ===
  const actions = document.createElement("div");
  actions.className = "suggest-actions";

  const btnWatchlist = document.createElement("button");
  btnWatchlist.className = "btn-icon btn-watchlist";
  btnWatchlist.title = "Add to watchlist";
  btnWatchlist.innerHTML = "☆";

  const btnWatched = document.createElement("button");
  btnWatched.className = "btn-icon btn-watched";
  btnWatched.title = "Mark as watched";
  btnWatched.innerHTML = "✓";

  // Membership state
  const inWatchlist = state.watchKeys.has(item.key);
  const inWatched = state.watchedKeys.has(item.key);

  if (inWatched) {
    btnWatched.classList.add("active");
    btnWatched.disabled = true;
    btnWatchlist.disabled = true;
  } else if (inWatchlist) {
    btnWatchlist.classList.add("active");
  }

  // Button handlers
  btnWatchlist.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (inWatched) return;
    await addTo("watchlist", item);
    await updateMembershipSets();
    renderContextCard();
  });

  btnWatched.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (inWatched) return;
    await addTo("watched", item);
    await removeFrom("watchlist", item.key);
    await updateMembershipSets();
    renderContextCard();
  });

  actions.appendChild(btnWatchlist);
  actions.appendChild(btnWatched);

  // === Assemble card ===
  card.appendChild(main);
  card.appendChild(actions);

  // Insert final card
  contextCardEl.appendChild(card);
}


// AI suggestions

function setAiLoading(loading) {
  state.aiLoading = loading;
  btnAskAi.disabled = loading || !state.currentItem;
  aiStatusEl.textContent = loading ? "Thinking..." : "";
}

function renderAiResults() {
  aiResultsEl.innerHTML = "";

  if (!state.aiSuggestions.length) {
    aiEmptyEl.style.display = "block";
    return;
  }
  aiEmptyEl.style.display = "none";

  state.aiSuggestions.forEach((item) => {
    const node = tplSuggestion.content.firstElementChild.cloneNode(true);

    const titleEl = node.querySelector(".s-title");
    const metaEl = node.querySelector(".s-meta");
    const scoreEl = node.querySelector(".imdb-score");
    const providersContainer = node.querySelector(".providers");
    const typeLabel = item.type === "movie" ? "Movie" : "TV";

    titleEl.textContent = item.title;

    const titleLink = node.querySelector(".s-title-link");
    titleLink.href = `https://www.imdb.com/title/${item.imdbId}/`;
    titleLink.target = "_blank";

    metaEl.textContent = item.year
      ? `${typeLabel} • ${item.year}`
      : typeLabel;
    scoreEl.textContent = item.imdbRating || "N/A";

    renderProviderTags(providersContainer, item.providers || []);

    const btnWatchlist = node.querySelector(".btn-watchlist");
    const btnWatched = node.querySelector(".btn-watched");

    const key = item.key;
    const inWatchlist = state.watchKeys.has(key);
    const inWatched = state.watchedKeys.has(key);

    if (inWatched) {
      btnWatched.classList.add("active");
      btnWatched.disabled = true;
      btnWatchlist.disabled = true;
    } else if (inWatchlist) {
      btnWatchlist.classList.add("active");
    }

    btnWatchlist.addEventListener("click", async (e) => {
      e.stopPropagation();
      await addTo("watchlist", item);
      await updateMembershipSets();
      renderAiResults();
    });

    btnWatched.addEventListener("click", async (e) => {
      e.stopPropagation();
      await addTo("watched", item);
      await removeFrom("watchlist", key);
      await updateMembershipSets();
      renderAiResults();
    });

    aiResultsEl.appendChild(node);
  });
}

async function askAiForSuggestions() {
  const baseItem = state.currentItem;
  if (!baseItem) {
    aiStatusEl.textContent = "No title detected.";
    return;
  }

  setAiLoading(true);
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
    // Expected response shape:
    // { items: [{ key, title, year, type, imdbRating, providers }] }
    const items = json.items || [];

    state.aiSuggestions = items.map((it) => {
      // Ensure there is a key
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

// --- Collapsible panel ---
const collapseBtn = document.getElementById("sp-collapse-btn");

collapseBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "STREAM_SCOUT_COLLAPSE_TOGGLE" });
});


// Events

btnAskAi.addEventListener("click", () => {
  askAiForSuggestions();
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

  // If we do not have a current item, AI button stays disabled
  btnAskAi.disabled = !state.currentItem;
})();
