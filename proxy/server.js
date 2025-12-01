// server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8080;

// Load keys
const OMDB = process.env.OMDB_API_KEY;
const TMDB_V4 = process.env.TMDB_V4_TOKEN;

if (!OMDB) console.warn("Missing OMDB_API_KEY!");
if (!TMDB_V4) console.warn("Missing TMDB_V4_TOKEN!");

const TMDB_HEADERS = {
  Authorization: `Bearer ${TMDB_V4}`,
  "Content-Type": "application/json;charset=utf-8",
};

/* -----------------------------
   OMDB
------------------------------ */
app.get("/omdb", async (req, res) => {
  const url =
    "https://www.omdbapi.com/?" +
    new URLSearchParams({
      apikey: OMDB,
      ...req.query,
    });

  console.log("OMDb request:", url);

  try {
    const r = await fetch(url);
    const text = await r.text();

    // If OMDb returned HTML, error page, or anything not JSON
    // Common HTML error pages start with "<"
    if (!text.trim().startsWith("{")) {
      console.warn("OMDb returned non JSON:", text.slice(0, 200));
      return res.json({
        Response: "False",
        Error: "OMDb returned invalid response",
      });
    }

    // Now we safely parse
    const json = JSON.parse(text);
    return res.json(json);

  } catch (err) {
    console.error("OMDb error:", err);
    return res.json({
      Response: "False",
      Error: "OMDb request failed",
    });
  }
});


/* -----------------------------
   TMDB genres
------------------------------ */
app.get("/tmdb_genres", async (req, res) => {
  try {
    const type = req.query.type === "tv" ? "tv" : "movie";
    const endpoint = `https://api.themoviedb.org/3/genre/${type}/list?language=en-US`;

    console.log("Genre request:", endpoint);

    const r = await fetch(endpoint, { headers: TMDB_HEADERS });
    const json = await r.json();
    res.json(json.genres || []);
  } catch (err) {
    console.error("Genre error:", err);
    res.status(500).json([]);
  }
});

/* -----------------------------
   TMDB search (title search)
------------------------------ */
app.get("/tmdb_search", async (req, res) => {
  try {
    const type = req.query.type === "tv" ? "tv" : "movie";

    const url = new URL(`https://api.themoviedb.org/3/search/${type}`);
    url.searchParams.set("query", req.query.query || "");
    url.searchParams.set("language", "en-US");
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("page", req.query.page || "1");

    console.log("TMDB search request:", url.toString());

    const r = await fetch(url.toString(), { headers: TMDB_HEADERS });
    res.json(await r.json());
  } catch (err) {
    console.error("TMDB search error:", err);
    res.status(500).json({ error: "TMDB search failed" });
  }
});

/* -----------------------------
   TMDB discover (top rated / filter only searches)
------------------------------ */
app.get("/tmdb_discover", async (req, res) => {
  try {
    const type = req.query.type === "tv" ? "tv" : "movie";

    const url = new URL(`https://api.themoviedb.org/3/discover/${type}`);
    url.searchParams.set("language", "en-US");
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("page", req.query.page || "1");
    url.searchParams.set("sort_by", req.query.sort_by || "vote_average.desc");

    if (req.query.with_genres) {
      url.searchParams.set("with_genres", req.query.with_genres);
    }

    if (req.query.vote_average_gte) {
      url.searchParams.set("vote_average.gte", req.query.vote_average_gte);
    }

    if (req.query.vote_count_gte) {
      url.searchParams.set("vote_count.gte", req.query.vote_count_gte);
    }

    if (req.query.with_watch_providers) {
      url.searchParams.set(
        "with_watch_providers",
        req.query.with_watch_providers
      );
      url.searchParams.set("watch_region", req.query.watch_region || "US");
    }

    console.log("TMDB discover request:", url.toString());

    const r = await fetch(url.toString(), { headers: TMDB_HEADERS });
    res.json(await r.json());
  } catch (err) {
    console.error("TMDB discover error:", err);
    res.status(500).json({ error: "TMDB discover failed" });
  }
});

/* -----------------------------
   TMDB external IDs
------------------------------ */
app.get("/tmdb_external_ids", async (req, res) => {
  try {
    const type = req.query.type === "tv" ? "tv" : "movie";
    const id = req.query.id;

    const url = `https://api.themoviedb.org/3/${type}/${id}/external_ids`;

    console.log("TMDB external_ids request:", url);

    const r = await fetch(url, { headers: TMDB_HEADERS });
    res.json(await r.json());
  } catch (err) {
    console.error("TMDB external_ids error:", err);
    res.status(500).json({ error: "TMDB external_ids failed" });
  }
});

