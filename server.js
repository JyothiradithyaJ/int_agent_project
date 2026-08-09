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

const curriculum = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "curriculum.json"), "utf8"));
const groqApiKey = cleanApiKey(process.env.GROQ_API_KEY);
const forceMock = process.env.USE_MOCK_LLM === "1";
const sessions = new Map();

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: groqApiKey && !forceMock ? "groq-live" : "local-mock",
    model: groqApiKey && !forceMock ? MODEL : "local-mock",
    hasGroqKey: Boolean(groqApiKey),
    forceMock,
  });
});

app.post("/api/interview", async (req, res) => {
  const { sessionId, candidate, message } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ reply: "Missing sessionId.", done: true });
  }

  try {
    if (candidate && !sessions.has(sessionId)) {
      const plan = buildInterviewPlan(curriculum, candidate);
      const state = {
        candidate,
        plan,
        history: [],
        askedCount: 0,
        daysCovered: new Set(),
        currentTopicIndex: 0,
        followUpsOnCurrent: 0,
        phase: "core",
      };
      sessions.set(sessionId, state);

      const name = candidate.member?.name || "there";
      const openingTopic = plan[0];
      const opening = `Welcome, ${name}. Let's begin with something concrete from your cohort work: on Day ${openingTopic.day}, ${openingTopic.topic}, what did you build or learn, and what engineering decision mattered most?`;
      state.history.push({ role: "interviewer", text: opening });
      state.askedCount += 1;
      state.daysCovered.add(openingTopic.day);
      return res.json({ reply: opening, done: false });
    }

    const state = sessions.get(sessionId);
    if (!state) {
      return res.status(400).json({ reply: "Unknown sessionId. Start a new interview first.", done: true });
    }

    if (typeof message === "string" && message.trim()) {
      state.history.push({ role: "candidate", text: message.trim() });
    }

    const planExhausted = state.currentTopicIndex >= state.plan.length - 1;
    const minimumsMet = state.askedCount >= MIN_QUESTIONS && state.daysCovered.size >= MIN_DAYS;
    const overBudget = state.askedCount >= MAX_TURNS;
    if ((minimumsMet && planExhausted) || overBudget) state.phase = "wrapup";

    const turn = await callModelForTurn(state);
    const safeTurn = normalizeTurn(turn, state);

    state.history.push({ role: "interviewer", text: safeTurn.reply });
    if (safeTurn.day_covered) state.daysCovered.add(safeTurn.day_covered);
    state.askedCount += 1;

    if (safeTurn.action === "follow_up") {
      state.followUpsOnCurrent += 1;
      if (state.followUpsOnCurrent > 2) advanceTopic(state);
    } else if (safeTurn.action === "advance_topic") {
      advanceTopic(state);
    }

    if (state.phase === "wrapup" || safeTurn.action === "wrap_up") {
      const feedback = await callModelForFeedback(state);
      sessions.delete(sessionId);
      return res.json({
        reply: safeTurn.action === "wrap_up" ? safeTurn.reply : "Interview completed. Thanks for walking through your cohort work with me.",
        done: true,
        feedback: normalizeFeedback(feedback),
      });
    }

    return res.json({ reply: safeTurn.reply, done: false });
  } catch (err) {
    console.error("interview turn failed:", err);
    return res.status(500).json({
      reply: "I hit a temporary issue on my side. Please send that answer once more and I'll continue the interview.",
      done: false,
    });
  }
});

function advanceTopic(state) {
  state.currentTopicIndex = Math.min(state.currentTopicIndex + 1, state.plan.length - 1);
  state.followUpsOnCurrent = 0;
}

async function callModelForTurn(state) {
  if (!groqApiKey || forceMock) return mockTurn(state);
  return (await callModelForJSON(buildTurnPrompt(state), "turn")) || mockTurn(state);
}

async function callModelForFeedback(state) {
  if (!groqApiKey || forceMock) return mockFeedback(state);
  return (await callModelForJSON(buildFeedbackPrompt(state), "feedback")) || mockFeedback(state);
}

async function callModelForJSON(prompt, kind, retrying = false) {
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  let text = "";

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
        max_tokens: kind === "feedback" ? 1400 : 900,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`Groq API request failed, using local fallback: ${response.status} ${body.slice(0, 180)}`);
      return null;
    }

    const data = await response.json();
    text = data.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.warn(`Groq call failed, using local fallback: ${err.message}`);
    return null;
  }

  try {
    return parseJSON(text);
  } catch (err) {
    if (retrying) {
      console.warn(`Groq returned invalid JSON after retry, using local fallback: ${text.slice(0, 180)}`);
      return null;
    }
    return callModelForJSON(`${prompt}\n\nReturn a complete valid JSON object only. Keep strings short.`, kind, true);
  }
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
  };
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
  app.listen(PORT, () => {
    const mode = groqApiKey && !forceMock ? `Groq live: ${MODEL}` : "local mock mode: set GROQ_API_KEY and unset USE_MOCK_LLM";
    console.log(`Interview agent listening on http://localhost:${PORT} (${mode})`);
  });
}

module.exports = app;
