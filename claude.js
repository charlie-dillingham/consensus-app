/**
 * claude.js
 * ---------
 * Talks to the Claude API. This is where the "grounding" magic happens:
 * instead of asking Claude to answer from its general training knowledge,
 * we hand it the actual, current post text from Reddit and ask it to
 * synthesize an answer FROM THAT — this pattern is called RAG (Retrieval-
 * Augmented Generation). Retrieval = reddit.js fetching posts. Generation =
 * this file asking Claude to write an answer using only what was retrieved.
 *
 * We also ask Claude to cite which post(s) informed each claim, using a
 * simple [1], [2] style, so the frontend can turn those into real links
 * back to Reddit.
 */

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-4-5";

/**
 * Build the prompt content that gets sent to Claude: the user's question,
 * plus a numbered list of posts for it to draw from.
 */
function buildPromptPosts(posts) {
  return posts
    .map((post, i) => {
      const num = i + 1;
      const body = post.selftext ? post.selftext.slice(0, 1500) : "(no body text — link/image post)";
      return `[${num}] Title: ${post.title}\nScore: ${post.score} | Comments: ${post.numComments}\nBody: ${body}`;
    })
    .join("\n\n");
}

/**
 * Ask Claude to synthesize an answer to `question` using `posts` from a
 * given subreddit. Returns the raw answer text (with [n] citation markers)
 * plus the list of posts, so the caller can map citation numbers back to
 * real Reddit URLs.
 *
 * @param {string} subreddit
 * @param {string} question
 * @param {Array} posts - output of fetchSubredditPosts()
 * @returns {Promise<{answer: string, posts: Array}>}
 */
async function synthesizeAnswer(subreddit, question, posts) {
  if (!posts.length) {
    return {
      answer:
        "I couldn't find any posts to work with — the subreddit may be empty, private, or Reddit didn't return results just now.",
      posts: [],
    };
  }

  const promptPosts = buildPromptPosts(posts);

  const systemPrompt = `You are answering questions about the subreddit r/${subreddit} using ONLY the numbered posts provided by the user. Do not use outside knowledge or general training data to answer — if the posts don't contain an answer, say so plainly rather than guessing.

When you make a claim, cite the post(s) it came from using bracketed numbers matching the post list, like this: "People recommend brining the chicken overnight [3][7]." Cite as specifically as possible — a claim per citation, not one citation dumped at the end.

Keep your answer conversational and directly responsive to the question. It's fine to synthesize across multiple posts (e.g. "the community is split between X and Y [2][5]").`;

  const userMessage = `Question: ${question}\n\nPosts from r/${subreddit}:\n\n${promptPosts}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const answer = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return { answer, posts };
}

module.exports = { synthesizeAnswer };
