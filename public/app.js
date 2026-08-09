const candidateSelect = document.querySelector("#candidateSelect");
const startBtn = document.querySelector("#startBtn");
const exitBtn = document.querySelector("#exitBtn");
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
const timerEl = document.querySelector("#timer");
const timerProgress = document.querySelector("#timerProgress");
const timerState = document.querySelector("#timerState");
const responseTimerEl = document.querySelector("#responseTimer");
const questionCountEl = document.querySelector("#questionCount");
const coveredCountEl = document.querySelector("#coveredCount");
const difficultyEl = document.querySelector("#difficulty");
const difficultyHintEl = document.querySelector("#difficultyHint");
const historyList = document.querySelector("#historyList");

const TOTAL_CURRICULUM_DAYS = 31;
const INTERVIEW_SECONDS = 20 * 60;
const RESPONSE_SECONDS = 90;
const HISTORY_KEY = "interview-agent-score-history-v1";
const MAX_HISTORY = 10;

let candidates = [];
let sessionId = crypto.randomUUID();
let coveredDays = new Set();
let loading = false;
let lastRequest = null;
let interviewStartedAt = null;
let interviewRemaining = INTERVIEW_SECONDS;
let responseRemaining = RESPONSE_SECONDS;
let interviewTimerId = null;
let responseTimerId = null;
let questionCount = 0;
let interviewEndedByTimer = false;
let currentCandidate = null;
let lastFinalScore = null;

init();

async function init() {
  setBusy(true, "Loading");
  renderHistory();
  try {
    const [candidateRes, healthRes] = await Promise.all([fetch("/data/candidates.json"), fetch("/api/health")]);
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
  currentCandidate = candidate;
  resetInterviewState();
  sessionId = crypto.randomUUID();
  lastRequest = null;
  chat.innerHTML = "";
  feedbackEl.classList.add("hidden");
  retryBtn.classList.add("hidden");
  chat.classList.remove("hidden");
  composer.classList.remove("hidden");
  setup.classList.add("hidden");
  updateCoverage([]);
  updateDifficulty("foundation");
  startTimers();
  await sendTurn({ sessionId, candidate }, false);
});

exitBtn.addEventListener("click", () => {
  if (!interviewStartedAt || feedbackEl.classList.contains("hidden") === false) returnToSetup();
  else {
    const confirmed = window.confirm("Exit this interview? Your current attempt will not receive a score and its progress will be discarded.");
    if (confirmed) returnToSetup();
  }
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || loading || interviewRemaining <= 0 || interviewEndedByTimer) return;
  input.value = "";
  stopResponseTimer();
  addBubble("candidate", message);
  await sendTurn({ sessionId, message }, true);
});

retryBtn.addEventListener("click", async () => {
  if (!lastRequest || loading || interviewRemaining <= 0) return;
  retryBtn.classList.add("hidden");
  await sendTurn(lastRequest.body, lastRequest.delayed, false);
});

