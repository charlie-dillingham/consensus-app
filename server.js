/**
 * server.js
 * ---------
 * This is the Express backend — the piece your meal planner app didn't need.
 *
 * WHY WE NEED A BACKEND HERE (worth understanding, since it's new):
 * A static frontend (plain HTML/CSS/JS running in your browser) can't safely
 * or reliably do two things this app needs:
 *   1. Call Reddit's JSON endpoints. Reddit doesn't send the CORS headers
 *      that would let a browser fetch() them directly from a different
 *      origin (your Repl's URL) — the browser will block the request. A
 *      server has no such restriction; it can fetch anything.
 *   2. Call the Claude API with your secret key. If that key lived in
 *      frontend JS, anyone who opened your site's dev tools could steal it
 *      and rack up charges on your account. Keeping it server-side (as an
 *      environment variable, injected via Replit Secrets) means it never
 *      reaches the browser at all.
 *
 * So: Express is a small Node.js library for building a server that (a)
 * serves your static frontend files, and (b) exposes a few API routes
 * (/api/...) that the frontend's JS calls with fetch(), which the server
 * then fulfills using reddit.js and claude.js.
 */

const express = require("express");
const path = require("path");

const { fetchSubredditPosts, RedditFetchError } = require("./reddit");
const { synthesizeAnswer } = require("./claude");
const { getSubreddits, addSubreddit, removeSubreddit } = require("./storage");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Subreddit list management -------------------------------------------

app.get("/api/subreddits", async (req, res) => {
  const list = await getSubreddits();
  res.json({ subreddits: list });
});

app.post("/api/subreddits", async (req, res) => {
  try {
    const list = await addSubreddit(req.body?.name);
    res.json({ subreddits: list });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/subreddits/:name", async (req, res) => {
  const list = await removeSubreddit(req.params.name);
  res.json({ subreddits: list });
});

// --- Chat / question answering --------------------------------------------

app.post("/api/ask", async (req, res) => {
  const { subreddit, question } = req.body || {};

  if (!subreddit || !question) {
    return res.status(400).json({ error: "Both 'subreddit' and 'question' are required." });
  }

  try {
    const posts = await fetchSubredditPosts(subreddit, { sort: "hot", limit: 25 });
    const { answer } = await synthesizeAnswer(subreddit, question, posts);

    res.json({
      answer,
      sources: posts.map((p, i) => ({
        num: i + 1,
        title: p.title,
        url: p.permalink,
        score: p.score,
      })),
    });
  } catch (err) {
    if (err instanceof RedditFetchError) {
      // These are "expected" failure modes (bad subreddit name, rate limit, etc.)
      // — surface a clean message instead of a generic 500.
      const statusMap = { NOT_FOUND: 404, RATE_LIMITED: 429 };
      return res.status(statusMap[err.code] || 502).json({ error: err.message, code: err.code });
    }
    console.error("Unexpected error in /api/ask:", err);
    res.status(500).json({ error: "Something went wrong on the server. Check the Replit console for details." });
  }
});

app.listen(PORT, () => {
  console.log(`Reddit Consensus app running at http://localhost:${PORT}`);
});
