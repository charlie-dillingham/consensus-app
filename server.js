/**
 * server.js
 * ---------
 * This is the Express backend — the piece your meal planner app didn't need.
 *
 * WHY WE NEED A BACKEND HERE (worth understanding, since it's new):
 * A static frontend (plain HTML/CSS/JS running in your browser) can't safely
 * or reliably do two things this app needs:
 *   1. Call the Claude API with your secret key. If that key lived in
 *      frontend JS, anyone who opened your site's dev tools could steal it
 *      and rack up charges on your account. Keeping it server-side (as an
 *      environment variable, injected via Replit Secrets) means it never
 *      reaches the browser at all.
 *   2. Keep the whole "fetch data, then ask Claude" flow off the browser's
 *      plate — the browser just asks our own server one question and gets
 *      one answer back, rather than juggling two API calls itself.
 *
 * So: Express is a small Node.js library for building a server that (a)
 * serves your static frontend files, and (b) exposes a few API routes
 * (/api/...) that the frontend's JS calls with fetch(), which the server
 * then fulfills using stackexchange.js and claude.js.
 */

const express = require("express");
const path = require("path");

const { fetchSiteQuestions, StackExchangeFetchError } = require("./stackexchange");
const { synthesizeAnswer } = require("./claude");
const { getSites, addSite, removeSite } = require("./storage");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Site list management ---------------------------------------------

app.get("/api/sites", async (req, res) => {
  const list = await getSites();
  res.json({ sites: list });
});

app.post("/api/sites", async (req, res) => {
  try {
    const list = await addSite(req.body?.name);
    res.json({ sites: list });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/sites/:name", async (req, res) => {
  const list = await removeSite(req.params.name);
  res.json({ sites: list });
});

// --- Chat / question answering --------------------------------------------

app.post("/api/ask", async (req, res) => {
  const { site, question } = req.body || {};

  if (!site || !question) {
    return res.status(400).json({ error: "Both 'site' and 'question' are required." });
  }

  try {
    const questions = await fetchSiteQuestions(site, { sort: "activity", limit: 25 });
    const { answer } = await synthesizeAnswer(site, question, questions);

    res.json({
      answer,
      sources: questions.map((q, i) => ({
        num: i + 1,
        title: q.title,
        url: q.link,
        score: q.score,
      })),
    });
  } catch (err) {
    if (err instanceof StackExchangeFetchError) {
      // These are "expected" failure modes (bad site slug, throttling, etc.)
      // — surface a clean message instead of a generic 500.
      const statusMap = { NOT_FOUND: 404, RATE_LIMITED: 429 };
      return res.status(statusMap[err.code] || 502).json({ error: err.message, code: err.code });
    }
    console.error("Unexpected error in /api/ask:", err);
    res.status(500).json({ error: "Something went wrong on the server. Check the Replit console for details." });
  }
});

app.listen(PORT, () => {
  console.log(`Consensus app running at http://localhost:${PORT}`);
});