async function sendTurn(body, delayed, saveForRetry = true) {
  setBusy(true, "Thinking");
  if (saveForRetry) lastRequest = { body, delayed };
  try {
    if (delayed) await sleep(350);
    const res = await fetch("/api/interview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.reply || "Request failed");
    addBubble("interviewer", data.reply);
    questionCount += 1;
    questionCountEl.textContent = String(questionCount);
    updateCoverage(data.coverage, data.day_covered);
    if (data.difficulty) updateDifficulty(data.difficulty);
    if (data.done) {
      finishInterview();
      lastRequest = null;
      retryBtn.classList.add("hidden");
      showFeedback(data.feedback);
    } else {
      retryBtn.classList.add("hidden");
      startResponseTimer();
    }
    statusEl.textContent = data.done ? "Complete" : "In progress";
  } catch (err) {
    addBubble("interviewer", err.message || "Something went wrong. Please retry.");
    statusEl.textContent = "Needs retry";
    retryBtn.classList.remove("hidden");
    startResponseTimer();
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
  coverageText.textContent = `${coveredDays.size} / ${TOTAL_CURRICULUM_DAYS} days`;
  coveredCountEl.textContent = `${coveredDays.size}/${TOTAL_CURRICULUM_DAYS}`;
}

function updateDifficulty(level) {
  const normalized = String(level || "foundation").toLowerCase();
  const allowed = ["foundation", "intermediate", "advanced", "production"];
  const value = allowed.includes(normalized) ? normalized : "foundation";
  difficultyEl.textContent = value.toUpperCase();
  difficultyEl.className = `difficulty-badge ${value}`;
  const hints = {
    foundation: "Baseline understanding and implementation fundamentals.",
    intermediate: "Testing reasoning, evidence, and practical trade-offs.",
    advanced: "Pushing architecture decisions and engineering judgment.",
    production: "Evaluating scalability, reliability, observability, and cost.",
  };
  difficultyHintEl.textContent = hints[value];
}

function startTimers() {
  stopTimers();
  interviewStartedAt = Date.now();
  interviewRemaining = INTERVIEW_SECONDS;
  responseRemaining = RESPONSE_SECONDS;
  renderInterviewTimer();
  interviewTimerId = setInterval(() => {
    interviewRemaining = Math.max(0, INTERVIEW_SECONDS - Math.floor((Date.now() - interviewStartedAt) / 1000));
    renderInterviewTimer();
    if (interviewRemaining <= 0) handleInterviewTimeout();
  }, 1000);
  startResponseTimer();
}

function startResponseTimer() {
  stopResponseTimer();
  if (interviewRemaining <= 0) return;
  responseRemaining = RESPONSE_SECONDS;
  renderResponseTimer();
  responseTimerId = setInterval(() => {
    responseRemaining = Math.max(0, responseRemaining - 1);
    renderResponseTimer();
    if (responseRemaining <= 0) handleResponseTimeout();
  }, 1000);
}

function stopResponseTimer() {
  if (responseTimerId) clearInterval(responseTimerId);
  responseTimerId = null;
}

function stopTimers() {
  if (interviewTimerId) clearInterval(interviewTimerId);
  interviewTimerId = null;
  stopResponseTimer();
}

function finishInterview() {
  stopTimers();
  timerState.textContent = "Assessment complete";
  responseTimerEl.textContent = "DONE";
}

function handleResponseTimeout() {
  stopResponseTimer();
  responseTimerEl.textContent = "TIME UP";
  responseTimerEl.className = "danger";
  input.value = "";
  input.disabled = true;
  timerState.textContent = "Response window expired — moving on";
  setTimeout(() => {
    if (interviewRemaining > 0 && feedbackEl.classList.contains("hidden")) {
      input.disabled = false;
      startResponseTimer();
    }
  }, 800);
}

function handleInterviewTimeout() {
  if (interviewEndedByTimer) return;
  interviewEndedByTimer = true;
  stopTimers();
  input.disabled = true;
  statusEl.textContent = "Time expired";
  timerState.textContent = "Time expired — assessment ended";
  timerEl.textContent = "00:00";
  addBubble("interviewer", "Your assessment time has ended. The completed-session scorecard is shown below.");
  composer.classList.add("hidden");
  showFeedback({ summary: "The interview ended when the 20-minute assessment window expired. The score below reflects the evidence collected before time ran out.", recommendation: "INCOMPLETE", confidence: "low", scores: {} });
}

function renderInterviewTimer() {
  const minutes = Math.floor(interviewRemaining / 60);
  const seconds = interviewRemaining % 60;
  timerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const percent = Math.max(0, Math.min(100, (interviewRemaining / INTERVIEW_SECONDS) * 100));
  timerProgress.style.width = `${percent}%`;
  timerEl.className = `timer ${interviewRemaining <= 60 ? "danger" : interviewRemaining <= 300 ? "warning" : ""}`;
  timerState.textContent = interviewRemaining <= 60 ? "Less than one minute remaining" : interviewRemaining <= 300 ? "Five minutes remaining" : "Assessment in progress";
}

function renderResponseTimer() {
  const minutes = Math.floor(responseRemaining / 60);
  const seconds = responseRemaining % 60;
  responseTimerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  responseTimerEl.className = responseRemaining <= 15 ? "danger" : responseRemaining <= 30 ? "warning" : "";
}

function showFeedback(feedback = {}) {
  composer.classList.add("hidden");
  chat.classList.add("hidden");
  feedbackEl.classList.remove("hidden");
  const scores = feedback.scores || {};
  const entries = [["Technical Knowledge", scores.technical_knowledge], ["Problem Solving", scores.problem_solving], ["Engineering Judgment", scores.engineering_judgment], ["Production Readiness", scores.production_readiness], ["Communication", scores.communication]].filter(([, value]) => Number.isFinite(Number(value)));
  const overall = entries.length ? Math.round(entries.reduce((sum, [, value]) => sum + Number(value), 0) / entries.length) : 0;
  const elapsed = interviewStartedAt ? Math.max(0, Math.floor((Date.now() - interviewStartedAt) / 1000)) : 0;
  const recommendation = feedback.recommendation || recommendationFromScore(overall);
  const confidence = feedback.confidence || "medium";
  const isIncomplete = recommendation === "INCOMPLETE";
  if (!isIncomplete && entries.length) saveScoreHistory({ score: overall, recommendation, confidence, questions: questionCount, coverage: coveredDays.size, duration: elapsed, candidate: getCandidateName() });
  lastFinalScore = isIncomplete ? null : overall;
  feedbackEl.innerHTML = `
    <div class="feedback-head"><div><div class="eyebrow">ASSESSMENT REPORT</div><h2>Interview scorecard</h2><p class="feedback-summary">${escapeHtml(feedback.summary || "Interview complete. The report reflects evidence collected during the assessment.")}</p><div class="recommendation"><span class="label">${escapeHtml(recommendation)}</span><span class="confidence">Evaluation confidence: ${escapeHtml(confidence)}</span></div></div><div class="overall-score"><strong>${isIncomplete ? "—" : `${overall}/100`}</strong><span>${isIncomplete ? "Incomplete assessment" : "Final score"}</span></div></div>
    <div class="metric-grid"><div class="metric"><strong>${questionCount}</strong><span>Questions</span></div><div class="metric"><strong>${coveredDays.size}/${TOTAL_CURRICULUM_DAYS}</strong><span>Curriculum days</span></div><div class="metric"><strong>${formatDuration(elapsed)}</strong><span>Time used</span></div><div class="metric"><strong>${Math.round((coveredDays.size / TOTAL_CURRICULUM_DAYS) * 100)}%</strong><span>Coverage</span></div></div>
    ${entries.length ? `<div class="score-layout"><div><h3>Competency scores</h3><div class="scores">${entries.map(([label, value]) => `<div class="score-row"><div class="score-header"><span>${escapeHtml(label)}</span><strong>${Number(value)}/100</strong></div><div class="score-track"><div class="score-fill" style="width:${Math.max(0, Math.min(100, Number(value)))}%"></div></div></div>`).join("")}</div></div><div><h3>Strengths</h3><div class="chips">${renderChips(feedback.strengths)}</div><h3>Gaps</h3><div class="chips">${renderChips(feedback.gaps)}</div></div></div>` : `<div class="chip">No final competency score was produced because the assessment ended before a final AI evaluation was available.</div>`}
    ${entries.length ? `<h3>Evidence from the interview</h3><div class="evidence-list">${(feedback.evidence || []).map((item) => `<div class="evidence ${escapeHtml(item.assessment || "partial")}"><strong>${escapeHtml(item.topic || "Topic")}</strong><span class="assessment">${escapeHtml(item.assessment || "partial")}</span><p>${escapeHtml(item.evidence || "No evidence provided.")}</p></div>`).join("") || "<p>No structured evidence was returned.</p>"}</div><h3>Recommended next steps</h3>${(feedback.next || []).map((item) => `<div class="check"><span>✓</span><span>${escapeHtml(item)}</span></div>`).join("") || "<div class=\"chip\">Continue practicing evidence-based technical explanations.</div>"}` : ""}
    ${renderHistorySection()}
  `;
  feedbackEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function saveScoreHistory(result) {
  const history = readHistory();
  history.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), ...result });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY))); } catch (_) {}
  renderHistory();
}

