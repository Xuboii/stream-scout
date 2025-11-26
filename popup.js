// FILE: popup.js

// Basic constants
const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const COUNTRY = "US";
const PROXY_URL = "http://localhost:8080";

// Shared state
const state = {
  tab: "search", // search | watchlist | watched
  type: "movie", // movie | tv
  q: "",
  genres: [],
  selectedGenres: new Set(),
  providerFilter: new Set(),
  minRating: "",
  onlyAvail: false,
  watchKeys: new Set(),
  watchedKeys: new Set(),
};

// DOM refs
const appEl = document.getElementById("app");

const elControls = document.getElementById("controls");
const elQ = document.getElementById("q");
const elType = document.getElementById("type");
const elGenre = document.getElementById("genre");
const elMinRating = document.getElementById("minRating");
const elProviders = document.getElementById("providers");
const elOnlyAvail = document.getElementById("onlyAvail");
const elResults = document.getElementById("results");
const elEmpty = document.getElementById("emptyState");
const tplRow = document.getElementById("row-tpl");

const btnTabSearch = document.getElementById("tabSearch");
const btnTabWatchlist = document.getElementById("tabWatchlist");
const btnTabWatched = document.getElementById("tabWatched");
const btnSearch = document.getElementById("btnSearch");

let currentItems = [];

// ---------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------

const loadList = async (key) =>
  (await chrome.storage.sync.get([key]))[key] || [];

const saveList = async (key, arr) =>
  chrome.storage.sync.set({ [key]: arr });

const addTo = async (key, item) => {
  const arr = await loadList(key);
  if (!arr.find((x) => x.key === item.key)) {
    arr.push(item);
    await saveList(key, arr);
  }
};

const removeFrom = async (key, tmdbKey) => {
  const arr = await loadList(key);
  const next = arr.filter((x) => x.key !== tmdbKey);
  await saveList(key, next);
};

// Keep quick membership sets for indicators
async function updateMembershipSets() {
  const [watchlist, watched] = await Promise.all([
    loadList("watchlist"),
    loadList("watched"),
  ]);
  state.watchKeys = new Set(watchlist.map((x) => x.key));
  state.watchedKeys = new Set(watched.map((x) => x.key));
}

// ---------------------------------------------------------------------
// Simple proxy GET
// ---------------------------------------------------------------------

