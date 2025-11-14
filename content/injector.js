import { detectTitleAndYear } from "./detect.js";

const TMDB_IMG = "https://image.tmdb.org/t/p/w92";
const COUNTRY = "US";
const PROXY = "https://your-proxy.example.com";

async function pget(path, params = {}) {
  const url = new URL(PROXY + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function lookup(title, typeHint) {
  // 1) search TMDB
  const searchPath = typeHint === "tv" ? "/tmdb/search/tv" : "/tmdb/search/movie";
  const s = await pget(searchPath, { query: title, include_adult: "false", language: "en-US", page: "1" });
  const hit = (s.results || [])[0];
  if (!hit) return null;

  const tmdbId = hit.id;
  const type = typeHint || (hit.media_type === "tv" ? "tv" : "movie");

  // 2) map to IMDb
  const ext = await pget(type === "tv" ? `/tmdb/tv/${tmdbId}/external_ids` : `/tmdb/movie/${tmdbId}/external_ids`);
  const imdbId = ext.imdb_id || "";

  // 3) OMDb rating
  let imdbRating = null;
  if (imdbId) {
    const o = await pget("/omdb/", { i: imdbId });
    if (o && o.imdbRating && o.imdbRating !== "N/A") imdbRating = o.imdbRating;
  }

  // 4) providers
  const prov = await pget(type === "tv" ? `/tmdb/tv/${tmdbId}/watch/providers` : `/tmdb/movie/${tmdbId}/watch/providers`);
  const us = (prov.results && prov.results[COUNTRY]) || {};
  const offers = [
    ...(us.flatrate || []),
    ...(us.ads || []),
    ...(us.rent || []),
    ...(us.buy || [])
  ];
  const providers = offers.map(o => o.provider_name);

  return {
    tmdbId,
    imdbId,
    imdbRating,
    title: type === "tv" ? hit.name || hit.original_name : hit.title || hit.original_title,
    year: (hit.release_date || hit.first_air_date || "").slice(0, 4),
    poster: hit.poster_path ? TMDB_IMG + hit.poster_path : "",
    type,
    providers
  };
}

function renderPanel(info) {
  if (!info) return;

  const root = document.createElement("div");
  root.className = "ss-panel";
  root.innerHTML = `
    <img class="ss-poster" src="${info.poster}" alt="">
    <div class="ss-meta">
      <div class="ss-title">${info.title}</div>
      <div class="ss-sub">${info.type.toUpperCase()} ${info.year ? " • " + info.year : ""}</div>
      <div class="ss-imdb">${info.imdbRating ? "IMDb " + info.imdbRating : "IMDb N/A"}</div>
      <div class="ss-providers"></div>
      <div class="ss-actions">
        <button id="ss-watchlist">Add to Watchlist</button>
        <button id="ss-watched">Mark Watched</button>
      </div>
    </div>
  `;
  const host = document.body;
  host.appendChild(root);

  const wrap = root.querySelector(".ss-providers");
  if (info.providers.length === 0) {
    wrap.innerHTML = `<span class="ss-tag">No providers found</span>`;
  } else {
    wrap.innerHTML = info.providers.slice(0, 10).map(p => `<span class="ss-tag">${p}</span>`).join("");
  }

  // storage sync
  const key = `${info.type}:${info.tmdbId}`;
  document.getElementById("ss-watchlist").onclick = async () => {
    const cur = (await chrome.storage.sync.get(["watchlist"])).watchlist || [];
    if (!cur.find(x => x.key === key)) cur.push({ key, ...info });
    await chrome.storage.sync.set({ watchlist: cur });
  };
  document.getElementById("ss-watched").onclick = async () => {
    const wl = (await chrome.storage.sync.get(["watchlist"])).watchlist || [];
    const watched = (await chrome.storage.sync.get(["watched"])).watched || [];
    const nextWl = wl.filter(x => x.key !== key);
    if (!watched.find(x => x.key === key)) watched.push({ key, ...info, addedAt: Date.now() });
    await chrome.storage.sync.set({ watchlist: nextWl, watched });
  };
}

(async () => {
  const detected = detectTitleAndYear();
  if (!detected) return;
  try {
    const info = await lookup(detected.title, detected.type);
    renderPanel(info);
  } catch {}
})();
