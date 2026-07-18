# Consensus App

Ask natural-language questions about a Stack Exchange community and get
answers grounded in real, current questions and answers — with links back
to the sources.

## Why this isn't a Reddit app anymore

This project started as a Reddit-scraping tool. During the build, we
confirmed (by testing directly with `curl` and a real browser side by side)
that Reddit blocks non-browser HTTP clients like a Node server's `fetch()`
at the network/fingerprint level — not something fixable with a better
User-Agent header, and not something worth working around by impersonating
a real browser. So the project pivoted to Stack Exchange, which runs a real,
documented, self-serve API (v2.3) with no manual approval process. Its
network includes topic-specific Q&A communities beyond just Stack Overflow —
Cooking ("Seasoned Advice"), Home Improvement, Personal Finance, Fitness,
Parenting, and many more (see https://stackexchange.com/sites for the full
list). A "site" in this app (e.g. `cooking`) plays the role "subreddit"
originally played.

## How it's built

```
Browser (public/) --fetch()--> Express server (server.js) --> stackexchange.js --> Stack Exchange API
                                                             \-> claude.js       --> Claude API
                                                             \-> storage.js      --> data/sites.json
```

- **public/** — the frontend: `index.html`, `style.css`, `app.js`. Plain JS, no framework, same style as your meal planner app.
- **server.js** — the Express backend. New concept vs. the meal planner: see "Why Express?" below.
- **stackexchange.js** — the *only* file that talks to Stack Exchange. Exposes one function, `fetchSiteQuestions(site, options)`, which returns questions with their top answers already attached.
- **claude.js** — the *only* file that talks to the Claude API. Builds the prompt (question + retrieved Q&A) and asks Claude to answer using only that material, with `[n]` citations.
- **storage.js** — reads/writes `data/sites.json`, your saved site list.

## Why Express? (new concept vs. the meal planner)

The meal planner didn't need a backend. This app has to do two things a
plain frontend can't do safely:

1. **Keep your Claude API key secret.** If that key lived in browser-side
   JS, anyone who opened dev tools could steal it. Express keeps it
   server-side, read from an environment variable.
2. **Orchestrate a two-step flow.** Fetch questions from Stack Exchange,
   then hand them to Claude, then return one clean answer — the browser
   only ever talks to our own server, once.

Express itself is just a small library for defining routes — "when someone
requests GET /api/sites, run this function" — plus serving your static
frontend files. `server.js` is intentionally the *only* file with route
definitions; it delegates actual work to `stackexchange.js`, `claude.js`,
and `storage.js`.

## The Stack Exchange API

Read access works without a key at all (300 requests/day per IP — fine for
a personal, on-demand tool, since this app never polls on a schedule). If
you want a higher ceiling later, register a free key at
https://stackapps.com/apps/oauth/register (self-serve, instant, no human
review) and set it as `STACK_EXCHANGE_KEY` in Replit Secrets —
`stackexchange.js` already reads that variable and attaches it automatically
when present.

If Stack Exchange's API ever behaves unexpectedly, `stackexchange.js` throws
a `StackExchangeFetchError` with a specific code (`NOT_FOUND`,
`RATE_LIMITED`, `UNKNOWN`) rather than silently swallowing or working around
it.

## Storage — and its tradeoff

Saved sites live in `data/sites.json`, a plain file on disk. This is the
simplest possible approach and is fine for a single-user tool.

**Tradeoff to know about:** Replit's filesystem usually survives normal
restarts, but certain actions (redeploying, forking, some "reboot" flows)
can reset the filesystem to whatever's in your last GitHub commit. If you
add sites through the app and never commit that file, a reset could lose
the list. Not worth solving for v1 — if it becomes annoying, the fix is
either committing `data/sites.json` periodically, or swapping in a real
database later (that change would be isolated to `storage.js`).

## Setup on Replit

1. Create a new Repl, choose "Import from GitHub," or upload these files directly.
2. Open the **Secrets** tool (padlock icon, left sidebar) and add:
   - `ANTHROPIC_API_KEY` — your "personal-projects" key
   - `STACK_EXCHANGE_KEY` — optional, leave unset unless you've registered one
3. Click **Run**. Replit will run `npm install` automatically the first time, then `npm start`, which runs `server.js`.
4. Open the webview Replit shows you. Add a site slug (e.g. `cooking`), select it, and ask a question.

## Example sites to try

- `cooking` — Seasoned Advice (cooking technique and recipes)
- `diy` — Home Improvement
- `money` — Personal Finance & Money
- `parenting` — Parenting
- `fitness` — Physical Fitness

## Ideas for later (explicitly out of scope for v1)

- A registered Stack Exchange key for a higher request ceiling, if 300/day ever isn't enough
- Pulling comments on answers, not just the answers themselves, for richer grounding
- A real database if the JSON file tradeoff ever actually bites you
- Multi-user accounts / login (this is a personal single-user tool for now)
