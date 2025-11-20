import { pget, loadList, saveList, addTo, removeFrom } from "./shared.js";
// shared.js will contain your pget and storage utilities.
// If you have not made shared.js yet, I can generate it for you.

const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const COUNTRY = "US";

const state = {
  q: "",
  type: "movie",
  genres: [],
  selectedGenres: new Set(),
  sort: "popularity",
  onlyAvail: false,
  providerFilters: new Set(),
  page: 1,
  loading: false,
  lastResults: []
};

// DOM
const elQ = document.getElementById("q");
const elType = document.getElementById("type");
const elGenre = document.getElementById("genre");
const elSort = document.getElementById("sort");
const elOnlyAvail = document.getElementById("onlyAvail");
const elProviders = document.getElementById("providerFilters");
const elResults = document.getElementById("results");
const elLoadMore = document.getElementById("loadMore");
const tplCard = document.getElementById("card-tpl");

async function loadGenres() {
  const path = state.type === "movie" ? "/tmdb/genre/movie/list" : "/tmdb/genre/tv/list";
  const data = await pget(path, { language: "en-US" });
  state.genres = data.genres || [];
  renderGenreOptions();
}

function renderGenreOptions() {
  elGenre.innerHTML = "";
  state.genres.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = g.name;
    if (state.selectedGenres.has(g.id)) opt.selected = true;
    elGenre.appendChild(opt);
  });
}

async function loadProviders() {
  const data = await pget("/tmdb/watch/providers", { type: state.type, region: COUNTRY });
  const list = data.results || [];
  elProviders.innerHTML = "";
  list.forEach(p => {
    const chip = document.createElement("span");
    chip.className = "provider-chip";
    chip.textContent = p.provider_name;
    chip.dataset.id = p.provider_id;
    chip.onclick = () => toggleProviderFilter(p.provider_id, chip);
    elProviders.appendChild(chip);
  });
}

function toggleProviderFilter(id, chip) {
  if (state.providerFilters.has(id)) {
    state.providerFilters.delete(id);
    chip.classList.remove("active");
  } else {
    state.providerFilters.add(id);
    chip.classList.add("active");
  }
  resetAndSearch();
}

function resetAndSearch() {
  state.page = 1;
  state.lastResults = [];
  elResults.innerHTML = "";
  doSearch();
}

async function doSearch() {
  if (state.loading) return;
  state.loading = true;

  const query = state.q.trim();
  if (!query) {
    elResults.innerHTML = "";
    state.loading = false;
    return;
  }

  const endpoint = state.type === "movie" ? "/tmdb/search/movie" : "/tmdb/search/tv";
  const genreIds = [...state.selectedGenres].join(",");

  const tmdb = await pget(endpoint, {
    query,
    include_adult: "false",
    language: "en-US",
    page: state.page
  });

  let results = (tmdb.results || []).map(r => ({
    ...r,
    tmdbId: r.id,
    title: state.type === "movie" ? (r.title || r.original_title) : (r.name || r.original_name),
    year: (r.release_date || r.first_air_date || "").slice(0, 4),
    poster: r.poster_path ? TMDB_IMG + r.poster_path : "",
    popularity: r.popularity || 0,
    genre_ids: r.genre_ids || []
  }));

  if (genreIds) {
    const want = new Set([...state.selectedGenres]);
    results = results.filter(r => r.genre_ids.some(id => want.has(id)));
  }

  const enriched = await Promise.all(results.map(async item => {
    const type = state.type;
    const ext = await pget(type === "movie" ? `/tmdb/movie/${item.tmdbId}/external_ids` : `/tmdb/tv/${item.tmdbId}/external_ids`);
    const imdbId = ext.imdb_id || null;

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

    const prov = await pget(type === "movie" ? `/tmdb/movie/${item.tmdbId}/watch/providers` : `/tmdb/tv/${item.tmdbId}/watch/providers`);
    const us = (prov.results && prov.results[COUNTRY]) || {};
    const offers = [
      ...(us.flatrate || []),
      ...(us.ads || []),
      ...(us.rent || []),
      ...(us.buy || [])
    ];
    const providers = offers.map(o => o.provider_name);
    const providerIds = offers.map(o => o.provider_id);

    if (state.onlyAvail && providers.length === 0) return null;

    if (state.providerFilters.size > 0) {
      const set = new Set(providerIds);
      const hit = [...state.providerFilters].some(id => set.has(id));
      if (!hit) return null;
    }

    return {
      key: `${type}:${item.tmdbId}`,
      type,
      tmdbId: item.tmdbId,
      title: item.title,
      year: item.year,
      poster: item.poster,
      imdbId,
      imdbRating,
      providers,
      popularity: item.popularity
    };
  }));

  let items = enriched.filter(Boolean);

  if (state.sort === "rating") {
    items.sort((a, b) => (parseFloat(b.imdbRating || 0) - parseFloat(a.imdbRating || 0)));
  } else if (state.sort === "year") {
    items.sort((a, b) => (parseInt(b.year || 0) - parseInt(a.year || 0)));
  } else if (state.sort === "title") {
    items.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    items.sort((a, b) => b.popularity - a.popularity);
  }

  state.lastResults.push(...items);
  renderResults(items);

  state.loading = false;
}

function renderResults(items) {
  items.forEach(item => {
    const node = tplCard.content.firstElementChild.cloneNode(true);
    node.querySelector(".poster").src = item.poster;
    node.querySelector(".title").textContent = item.title;
    node.querySelector(".sub").textContent = `${item.type.toUpperCase()} ${item.year ? " • " + item.year : ""}`;
    node.querySelector(".imdb").textContent = item.imdbRating ? "IMDb " + item.imdbRating : "IMDb N/A";

    const wrap = node.querySelector(".providers");
    if (item.providers.length === 0) {
      wrap.innerHTML = `<span class="provider-tag">No providers</span>`;
    } else {
      wrap.innerHTML = item.providers.slice(0, 10)
        .map(p => `<span class="provider-tag">${p}</span>`)
        .join("");
    }

    node.querySelector(".btn-watchlist").onclick = async () => {
      await addTo("watchlist", item);
    };

    node.querySelector(".btn-watched").onclick = async () => {
      await removeFrom("watchlist", item.key);
      await addTo("watched", item);
    };

    elResults.appendChild(node);
  });
}

// event handlers
elQ.addEventListener("input", e => { state.q = e.target.value; resetAndSearch(); });
elType.addEventListener("change", async e => {
  state.type = e.target.value;
  state.selectedGenres.clear();
  state.providerFilters.clear();
  await loadGenres();
  await loadProviders();
  resetAndSearch();
});
elGenre.addEventListener("change", e => {
  state.selectedGenres = new Set([...e.target.selectedOptions].map(o => Number(o.value)));
  resetAndSearch();
});
elSort.addEventListener("change", e => { state.sort = e.target.value; resetAndSearch(); });
elOnlyAvail.addEventListener("change", e => { state.onlyAvail = e.target.checked; resetAndSearch(); });
elLoadMore.addEventListener("click", () => {
  state.page += 1;
  doSearch();
});

// init
(async () => {
  await loadGenres();
  await loadProviders();
})();