function readHistory() {
  try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch (_) { return []; }
}

function renderHistory() {
  if (!historyList) return;
  const history = readHistory();
  if (!history.length) { historyList.innerHTML = '<div class="history-empty">No completed interviews yet. Your first final score will appear here.</div>'; return; }
  historyList.innerHTML = history.map((item) => `<div class="history-row"><div><div class="history-name">${escapeHtml(item.candidate || "Candidate")}</div><div class="history-date">${escapeHtml(formatDate(item.date))} · ${item.questions || 0} questions · ${item.coverage || 0}/31 days</div></div><strong class="history-score">${Number(item.score)}/100</strong><span class="history-rec">${escapeHtml(item.recommendation || "ASSESSED")}</span></div>`).join("");
}

function renderHistorySection() {
  const history = readHistory();
  if (!history.length) return '';
  return `<div class="history-in-report"><h3>Score history</h3><div class="history-list">${history.slice(0, 5).map((item) => `<div class="history-row"><div><div class="history-name">${escapeHtml(item.candidate || "Candidate")}</div><div class="history-date">${escapeHtml(formatDate(item.date))}</div></div><strong class="history-score">${Number(item.score)}/100</strong><span class="history-rec">${escapeHtml(item.recommendation || "ASSESSED")}</span></div>`).join("")}</div>`;
}

