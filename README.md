## The Reddit access approach — and its limits

This v1 uses Reddit's public JSON endpoints (`reddit.com/r/<sub>/hot.json`) to
read posts. This is read-only, low-volume, and manually triggered per
question (no scheduled or background polling). A few things to know:

- Every request needs a descriptive `User-Agent` header or Reddit rejects it.
  Set yours in Replit Secrets as `REDDIT_USER_AGENT`.
- The Reddit-fetching logic is fully isolated in `reddit.js` behind one
  function, `fetchSubredditPosts()`. This is intentional: if this project's
  Reddit Data API access is approved, switching to authenticated OAuth calls
  is a contained change to that one file — nothing else in the app needs to
  change. Look for the comment block labeled `OAUTH SWAP-IN POINT`.

If Reddit's JSON endpoint ever behaves unexpectedly, `reddit.js` throws a
`RedditFetchError` with a specific code rather than silently working around
it.
