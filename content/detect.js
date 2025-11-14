// Try JSON-LD first, then fall back to common selectors
export function detectTitleAndYear() {
  // JSON-LD on many media pages
  for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(el.textContent.trim());
      const node = Array.isArray(data) ? data.find(x => x["@type"] === "Movie" || x["@type"] === "TVSeries") : data;
      if (node && (node.name || node.title)) {
        const title = node.name || node.title;
        const year = (node.datePublished || node.startDate || "").slice(0, 4);
        const type = node["@type"] === "TVSeries" ? "tv" : "movie";
        return { title, year, type };
      }
    } catch {}
  }

  // IMDb fallback
  const imdbTitle = document.querySelector("h1[data-testid='hero-title-block__title']");
  if (imdbTitle) {
    const sub = document.querySelector("ul[data-testid='hero-title-block__metadata'] li");
    const year = sub ? sub.textContent.match(/\d{4}/)?.[0] : "";
    // Heuristic: if page has episodes nav then call it TV
    const type = document.querySelector("[data-testid='episodes-header']") ? "tv" : "movie";
    return { title: imdbTitle.textContent.trim(), year, type };
  }

  // TMDB fallback
  const tmdbTitle = document.querySelector("h2 a[href*='/movie/'], h2 a[href*='/tv/']");
  if (tmdbTitle) {
    const type = tmdbTitle.href.includes("/tv/") ? "tv" : "movie";
    return { title: tmdbTitle.textContent.trim(), year: "", type };
  }

  // Netflix and others would need per-site tweaks. Return null if unknown.
  return null;
}
