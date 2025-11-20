import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8080;

// Validate keys exist
if (!process.env.OMDB_API_KEY) console.warn("Missing OMDB_API_KEY!");
if (!process.env.TMDB_API_KEY) console.warn("Missing TMDB_API_KEY!");

/* -----------------------------
    OMDB PROXY
------------------------------ */
app.get("/omdb", async (req, res) => {
  const url = `https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&${new URLSearchParams(req.query)}`;

  console.log("Proxy request:", url);

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("OMDB error:", err);
    res.status(500).json({ error: "OMDB request failed" });
  }
});

/* -----------------------------
    TMDB GENRES (movies or tv)
------------------------------ */
app.get("/tmdb_genres", async (req, res) => {
  try {
    const type = req.query.type;
    const base = "https://api.themoviedb.org/3/genre";
    const endpoint =
      type === "movie"
        ? `${base}/movie/list?api_key=${process.env.TMDB_API_KEY}&language=en-US`
        : `${base}/tv/list?api_key=${process.env.TMDB_API_KEY}&language=en-US`;

    console.log("Genre request:", endpoint);

    const tmdbRes = await fetch(endpoint);
    const json = await tmdbRes.json();

    res.json(json.genres || []);
  } catch (err) {
    console.error("Genre error:", err);
    res.status(500).json([]);
  }
});


/* -----------------------------
    TMDB DISCOVER (for search)
------------------------------ */
app.get("/tmdb_search", async (req, res) => {
  const searchType = req.query.type === "movie" ? "movie" : "tv";

  const url =
    `https://api.themoviedb.org/3/discover/${searchType}?` +
    new URLSearchParams({
      api_key: process.env.TMDB_API_KEY,
      language: "en-US",
      sort_by: "popularity.desc",
      include_adult: "false",
      include_video: "false",
      page: req.query.page || "1",
      with_genres: req.query.with_genres || "",
      with_watch_providers: req.query.providers || "",
      watch_region: "US",
    });

  console.log("TMDB search request:", url);

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("TMDB search error:", err);
    res.status(500).json({ error: "TMDB search failed" });
  }
});

/* ----------------------------------------
    TMDB EXTERNAL IDS
----------------------------------------- */
app.get("/tmdb_external_ids", async (req, res) => {
  try {
    const type = req.query.type === "movie" ? "movie" : "tv";
    const id = req.query.id;

    if (!id) return res.status(400).json({ error: "Missing id" });

    const url = `https://api.themoviedb.org/3/${type}/${id}/external_ids?api_key=${process.env.TMDB_API_KEY}`;

    console.log("External IDs request:", url);

    const tmdbRes = await fetch(url);
    const json = await tmdbRes.json();

    res.json(json);
  } catch (err) {
    console.error("External IDs error:", err);
    res.status(500).json({ error: "external_ids failed" });
  }
});

/* ----------------------------------------
    TMDB WATCH PROVIDERS
----------------------------------------- */
app.get("/tmdb_providers", async (req, res) => {
  try {
    const type = req.query.type === "movie" ? "movie" : "tv";
    const id = req.query.id;

    if (!id) return res.status(400).json({ error: "Missing id" });

    const url = `https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${process.env.TMDB_API_KEY}`;

    console.log("Providers request:", url);

    const tmdbRes = await fetch(url);
    const json = await tmdbRes.json();

    res.json(json);
  } catch (err) {
    console.error("Provider error:", err);
    res.status(500).json({ error: "providers failed" });
  }
});


/* -----------------------------
    START SERVER
------------------------------ */
app.listen(PORT, () => {
  console.log(`Stream Scout Proxy running at http://localhost:${PORT}`);
});
