# Reddit Consensus App

Ask natural-language questions about your saved subreddits and get answers
grounded in real, recent Reddit posts — with links back to the sources.

## How it's built (the short version)

```
Browser (public/) --fetch()--> Express server (server.js) --> reddit.js  --> Reddit JSON endpoints
                                                            \-> claude.js --> Claude API
                                                            \-> storage.js -> data/subreddits.json
```

- **public/** — the frontend: `index.html`, `style.css`, `app.js`. Plain JS, no framework, same style as your meal planner app.
- **server.js** — the Express backend. New concept vs. the meal planner: see "Why Express?" below.
- **reddit.js** — the *only* file that talks to Reddit. Exposes one function, `fetchSubredditPosts(subreddit, options)`.
- **claude.js** — the *only* file that talks to the Claude API. Builds the prompt (question + retrieved posts) and asks Claude to answer using only that material, with `[n]` citations.
- **storage.js** — reads/writes `data/subreddits.json`, your saved subreddit list.

## Why Express? (new concept vs. the meal planner)

The meal planner didn't need a backend because it probably didn't need to
hide a secret or dodge a browser security restriction. This app has to do
both:

1. **CORS.** Reddit's JSON endpoints don't send the headers that would let
   your browser fetch them directly from a different website (your Repl).
   Browsers block that by default. A server has no such restriction — it can
   fetch anything — so the browser asks *our* server, and our server asks
   Reddit.
2. **Secret key.** Your Claude API key must never appear in code the browser
   can see (anyone could open dev tools and steal it). Express keeps it
   server-side, read from an environment variable.

Express itself is just a small library for defining routes — "when someone
requests GET /api/subreddits, run this function" — plus serving your static
frontend files. `server.js` is intentionally the *only* file with route
definitions; it delegates actual work to `reddit.js`, `claude.js`, and
`storage.js`.

## The Reddit access approach — and its limits

We're using Reddit's public JSON endpoints (`reddit.com/r/<sub>/hot.json`),
not the official OAuth API, because official access is currently gated
behind a manual approval process that hasn't come through yet. This works
without any keys or client IDs, but:

- It's not officially supported for programmatic use — Reddit could rate-limit
  or block the requesting IP if we're not careful. We fetch on-demand only
  (never on a schedule) and use small batches (~25 posts) to stay light.
- Every request needs a descriptive `User-Agent` header or Reddit rejects it.
  Set yours in Replit Secrets as `REDDIT_USER_AGENT` (see Setup below).
- **The swap-in point for OAuth, when your API access is approved, lives
  entirely inside `reddit.js`.** Look for the comment block labeled
  `OAUTH SWAP-IN POINT`. Nothing else in the app needs to change — server.js
  and claude.js only know about `fetchSubredditPosts()`, not how it works
  internally.

If Reddit's JSON endpoint ever starts behaving unexpectedly (different
shape, unexpected blocks), `reddit.js` throws a `RedditFetchError` with a
specific `code` (`NOT_FOUND`, `RATE_LIMITED`, `UNEXPECTED_SHAPE`, `UNKNOWN`)
rather than silently swallowing or working around it — check the Replit
console if you see one of these surface as an error in the chat.

## Storage — and its tradeoff

Saved subreddits live in `data/subreddits.json`, a plain file on disk. This
is the simplest possible approach and is fine for a single-user tool.

**Tradeoff to know about:** Replit's filesystem usually survives normal
restarts, but certain actions (redeploying, forking, some "reboot" flows)
can reset the filesystem to whatever's in your last GitHub commit. If you
add subreddits through the app and never commit that file, a reset could
lose the list. Not worth solving for v1 — if it becomes annoying, the fix is
either committing `data/subreddits.json` periodically, or swapping in a real
database later (that change would be isolated to `storage.js`).

## Setup on Replit

1. Create a new Repl, choose "Import from GitHub" (after you've pushed this
   project there), or upload these files directly.
2. Open the **Secrets** tool (padlock icon, left sidebar) and add two secrets:
   - `ANTHROPIC_API_KEY` — your "personal-projects" key
   - `REDDIT_USER_AGENT` — something like `consensus-app/0.1 by u/your-reddit-username`
   (Don't put these in a `.env` file that gets committed — Secrets keeps them out of GitHub entirely. `.env.example` in this repo just documents the format.)
3. Click **Run**. Replit will run `npm install` automatically the first time, then `npm start`, which runs `server.js`.
4. Open the webview Replit shows you. Add a subreddit, select it, and ask a question.

## Build sequence this follows

1. ✅ Express backend + static frontend shell
2. ✅ `fetchSubredditPosts()` against Reddit's public JSON endpoint
3. ✅ Claude API wired up with citation-aware prompting
4. ✅ Subreddit save/list management + JSON file persistence
5. ✅ Chat UI (sidebar + chat log + source links)
6. Polish — loading states and error handling are in for v1 (bad subreddit name, empty results, rate limits); revisit once you've used it for real and have opinions about what's missing.

## Ideas for later (explicitly out of scope for v1)

- OAuth swap-in once your Reddit API access is approved (see `reddit.js`)
- Pulling top comments per post, not just post bodies, for richer grounding
- A real database if the JSON file tradeoff ever actually bites you
- Multi-user accounts / login (this is a personal single-user tool for now)
