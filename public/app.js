const candidateSelect = document.querySelector("#candidateSelect");
const startBtn = document.querySelector("#startBtn");
const chat = document.querySelector("#chat");
const composer = document.querySelector("#composer");
const input = document.querySelector("#messageInput");
const statusEl = document.querySelector("#status");
const progress = document.querySelector("#progress");
const feedbackEl = document.querySelector("#feedback");
const setup = document.querySelector("#setup");

let candidates = [];
let sessionId = crypto.randomUUID();
let coveredDays = new Set();
let loading = false;

init();

async function init() {
  setBusy(true, "Loading");
  try {
    const res = await fetch("/data/candidates.json");
    const data = await res.json();
    candidates = data.candidates || [];
    candidateSelect.innerHTML = candidates
      .map((candidate, index) => {
        const member = candidate.member || {};
        return `<option value="${index}">${member.name} - ${member.jobRole}</option>`;
      })
      .join("");
    statusEl.textContent = "Ready";
  } catch (_err) {
    statusEl.textContent = "Could not load profiles";
    addBubble("interviewer", "I could not load the candidate profiles. Check that data/candidates.json is present.");
  } finally {
    setBusy(false);
  }
}

startBtn.addEventListener("click", async () => {
  const candidate = candidates[Number(candidateSelect.value)];
  if (!candidate) return;
  sessionId = crypto.randomUUID();
  coveredDays = new Set();
  chat.innerHTML = "";
  feedbackEl.classList.add("hidden");
  chat.classList.remove("hidden");
  composer.classList.remove("hidden");
  setup.classList.add("hidden");
  await sendTurn({ sessionId, candidate }, false);
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || loading) return;
  input.value = "";
  addBubble("candidate", message);
  await sendTurn({ sessionId, message }, true);
});

async function sendTurn(body, delayed) {
  setBusy(true, "Thinking");
  try {
    if (delayed) await sleep(350);
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.reply || "Request failed");
    addBubble("interviewer", data.reply);
    updateCoverageFromReply(data.reply);
    if (data.done) showFeedback(data.feedback);
    statusEl.textContent = data.done ? "Complete" : "In progress";
  } catch (err) {
    addBubble("interviewer", err.message || "Something went wrong. Please try again.");
    statusEl.textContent = "Needs retry";
  } finally {
    setBusy(false);
  }
}

function addBubble(role, text) {
  const node = document.createElement("div");
  node.className = `bubble ${role}`;
  node.textContent = text;
  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
}

function updateCoverageFromReply(reply) {
  const matches = reply.matchAll(/Day\s+(\d+)/gi);
  for (const match of matches) coveredDays.add(Number(match[1]));
  progress.style.width = `${Math.min(100, (coveredDays.size / 4) * 100)}%`;
}

function showFeedback(feedback) {
  composer.classList.add("hidden");
  chat.classList.add("hidden");
  feedbackEl.classList.remove("hidden");
  feedbackEl.innerHTML = `
    <h2>Feedback Report</h2>
    <p>${escapeHtml(feedback?.summary || "Interview complete.")}</p>
    <h3>Strengths</h3>
    <div class="chips">${renderChips(feedback?.strengths)}</div>
    <h3>Gaps</h3>
    <div class="chips">${renderChips(feedback?.gaps)}</div>
    <h3>Next Steps</h3>
    ${(feedback?.next || []).map((item) => `<div class="check"><span>✓</span><span>${escapeHtml(item)}</span></div>`).join("")}
  `;
}

function renderChips(items = []) {
  return items.map((item) => `<div class="chip">${escapeHtml(item)}</div>`).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setBusy(value, label) {
  loading = value;
  startBtn.disabled = value;
  input.disabled = value;
  composer.querySelector("button").disabled = value;
  if (label) statusEl.textContent = label;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
