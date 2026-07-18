/**
 * app.js
 * ------
 * All the frontend logic: rendering the subreddit sidebar, handling the
 * add/remove form, and running the chat. This talks to our own backend's
 * /api/... routes with fetch() — never to Reddit or Claude directly (that's
 * the whole reason server.js exists).
 */

const subredditListEl = document.getElementById("subreddit-list");
const addForm = document.getElementById("add-form");
const addInput = document.getElementById("add-input");

const chatHeader = document.getElementById("chat-header");
const chatLog = document.getElementById("chat-log");
const askForm = document.getElementById("ask-form");
const askInput = document.getElementById("ask-input");
const askButton = document.getElementById("ask-button");

let activeSubreddit = null;

// --- Subreddit list ---------------------------------------------------

async function loadSubreddits() {
  const res = await fetch("/api/subreddits");
  const { subreddits } = await res.json();
  renderSubredditList(subreddits);
}

function renderSubredditList(subreddits) {
  subredditListEl.innerHTML = "";

  if (!subreddits.length) {
    const hint = document.createElement("li");
    hint.className = "empty-hint";
    hint.textContent = "No subreddits saved yet. Add one above.";
    subredditListEl.appendChild(hint);
    return;
  }

  for (const name of subreddits) {
    const li = document.createElement("li");
    li.className = "subreddit-item" + (name === activeSubreddit ? " active" : "");

    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = name;
    nameSpan.addEventListener("click", () => selectSubreddit(name));

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.title = `Remove r/${name}`;
    removeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch(`/api/subreddits/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (activeSubreddit === name) {
        activeSubreddit = null;
        chatHeader.textContent = "Select a subreddit to start asking questions";
        chatLog.innerHTML = "";
        setInputEnabled(false);
      }
      loadSubreddits();
    });

    li.appendChild(nameSpan);
    li.appendChild(removeBtn);
    subredditListEl.appendChild(li);
  }
}

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = addInput.value.trim();
  if (!name) return;

  const res = await fetch("/api/subreddits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (res.ok) {
    addInput.value = "";
    loadSubreddits();
  } else {
    const { error } = await res.json();
    alert(error || "Couldn't add that subreddit.");
  }
});

function selectSubreddit(name) {
  activeSubreddit = name;
  chatHeader.textContent = `r/${name}`;
  chatLog.innerHTML = "";
  setInputEnabled(true);
  askInput.focus();
  loadSubreddits(); // re-render to highlight active item
}

function setInputEnabled(enabled) {
  askInput.disabled = !enabled;
  askButton.disabled = !enabled;
}

// --- Chat ---------------------------------------------------------------

askForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = askInput.value.trim();
  if (!question || !activeSubreddit) return;

  addMessage(question, "user");
  askInput.value = "";
  setInputEnabled(false);

  const loadingEl = addMessage(
    `Fetching recent posts from r/${activeSubreddit} and asking Claude...`,
    "loading"
  );

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subreddit: activeSubreddit, question }),
    });

    const data = await res.json();
    loadingEl.remove();

    if (!res.ok) {
      addMessage(data.error || "Something went wrong.", "error");
    } else {
      addAssistantMessage(data.answer, data.sources);
    }
  } catch (err) {
    loadingEl.remove();
    addMessage("Network error — couldn't reach the server.", "error");
  } finally {
    setInputEnabled(true);
    askInput.focus();
  }
});

function addMessage(text, kind) {
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

function addAssistantMessage(answerText, sources) {
  const el = document.createElement("div");
  el.className = "msg assistant";

  const textEl = document.createElement("div");
  textEl.textContent = answerText;
  el.appendChild(textEl);

  if (sources && sources.length) {
    const sourcesEl = document.createElement("div");
    sourcesEl.className = "sources";
    for (const s of sources) {
      const link = document.createElement("a");
      link.href = s.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `[${s.num}] ${s.title} (${s.score} pts)`;
      sourcesEl.appendChild(link);
    }
    el.appendChild(sourcesEl);
  }

  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

// --- Init ---------------------------------------------------------------

loadSubreddits();
