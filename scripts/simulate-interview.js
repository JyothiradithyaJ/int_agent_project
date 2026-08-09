process.env.USE_MOCK_LLM = "1";

const app = require("../server");
const { candidates } = require("../data/candidates.json");

const PORT = process.env.SIM_PORT || 3199;
const base = `http://localhost:${PORT}`;

const answers = [
  "I would start by identifying the user need, then explain the implementation choice and the trade-off between speed, correctness, and maintainability.",
  "For a RAG system, I would chunk documents, embed them, retrieve the most relevant context, and measure whether the final answer is grounded.",
  "The failure mode I would watch for is confident but unsupported generation, so I would log retrieved chunks and compare answers against expected evidence.",
  "For vector search I would tune chunk size and top-k because too much context adds noise while too little context misses the answer.",
  "Prompt design matters because the instruction should constrain format, role, context use, and refusal behavior without hiding system limitations.",
  "For agents I would keep tools explicit, validate tool inputs, and add stop conditions so the agent does not loop or take unsafe actions.",
  "For MCP I would describe the server as a typed bridge to tools and resources, with clear contracts for what the model can request.",
  "In deployment I would monitor latency, cost, retrieval quality, error rate, and user feedback, then roll back if quality regressed.",
  "End to end, I would connect ingestion, retrieval, prompting, evaluation, deployment, and monitoring so each layer can be debugged independently.",
];

async function main() {
  const server = app.listen(PORT);
  try {
    let payload = await post("/api/interview", {
      sessionId: "sim-1",
      candidate: candidates[0],
    });
    assertShape(payload);

    const days = new Set(Array.isArray(payload.coverage) ? payload.coverage : []);
    if (Number.isInteger(payload.day_covered)) days.add(payload.day_covered);

    for (const message of answers) {
      payload = await post("/api/interview", { sessionId: "sim-1", message });
      assertShape(payload);
      if (Array.isArray(payload.coverage)) payload.coverage.forEach((day) => days.add(day));
      if (Number.isInteger(payload.day_covered)) days.add(payload.day_covered);
      if (payload.done) break;
    }

    if (!payload.done) throw new Error("Simulation did not finish.");
    if (!payload.feedback) throw new Error("Final response is missing feedback.");
    if (days.size < 4) throw new Error(`Simulation covered only ${days.size} days.`);

    console.log(`Simulation passed. Covered ${days.size} days. Final feedback keys: ${Object.keys(payload.feedback).join(", ")}`);
  } finally {
    server.close();
  }
}

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

function assertShape(payload) {
  const required = ["coverage", "done", "reply"];
  const missing = required.filter((key) => !(key in payload));
  if (missing.length) {
    throw new Error(`Bad response shape: missing ${missing.join(",")}`);
  }
  if (!Array.isArray(payload.coverage)) throw new Error("Bad coverage type.");
  if (typeof payload.reply !== "string" || typeof payload.done !== "boolean") {
    throw new Error("Bad reply/done types.");
  }
  if (!payload.done && !("day_covered" in payload)) {
    throw new Error("Non-final response is missing day_covered.");
  }
  if (payload.done && (!payload.feedback || typeof payload.feedback !== "object")) {
    throw new Error("Final response is missing feedback.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