async function pget(path, params = {}) {
  const url = new URL(PROXY_URL + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// ---------------------------------------------------------------------
// Genres
// ---------------------------------------------------------------------

async function loadGenres() {
  try {
    const data = await pget("/tmdb_genres", { type: state.type });
    state.genres = data || [];
  } catch (err) {
    console.error("Genre load failed", err);
    state.genres = [];
  }
  renderGenreOptions();
}

function renderGenreOptions() {
  elGenre.innerHTML = "";
  state.genres.forEach((g) => {
    const opt = document.createElement("option");
    opt.value = String(g.id);
    opt.textContent = g.name;
    if (state.selectedGenres.has(g.id)) opt.selected = true;
    elGenre.appendChild(opt);
  });
}

// ---------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------

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

function providerKeyFromName(name) {
  const n = name.toLowerCase();
  if (n.includes("netflix")) return "netflix";
  if (n.includes("prime") || n.includes("amazon")) return "prime";
  if (n.includes("hulu")) return "hulu";
  if (n.includes("disney")) return "disney";
  if (n.includes("crunchy")) return "crunchy";
  if (n.includes("hbo") || n.includes("max")) return "max";
  if (n.includes("apple")) return "apple";
  if (n.includes("paramount")) return "paramount";
  if (n.includes("peacock")) return "peacock";
  if (n.includes("youtube")) return "youtube";
  return "other";
}

function renderProviderTags(container, providers) {
  container.innerHTML = "";
  if (!providers || !providers.length) {
    const tag = document.createElement("span");
    tag.className = "provider-tag";
    tag.textContent = "No providers found";
    container.appendChild(tag);
    return;
  }

  providers.slice(0, 8).forEach((p) => {
    const tag = document.createElement("span");
    const cls = providerClass(p);
    tag.className = "provider-tag " + cls;
    tag.textContent = p;
    container.appendChild(tag);
  });
}

// ---------------------------------------------------------------------
// Search via TMDB + OMDb enrichment
// ---------------------------------------------------------------------

async function doSearch() {
  if (state.tab !== "search") return;

  const query = (state.q || "").trim();
  if (!query) {
    renderResults([]);
    return;
  }

  const genreIds = [...state.selectedGenres].join(",");

  let tmdb;
  try {
    tmdb = await pget("/tmdb_search", {
      type: state.type,
      query,
      include_adult: "false",
      language: "en-US",
      page: "1",
      with_genres: genreIds,
    });
  } catch (err) {
    console.error("TMDB search failed", err);
    renderResults([]);
    return;
  }

  let results = (tmdb.results || []).slice(0, 12);

  const items = await Promise.all(
    results.map(async (r) => {
      const tmdbId = r.id;
      const title =
        state.type === "movie"
          ? r.title || r.original_title
          : r.name || r.original_name;
      const year = (r.release_date || r.first_air_date || "").slice(0, 4);

      // external ids to get imdb id
      let imdbId = null;
      try {
        const ext = await pget("/tmdb_external_ids", {
          type: state.type,
          id: tmdbId,
        });
        imdbId = ext.imdb_id || null;
      } catch (err) {
        console.warn("external ids failed", tmdbId, err);
      }

      // IMDb rating via OMDb
      let imdbRating = null;
      if (imdbId) {
        try {
          const omdb = await pget("/omdb", { i: imdbId });
          if (omdb && omdb.imdbRating && omdb.imdbRating !== "N/A") {
            imdbRating = omdb.imdbRating;
          }
        } catch (err) {
          console.warn("OMDb failed for", imdbId, err);
        }
      }

      // provider info from TMDB
      let offers = [];
      try {
        const prov = await pget("/tmdb_providers", {
          type: state.type,
          id: tmdbId,
        });
        const us = (prov.results && prov.results[COUNTRY]) || {};
        offers = [
          ...(us.flatrate || []),
          ...(us.ads || []),
          ...(us.rent || []),
          ...(us.buy || []),
        ];
      } catch (err) {
        console.warn("provider lookup failed", tmdbId, err);
      }

      if (state.onlyAvail && offers.length === 0) return null;

      return {
        key: `${state.type}:${tmdbId}`,
        tmdbId,
        type: state.type,
        title,
        year,
        poster: r.poster_path ? TMDB_IMG + r.poster_path : "",
        imdbId,
        imdbRating,
        providers: offers.map((o) => o.provider_name),
      };
    })
  );

  let filtered = items.filter(Boolean);

  // Extra filters: min IMDb and provider
  if (state.minRating) {
    const min = parseFloat(state.minRating);
    filtered = filtered.filter((item) => {
      if (!item.imdbRating) return false;
      const val = parseFloat(item.imdbRating);
      return !Number.isNaN(val) && val >= min;
    });
  }

  if (state.providerFilter.size > 0) {
    filtered = filtered.filter((item) => {
      if (!item.providers || !item.providers.length) return false;
      const keys = item.providers.map(providerKeyFromName);
      return keys.some((k) => state.providerFilter.has(k));
    });
  }

  await updateMembershipSets();
  renderResults(filtered);
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------

function renderResults(items) {
  currentItems = items;
  elResults.innerHTML = "";

  if (!items.length) {
    elEmpty.style.display = "block";
    elEmpty.textContent =
      state.tab === "search"
        ? "No matches yet. Try a different title or filters."
        : "Nothing here yet.";
    return;
  }

  elEmpty.style.display = "none";

  const watchKeys = state.watchKeys || new Set();
  const watchedKeys = state.watchedKeys || new Set();

  items.forEach((item) => {
    const node = tplRow.content.firstElementChild.cloneNode(true);

    const labelType = item.type === "movie" ? "Movie" : "TV";

    node.querySelector(".title").textContent = item.title;
    node.querySelector(".year-type").textContent = item.year
      ? `${labelType} • ${item.year}`
      : labelType;

    const scoreEl = node.querySelector(".imdb-score");
    if (item.imdbRating) {
      scoreEl.textContent = item.imdbRating;
    } else {
      scoreEl.textContent = "N/A";
    }

    renderProviderTags(node.querySelector(".providers"), item.providers);

    const btnWatchlist = node.querySelector(".btn-watchlist");
    const btnWatched = node.querySelector(".btn-watched");
    const btnRemove = node.querySelector(".btn-remove");

    const inWatchlist = watchKeys.has(item.key);
    const inWatched = watchedKeys.has(item.key);

    // Reset common state
    btnWatchlist.style.display = "inline-flex";
    btnWatched.style.display = "inline-flex";
    btnRemove.style.display = "inline-flex";

    btnWatchlist.disabled = false;
    btnWatched.disabled = false;
    btnWatchlist.classList.remove("active");
    btnWatched.classList.remove("active");
    btnWatchlist.textContent = "☆";
    btnWatched.textContent = "✓";

    if (state.tab === "search") {
      // Search: show both actions, hide remove
      btnRemove.style.display = "none";

      if (inWatched) {
        // Already watched: show teal check, disable both
        btnWatched.classList.add("active");
        btnWatched.disabled = true;
        btnWatched.title = "Already watched";

        btnWatchlist.disabled = true;
        btnWatchlist.title = "Already watched";
      } else if (inWatchlist) {
        // In watchlist only
        btnWatchlist.classList.add("active");
        btnWatchlist.textContent = "★";
        btnWatchlist.title = "In watchlist";
        btnWatched.title = "Mark as watched";
      } else {
        // Not in either list
        btnWatchlist.title = "Add to watchlist";
        btnWatched.title = "Mark as watched";
      }
    } else if (state.tab === "watchlist") {
      // Watchlist tab: move to watched or remove
      btnWatchlist.style.display = "none";

      btnWatched.disabled = false;
      btnWatched.title = "Move to watched";
      btnRemove.title = "Remove from watchlist";
    } else if (state.tab === "watched") {
      // Watched tab: subtle already watched check, remove option
      btnWatchlist.style.display = "none";

      btnWatched.classList.add("active");
      btnWatched.disabled = true;
      btnWatched.title = "Already watched";
      btnRemove.title = "Remove from watched";
    }

    // Click handlers
    btnWatchlist.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (state.tab !== "search") return;

      await addTo("watchlist", item);
      await updateMembershipSets();

      btnWatchlist.classList.add("active");
      btnWatchlist.textContent = "★";
      btnWatchlist.title = "In watchlist";
    });

    btnWatched.addEventListener("click", async (e) => {
      e.stopPropagation();

      if (state.tab === "search") {
        // From search: mark watched, remove from watchlist if present
        await addTo("watched", item);
        await removeFrom("watchlist", item.key);
        await updateMembershipSets();

        btnWatched.classList.add("active");
        btnWatched.disabled = true;
        btnWatched.title = "Already watched";

        btnWatchlist.disabled = true;
        btnWatchlist.classList.remove("active");
        btnWatchlist.textContent = "☆";
      } else if (state.tab === "watchlist") {
        // From watchlist: move to watched and refresh
        await removeFrom("watchlist", item.key);
        await addTo("watched", item);
        await updateMembershipSets();
        await refreshTab();
      }
      // In watched tab the button is disabled so click will not fire
    });

    btnRemove.addEventListener("click", async (e) => {
      e.stopPropagation();
      const listKey = state.tab === "watchlist" ? "watchlist" : "watched";
      await removeFrom(listKey, item.key);
      await updateMembershipSets();
      await refreshTab();
    });

    elResults.appendChild(node);
  });
}

// ---------------------------------------------------------------------
// Tabs and input wiring
// ---------------------------------------------------------------------

async function refreshTab() {
  if (state.tab === "search") {
    await doSearch();
  } else if (state.tab === "watchlist") {
    const items = await loadList("watchlist");
    await updateMembershipSets();
    renderResults(items);
  } else if (state.tab === "watched") {
    const items = await loadList("watched");
    await updateMembershipSets();
    renderResults(items);
  }
}

function setTab(tab) {
  state.tab = tab;

  btnTabSearch.classList.toggle("active", tab === "search");
  btnTabWatchlist.classList.toggle("active", tab === "watchlist");
  btnTabWatched.classList.toggle("active", tab === "watched");

  elControls.style.display = tab === "search" ? "block" : "none";

  refreshTab();
}

btnTabSearch.addEventListener("click", () => setTab("search"));
btnTabWatchlist.addEventListener("click", () => setTab("watchlist"));
btnTabWatched.addEventListener("click", () => setTab("watched"));

btnSearch.addEventListener("click", () => {
  state.q = elQ.value;
  doSearch();
});

elQ.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    state.q = elQ.value;
    doSearch();
  }
});

