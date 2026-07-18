/**
 * stackexchange.js
 * ----------------
 * Everything about HOW we get data out of Stack Exchange lives in this one
 * file. The rest of the app never talks to Stack Exchange's API directly —
 * it just calls fetchSiteQuestions() and gets back a clean array of
 * question objects (each with its top answers already attached).
 *
 * BACKGROUND — why this replaced reddit.js:
 * This app originally pulled from Reddit's public JSON endpoints. We
 * confirmed (by testing directly) that Reddit now blocks non-browser HTTP
 * clients like our server's fetch() at the network/fingerprint level,
 * regardless of headers or IP — not something fixable without impersonating
 * a real browser, which we deliberately chose not to do. Stack Exchange runs
 * a real, documented, self-serve API (v2.3) with no manual approval process,
 * so we pivoted to it. Its network of Q&A sites (Stack Overflow is the
 * famous one) includes topic-specific communities like Cooking ("Seasoned
 * Advice", site slug: cooking), Home Improvement (diy), Personal Finance
 * (money), and many more — https://stackexchange.com/sites lists them all.
 *
 * A "site" here (e.g. "cooking") plays the same role "subreddit" used to.
 *
 * API KEY: Stack Exchange's API works read-only WITHOUT a key at a lower
 * quota (300 requests/day per IP) — fine for personal, on-demand use. If you
 * ever want a higher ceiling, register a free key at
 * https://stackapps.com/apps/oauth/register and set it as the
 * STACK_EXCHANGE_KEY secret; this file already reads that variable and
 * attaches it to every request automatically when present.
 */

const BASE_URL = "https://api.stackexchange.com/2.3";
const STACK_EXCHANGE_KEY = process.env.STACK_EXCHANGE_KEY || "";

/** Strip HTML tags and decode the handful of entities Stack Exchange commonly uses. Good enough for feeding plain text to Claude — doesn't need to be a full HTML parser. */
function htmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch recent/top questions from a Stack Exchange site, each with its
 * top-voted answers attached.
 *
 * @param {string} site - site slug, e.g. "cooking", "diy", "money"
 * @param {object} options
 * @param {"activity"|"votes"|"creation"} [options.sort="activity"] - question ordering
 * @param {number} [options.limit=25] - how many questions to fetch (max 100 per page)
 * @param {number} [options.answersPerQuestion=3] - top answers to attach per question
 * @returns {Promise<Array<{
 *   id: number,
 *   title: string,
 *   body: string,
 *   tags: string[],
 *   score: number,
 *   isAnswered: boolean,
 *   answerCount: number,
 *   link: string,
 *   createdUtc: number,
 *   answers: Array<{ body: string, score: number, isAccepted: boolean }>
 * }>>}
 */
async function fetchSiteQuestions(site, options = {}) {
  const { sort = "activity", limit = 25, answersPerQuestion = 3 } = options;

  if (!site || typeof site !== "string") {
    throw new Error("fetchSiteQuestions: site is required");
  }

  const cleanSite = site.trim().toLowerCase();

  // --- Step 1: fetch the questions themselves ------------------------------
  const questionsParams = new URLSearchParams({
    order: "desc",
    sort,
    site: cleanSite,
    pagesize: String(Math.min(limit, 100)),
    filter: "withbody",
  });
  if (STACK_EXCHANGE_KEY) questionsParams.set("key", STACK_EXCHANGE_KEY);

  const questionsRes = await fetch(`${BASE_URL}/questions?${questionsParams.toString()}`);
  const questionsData = await questionsRes.json();

  if (!questionsRes.ok) {
    throw toStackExchangeError(questionsRes.status, questionsData, cleanSite);
  }

  const items = Array.isArray(questionsData.items) ? questionsData.items : [];
  if (!items.length) {
    return [];
  }

  // --- Step 2: fetch top answers for those questions in one batched call ---
  const ids = items.map((q) => q.question_id).join(";");
  const answersParams = new URLSearchParams({
    order: "desc",
    sort: "votes",
    site: cleanSite,
    filter: "withbody",
  });
  if (STACK_EXCHANGE_KEY) answersParams.set("key", STACK_EXCHANGE_KEY);

  const answersRes = await fetch(`${BASE_URL}/questions/${ids}/answers?${answersParams.toString()}`);
  const answersData = answersRes.ok ? await answersRes.json() : { items: [] };

  const answersByQuestion = new Map();
  for (const answer of answersData.items || []) {
    const list = answersByQuestion.get(answer.question_id) || [];
    if (list.length < answersPerQuestion) {
      list.push({
        body: htmlToText(answer.body),
        score: answer.score ?? 0,
        isAccepted: !!answer.is_accepted,
      });
      answersByQuestion.set(answer.question_id, list);
    }
  }

  // --- Step 3: assemble ------------------------------------------------------
  return items.map((q) => ({
    id: q.question_id,
    title: q.title || "",
    body: htmlToText(q.body),
    tags: q.tags || [],
    score: q.score ?? 0,
    isAnswered: !!q.is_answered,
    answerCount: q.answer_count ?? 0,
    link: q.link || `https://${cleanSite}.stackexchange.com/questions/${q.question_id}`,
    createdUtc: q.creation_date || 0,
    answers: answersByQuestion.get(q.question_id) || [],
  }));
}

function toStackExchangeError(status, data, site) {
  const message = data?.error_message || `Stack Exchange returned status ${status}`;

  if (status === 400 && /site/i.test(message)) {
    return new StackExchangeFetchError(
      `"${site}" doesn't look like a valid Stack Exchange site slug (e.g. "cooking", "diy", "money").`,
      "NOT_FOUND"
    );
  }
  if (status === 502 || status === 503 || data?.error_id === 502) {
    return new StackExchangeFetchError(
      "Stack Exchange is throttling us right now. Wait a bit and try again.",
      "RATE_LIMITED"
    );
  }
  return new StackExchangeFetchError(message, "UNKNOWN");
}

class StackExchangeFetchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "StackExchangeFetchError";
    this.code = code; // "NOT_FOUND" | "RATE_LIMITED" | "UNKNOWN"
  }
}

module.exports = { fetchSiteQuestions, StackExchangeFetchError };
