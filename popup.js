// Basic constants
const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const COUNTRY = "US";
const PROXY_URL = "http://localhost:8080";

// Shared state
const state = {
  tab: "search", // "search" | "watchlist" | "watched"
  type: "movie", // "movie" | "tv"
  q: "",
  genres: [],
  selectedGenres: new Set(),
  onlyAvail: false,
};

// DOM references
const elControls = document.getElementById("controls");
const elQ = document.getElementById("q");
const elType = document.getElementById("type");
const elGenre = document.getElementById("genre");
const elOnlyAvail = document.getElementById("onlyAvail");
const elResults = document.getElementById("results");
const elEmpty = document.getElementById("emptyState");
const tplRow = document.getElementById("row-tpl");

const btnTabSearch = document.getElementById("tabSearch");
const btnTabWatchlist = document.getElementById("tabWatchlist");
const btnTabWatched = document.getElementById("tabWatched");

// Hover preview elements
const previewEl = document.getElementById("hoverPreview");
const previewPoster = document.getElementById("previewPoster");
const previewTitle = document.getElementById("previewTitle");
const previewSub = document.getElementById("previewSub");
const previewImdb = document.getElementById("previewImdb");
const previewProviders = document.getElementById("previewProviders");

let hidePreviewTimer = null;
let currentItems = [];

// ---------------------------------------------------------
// Small utilities
// ---------------------------------------------------------

// Debounce helper
const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

// Storage helpers
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

