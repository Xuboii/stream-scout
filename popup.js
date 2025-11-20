const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const COUNTRY = "US"; // make this user selectable later

// Use a tiny proxy that adds your API keys in server side headers
const PROXY_URL = "http://localhost:8080";

const state = {
  tab: "search",       // "search" | "watchlist" | "watched"
  type: "movie",       // "movie" | "tv"
  q: "",
  genres: [],          // fetched from TMDB
  selectedGenres: new Set(),
  onlyAvail: false
};

// DOM
const elQ = document.getElementById("q");
const elType = document.getElementById("type");
const elGenre = document.getElementById("genre");
const elOnlyAvail = document.getElementById("onlyAvail");
const elResults = document.getElementById("results");
const tplCard = document.getElementById("card-tpl");

const btnTabSearch = document.getElementById("tabSearch");
const btnTabWatchlist = document.getElementById("tabWatchlist");
const btnTabWatched = document.getElementById("tabWatched");

// Debounce helper
const debounce = (fn, ms = 300) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

// Storage helpers
const loadList = async (key) => (await chrome.storage.sync.get([key]))[key] || [];
const saveList = async (key, arr) => chrome.storage.sync.set({ [key]: arr });

const addTo = async (key, item) => {
  const arr = await loadList(key);
  if (!arr.find(x => x.key === item.key)) {
    arr.push(item);
    await saveList(key, arr);
  }
};

const removeFrom = async (key, tmdbKey) => {
  const arr = await loadList(key);
  const next = arr.filter(x => x.key !== tmdbKey);
  await saveList(key, next);
};