/* -----------------------------
   TMDB watch providers
------------------------------ */
app.get("/tmdb_providers", async (req, res) => {
  try {
    const type = req.query.type === "tv" ? "tv" : "movie";
    const id = req.query.id;

    const url = `https://api.themoviedb.org/3/${type}/${id}/watch/providers`;

    console.log("TMDB providers request:", url);

    const r = await fetch(url, { headers: TMDB_HEADERS });
    res.json(await r.json());
  } catch (err) {
    console.error("TMDB providers error:", err);
    res.status(500).json({ error: "TMDB providers failed" });
  }
});

/* -----------------------------
   AI recommend
------------------------------ */
app.post("/ai_recommend", async (req, res) => {
  try {
    const { title, year, type, mood, watchedProfile } = req.body;

    // Build description from watched list
    let watchedLines = "";
    if (Array.isArray(watchedProfile) && watchedProfile.length > 0) {
      watchedLines = watchedProfile
        .map(w => `${w.title} (${w.year}) rated ${w.score}/10`)
        .join("; ");
    }

    const userMood = mood?.trim() || "";

    const prompt = `
    You are a film recommendation engine.

    User's past ratings:
    ${watchedLines || "No ratings provided"}

    Primary anchor title:
    ${title} (${year})

    User mood or preference:
    "${userMood}"

    Generate exactly 5 recommendations.
    Each recommendation MUST include:
    - title
    - year
    - type (movie or tv)
    - imdbId
    - reason (why they would like it based on past scores)

    Return ONLY a JSON array like:
    [
      {
        "title": "Example",
        "year": "2014",
        "type": "movie",
        "imdbId": "tt1234567",
        "reason": "Because you liked..."
      }
    ]
    `.trim();


    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
      }),
    });

    const data = await r.json();
    if (!data.choices || !data.choices.length) {
      return res.json({ items: [] });
    }

    // CLEAN AI OUTPUT
    let text = data.choices[0].message.content.trim();

    text = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .replace(/^\s*json/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error("Cleaned AI text:", text);
      console.error("Parse error:", err);
      return res.json({ items: [] });
    }

    if (!Array.isArray(parsed)) {
      return res.json({ items: [] });
    }

    // Convert results into full Stream Scout format
    const finalItems = [];

    for (const entry of parsed) {
      if (!entry.imdbId) continue;

      const omdbURL =
        "https://www.omdbapi.com/?" +
        new URLSearchParams({
          apikey: OMDB,
          i: entry.imdbId,
        });

      const omdb = await fetch(omdbURL).then((r) => r.json());
      if (!omdb || omdb.Response === "False") continue;

      const tmdbType = omdb.Type === "series" ? "tv" : "movie";

      const searchURL = new URL(
        `https://api.themoviedb.org/3/search/${tmdbType}`
      );
      searchURL.searchParams.set("query", omdb.Title);
      searchURL.searchParams.set("language", "en-US");
      searchURL.searchParams.set("include_adult", "false");
      searchURL.searchParams.set("page", "1");

      const tmdbSearch = await fetch(searchURL, {
        headers: TMDB_HEADERS,
      }).then((r) => r.json());

      const match = tmdbSearch.results?.[0];
      if (!match) continue;

      const tmdbId = match.id;

      // Providers
      let providers = [];
      try {
        const provURL = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/watch/providers`;
        const prov = await fetch(provURL, {
          headers: TMDB_HEADERS,
        }).then((r) => r.json());
        const us = prov.results?.US || {};
        const offers = [
          ...(us.flatrate || []),
          ...(us.ads || []),
          ...(us.rent || []),
          ...(us.buy || []),
        ];
        providers = offers.map((o) => o.provider_name);
      } catch {}

      finalItems.push({
        key: `${tmdbType}:${tmdbId}`,
        tmdbId,
        imdbId: entry.imdbId,
        title: omdb.Title,
        year: omdb.Year?.slice(0, 4) || "",
        type: tmdbType,
        imdbRating:
          omdb.imdbRating && omdb.imdbRating !== "N/A"
            ? omdb.imdbRating
            : null,
        providers,
      });
    }

    return res.json({ items: finalItems });
  } catch (err) {
    console.error("ai_recommend error", err);
    res.status(500).json({ error: "AI recommend failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Stream Scout Proxy running at http://localhost:${PORT}`);
});
