/**
 * app.js
 * ------
 * All the frontend logic: rendering the site sidebar, handling the
 * add/remove form, and running the chat. This talks to our own backend's
 * /api/... routes with fetch() — never to Stack Exchange or Claude directly
 * (that's the whole reason server.js exists).
 */

const siteListEl = document.getElementById("site-list");
const addForm = document.getElementById("add-form");
const addInput = document.getElementById("add-input");

const chatHeader = document.getElementById("chat-header");
const chatLog = document.getElementById("chat-log");
const askForm = document.getElementById("ask-form");
const askInput = document.getElementById("ask-input");
const askButton = document.getElementById("ask-button");

let activeSite = null;

// --- Site list ---------------------------------------------------

async function loadSites() {
  const res = await fetch("/api/sites");
  const { sites } = await res.json();
  renderSiteList(sites);
}

function renderSiteList(sites) {
  siteListEl.innerHTML = "";

  if (!sites.length) {
    const hint = document.createElement("li");
    hint.className = "empty-hint";
    hint.textContent = "No sites saved yet. Add one above (e.g. cooking, diy, money).";
    siteListEl.appendChild(hint);
    return;
  }

  for (const name of sites) {
    const li = document.createElement("li");
    li.className = "site-item" + (name === activeSite ? " active" : "");

    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = name;
    nameSpan.addEventListener("click", () => selectSite(name));

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.title = `Remove ${name}`;
    removeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await fetch(`/api/sites/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (activeSite === name) {
        activeSite = null;
        chatHeader.textContent = "Select a site to start asking questions";
        chatLog.innerHTML = "";
        setInputEnabled(false);
      }
      loadSites();
    });

    li.appendChild(nameSpan);
    li.appendChild(removeBtn);
    siteListEl.appendChild(li);
  }
}

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = addInput.value.trim();
  if (!name) return;

  const res = await fetch("/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (res.ok) {
    addInput.value = "";
    loadSites();
  } else {
    const { error } = await res.json();
    alert(error || "Couldn't add that site.");
  }
});

function selectSite(name) {
  activeSite = name;
  chatHeader.textContent = name;
  chatLog.innerHTML = "";
  setInputEnabled(true);
  askInput.focus();
  loadSites(); // re-render to highlight active item
}

function setInputEnabled(enabled) {
  askInput.disabled = !enabled;
  askButton.disabled = !enabled;
}

// --- Chat ---------------------------------------------------------------

askForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = askInput.value.trim();
  if (!question || !activeSite) return;

  addMessage(question, "user");
  askInput.value = "";
  setInputEnabled(false);

  const loadingEl = addMessage(
    `Fetching recent questions from ${activeSite} and asking Claude...`,
    "loading"
  );

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: activeSite, question }),
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

loadSites();
