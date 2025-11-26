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
  "Content-Type": "application/json;charset=utf-8"
};

/* -----------------------------
   OMDB
------------------------------ */
app.get("/omdb", async (req, res) => {
  const url =
    "https://www.omdbapi.com/?" +
    new URLSearchParams({
      apikey: OMDB,
      ...req.query
    });

  console.log("OMDb request:", url);

  try {
    const r = await fetch(url);
    res.json(await r.json());
  } catch (err) {
    console.error("OMDb error:", err);
    res.status(500).json({ error: "OMDb request failed" });
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
   TMDB search
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

app.post("/ai_recommend", async (req, res) => {
  try {
    const body = req.body; // { title, year, type, mood, ... }

    // Call OpenAI or your model here using body.title etc
    // Then map to a structure like:
    // { items: [{ key, title, year, type, imdbRating, providers }] }

    res.json({ items: [] }); // placeholder
  } catch (err) {
    console.error("ai_recommend error", err);
    res.status(500).json({ error: "AI recommend failed" });
  }
});


app.listen(PORT, () => {
  console.log(`Stream Scout Proxy running at http://localhost:${PORT}`);
});


