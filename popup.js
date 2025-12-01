// popup.js
import {
  pget,
  loadList,
  addTo,
  removeFrom,
  saveScore,
  normalizeItem,
  createItemCard,
} from "./shared.js";

// Basic constants
const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const COUNTRY = "US";
const PROXY_URL = "http://localhost:8080";
const PAGE_SIZE = 5;

// Shared state
const state = {
  tab: "search", // search | watchlist | watched | recommended
  type: "movie", // movie | tv
  q: "",
  genres: [],
  selectedGenres: new Set(),
  providerFilter: new Set(),
  minRating: "",
  onlyAvail: false,
  watchKeys: new Set(),
  watchedKeys: new Set(),
  page: 1,
};

let currentItems = [];
let searchResults = [];

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

const btnTabSearch = document.getElementById("tabSearch");
const btnTabWatchlist = document.getElementById("tabWatchlist");
const btnTabWatched = document.getElementById("tabWatched");
const btnSearch = document.getElementById("btnSearch");

// Recommended tab refs
const btnTabRecommended = document.getElementById("tabRecommended");
const recControls = document.getElementById("recControls");
const recPromptEl = document.getElementById("recPrompt");
const btnRecAi = document.getElementById("btnRecAi");

// Pagination refs
const elPagination = document.getElementById("pagination");
const btnPrevPage = document.getElementById("prevPage");
const btnNextPage = document.getElementById("nextPage");
const elPageInfo = document.getElementById("pageInfo");

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
// Provider helpers (for filtering only)
// ---------------------------------------------------------------------

