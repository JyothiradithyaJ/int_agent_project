const express = require("express");
const fs = require("fs");
const path = require("path");

const { buildInterviewPlan } = require("./planner");
const { buildTurnPrompt, buildFeedbackPrompt } = require("./prompts");

loadEnvFile();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/data", express.static(path.join(__dirname, "data")));

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const MIN_QUESTIONS = 8;
const MIN_DAYS = 4;
const MAX_TURNS = 16;
const SESSION_TTL_MS = 60 * 60 * 1000;
const GROQ_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS || 20000);

const curriculum = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "curriculum.json"), "utf8"));
const groqApiKey = cleanApiKey(process.env.GROQ_API_KEY);
const forceMock = process.env.USE_MOCK_LLM === "1";
const sessions = new Map();

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: forceMock ? "local-mock" : groqApiKey ? "groq-live" : "configuration-error",
    model: forceMock ? "local-mock" : MODEL,
    hasGroqKey: Boolean(groqApiKey),
    forceMock,
    curriculumDays: curriculum.days?.length || 0,
  });
});

app.get("/api/groq-test", async (_req, res) => {
  if (!groqApiKey) {
    return res.status(500).json({ ok: false, error: "GROQ_API_KEY is missing" });
  }

  try {
    const result = await callGroq("Reply with exactly GROQ_OK", "health");
    return res.json({
      ok: true,
      model: MODEL,
      response: result.text.trim(),
    });
  } catch (err) {
    console.error("Groq health check failed:", err.message);
    return res.status(err.statusCode || 502).json({
      ok: false,
      model: MODEL,
      error: err.publicMessage || err.message,
    });
  }
});

app.post("/api/interview", async (req, res) => {
  const { sessionId, candidate, message } = req.body || {};

  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ reply: "Missing or invalid sessionId.", done: true });
  }

  if (message !== undefined && typeof message !== "string") {
    return res.status(400).json({ reply: "Invalid message.", done: false });
  }

  if (typeof message === "string" && message.trim().length > 5000) {
    return res.status(400).json({
      reply: "Please keep your answer under 5000 characters.",
      done: false,
    });
  }

  let addedCandidateMessage = false;

  try {
    if (candidate && !sessions.has(sessionId)) {
      if (!candidate.member?.name) {
        return res.status(400).json({ reply: "Invalid candidate profile.", done: true });
      }

      const plan = buildInterviewPlan(curriculum, candidate);
      if (!plan.length) {
        return res.status(422).json({
          reply: "I could not build an interview plan for this candidate.",
          done: true,
        });
      }

      const state = {
        candidate,
        plan,
        history: [],
        askedCount: 0,
        daysCovered: new Set(),
        currentTopicIndex: 0,
        followUpsOnCurrent: 0,
        qualitySignals: [],
        topicHistory: [],
        createdAt: Date.now(),
        phase: "core",
      };
      sessions.set(sessionId, state);

      const name = candidate.member.name || "there";
      const openingTopic = plan[0];
      const opening = `Welcome, ${name}. Let's begin with something concrete from your cohort work: on Day ${openingTopic.day}, ${openingTopic.topic}, what did you build or learn, and what engineering decision mattered most?`;
      state.history.push({ role: "interviewer", text: opening });
      state.askedCount += 1;
      state.daysCovered.add(openingTopic.day);
      state.topicHistory.push(openingTopic.day);
      return res.json({
        reply: opening,
        done: false,
        day_covered: openingTopic.day,
        coverage: [...state.daysCovered].sort((a, b) => a - b),
      });
    }

    const state = sessions.get(sessionId);
    if (!state) {
      return res.status(400).json({ reply: "Unknown sessionId. Start a new interview first.", done: true });
    }

    if (Date.now() - state.createdAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      return res.status(400).json({ reply: "This interview session has expired. Please start a new interview.", done: true });
    }

    if (typeof message === "string" && message.trim()) {
      state.history.push({ role: "candidate", text: message.trim() });
      addedCandidateMessage = true;
    }

    const planExhausted = state.currentTopicIndex >= state.plan.length - 1;
    const minimumsMet = state.askedCount >= MIN_QUESTIONS && state.daysCovered.size >= MIN_DAYS;
    const overBudget = state.askedCount >= MAX_TURNS;
    if ((minimumsMet && planExhausted) || overBudget) state.phase = "wrapup";

    const turn = await callModelForTurn(state);
    const safeTurn = normalizeTurn(turn, state);

    state.history.push({ role: "interviewer", text: safeTurn.reply });
    if (safeTurn.day_covered) state.daysCovered.add(safeTurn.day_covered);
    state.qualitySignals.push(safeTurn.quality_signal);
    state.askedCount += 1;

    if (safeTurn.action === "follow_up") {
      state.followUpsOnCurrent += 1;
      if (state.followUpsOnCurrent >= 2) advanceTopic(state);
    } else if (safeTurn.action === "advance_topic") {
      advanceTopic(state);
    }

    if (state.phase === "wrapup" || safeTurn.action === "wrap_up") {
      const feedback = await callModelForFeedback(state);
      const response = {
        reply: safeTurn.action === "wrap_up"
          ? safeTurn.reply
          : "Interview completed. Thanks for walking through your cohort work with me.",
        done: true,
        feedback: normalizeFeedback(feedback),
        coverage: [...state.daysCovered].sort((a, b) => a - b),
      };
      sessions.delete(sessionId);
      return res.json(response);
    }

    return res.json({
      reply: safeTurn.reply,
      done: false,
      day_covered: safeTurn.day_covered,
      quality_signal: safeTurn.quality_signal,
      coverage: [...state.daysCovered].sort((a, b) => a - b),
    });
  } catch (err) {
    console.error("interview turn failed:", err);

    // Do not leave a failed candidate message in the transcript. This prevents
    // duplicate answers when the user retries the same turn.
    const state = sessions.get(sessionId);
    if (addedCandidateMessage && state?.history?.at(-1)?.role === "candidate") {
      state.history.pop();
    }

    return res.status(503).json({
      reply: "The AI interviewer is temporarily unavailable. Please try again in a moment.",
      done: false,
      error: "LLM_UNAVAILABLE",
    });
  }
});

