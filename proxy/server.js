// server.js (ESM version)
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 8080;

// Your keys
const TMDB_KEY = process.env.TMDB_KEY;
const OMDB_KEY = process.env.OMDB_KEY;
const EXT_ID = process.env.EXT_ID;

// Allowed origins
const allowedOrigins = [
  "chrome-extension://" + EXT_ID,
  "https://www.imdb.com",
  "https://imdb.com",
  "https://m.imdb.com",
  "https://www.netflix.com",
  "https://www.disneyplus.com",
  "https://www.hulu.com",
  "https://www.primevideo.com",
  "http://localhost",
  "http://localhost:8080",
  "https://localhost",
];

// CORS
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (origin.endsWith(".imdb.com")) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS: " + origin));
    },
  })
);

// Logging
app.use((req, res, next) => {
  console.log("Proxy request:", req.method, req.url);
  next();
});

// TMDB Proxy
app.get("/tmdb/*", async (req, res) => {
  const tmdbPath = req.params[0];
  const qs = new URLSearchParams(req.query);
  qs.set("api_key", TMDB_KEY);

  const url = `https://api.themoviedb.org/3/${tmdbPath}?${qs.toString()}`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "TMDB fetch failed", details: err.message });
  }
});

// OMDb Proxy
app.get("/omdb/", async (req, res) => {
  const qs = new URLSearchParams(req.query);
  qs.set("apikey", OMDB_KEY);

  const url = `https://www.omdbapi.com/?${qs.toString()}`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "OMDb fetch failed", details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Stream Scout Proxy running at http://localhost:${PORT}`);
});