function renderWaitForSearchMessage() {
  elResults.innerHTML = "";
  elEmpty.style.display = "block";
  elEmpty.textContent =
    "Filters updated. Click Search when ready.";
  if (elPagination) elPagination.classList.add("hidden");
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

// ---------------------------------------------------------------------
// Search via TMDB + OMDb enrichment
// ---------------------------------------------------------------------

async function doSearch() {
  if (state.tab !== "search") return;

  const loadingEl = document.getElementById("popupLoading");
  const resultsEl = elResults;

  // START LOADING
  loadingEl.classList.remove("hidden");
  resultsEl.innerHTML = "";
  elEmpty.style.display = "none";
  if (elPagination) elPagination.classList.add("hidden");

  const query = (state.q || "").trim();
  const hasQuery = !!query;
  const hasFilters =
    state.selectedGenres.size > 0 ||
    state.providerFilter.size > 0 ||
    !!state.minRating ||
    state.onlyAvail;

  const selectedGenres = new Set(state.selectedGenres);
  let tmdb;

  try {
    if (hasQuery) {
      // Normal title search
      tmdb = await pget("/tmdb_search", {
        type: state.type,
        query,
        include_adult: "false",
        language: "en-US",
        page: "1",
      });
    } else {
      // No title: use TMDB discover for top rated baseline
      // When no filters, this is simply top rated
      tmdb = await pget("/tmdb_discover", {
        type: state.type,
        sort_by: "vote_average.desc",
        page: "1",
        vote_count_gte: "200",
      });
    }
  } catch (err) {
    console.error("TMDB search or discover failed", err);
    loadingEl.classList.add("hidden");
    searchResults = [];
    state.page = 1;
    applySearchPagination();
    return;
  }

  let results = (tmdb.results || []);

  // Client side genre filter using TMDB genre_ids
  if (selectedGenres.size > 0) {
    results = results.filter((r) => {
      if (!Array.isArray(r.genre_ids)) return false;
      return r.genre_ids.some((id) => selectedGenres.has(id));
    });
  }

  // Limit how many we enrich to avoid tons of OMDb calls
  results = results.slice(0, 20);

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
          if (omdb && omdb.Response !== "False" && omdb.imdbRating && omdb.imdbRating !== "N/A") {
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

  // Extra filters
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

  loadingEl.classList.add("hidden");

  // Store full search results for pagination
  searchResults = filtered;
  state.page = 1;
  applySearchPagination();
}

// Apply pagination for search tab
function applySearchPagination() {
  if (state.tab !== "search") {
    if (elPagination) elPagination.classList.add("hidden");
    renderResults(searchResults);
    return;
  }

  const total = searchResults.length;

  if (!total) {
    if (elPagination) elPagination.classList.add("hidden");
    renderResults([]);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (state.page < 1) state.page = 1;
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = searchResults.slice(start, start + PAGE_SIZE);

  renderResults(pageItems);

  if (!elPagination) return;

  elPagination.classList.toggle("hidden", totalPages <= 1);
  elPageInfo.textContent = `Page ${state.page} of ${totalPages}`;
  btnPrevPage.disabled = state.page <= 1;
  btnNextPage.disabled = state.page >= totalPages;
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

  const tab = state.tab;
  const watchKeys = state.watchKeys || new Set();
  const watchedKeys = state.watchedKeys || new Set();

  items
    .map((it) => normalizeItem(it))
    .forEach((item) => {
      const key = item.key;

      const card = createItemCard(item, {
        isInWatchlist: watchKeys.has(key),
        isInWatched: watchedKeys.has(key),

        onToggleWatchlist: async () => {
          if (state.watchKeys.has(key)) {
            await removeFrom("watchlist", key);
          } else {
            await addTo("watchlist", item);
          }
          await updateMembershipSets();

          if (tab === "search" || tab === "recommended") {
            if (tab === "search") {
              // Repaint current page without refetching
              applySearchPagination();
            } else {
              renderResults(currentItems);
            }
          } else {
            await refreshTab();
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

          if (tab === "search" || tab === "recommended") {
            if (tab === "search") {
              applySearchPagination();
            } else {
              renderResults(currentItems);
            }
          } else {
            await refreshTab();
          }
        },

        onScoreChange: async (newScore) => {
          item.score = newScore;
          await saveScore(key, newScore);
          await updateMembershipSets();
        },
      });

      elResults.appendChild(card);
    });
}

// ---------------------------------------------------------------------
// Recommended tab helpers
// ---------------------------------------------------------------------

function buildWatchedProfile(watched) {
  // Only items with a stored score
  const rated = watched
    .filter((w) => w.score && w.score !== "N/A")
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  if (!rated.length) return null;

  const top = rated.slice(0, 6);
  const profileLines = top.map(
    (it) => `${it.title} (${it.year || "n/a"}) rated ${it.score}/10`
  );

  return {
    anchor: top[0],
    description: profileLines.join("; "),
  };
}

async function loadRecommended() {
  const watched = await loadList("watched");
  await updateMembershipSets();

  // Build profile from watched scores
  const profile = buildWatchedProfile(watched);

  if (!profile) {
    elResults.innerHTML = "";
    elEmpty.style.display = "block";
    elEmpty.textContent =
      "Rate a few titles in your Watched list to get recommendations here.";
    if (elPagination) elPagination.classList.add("hidden");
    return;
  }

  const userPrompt = recPromptEl.value.trim();

  const mood = userPrompt
    ? `User says they are in the mood for: "${userPrompt}". They previously rated: ${profile.description}. Recommend new titles they are likely to enjoy and explain each suggestion with lines like "Because you liked X and Y, you might like Z because ...".`
    : `User has previously watched and rated: ${profile.description}. Recommend new titles they are likely to enjoy and explain each suggestion with lines like "Because you liked X and Y, you might like Z because ...".`;

  try {
    elEmpty.style.display = "block";
    elEmpty.textContent = "Asking AI for personalized picks...";
    elResults.innerHTML = "";
    if (elPagination) elPagination.classList.add("hidden");

    // We reuse /ai_recommend and treat the top rated item as the anchor.
    const anchor = profile.anchor;

    const watchedProfile = watched
      .filter(w => w.score && w.score !== "N/A")
      .map(w => ({
        title: w.title,
        year: w.year,
        score: w.score
      }));

    const res = await fetch(`${PROXY_URL}/ai_recommend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        imdb_id: anchor.imdbId || "",
        title: anchor.title || "",
        year: anchor.year || "",
        type: anchor.type || "movie",
        mood,
        watchedProfile
      })
    });

    if (!res.ok) {
      throw new Error("AI request failed with status " + res.status);
    }

    const data = await res.json();



    const items = (data.items || data || []).map((it) => normalizeItem(it));

    elEmpty.style.display = items.length ? "none" : "block";
    if (!items.length) {
      elEmpty.textContent =
        "AI did not find good recommendations. Try adjusting your mood prompt.";
    }

    renderResults(items);
  } catch (err) {
    console.error("recommended AI error", err);
    elResults.innerHTML = "";
    elEmpty.style.display = "block";
    elEmpty.textContent = "AI request for recommendations failed.";
  }
}

// ---------------------------------------------------------------------
// Tabs and input wiring
// ---------------------------------------------------------------------

async function refreshTab() {
  if (state.tab === "search") {
    renderWaitForSearchMessage();
  } else if (state.tab === "watchlist") {
    const items = await loadList("watchlist");
    await updateMembershipSets();
    if (elPagination) elPagination.classList.add("hidden");
    renderResults(items);
  } else if (state.tab === "watched") {
    const items = await loadList("watched");
    await updateMembershipSets();
    if (elPagination) elPagination.classList.add("hidden");
    renderResults(items);
  } else if (state.tab === "recommended") {
    if (elPagination) elPagination.classList.add("hidden");
    await loadRecommended();
  }
}

function setTab(tab) {
  state.tab = tab;

  btnTabSearch.classList.toggle("active", tab === "search");
  btnTabWatchlist.classList.toggle("active", tab === "watchlist");
  btnTabWatched.classList.toggle("active", tab === "watched");
  btnTabRecommended.classList.toggle("active", tab === "recommended");

  elControls.style.display = tab === "search" ? "block" : "none";
  recControls.style.display = tab === "recommended" ? "block" : "none";

  if (tab === "search") {
    elResults.innerHTML = "";
    elEmpty.style.display = "block";
    elEmpty.textContent = "Enter a title or choose filters, then click Search.";
    if (elPagination) elPagination.classList.add("hidden");
    return;
  }

  refreshTab();
}


btnTabSearch.addEventListener("click", () => setTab("search"));
btnTabWatchlist.addEventListener("click", () => setTab("watchlist"));
btnTabWatched.addEventListener("click", () => setTab("watched"));
btnTabRecommended.addEventListener("click", () => setTab("recommended"));

btnRecAi.addEventListener("click", () => {
  if (state.tab !== "recommended") {
    setTab("recommended");
  } else {
    loadRecommended();
  }
});

btnSearch.addEventListener("click", () => {
  state.q = elQ.value;
  state.page = 1;
  doSearch();
});

elQ.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    state.q = elQ.value;
    state.page = 1;
    renderWaitForSearchMessage();
  }
});

elType.addEventListener("change", async (e) => {
  state.type = e.target.value;
  state.selectedGenres.clear();
  await loadGenres();
  if (state.tab === "search") {
    state.page = 1;
    await renderWaitForSearchMessage();
  }
});

elGenre.addEventListener("change", (e) => {
  state.selectedGenres = new Set(
    [...e.target.selectedOptions].map((o) => Number(o.value))
  );
  if (state.tab === "search") {
    state.page = 1;
    renderWaitForSearchMessage();
  }
});

elMinRating.addEventListener("change", (e) => {
  state.minRating = e.target.value || "";
  if (state.tab === "search") {
    state.page = 1;
    renderWaitForSearchMessage();
  }
});

elProviders.addEventListener("change", (e) => {
  const vals = [...e.target.selectedOptions].map((o) => o.value);
  state.providerFilter = new Set(vals);
  if (state.tab === "search") {
    state.page = 1;
    renderWaitForSearchMessage();
  }
});

elOnlyAvail.addEventListener("change", (e) => {
  state.onlyAvail = e.target.checked;
  if (state.tab === "search") {
    state.page = 1;
    renderWaitForSearchMessage();
  }
});

document.getElementById("clearGenres").addEventListener("click", () => {
  state.selectedGenres.clear();
  [...elGenre.options].forEach((o) => (o.selected = false));
  if (state.tab === "search") {
    state.page = 1;
    renderWaitForSearchMessage();
  }
});

document
  .getElementById("clearProviders")
  .addEventListener("click", () => {
    state.providerFilter.clear();
    [...elProviders.options].forEach((o) => (o.selected = false));
    if (state.tab === "search") {
      state.page = 1;
      renderWaitForSearchMessage();
    }
  });

// Pagination button handlers
if (btnPrevPage && btnNextPage) {
  btnPrevPage.addEventListener("click", () => {
    if (state.tab !== "search") return;
    if (state.page > 1) {
      state.page -= 1;
      applySearchPagination();
    }
  });

  btnNextPage.addEventListener("click", () => {
    if (state.tab !== "search") return;
    state.page += 1;
    applySearchPagination();
  });
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------

(async () => {
  await loadGenres();
  await updateMembershipSets();

  // manually go to search tab without auto search
  state.tab = "search";

  btnTabSearch.classList.add("active");
  btnTabWatchlist.classList.remove("active");
  btnTabWatched.classList.remove("active");
  btnTabRecommended.classList.remove("active");

  elControls.style.display = "block";
  recControls.style.display = "none";

  renderResults([]);
  elEmpty.style.display = "block";
  elEmpty.textContent =
    "Enter a title or choose filters, then click Search.";
})();

