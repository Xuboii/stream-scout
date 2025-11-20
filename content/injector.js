// content/injector.js
console.log("Stream Scout content script loaded on", location.href);

// ---------- Helpers ----------

// Wait for something in the DOM (useful because IMDb is React)
function waitForDOM(selector, timeout = 5000) {
  return new Promise(resolve => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);

    const observer = new MutationObserver(() => {
      const node = document.querySelector(selector);
      if (node) {
        observer.disconnect();
        resolve(node);
      }
    });

    observer.observe(document, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Extract IMDb ID from URL like /title/tt1375666/
function extractIMDbID() {
  const match = location.pathname.match(/\/title\/(tt\d{7,8})/);
  return match ? match[1] : null;
}

// Title detection
function detectTitle() {
  // IMDb hero title element
  const el = document.querySelector('[data-testid="hero-title-block__title"]');
  if (el) return el.textContent.trim();

  // Fallback to document.title
  const raw = document.title || "";
  const m = raw.match(/^(.*?)\s*\(/);
  return m ? m[1].trim() : raw.trim();
}

// Year detection
function detectYear() {
  // First metadata item under hero title (usually year)
  const yearNode = document.querySelector(
    '[data-testid="hero-title-block__metadata"] li'
  );
  if (yearNode) {
    const y = yearNode.textContent.trim().slice(0, 4);
    if (/^\d{4}$/.test(y)) return y;
  }

  // Fallback to document.title
  const m = document.title.match(/\((\d{4})\)/);
  return m ? m[1] : null;
}

// Create the floating panel
function createPanel() {
  const box = document.createElement("div");
  box.id = "stream-scout-panel";

  Object.assign(box.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    padding: "12px 16px",
    background: "white",
    color: "black",
    fontSize: "14px",
    fontFamily: "Arial, sans-serif",
    borderRadius: "8px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
    zIndex: 999999999,
    maxWidth: "260px",
    lineHeight: "1.35",
    cursor: "default",
    border: "1px solid #ddd"
  });

  box.innerHTML = `
    <div style="font-weight: bold; font-size: 15px; margin-bottom: 6px;">Stream Scout</div>
    <div id="ss-title" style="font-weight: 600; margin-bottom: 4px;"></div>
    <div id="ss-year" style="color: #666; margin-bottom: 4px;"></div>
    <div id="ss-rating" style="color: #444; margin-bottom: 8px;">IMDb rating: …</div>
    <div id="ss-status" style="color: #333; font-size: 13px;"></div>
  `;

  document.body.appendChild(box);
  return box;
}

// ---------- Main flow ----------

(async function init() {
  // Only run on real title pages
  const imdbId = extractIMDbID();
  if (!imdbId) {
    console.log("Stream Scout: no IMDb ID found on this page. Skipping.");
    return;
  }

  // Wait for React title block to exist
  await waitForDOM('[data-testid="hero-title-block__title"]', 5000);

  const title = detectTitle();
  const year = detectYear();

  console.log("Stream Scout detected:", { imdbId, title, year });

  const panel = createPanel();
  panel.querySelector("#ss-title").textContent = title || "Unknown title";
  panel.querySelector("#ss-year").textContent =
    year ? `Year: ${year}` : "Year unknown";
  panel.querySelector("#ss-rating").textContent = "IMDb rating: …";
  panel.querySelector("#ss-status").textContent = "Fetching rating…";

  // Call your local proxy (make sure proxy is running on port 8080)
  const url = `http://localhost:8080/omdb/?i=${encodeURIComponent(imdbId)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }
    const data = await res.json();

    if (data && data.imdbRating && data.imdbRating !== "N/A") {
      panel.querySelector("#ss-rating").textContent =
        "IMDb rating: " + data.imdbRating;
    } else {
      panel.querySelector("#ss-rating").textContent = "IMDb rating: N/A";
    }

    panel.querySelector("#ss-status").textContent = "";
  } catch (err) {
    console.warn("Stream Scout rating fetch error", err);
    panel.querySelector("#ss-status").textContent = "Failed to fetch data";
  }
})();
