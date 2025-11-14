import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// CORS handling
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.startsWith("chrome-extension://")) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    }
  })
);

// Health check
app.get("/", (req, res) => {
  res.json({ ok: true, service: "Stream Scout Proxy" });
});

// TMDB forwarder
app.get("/tmdb/*", async (req, res) => {
  try {
    const actualPath = req.path.replace("/tmdb", "");
    const targetUrl =
      "https://api.themoviedb.org/3" +
      actualPath +
      "?" +
      new URLSearchParams(req.query);

    const upstream = await fetch(targetUrl, {
      headers: {
        Authorization: "Bearer " + process.env.TMDB_BEARER,
        Accept: "application/json"
      }
    });

    const text = await upstream.text();
    res.set("Cache-Control", "public, max-age=3600");
    res.status(upstream.status).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// OMDb forwarder
app.get("/omdb/", async (req, res) => {
  try {
    const params = new URLSearchParams({
      ...req.query,
      apikey: process.env.OMDB_KEY
    });

    const targetUrl = "https://www.omdbapi.com/?" + params.toString();
    const upstream = await fetch(targetUrl);
    const text = await upstream.text();

    res.set("Cache-Control", "public, max-age=3600");
    res.status(upstream.status).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Special dynamic provider list for side panel
app.get("/tmdb/watch/providers", async (req, res) => {
  try {
    const type = req.query.type; // movie or tv
    const region = req.query.region;

    const endpoint =
      type === "tv"
        ? "/watch/providers/tv"
        : "/watch/providers/movie";

    const targetUrl =
      "https://api.themoviedb.org/3" + endpoint + "?watch_region=" + region;

    const upstream = await fetch(targetUrl, {
      headers: {
        Authorization: "Bearer " + process.env.TMDB_BEARER
      }
    });

    const json = await upstream.json();
    res.set("Cache-Control", "public, max-age=86400");
    res.json(json);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log("Proxy running on port", PORT);
});
