const curriculum = require("../data/curriculum.json");
const { candidates } = require("../data/candidates.json");
const { buildInterviewPlan } = require("../planner");

let failed = false;

for (const candidate of candidates) {
  const plan = buildInterviewPlan(curriculum, candidate);
  const days = new Set(plan.map((item) => item.day));
  const opener = plan[0];
  const okDays = days.size >= 4;
  const okOpener = opener && ["mastered", "struggled"].includes(opener.reason);
  const name = candidate.member?.name || candidate.member?.id || "Unknown";

  console.log(`${name}: days=${days.size}, opener=${opener?.reason}, day=${opener?.day}, topic=${opener?.topic}`);

  if (!okDays || !okOpener) failed = true;
}

if (failed) {
  console.error("Planner check failed.");
  process.exit(1);
}

console.log("Planner check passed.");