function getCandidateName() { return currentCandidate?.member?.name || "Candidate"; }
function formatDate(value) { try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch (_) { return "Previous attempt"; } }
function recommendationFromScore(score) { if (score >= 85) return "STRONG HIRE"; if (score >= 70) return "HIRE"; if (score >= 55) return "BORDERLINE"; return "NO HIRE"; }
function formatDuration(totalSeconds) { const minutes = Math.floor(totalSeconds / 60); const seconds = totalSeconds % 60; return `${minutes}m ${String(seconds).padStart(2, "0")}s`; }
function renderChips(items = []) { return (Array.isArray(items) ? items : []).map((item) => `<div class="chip">${escapeHtml(item)}</div>`).join("") || "<div class=\"chip\">No items recorded.</div>"; }

function returnToSetup() {
  stopTimers();
  loading = false;
  interviewEndedByTimer = false;
  interviewStartedAt = null;
  currentCandidate = null;
  lastRequest = null;
  chat.innerHTML = "";
  feedbackEl.classList.add("hidden");
  retryBtn.classList.add("hidden");
  composer.classList.remove("hidden");
  chat.classList.remove("hidden");
  setup.classList.remove("hidden");
  input.value = "";
  input.disabled = false;
  resetInterviewState();
  statusEl.textContent = "Ready";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetInterviewState() {
  stopTimers();
  coveredDays = new Set();
  questionCount = 0;
  interviewEndedByTimer = false;
  interviewStartedAt = null;
  interviewRemaining = INTERVIEW_SECONDS;
  responseRemaining = RESPONSE_SECONDS;
  questionCountEl.textContent = "0";
  coveredCountEl.textContent = "0/31";
  timerEl.textContent = "20:00";
  timerEl.className = "timer";
  timerProgress.style.width = "100%";
  timerState.textContent = "Ready when you are";
  responseTimerEl.textContent = "01:30";
  responseTimerEl.className = "";
  input.disabled = false;
  updateCoverage([]);
}

function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function setBusy(value, label) { loading = value; startBtn.disabled = value; input.disabled = value || interviewEndedByTimer || interviewRemaining <= 0; composer.querySelector("button").disabled = value || interviewEndedByTimer || interviewRemaining <= 0; if (label) statusEl.textContent = label; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