function advanceTopic(state) {
  state.currentTopicIndex = Math.min(state.currentTopicIndex + 1, state.plan.length - 1);
  state.followUpsOnCurrent = 0;
}

async function callModelForTurn(state) {
  if (forceMock) return mockTurn(state);
  if (!groqApiKey) throw new Error("GROQ_API_KEY is missing");
  const result = await callModelForJSON(buildTurnPrompt(state), "turn");
  return result;
}

async function callModelForFeedback(state) {
  if (forceMock) return mockFeedback(state);
  if (!groqApiKey) throw new Error("GROQ_API_KEY is missing");
  return callModelForJSON(buildFeedbackPrompt(state), "feedback");
}

async function callModelForJSON(prompt, kind, retrying = false) {
  const result = await callGroq(prompt, kind);
  const text = result.text;

  try {
    return parseJSON(text);
  } catch (err) {
    if (retrying) {
      throw new Error(`Groq returned invalid JSON after retry: ${err.message}`);
    }

    return callModelForJSON(
      `${prompt}\n\nIMPORTANT: Return one complete valid JSON object only. Do not include markdown or code fences. Keep strings concise.`,
      kind,
      true
    );
  }
}

async function callGroq(prompt, kind) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "You return only complete valid JSON that matches the requested schema.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: kind === "feedback" ? 1400 : kind === "health" ? 20 : 900,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    const body = await response.text();

    if (!response.ok) {
      console.error("Groq API error:", {
        status: response.status,
        body: body.slice(0, 1000),
        model: MODEL,
      });

      const error = new Error(`Groq API returned HTTP ${response.status}`);
      error.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
      error.publicMessage = groqPublicError(response.status);
      throw error;
    }

    let data;
    try {
      data = JSON.parse(body);
    } catch (_err) {
      throw new Error("Groq returned invalid HTTP response JSON");
    }

    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Groq response did not contain message content");

    return { text };
  } catch (err) {
    if (err.name === "AbortError") {
      const timeoutError = new Error(`Groq request timed out after ${GROQ_TIMEOUT_MS}ms`);
      timeoutError.statusCode = 504;
      timeoutError.publicMessage = "Groq did not respond before the request timed out.";
      throw timeoutError;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function groqPublicError(status) {
  if (status === 400) return "Groq rejected the request. Check the model and request configuration.";
  if (status === 401) return "Groq authentication failed. Check GROQ_API_KEY.";
  if (status === 403) return "Groq denied the request. Check API key permissions.";
  if (status === 429) return "Groq rate limit reached. Please wait and try again.";
  if (status >= 500) return "Groq is temporarily unavailable. Please try again shortly.";
  return `Groq request failed with HTTP ${status}.`;
}

function parseJSON(text) {
  const cleaned = String(text)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch (_err) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw _err;
  }
}

function normalizeTurn(turn, state) {
  const topic = state.plan[Math.min(state.currentTopicIndex, state.plan.length - 1)];
  const action = ["follow_up", "advance_topic", "wrap_up"].includes(turn?.action) ? turn.action : "advance_topic";
  return {
    reply: typeof turn?.reply === "string" && turn.reply.trim() ? turn.reply.trim() : fallbackQuestion(topic),
    action,
    day_covered: Number.isInteger(turn?.day_covered) ? turn.day_covered : topic.day,
    quality_signal: ["strong", "partial", "weak"].includes(turn?.quality_signal) ? turn.quality_signal : "partial",
    done: Boolean(turn?.done),
  };
}

function normalizeFeedback(feedback) {
  return {
    summary: stringOr(feedback?.summary, "You communicated several relevant ideas, with room to make trade-offs more concrete."),
    strengths: arrayOr(feedback?.strengths, ["Connected cohort concepts to implementation decisions."]),
    gaps: arrayOr(feedback?.gaps, ["Add more specific metrics, failure modes, and production trade-offs in future answers."]),
    next: arrayOr(feedback?.next, ["Practice explaining one cohort project end to end: requirements, design, evaluation, deployment, and monitoring."]),
    scores: normalizeScores(feedback?.scores),
    evidence: normalizeEvidence(feedback?.evidence),
  };
}

function normalizeScores(scores) {
  const keys = [
    "technical_knowledge",
    "problem_solving",
    "engineering_judgment",
    "production_readiness",
    "communication",
  ];
  return Object.fromEntries(keys.map((key) => {
    const value = Number(scores?.[key]);
    return [key, Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0];
  }));
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter((item) => item && typeof item === "object")
    .slice(0, 10)
    .map((item) => ({
      topic: stringOr(item.topic, "Topic"),
      assessment: ["strong", "partial", "weak"].includes(item.assessment) ? item.assessment : "partial",
      evidence: stringOr(item.evidence, "No specific evidence provided."),
    }));
}

function stringOr(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function arrayOr(value, fallback) {
  return Array.isArray(value) && value.length ? value.map(String).filter(Boolean) : fallback;
}

function fallbackQuestion(topic) {
  return `Let's move to Day ${topic.day}, ${topic.topic}. What was the key engineering trade-off you had to make there, and how would you defend it in production?`;
}

function mockTurn(state) {
  const topic = state.plan[Math.min(state.currentTopicIndex, state.plan.length - 1)];
  if (state.phase === "wrapup") {
    return {
      reply: "Interview completed. Thanks for walking through your cohort work with me.",
      action: "wrap_up",
      day_covered: topic.day,
      quality_signal: "partial",
      done: true,
    };
  }

  const lastAnswer = [...state.history].reverse().find((item) => item.role === "candidate")?.text || "";
  const vague = lastAnswer.trim().split(/\s+/).length < 18;
  if (vague && state.followUpsOnCurrent < 1) {
    return {
      reply: `Let's make that more concrete. For Day ${topic.day}, ${topic.topic}, what failure mode would you watch for, and how would you know your solution was working?`,
      action: "follow_up",
      day_covered: topic.day,
      quality_signal: "weak",
      done: false,
    };
  }

  const nextTopic = state.plan[Math.min(state.currentTopicIndex + 1, state.plan.length - 1)];
  return {
    reply: `Good, that gives me a clearer signal. Now let's shift to Day ${nextTopic.day}, ${nextTopic.topic}: explain the most important design choice you made and the trade-off behind it.`,
    action: "advance_topic",
    day_covered: nextTopic.day,
    quality_signal: "partial",
    done: false,
  };
}

function mockFeedback(state) {
  const days = [...state.daysCovered].sort((a, b) => a - b).join(", ");
  return {
    summary: `The interview covered curriculum Days ${days}. The candidate gave usable high-level explanations and should keep practicing sharper production trade-offs.`,
    strengths: ["Maintained context across multiple AI engineering topics.", "Explained cohort work in terms of design choices rather than only definitions."],
    gaps: ["Some answers need more concrete evaluation metrics and failure modes.", "Production readiness could be explained with more detail around monitoring, rollback, and data quality."],
    next: ["Rehearse a full RAG system walkthrough from ingestion through evaluation.", "Prepare concise examples for vector search trade-offs, prompt design, agent control flow, MCP integration, and deployment monitoring."],
    scores: {
      technical_knowledge: 70,
      problem_solving: 70,
      engineering_judgment: 65,
      production_readiness: 60,
      communication: 75,
    },
    evidence: [],
  };
}

function cleanApiKey(value) {
  return String(value || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^["']|["']$/g, "");
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const mode = forceMock
    ? "local mock mode"
    : groqApiKey
      ? `Groq live: ${MODEL}`
      : "configuration error: GROQ_API_KEY is missing";
  console.log(`Interview agent starting on http://localhost:${PORT} (${mode})`);
  app.listen(PORT, () => {
    console.log(`Interview agent listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
