const MIN_TOPICS = 6;

function findModule(modules, day) {
  return modules.find((m) => day >= m.days[0] && day <= m.days[1]);
}

function classifyMission(mission) {
  if (mission.skipped) return { reason: "skipped", score: 4 };
  if (mission.passed === false) return { reason: "failed", score: 5 };
  if ((mission.attempts || 1) >= 3) return { reason: "struggled", score: 3 };
  return { reason: "mastered", score: 1 };
}

function planItemFromDay(curriculum, missionOrDay, reason = "mastered", score = 0) {
  const dayNumber = missionOrDay.day;
  const day = curriculum.days.find((d) => d.day === dayNumber);
  if (!day) return null;
  const mod = findModule(curriculum.modules || [], dayNumber);

  return {
    day: dayNumber,
    module: mod?.title || "",
    type: day.type,
    topic: missionOrDay.title || day.title,
    objectives: day.objectives || [],
    tools: day.tools || [],
    attempts: missionOrDay.attempts ?? null,
    reason,
    score,
  };
}

function buildInterviewPlan(curriculum, candidate) {
  const missions = Array.isArray(candidate?.missions) ? candidate.missions : [];
  const scored = missions
    .map((mission) => {
      const { reason, score } = classifyMission(mission);
      return planItemFromDay(curriculum, mission, reason, score);
    })
    .filter(Boolean);
  const hasCandidateMastered = scored.some((item) => item.reason === "mastered");

  const seenDays = new Set();
  const spread = [];

  for (const item of [...scored].sort((a, b) => b.score - a.score || a.day - b.day)) {
    if (seenDays.has(item.day)) continue;
    spread.push(item);
    seenDays.add(item.day);
    if (spread.length >= MIN_TOPICS) break;
  }

  if (!spread.some((item) => item.reason === "mastered")) {
    const mastered = scored
      .filter((item) => item.reason === "mastered" && !seenDays.has(item.day))
      .sort((a, b) => (a.attempts ?? 1) - (b.attempts ?? 1) || a.day - b.day);
    if (mastered[0]) {
      spread.unshift(mastered[0]);
      seenDays.add(mastered[0].day);
    }
  }

  for (const day of curriculum.days || []) {
    if (spread.length >= MIN_TOPICS) break;
    if (seenDays.has(day.day)) continue;
    const item = planItemFromDay(curriculum, day, "mastered", 0);
    if (item) {
      spread.push(item);
      seenDays.add(item.day);
    }
  }

  const mastered = spread.filter((item) => item.reason === "mastered");
  const gapRank = { failed: 0, skipped: 1, struggled: 2 };
  const gaps = spread
    .filter((item) => item.reason !== "mastered")
    .sort((a, b) => gapRank[a.reason] - gapRank[b.reason] || b.score - a.score || a.day - b.day);

  let ordered;
  if (mastered.length > 0 && hasCandidateMastered) {
    ordered = [mastered[0], ...gaps, ...mastered.slice(1)];
  } else {
    const struggled = gaps
      .filter((item) => item.reason === "struggled")
      .sort((a, b) => (a.attempts ?? 99) - (b.attempts ?? 99) || a.day - b.day);
    const opener = struggled[0] || gaps[gaps.length - 1];
    ordered = [opener, ...gaps.filter((item) => item !== opener)];
  }

  const closingIndex = ordered.findIndex((item) => item.type === "SHIP_IT" || item.type === "CAPSTONE");
  if (closingIndex !== -1 && closingIndex !== ordered.length - 1) {
    const [closing] = ordered.splice(closingIndex, 1);
    ordered.push(closing);
  }

  return ordered.slice(0, Math.max(MIN_TOPICS, ordered.length));
}

module.exports = { buildInterviewPlan, classifyMission, findModule };
