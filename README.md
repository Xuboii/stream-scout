Stream Scout

Stream Scout is a Chrome extension that helps users discover movies and TV shows across streaming platforms, manage watchlists, and get AI powered recommendations based on their viewing history and preferences.
It combines a modern Chrome extension (Manifest V3) with a deployed Node.js backend to securely integrate third party APIs and AI services.

Features
Search for movies and TV shows using filters like genre, streaming provider, and IMDb rating
Automatically detect IMDb title pages and display a contextual side panel
Add titles to Watchlist or Watched lists with personal ratings
Store user data locally using Chrome Sync storage
Generate AI powered recommendations based on watched titles and user mood
Omnibox support (type ss in the Chrome address bar to search)
Context menu integration for quick lookups

Architecture Overview

**Chrome Extension (Manifest V3)**
- Popup UI
  - Search and filtering
  - Watchlist and Watched management
  - AI recommendations
- Side Panel UI
  - Contextual IMDb title detection
- Service Worker
  - Omnibox integration
  - Context menu actions
  - Side panel orchestration
- Chrome Storage (Sync)
  - Watchlist
  - Watched titles
  - User ratings

**Backend Proxy (Railway)**
- Node.js and Express
- OMDb API integration
- TMDb API integration
- OpenAI API integration

The extension never exposes API keys. All external API calls are routed through a hosted proxy backend.

Live Backend (Deployment Proof)
The backend proxy server is deployed on Railway and running continuously.
Health check endpoint:
https://proxyserver-production-6b19.up.railway.app/health
A successful response confirms the backend is live and operational.

Tech Stack
Frontend (Chrome Extension)
JavaScript (ES modules)
Chrome Extension Manifest V3
Chrome Side Panel API with fallback injection
Chrome Storage Sync API
Backend
Node.js
Express

Hosted on Railway
Integrates OMDb, TMDb, and OpenAI APIs
Installation (Local, Unpacked)
This extension is intentionally not published to the Chrome Web Store and is meant to be installed unpacked for development and portfolio demonstration.

How to Download this Extension for Use:
Clone this repository
Open Chrome and navigate to:

chrome://extensions

Enable Developer mode (top right)
Click Load unpacked
Select the root folder containing manifest.json
The extension will appear in the toolbar
The extension will function immediately using the deployed backend.

Usage

Click the Stream Scout icon to open the popup
Search for movies or TV shows with filters
Add items to Watchlist or Watched and rate them
Open any IMDb title page to see the Stream Scout side panel
Use the Recommended tab to get AI suggestions based on your history
Type ss <query> in the Chrome address bar for quick searches

Data and Privacy
No personal data is sold or shared
Watchlists, watched titles, and ratings are stored locally using Chrome Sync
Search queries and recommendation prompts are sent to the backend only to fetch results and generate AI recommendations
API keys are stored securely on the backend and never exposed to the extension
Why It Is Not on the Chrome Web Store
This project is intended as a portfolio demonstration of:
Chrome extension architecture
Backend API proxying
Secure third party API integration
AI powered recommendation logic
Publishing to the Chrome Web Store was not required to demonstrate deployment, functionality, or production readiness.

Future Improvements

Optional Chrome Web Store unlisted publication, 
Rate limiting and authentication on the backend, 
User configurable recommendation profiles, 
Support for additional streaming regions, 
Public demo video walkthrough

Author
Built by Eric Xu

This project demonstrates full stack development across browser extensions, backend services, and cloud deployment.