elType.addEventListener("change", async (e) => {
  state.type = e.target.value;
  state.selectedGenres.clear();
  await loadGenres();
  if (state.q.trim()) await doSearch();
});

elGenre.addEventListener("change", (e) => {
  state.selectedGenres = new Set(
    [...e.target.selectedOptions].map((o) => Number(o.value))
  );
});

elMinRating.addEventListener("change", (e) => {
  state.minRating = e.target.value || "";
  if (state.tab === "search" && state.q.trim()) doSearch();
});

elProviders.addEventListener("change", (e) => {
  const vals = [...e.target.selectedOptions].map((o) => o.value);
  state.providerFilter = new Set(vals);
  if (state.tab === "search" && state.q.trim()) doSearch();
});

elOnlyAvail.addEventListener("change", (e) => {
  state.onlyAvail = e.target.checked;
  if (state.tab === "search" && state.q.trim()) doSearch();
});

document.getElementById("clearGenres").addEventListener("click", () => {
  state.selectedGenres.clear();
  [...elGenre.options].forEach((o) => (o.selected = false));
  if (state.tab === "search" && state.q.trim()) doSearch();
});

document
  .getElementById("clearProviders")
  .addEventListener("click", () => {
    state.providerFilter.clear();
    [...elProviders.options].forEach((o) => (o.selected = false));
    if (state.tab === "search" && state.q.trim()) doSearch();
  });

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------

(async () => {
  await loadGenres();
  await updateMembershipSets();
  setTab("search");
})();
