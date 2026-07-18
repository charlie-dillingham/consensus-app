/**
 * storage.js
 * ----------
 * Manages the saved subreddit list, persisted as a plain JSON file on disk
 * (data/subreddits.json). This is the simplest possible storage approach —
 * good enough for a single-user personal tool, with one known tradeoff:
 *
 * TRADEOFF: Replit's filesystem is usually persistent across normal restarts,
 * but certain events (redeploys to a new environment, some "reboot repl"
 * actions, forking the repl) can reset it to what's in your last GitHub
 * commit. If you add subreddits through the app UI and never commit
 * data/subreddits.json to GitHub, a hard reset could lose that list. For v1
 * this is an acceptable risk — if it ever bites you, the fix is either (a)
 * periodically commit data/subreddits.json, or (b) swap this file for a real
 * database (e.g. Replit's built-in Database, or SQLite). Because all of that
 * logic is isolated here, that swap wouldn't touch server.js.
 */

const fs = require("fs/promises");
const path = require("path");

const DATA_PATH = path.join(__dirname, "data", "subreddits.json");

async function ensureDataFile() {
  try {
    await fs.access(DATA_PATH);
  } catch {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, "[]\n", "utf-8");
  }
}

async function getSubreddits() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // If the file somehow got corrupted, don't crash the app — start fresh.
    return [];
  }
}

async function addSubreddit(name) {
  const clean = String(name || "").trim().replace(/^r\//i, "");
  if (!clean) throw new Error("Subreddit name is required");

  const list = await getSubreddits();
  const alreadyExists = list.some(
    (s) => s.toLowerCase() === clean.toLowerCase()
  );
  if (!alreadyExists) {
    list.push(clean);
    await fs.writeFile(DATA_PATH, JSON.stringify(list, null, 2) + "\n", "utf-8");
  }
  return list;
}

async function removeSubreddit(name) {
  const clean = String(name || "").trim().replace(/^r\//i, "");
  const list = await getSubreddits();
  const filtered = list.filter((s) => s.toLowerCase() !== clean.toLowerCase());
  await fs.writeFile(DATA_PATH, JSON.stringify(filtered, null, 2) + "\n", "utf-8");
  return filtered;
}

module.exports = { getSubreddits, addSubreddit, removeSubreddit };
