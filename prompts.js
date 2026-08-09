const REASON_FRAMING = {
  failed: "the candidate attempted this and never passed it; check whether the concept has since solidified",
  skipped: "the candidate skipped this; assume low prior exposure and check baseline awareness before going deep",
  struggled: "the candidate passed after several attempts; verify what finally clicked and what was hard",
  mastered: "the candidate passed confidently; ask for design reasoning, trade-offs, and real engineering judgment",
};

function currentPlanItem(plan, index) {
  return plan[Math.min(index, plan.length - 1)];
}

function candidateContextLine(candidate) {
  const member = candidate.member || {};
  const signals = candidate.signals || {};
  const firstTryRate = signals.missionsCompleted
    ? Math.round((signals.missionsFirstTry / signals.missionsCompleted) * 100)
    : null;

  return [
    `${member.name || "Candidate"} - ${member.jobRole || "AI Cohort graduate"}, ${member.yearsExperience ?? "unknown"} yrs experience, ${member.education || "education not provided"}.`,
    signals.missionsCompleted
      ? `Completed ${signals.missionsCompleted} missions over ${signals.commitDays} active days; ${firstTryRate}% first-try pass rate.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildTurnPrompt({ candidate, plan, currentTopicIndex, phase, history, followUpsOnCurrent }) {
  const topic = currentPlanItem(plan, currentTopicIndex);
  const remainingTopics = plan.slice(currentTopicIndex + 1).map((item) => `Day ${item.day}: ${item.topic}`);
  const transcript = history
    .map((item) => `${item.role === "interviewer" ? "Interviewer" : "Candidate"}: ${item.text}`)
    .join("\n");

  return `You are conducting a live technical interview for "The AI Cohort", a 31-day applied AI engineering program covering RAG, vector databases, prompting, agents, MCP, deployment, and production AI systems.

Be warm, realistic, and rigorous. Ask one question at a time. Do not sound scripted.

CANDIDATE
${candidateContextLine(candidate)}

CURRENT PHASE: ${phase}
${phase === "wrapup" ? "This is the closing turn. Thank the candidate and end the interview. Do not ask a new question." : ""}

CURRENT TOPIC
Day ${topic.day} (${topic.module}, ${topic.type}) - ${topic.topic}
Reasoning frame: ${REASON_FRAMING[topic.reason]}
Attempts: ${topic.attempts ?? "n/a"}
Learning objectives: ${topic.objectives.join("; ") || "n/a"}
Tools: ${topic.tools.join(", ") || "n/a"}
Follow-ups already asked on this topic: ${followUpsOnCurrent}
Topics still ahead: ${remainingTopics.join(", ") || "none"}

TRANSCRIPT
${transcript || "(empty)"}

TASK
Use the candidate's latest answer to decide the next move:
- If the answer is vague, shallow, or avoids trade-offs, ask a targeted follow-up on the same topic.
- If the answer is solid, briefly acknowledge one specific point and move to the next planned topic.
- Never ask more than 2 follow-ups on the same topic.
- For SHIP_IT or CAPSTONE topics, ask about system integration and production decisions.
- If phase is wrapup, close the interview naturally.

Return ONLY this JSON object:
{
  "reply": "<2-4 sentence interviewer message>",
  "action": "follow_up" | "advance_topic" | "wrap_up",
  "day_covered": ${topic.day},
  "quality_signal": "strong" | "partial" | "weak",
  "done": false
}`;
}

function buildFeedbackPrompt({ candidate, plan, history }) {
  const transcript = history
    .map((item) => `${item.role === "interviewer" ? "Interviewer" : "Candidate"}: ${item.text}`)
    .join("\n");
  const plannedTopics = plan
    .map((item) => `Day ${item.day} (${item.topic}, ${item.type}) - ${item.reason}`)
    .join("\n");

  return `Produce structured feedback for ${candidate.member?.name || "the candidate"} after this technical interview.

CANDIDATE
${candidateContextLine(candidate)}

PLANNED TOPICS
${plannedTopics}

TRANSCRIPT
${transcript}

Evaluate only what the candidate demonstrated in the transcript. Be concrete and actionable.

Return ONLY this JSON object:
{
  "summary": "<2-3 sentence overall assessment>",
  "strengths": ["<specific strength tied to evidence>", "..."],
  "gaps": ["<specific gap or weak explanation>", "..."],
  "next": ["<specific study or practice step tied to a curriculum day>", "..."]
}`;
}

module.exports = { buildTurnPrompt, buildFeedbackPrompt };