// Proxy GET helper that forwards query to TMDB or OMDb
async function pget(path, params = {}) {
  const url = new URL(PROXY_URL + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// 1) Genres
async function loadGenres() {
  const path = state.type === "movie"
    ? "/tmdb/genre/movie/list"
    : "/tmdb/genre/tv/list";

  const data = await pget(path, { language: "en-US" });
  state.genres = data.genres || [];
  renderGenreOptions();
}


function renderGenreOptions() {
  elGenre.innerHTML = "";
  state.genres.forEach(g => {
    const opt = document.createElement("option");
    opt.value = String(g.id);
    opt.textContent = g.name;
    if (state.selectedGenres.has(g.id)) opt.selected = true;
    elGenre.appendChild(opt);
  });
}

// 2) Search TMDB, then enrich each result with IMDb and providers
const doSearch = debounce(async () => {
  if (state.tab !== "search") return;
  const query = (state.q || "").trim();
  if (!query) { elResults.innerHTML = ""; return; }

  // TMDB multi search by type
  const endpoint = state.type === "movie" ? "/tmdb/search/movie" : "/tmdb/search/tv";
  const genreIds = [...state.selectedGenres].join(",");

  const tmdb = await pget(endpoint, {
    query,
    include_adult: "false",
    language: "en-US",
    page: "1",
    with_genres: genreIds // TMDB honors this on discover endpoint; on search, we filter client side below
  });

  // Client side filter by genres for search results
  let results = (tmdb.results || []).filter(r => {
    if (!genreIds) return true;
    const want = new Set([...state.selectedGenres]);
    return (r.genre_ids || []).some(id => want.has(id));
  });

  // Limit to first 10 for popup
  results = results.slice(0, 10);

  // Enrich each item
  const items = await Promise.all(results.map(async r => {
    const tmdbId = r.id;
    const title = state.type === "movie" ? (r.title || r.original_title) : (r.name || r.original_name);
    const year = (r.release_date || r.first_air_date || "").slice(0, 4);

    // external_ids to get imdb_id
    const extPath = state.type === "movie" ? `/tmdb/movie/${tmdbId}/external_ids` : `/tmdb/tv/${tmdbId}/external_ids`;
    const ext = await pget(extPath);
    const imdbId = ext.imdb_id || null;

    // imdb rating via OMDb
    let imdbRating = null;
    if (imdbId) {
      try {
        const omdb = await pget("/omdb/", { i: imdbId });
        if (omdb && omdb.imdbRating && omdb.imdbRating !== "N/A") {
          imdbRating = omdb.imdbRating;
        }
      } catch (err) {
        console.warn("OMDb lookup failed for", imdbId, err);
        imdbRating = null;  // fail gracefully
      }
    }


    // providers via TMDB
    const provPath = state.type === "movie" ? `/tmdb/movie/${tmdbId}/watch/providers` : `/tmdb/tv/${tmdbId}/watch/providers`;
    const prov = await pget(provPath);
    const us = (prov.results && prov.results[COUNTRY]) || {};
    const offers = [
      ...(us.flatrate || []),
      ...(us.ads || []),
      ...(us.rent || []),
      ...(us.buy || [])
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
      providers: offers.map(o => o.provider_name)
    };
  }));

  renderResults(items.filter(Boolean));
}, 350);

// 3) Render
function renderResults(items) {
  elResults.innerHTML = "";
  items.forEach(item => {
    const node = tplCard.content.firstElementChild.cloneNode(true);
    node.querySelector(".poster").src = item.poster || "";
    node.querySelector(".title").textContent = item.title;
    node.querySelector(".sub").textContent = item.year ? `${item.type.toUpperCase()} • ${item.year}` : item.type.toUpperCase();
    node.querySelector(".imdb").textContent = item.imdbRating ? `IMDb ${item.imdbRating}` : "IMDb N/A";

    const provWrap = node.querySelector(".providers");
    if (item.providers.length === 0) {
      const tag = document.createElement("span");
      tag.className = "provider-tag";
      tag.textContent = "No providers found";
      provWrap.appendChild(tag);
    } else {
      item.providers.slice(0, 8).forEach(p => {
        const tag = document.createElement("span");
        tag.className = "provider-tag";
        tag.textContent = p;
        provWrap.appendChild(tag);
      });
    }

    node.querySelector(".btn-watchlist").addEventListener("click", async () => {
      await addTo("watchlist", item);
      node.querySelector(".btn-watchlist").textContent = "Added";
    });

    node.querySelector(".btn-watched").addEventListener("click", async () => {
      // remove from watchlist if present, then add to watched
      await removeFrom("watchlist", item.key);
      await addTo("watched", item);
      node.querySelector(".btn-watched").textContent = "Marked";
    });

    elResults.appendChild(node);
  });
}

// 4) Tabs
btnTabSearch.addEventListener("click", async () => {
  state.tab = "search";
  btnTabSearch.classList.add("active");
  btnTabWatchlist.classList.remove("active");
  btnTabWatched.classList.remove("active");
  doSearch();
});

btnTabWatchlist.addEventListener("click", async () => {
  state.tab = "watchlist";
  btnTabSearch.classList.remove("active");
  btnTabWatchlist.classList.add("active");
  btnTabWatched.classList.remove("active");
  const items = await loadList("watchlist");
  renderResults(items);
});

btnTabWatched.addEventListener("click", async () => {
  state.tab = "watched";
  btnTabSearch.classList.remove("active");
  btnTabWatchlist.classList.remove("active");
  btnTabWatched.classList.add("active");
  const items = await loadList("watched");
  renderResults(items);
});

// 5) Inputs
elQ.addEventListener("input", e => { state.q = e.target.value; doSearch(); });

elType.addEventListener("change", async e => {
  state.type = e.target.value;
  state.selectedGenres.clear();
  await loadGenres();
  doSearch();
});

elGenre.addEventListener("change", e => {
  state.selectedGenres = new Set([...e.target.selectedOptions].map(o => Number(o.value)));
  doSearch();
});

elOnlyAvail.addEventListener("change", e => {
  state.onlyAvail = e.target.checked;
  doSearch();
});

// init
(async () => {
  await loadGenres();
})();
