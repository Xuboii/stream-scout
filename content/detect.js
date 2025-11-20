// detect.js
console.log("Stream Scout detect.js loaded on", location.href);

// --- Helpers ---
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

// Extract IMDb ID from URL
function extractIMDbID() {
  const match = location.pathname.match(/\/title\/(tt\d{7,8})/);
  return match ? match[1] : null;
}

// Primary title detection (clean)
function detectTitle() {
  // IMDb renders the title in a <h1 data-testid="hero-title-block__title">
  const el = document.querySelector('[data-testid="hero-title-block__title"]');
  if (el) return el.textContent.trim();

  // Fallback to <title>
  const raw = document.title || "";
  const m = raw.match(/^(.*?)\s*\(/);
  return m ? m[1].trim() : null;
}

// Year detection
function detectYear() {
  // IMDb renders the year in the hero metadata list
  const yearNode = document.querySelector('[data-testid="hero-title-block__metadata"] li');
  if (yearNode) {
    const y = yearNode.textContent.trim().slice(0, 4);
    if (/^\d{4}$/.test(y)) return y;
  }

  // Fallback to document.title
  const m = document.title.match(/\((\d{4})\)/);
  return m ? m[1] : null;
}

// Send message to injector
async function sendDetectedInfo() {
  const imdbId = extractIMDbID();
  if (!imdbId) {
    console.warn("Stream Scout: Could not detect IMDb ID. Not an IMDb title page.");
    return;
  }

  // Wait for title block to render (React loads slow)
  await waitForDOM('[data-testid="hero-title-block__title"]');

  const title = detectTitle();
  const year = detectYear();

  console.log("Stream Scout detected:", { imdbId, title, year });

  chrome.runtime.sendMessage({
    action: "STREAM_SCOUT_DETECTED",
    imdbId,
    title,
    year
  });
}

sendDetectedInfo();
