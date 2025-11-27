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

// Load membership sets

async function updateMembershipSets() {
  const [watchlist, watched] = await Promise.all([
    loadList("watchlist"),
    loadList("watched"),
  ]);

  state.watchKeys = new Set(watchlist.map((x) => x.key));
  state.watchedKeys = new Set(watched.map((x) => x.key));
}

// Provider styling helper

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

// Detect IMDb page in active tab

async function detectContextFromTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.url) {
      badgeEl.textContent = "No active tab";
      subtitleEl.textContent = "Open an IMDb title page.";
      return null;
    }

    const url = tab.url;
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
    subtitleEl.textContent = "Check tab permissions.";
    return null;
  }
}

// Load item from OMDb and TMDB

async function loadItemForImdbId(imdbId) {
  try {
    const omdb = await pget("/omdb", { i: imdbId });

    if (!omdb || omdb.Response === "False") {
      renderEmptyContext("Could not load IMDb metadata.");
      return;
    }

    const title = omdb.Title || "";
    const year = omdb.Year || "";
    const type = omdb.Type === "series" ? "tv" : "movie";

    const tmdbSearch = await pget("/tmdb_search", {
      type,
      query: title,
      include_adult: "false",
      language: "en-US",
      page: "1",
    });

    const first = (tmdbSearch.results || [])[0];

    if (!first) {
      renderEmptyContext("TMDB did not have this title.");
      return;
    }

    const tmdbId = first.id;
    const yearField = first.release_date || first.first_air_date || year || "";
    const yearResolved = yearField.slice(0, 4);

    let providers = [];

    try {
      const prov = await pget("/tmdb_providers", { type, id: tmdbId });
      const us = (prov.results && prov.results[COUNTRY]) || {};
      const offers = [
        ...(us.flatrate || []),
        ...(us.ads || []),
        ...(us.rent || []),
        ...(us.buy || []),
      ];
      providers = offers.map((o) => o.provider_name);
    } catch (err) {
      console.warn("Provider fetch failed", err);
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
    renderEmptyContext("Failed to load this title.");
  }
}

// Empty card template

function renderEmptyContext(message) {
  contextCardEl.classList.add("context-card-empty");
  contextCardEl.innerHTML = `
    <p class="context-empty-text">${message}</p>
  `;
}

// Render context card

function renderContextCard() {
  const item = state.currentItem;

  if (!item) {
    renderEmptyContext("No supported title detected.");
    return;
  }

  contextCardEl.classList.remove("context-card-empty");
  contextCardEl.innerHTML = "";

  const card = document.createElement("article");
  card.className = "suggest-card ctx-card";

  const main = document.createElement("div");
  main.className = "suggest-main";

  const titleEl = document.createElement("h2");
  titleEl.className = "ctx-title-centered";
  titleEl.textContent = item.title;

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
  ["N/A", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    scoreSelect.appendChild(opt);
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

  const key = item.key;
  const inWatchlist = state.watchKeys.has(key);
  const inWatched = state.watchedKeys.has(key);

  btnWatchlist.classList.toggle("active", inWatchlist);
  btnWatched.classList.toggle("active", inWatched);

  btnWatchlist.title = inWatchlist ? "Remove from watchlist" : "Add to watchlist";
  btnWatched.title = inWatched ? "Remove from watched" : "Mark as watched";

  btnWatchlist.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (inWatchlist) {
      await removeFrom("watchlist", key);
    } else {
      await addTo("watchlist", item);
    }

    await updateMembershipSets();
    renderContextCard();
  });

  btnWatched.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (inWatched) {
      await removeFrom("watched", key);
    } else {
      await addTo("watched", item);
      await removeFrom("watchlist", key);
    }

    await updateMembershipSets();
    renderContextCard();
  });

  card.appendChild(main);
  contextCardEl.appendChild(card);
}

// AI loading state

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

// Render AI suggestions

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

    const key = item.key;
    const typeLabel = item.type === "movie" ? "Movie" : "TV";
    const inWatchlist = state.watchKeys.has(key);
    const inWatched = state.watchedKeys.has(key);

    titleEl.textContent = item.title;
    metaEl.textContent = item.year ? `${typeLabel} • ${item.year}` : typeLabel;
    scoreEl.textContent = item.imdbRating || "N/A";

    renderProviderTags(providersContainer, item.providers || []);

    const btnWatchlist = node.querySelector(".btn-watchlist");
    const btnWatched = node.querySelector(".btn-watched");

    btnWatchlist.classList.toggle("active", inWatchlist);
    btnWatched.classList.toggle("active", inWatched);

    btnWatchlist.title = inWatchlist ? "Remove from watchlist" : "Add to watchlist";
    btnWatched.title = inWatched ? "Remove from watched" : "Mark as watched";

    btnWatchlist.addEventListener("click", async (e) => {
      e.stopPropagation();

      if (inWatchlist) {
        await removeFrom("watchlist", key);
      } else {
        await addTo("watchlist", item);
      }

      await updateMembershipSets();
      renderAiResults();
    });

    btnWatched.addEventListener("click", async (e) => {
      e.stopPropagation();

      if (inWatched) {
        await removeFrom("watched", key);
      } else {
        await addTo("watched", item);
        await removeFrom("watchlist", key);
      }

      await updateMembershipSets();
      renderAiResults();
    });

    aiResultsEl.appendChild(node);
  });
}

// Ask AI

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
      : "No matches found.";
  } catch (err) {
    console.error("AI error", err);
    aiStatusEl.textContent = "AI request failed.";
  } finally {
    setAiLoading(false);
  }
}

// Collapse button

const collapseBtn = document.getElementById("sp-collapse-btn");

collapseBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    action: "STREAM_SCOUT_COLLAPSE_TOGGLE",
  });
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

  btnAskAi.disabled = !state.currentItem;
})();
