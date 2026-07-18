/**
 * claude.js
 * ---------
 * Talks to the Claude API. This is where the "grounding" magic happens:
 * instead of asking Claude to answer from its general training knowledge,
 * we hand it real, current questions and answers from a Stack Exchange
 * community and ask it to synthesize an answer FROM THAT — this pattern is
 * called RAG (Retrieval-Augmented Generation). Retrieval = stackexchange.js
 * fetching questions/answers. Generation = this file asking Claude to write
 * an answer using only what was retrieved.
 *
 * We also ask Claude to cite which question(s) informed each claim, using a
 * simple [1], [2] style, so the frontend can turn those into real links
 * back to Stack Exchange.
 */

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-4-5";

/**
 * Build the prompt content that gets sent to Claude: the user's question,
 * plus a numbered list of Stack Exchange questions (each with its top
 * answers attached) for it to draw from.
 */
function buildPromptQuestions(questions) {
  return questions
    .map((q, i) => {
      const num = i + 1;
      const body = q.body ? q.body.slice(0, 1200) : "(no body text)";
      const answersText = q.answers.length
        ? q.answers
            .map(
              (a, ai) =>
                `  Answer ${ai + 1}${a.isAccepted ? " (accepted)" : ""} (${a.score} votes): ${a.body.slice(0, 1000)}`
            )
            .join("\n")
        : "  (no answers yet)";
      return `[${num}] Question: ${q.title}\nTags: ${q.tags.join(", ")} | Score: ${q.score} | Answered: ${q.isAnswered}\nBody: ${body}\n${answersText}`;
    })
    .join("\n\n");
}

/**
 * Ask Claude to synthesize an answer to `userQuestion` using `questions`
 * (Stack Exchange Q&A items) from a given site. Returns the raw answer text
 * (with [n] citation markers) plus the list of questions, so the caller can
 * map citation numbers back to real Stack Exchange URLs.
 *
 * @param {string} site
 * @param {string} userQuestion
 * @param {Array} questions - output of fetchSiteQuestions()
 * @returns {Promise<{answer: string, questions: Array}>}
 */
async function synthesizeAnswer(site, userQuestion, questions) {
  if (!questions.length) {
    return {
      answer:
        "I couldn't find any questions to work with — this site slug may be wrong, or Stack Exchange didn't return results just now.",
      questions: [],
    };
  }

  const promptQuestions = buildPromptQuestions(questions);

  const systemPrompt = `You are answering questions using ONLY the numbered Stack Exchange questions and answers provided by the user, drawn from the "${site}" community on Stack Exchange. Do not use outside knowledge or general training data to answer — if the provided material doesn't contain an answer, say so plainly rather than guessing.

When you make a claim, cite the numbered question(s) it came from using bracketed numbers, like this: "The community recommends brining overnight [3][7]." Cite as specifically as possible — a claim per citation, not one citation dumped at the end. Prefer accepted or high-voted answers when they exist, but you can note disagreement between answers if it's relevant.

Keep your answer conversational and directly responsive to the question. It's fine to synthesize across multiple questions/answers (e.g. "opinions are split between X and Y [2][5]").`;

  const userMessage = `Question: ${userQuestion}\n\nQuestions and answers from the "${site}" Stack Exchange community:\n\n${promptQuestions}`;

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

  return { answer, questions };
}

module.exports = { synthesizeAnswer };
