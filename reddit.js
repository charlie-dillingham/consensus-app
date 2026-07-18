/**
 * reddit.js
 * ---------
 * Everything about HOW we get data out of Reddit lives in this one file.
 * The rest of the app never talks to Reddit directly — it just calls
 * fetchSubredditPosts() and gets back a clean array of post objects.
 *
 * WHY THIS MATTERS (read this if you're new to the project):
 * Right now we're using Reddit's public, unauthenticated JSON endpoints —
 * the same data a logged-out browser gets, just requested as JSON instead
 * of HTML (add ".json" to almost any Reddit URL and you'll see it yourself,
 * e.g. https://www.reddit.com/r/Cooking/hot.json).
 *
 * This is NOT the official, approved way to build a Reddit app long-term.
 * It works today because Reddit doesn't require auth to read public JSON,
 * but it comes with three tradeoffs baked into the code below:
 *   1. No OAuth — so no rate-limit guarantees, no elevated access, and no
 *      access to anything private/restricted.
 *   2. A custom User-Agent is required on every request or Reddit will
 *      reject/block it.
 *   3. We must be a "light" citizen — small batches, short delays, and we
 *      back off immediately if Reddit signals we're going too fast.
 *
 * >>> OAUTH SWAP-IN POINT <<<
 * When your Reddit Data API application is approved, everything you need
 * to change lives inside this file. The function signature
 * `fetchSubredditPosts(subreddit, options)` should NOT change — server.js
 * and claude.js call this function and don't care how it gets its data.
 * You'll replace the fetch() call below with an authenticated request to
 * https://oauth.reddit.com/... using a Bearer token, and add a small
 * token-refresh helper. Search this file for "OAUTH SWAP-IN POINT" to find
 * the exact spot.
 */

const REDDIT_USER_AGENT =
  process.env.REDDIT_USER_AGENT || "consensus-app/0.1 (unconfigured user-agent)";

// Reddit doesn't publish a hard rate limit for unauthenticated JSON requests,
// so we self-impose a small delay between any sequential requests we make.
// This matters more once we start fetching comments per-post; for a single
// subreddit listing request it's not strictly needed, but the helper is here
// and used if/when we fetch multiple pages.
const REQUEST_DELAY_MS = 1200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch recent posts from a subreddit.
 *
 * @param {string} subreddit - subreddit name without "r/", e.g. "Cooking"
 * @param {object} options
 * @param {"hot"|"top"|"new"} [options.sort="hot"] - which listing to pull
 * @param {number} [options.limit=25] - how many posts to fetch (max ~100 per Reddit page)
 * @param {"hour"|"day"|"week"|"month"|"year"|"all"} [options.timeframe="week"] - only used when sort === "top"
 * @returns {Promise<Array<{
 *   id: string,
 *   title: string,
 *   selftext: string,
 *   author: string,
 *   score: number,
 *   numComments: number,
 *   url: string,
 *   permalink: string,
 *   createdUtc: number
 * }>>}
 */
async function fetchSubredditPosts(subreddit, options = {}) {
  const { sort = "hot", limit = 25, timeframe = "week" } = options;

  if (!subreddit || typeof subreddit !== "string") {
    throw new Error("fetchSubredditPosts: subreddit is required");
  }

  const cleanSubreddit = subreddit.trim().replace(/^r\//i, "");

  // --- OAUTH SWAP-IN POINT -------------------------------------------------
  // Today: unauthenticated public JSON endpoint on www.reddit.com.
  // Later: swap this block for a request to https://oauth.reddit.com/r/<sub>/<sort>
  //        with an `Authorization: Bearer <access_token>` header obtained
  //        from Reddit's OAuth token endpoint. The URL path and query params
  //        (limit, t) stay basically the same — only the host and auth header change.
  const params = new URLSearchParams({ limit: String(Math.min(limit, 100)) });
  if (sort === "top") params.set("t", timeframe);

  const url = `https://www.reddit.com/r/${encodeURIComponent(cleanSubreddit)}/${sort}.json?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      // Required: Reddit blocks generic/missing User-Agent strings.
      "User-Agent": REDDIT_USER_AGENT,
    },
  });
  // --- END OAUTH SWAP-IN POINT ---------------------------------------------

  if (response.status === 404) {
    throw new RedditFetchError(
      `Subreddit "${cleanSubreddit}" doesn't exist or is private.`,
      "NOT_FOUND"
    );
  }

  if (response.status === 429) {
    throw new RedditFetchError(
      "Reddit is rate-limiting us right now. Wait a bit and try again.",
      "RATE_LIMITED"
    );
  }

  if (!response.ok) {
    throw new RedditFetchError(
      `Reddit returned an unexpected status: ${response.status}`,
      "UNKNOWN"
    );
  }

  const data = await response.json();

  const children = data?.data?.children;
  if (!Array.isArray(children)) {
    throw new RedditFetchError(
      "Reddit's response didn't look like a normal post listing. Its JSON format may have changed.",
      "UNEXPECTED_SHAPE"
    );
  }

  return children
    .map((child) => child?.data)
    .filter(Boolean)
    // Skip stickied/pinned posts (usually mod announcements, not community content)
    .filter((post) => !post.stickied)
    .map((post) => ({
      id: post.id,
      title: post.title || "",
      selftext: post.selftext || "",
      author: post.author || "[unknown]",
      score: post.score ?? 0,
      numComments: post.num_comments ?? 0,
      url: post.url || "",
      permalink: `https://www.reddit.com${post.permalink}`,
      createdUtc: post.created_utc || 0,
    }));
}

/** Small delay helper, exported for use if server.js ever fetches multiple pages/subreddits in one request. */
async function politeDelay() {
  await sleep(REQUEST_DELAY_MS);
}

class RedditFetchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "RedditFetchError";
    this.code = code; // "NOT_FOUND" | "RATE_LIMITED" | "UNKNOWN" | "UNEXPECTED_SHAPE"
  }
}

module.exports = { fetchSubredditPosts, politeDelay, RedditFetchError };
