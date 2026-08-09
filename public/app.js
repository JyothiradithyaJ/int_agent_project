const candidateSelect = document.querySelector("#candidateSelect");
const startBtn = document.querySelector("#startBtn");
const chat = document.querySelector("#chat");
const composer = document.querySelector("#composer");
const input = document.querySelector("#messageInput");
const statusEl = document.querySelector("#status");
const progress = document.querySelector("#progress");
const coverageText = document.querySelector("#coverageText");
const aiStatus = document.querySelector("#aiStatus");
const feedbackEl = document.querySelector("#feedback");
const setup = document.querySelector("#setup");
const retryBtn = document.querySelector("#retryBtn");

const TOTAL_CURRICULUM_DAYS = 31;

let candidates = [];
let sessionId = crypto.randomUUID();
let coveredDays = new Set();
let loading = false;
let lastRequest = null;

init();

async function init() {
  setBusy(true, "Loading");
  try {
    const [candidateRes, healthRes] = await Promise.all([
      fetch("/data/candidates.json"),
      fetch("/api/health"),
    ]);
    if (!candidateRes.ok) throw new Error("Could not load candidate profiles");

    const data = await candidateRes.json();
    candidates = data.candidates || [];
    candidateSelect.innerHTML = candidates.map((candidate, index) => {
      const member = candidate.member || {};
      return `<option value="${index}">${escapeHtml(member.name || "Candidate")} - ${escapeHtml(member.jobRole || "AI role")}</option>`;
    }).join("");

    if (healthRes.ok) {
      const health = await healthRes.json();
      if (health.mode === "groq-live") {
        aiStatus.textContent = `Groq Live · ${health.model}`;
        aiStatus.className = "ai-status live";
      } else if (health.mode === "local-mock") {
        aiStatus.textContent = "Local Mock Mode";
        aiStatus.className = "ai-status mock";
      } else {
        aiStatus.textContent = "Groq Configuration Missing";
        aiStatus.className = "ai-status error";
      }
    }
    statusEl.textContent = "Ready";
  } catch (err) {
    statusEl.textContent = "Could not load";
    addBubble("interviewer", err.message || "Could not load the application.");
  } finally {
    setBusy(false);
  }
}

startBtn.addEventListener("click", async () => {
  const candidate = candidates[Number(candidateSelect.value)];
  if (!candidate) return;
  sessionId = crypto.randomUUID();
  coveredDays = new Set();
  lastRequest = null;
  chat.innerHTML = "";
  feedbackEl.classList.add("hidden");
  retryBtn.classList.add("hidden");
  chat.classList.remove("hidden");
  composer.classList.remove("hidden");
  setup.classList.add("hidden");
  updateCoverage([]);
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

retryBtn.addEventListener("click", async () => {
  if (!lastRequest || loading) return;
  retryBtn.classList.add("hidden");
  await sendTurn(lastRequest.body, lastRequest.delayed, false);
});

async function sendTurn(body, delayed, saveForRetry = true) {
  setBusy(true, "Thinking");
  if (saveForRetry) lastRequest = { body, delayed };
  try {
    if (delayed) await sleep(350);
    const res = await fetch("/api/interview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.reply || "Request failed");
    addBubble("interviewer", data.reply);
    updateCoverage(data.coverage, data.day_covered);
    if (data.done) {
      lastRequest = null;
      retryBtn.classList.add("hidden");
      showFeedback(data.feedback);
    } else {
      retryBtn.classList.add("hidden");
    }
    statusEl.textContent = data.done ? "Complete" : "In progress";
  } catch (err) {
    addBubble("interviewer", err.message || "Something went wrong. Please retry.");
    statusEl.textContent = "Needs retry";
    retryBtn.classList.remove("hidden");
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

function updateCoverage(coverage, dayCovered) {
  if (Array.isArray(coverage)) coveredDays = new Set(coverage.filter(Number.isInteger));
  else if (Number.isInteger(dayCovered)) coveredDays.add(dayCovered);
  const percent = Math.min(100, (coveredDays.size / TOTAL_CURRICULUM_DAYS) * 100);
  progress.style.width = `${percent}%`;
  coverageText.textContent = `${coveredDays.size} / ${TOTAL_CURRICULUM_DAYS} curriculum days covered`;
}

function showFeedback(feedback = {}) {
  composer.classList.add("hidden");
  chat.classList.add("hidden");
  feedbackEl.classList.remove("hidden");
  const scores = feedback.scores || {};
  const entries = [
    ["Technical Knowledge", scores.technical_knowledge],
    ["Problem Solving", scores.problem_solving],
    ["Engineering Judgment", scores.engineering_judgment],
    ["Production Readiness", scores.production_readiness],
    ["Communication", scores.communication],
  ].filter(([, value]) => Number.isFinite(Number(value)));
  const overall = entries.length ? Math.round(entries.reduce((sum, [, value]) => sum + Number(value), 0) / entries.length) : 0;

  feedbackEl.innerHTML = `
    <h2>Feedback Report</h2>
    <div class="overall-score"><strong>${overall}/100</strong><span>${coveredDays.size}/${TOTAL_CURRICULUM_DAYS} days covered</span></div>
    <p>${escapeHtml(feedback.summary || "Interview complete.")}</p>
    <h3>Scores</h3>
    <div class="scores">${entries.map(([label, value]) => `
      <div class="score-row">
        <div class="score-header"><span>${escapeHtml(label)}</span><strong>${Number(value)}/100</strong></div>
        <div class="score-track"><div class="score-fill" style="width:${Math.max(0, Math.min(100, Number(value)))}%"></div></div>
      </div>`).join("")}</div>
    <h3>Strengths</h3><div class="chips">${renderChips(feedback.strengths)}</div>
    <h3>Gaps</h3><div class="chips">${renderChips(feedback.gaps)}</div>
    <h3>Evidence</h3>
    <div class="evidence-list">${(feedback.evidence || []).map((item) => `
      <div class="evidence ${escapeHtml(item.assessment || "partial")}">
        <strong>${escapeHtml(item.topic || "Topic")}</strong>
        <span class="assessment">${escapeHtml(item.assessment || "partial")}</span>
        <p>${escapeHtml(item.evidence || "No evidence provided.")}</p>
      </div>`).join("") || "<p>No structured evidence was returned.</p>"}</div>
    <h3>Next Steps</h3>
    ${(feedback.next || []).map((item) => `<div class="check"><span>✓</span><span>${escapeHtml(item)}</span></div>`).join("")}
  `;
}

function renderChips(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => `<div class="chip">${escapeHtml(item)}</div>`).join("");
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
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