// Proxy GET helper that forwards query to TMDB or OMDb
async function pget(path, params = {}) {
  const url = new URL(PROXY_URL + path);
  Object.entries(params).forEach(([k, v]) =>
    url.searchParams.set(k, v)
  );
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// ---------------------------------------------------------
// Genres
// ---------------------------------------------------------

async function loadGenres() {
  const data = await pget("/tmdb_genres", { type: state.type });
  state.genres = data || [];
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

// ---------------------------------------------------------
// Search TMDB, enrich with OMDb and provider info
// ---------------------------------------------------------

const doSearch = debounce(async () => {
  if (state.tab !== "search") return;

  const query = (state.q || "").trim();
  if (!query) {
    renderResults([]);
    return;
  }

  const endpoint = "/tmdb_search";

  const genreIds = [...state.selectedGenres].join(",");

  const tmdb = await pget(endpoint, {
    type: state.type,
    query,
    include_adult: "false",
    language: "en-US",
    page: "1",
    with_genres: genreIds,
  });

  let results = (tmdb.results || []).filter((r) => {
    if (!genreIds) return true;
    const want = new Set([...state.selectedGenres]);
    return (r.genre_ids || []).some((id) => want.has(id));
  });

  results = results.slice(0, 12);

  const items = await Promise.all(
    results.map(async (r) => {
      const tmdbId = r.id;
      const title =
        state.type === "movie"
          ? r.title || r.original_title
          : r.name || r.original_name;
      const year = (r.release_date || r.first_air_date || "").slice(
        0,
        4,
      );

      // external_ids to get imdb_id
      const ext = await pget("/tmdb_external_ids", {
        type: state.type,
        id: tmdbId
      });
      const imdbId = ext.imdb_id || null;

      // imdb rating via OMDb
      let imdbRating = null;
      if (imdbId) {
        try {
          const omdb = await pget("/omdb/", { i: imdbId });
          if (
            omdb &&
            omdb.imdbRating &&
            omdb.imdbRating !== "N/A"
          ) {
            imdbRating = omdb.imdbRating;
          }
        } catch (err) {
          console.warn("OMDb lookup failed for", imdbId, err);
          imdbRating = null;
        }
      }

      // providers via TMDB
      const prov = await pget("/tmdb_providers", {
        type: state.type,
        id: tmdbId
      });

      const us = (prov.results && prov.results[COUNTRY]) || {};
      const offers = [
        ...(us.flatrate || []),
        ...(us.ads || []),
        ...(us.rent || []),
        ...(us.buy || []),
      ];

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
    }),
  );

  renderResults(items.filter(Boolean));
}, 350);

// ---------------------------------------------------------
// Rendering - rows and hover preview
// ---------------------------------------------------------

function providerClass(name) {
  const n = name.toLowerCase();
  if (n.includes("netflix")) return "provider-netflix";
  if (n.includes("prime") || n.includes("amazon"))
    return "provider-prime";
  if (n.includes("hulu")) return "provider-hulu";
  if (n.includes("disney")) return "provider-disney";
  if (n.includes("crunchy")) return "provider-crunchyroll";
  return "";
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

  providers.slice(0, 6).forEach((p) => {
    const tag = document.createElement("span");
    const cls = providerClass(p);
    tag.className = `provider-tag ${cls}`.trim();
    tag.textContent = p;
    container.appendChild(tag);
  });
}

function renderResults(items) {
  currentItems = items;
  elResults.innerHTML = "";

  if (!items.length) {
    elEmpty.style.display = "block";
    elEmpty.textContent =
      state.tab === "search"
        ? "No matches yet. Try a different title or filter."
        : "Nothing here yet.";
    return;
  }

  elEmpty.style.display = "none";

  items.forEach((item) => {
    const node = tplRow.content.firstElementChild.cloneNode(true);

    const labelType = item.type === "movie" ? "Movie" : "TV";

    node.querySelector(".title").textContent = item.title;
    node.querySelector(
      ".year-type",
    ).textContent = item.year
      ? `${labelType} · ${item.year}`
      : labelType;

    node.querySelector(".imdb-badge").textContent = item.imdbRating
      ? `IMDb ${item.imdbRating}`
      : "IMDb N/A";

    renderProviderTags(
      node.querySelector(".providers"),
      item.providers,
    );

    const btnWatchlist = node.querySelector(".btn-watchlist");
    const btnWatched = node.querySelector(".btn-watched");

    btnWatchlist.addEventListener("click", async (e) => {
      e.stopPropagation();
      await addTo("watchlist", item);
      btnWatchlist.textContent = "★";
    });

    btnWatched.addEventListener("click", async (e) => {
      e.stopPropagation();
      await removeFrom("watchlist", item.key);
      await addTo("watched", item);
      btnWatched.textContent = "✓";
    });

    node.addEventListener("mouseenter", () => showPreview(item));
    node.addEventListener("mouseleave", scheduleHidePreview);

    elResults.appendChild(node);
  });
}

// Hover preview

function showPreview(item) {
  if (hidePreviewTimer) {
    clearTimeout(hidePreviewTimer);
    hidePreviewTimer = null;
  }

  if (!item) {
    previewEl.classList.add("hidden");
    return;
  }

  previewPoster.src =
    item.poster || "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
  previewTitle.textContent = item.title;
  const labelType = item.type === "movie" ? "Movie" : "TV";
  previewSub.textContent = item.year
    ? `${labelType} · ${item.year}`
    : labelType;

  previewImdb.textContent = item.imdbRating
    ? `IMDb rating - ${item.imdbRating}`
    : "IMDb rating not available";

  previewProviders.innerHTML = "";
  renderProviderTags(previewProviders, item.providers);

  previewEl.classList.remove("hidden");
}

function scheduleHidePreview() {
  if (hidePreviewTimer) clearTimeout(hidePreviewTimer);
  hidePreviewTimer = setTimeout(() => {
    previewEl.classList.add("hidden");
  }, 140);
}

// Optional - if the user moves into the preview box, keep it visible
previewEl.addEventListener("mouseenter", () => {
  if (hidePreviewTimer) {
    clearTimeout(hidePreviewTimer);
    hidePreviewTimer = null;
  }
});
previewEl.addEventListener("mouseleave", scheduleHidePreview);

// ---------------------------------------------------------
// Tabs and input wiring
// ---------------------------------------------------------

function setTab(tab) {
  state.tab = tab;

  btnTabSearch.classList.toggle("active", tab === "search");
  btnTabWatchlist.classList.toggle("active", tab === "watchlist");
  btnTabWatched.classList.toggle("active", tab === "watched");

  // Hide search controls on non search tabs
  elControls.style.display = tab === "search" ? "block" : "none";

  if (tab === "search") {
    doSearch();
  } else if (tab === "watchlist") {
    loadList("watchlist").then((items) => {
      renderResults(items);
    });
  } else if (tab === "watched") {
    loadList("watched").then((items) => {
      renderResults(items);
    });
  }
}

btnTabSearch.addEventListener("click", () => setTab("search"));
btnTabWatchlist.addEventListener("click", () => setTab("watchlist"));
btnTabWatched.addEventListener("click", () => setTab("watched"));

elQ.addEventListener("input", (e) => {
  state.q = e.target.value;
  doSearch();
});

elType.addEventListener("change", async (e) => {
  state.type = e.target.value;
  state.selectedGenres.clear();
  await loadGenres();
  doSearch();
});

elGenre.addEventListener("change", (e) => {
  state.selectedGenres = new Set(
    [...e.target.selectedOptions].map((o) => Number(o.value)),
  );
  doSearch();
});

elOnlyAvail.addEventListener("change", (e) => {
  state.onlyAvail = e.target.checked;
  doSearch();
});

// ---------------------------------------------------------
// Init
// ---------------------------------------------------------

(async () => {
  await loadGenres();
  setTab("search");
})();
