# PROMPTS.md — AI Usage Log

This document records the AI-assisted development prompts used to design and build the AI Interview Agent. It includes the original Claude session log supplied for the project and the later ChatGPT/Codex-oriented prompts used for implementation, debugging, UX refinement, and deployment.

> **Submission note:** This file is intended to document AI-assisted development for review. If additional AI tools were used outside the sessions recorded below, append their prompts to this file before submission.

---

# Part I — Claude Session Log

**Tool used:** Claude (Claude Sonnet 5, web interface)  
**Purpose:** architecture design, backend implementation, and prompt engineering for the AI Interview Agent submission.

## Prompt 1 — Initial architecture request

**Attachments:** `ViCodathon-Participant-QnA.pdf`, `technical-spec (1).md`

> this is the problem statement for building an agent. I want you to give me a complete detailed working flow of such agent The Interview Agent
> Build the interviewer, not the interview.
> The Situation
> The AI Cohort is a 31-day enterprise AI engineering program covering modern AI topics including: Retrieval-Augmented Generation (RAG), Vector Databases, Prompt Engineering, Agentic AI, Model Context Protocol (MCP), AI Deployment, Production AI Systems
> After completing the cohort, learners should be able to confidently explain the systems they built and the engineering decisions behind them. However, preparing for technical interviews and effectively communicating this knowledge remains one of the biggest challenges. Your task is to build an AI Interview Agent that conducts personalized technical interviews based on a candidate's learning journey throughout the cohort.
> Your Challenge: Design and build an AI agent capable of conducting a realistic, multi-turn technical interview. The interview should: Assess the candidate's understanding of the concepts they have completed. Adapt naturally throughout the conversation. Ask intelligent follow-up questions. Maintain context across the interview. Provide actionable feedback at the end. The overall experience should resemble a real technical interview rather than a scripted questionnaire.
> What You're Given: 1. Curriculum — a structured JSON containing the complete 31-day AI Cohort curriculum, including modules, daily topics, learning objectives, tools used throughout the program. 2. Candidate Profiles — a collection of candidate profiles describing each participant's progress through the cohort, including completed missions, attempts, skipped topics, learning signals. 3. Technical Specification — a separate document defining required API contract, submission requirements, request/response formats.
> Minimum Requirements: Conduct a conversational technical interview. Ask a minimum of 8 questions covering at least 4 different curriculum days. Generate follow-up questions based on previous responses. Maintain conversation context throughout the interview. Produce structured feedback at the end of the interview. Expose the required HTTP endpoint defined in the Technical Specification. You are free to choose any AI models, Frameworks, Agent orchestration strategy, Retrieval pipeline, System architecture. Out of Scope: Voice interaction, User authentication, Persistent user accounts, Long-term conversation history, Mobile applications. Make sure UI and UX is at professional level. The flow need not be simple but also not too complicated at the same time.

## Prompt 2 — Confirmation to proceed

> okay

## Prompt 3 — Request for a Codex build prompt

> give proper prompt so that i can tell codex on VS code to build it properly.
> Make sure to also mention that it does not take a lot of time and can build a proper system without any errors.

## Prompt 4 — Real data upload, request to reconcile design against it

**Attachments:** `curriculum.json`, `candidates.json`, `technical-spec.md`

> Keeping these files alert the prompt accordingly and give a new and more efficient agent system.

## Prompt 5 — Free API key research

> what are the free(no card) api keys available for this project

## Prompt 6 — Landing page UI/UX request

**Attachment:** `Screenshot_2026-08-09_182808.png` (reference landing page design)

> I want you to give a prompt to tell chatgpt to build such a UI/UX. Make necessary changes.

## Prompt 7 — This prompt log request

> Give a list of all prompts used in this chat

## What each Claude prompt produced

| # | Output |
|---|---|
| 1 | End-to-end architecture: session model, deterministic topic planner, per-turn LLM prompt design, coverage-guarantee logic, feedback synthesis, UI/UX plan, spec-compliance mapping — with an inline flow diagram |
| 3 | `CODEX_BUILD_PROMPT.md` — a build brief for Codex covering the full spec |
| 4 | Rebuilt `planner.js`, `prompts.js`, `server.js` against the real `curriculum.json`/`candidates.json` schemas; verified against all 20 real candidate profiles; two real edge-case bugs found and fixed; `CODEX_BUILD_PROMPT.md` updated with exact schemas |
| 5 | Comparison of free, no-card LLM API providers (Groq, Gemini, OpenRouter, DeepSeek, NVIDIA NIM, Cerebras) |
| 6 | `CHATGPT_LANDING_PAGE_PROMPT.md` — a design-direction brief for a landing page, adapted from the reference screenshot to this product |
| 7 | This file |

---

# Part II — ChatGPT / Codex Development Log

## 1. Project efficiency review

> Tell me if any changes can be made in this project so the project is efficient.

Follow-ups:

> Okay make the necessary changes and tell me step by step where and what to do.

> I have not started building so give from beginning where and what is to be done.

> Give me description of what and where is to be done so I can describe it to Codex on VS Code.

## 2. Speed up the first implementation phase

> Phase 1 is done but takes a lot of time, give instructions so that Codex completes a bit faster and correctly.

## 3. Groq integration troubleshooting

> This is my GitHub link check the project and give me the changes to be done. One error is that Groq is not responding. check for other changes too.

> Can you make changes directly into my files by pulling?

> okay do it

## 4. Groq environment configuration

> no there is no .env, there is only .env.example thats it. So shall i create one?

> okay done

## 5. Groq verification

The local health response was checked:

```text
{"ok":true,"mode":"groq-live","model":"llama-3.3-70b-versatile","hasGroqKey":true,"forceMock":false,"curriculumDays":31}
```

The Groq test was verified with:

```text
npm.cmd run test:groq
```

Expected result:

```text
✅ Groq is working
Model: llama-3.3-70b-versatile
Response: {
"status": "GROQ_OK"
}
```

The interview simulation was verified with:

```text
npm.cmd run test:simulate
```

Expected result:

```text
Simulation passed. Covered 6 days. Final feedback keys: summary, strengths, gaps, next, scores, evidence
```

## 6. Interview timer and scorecard

> okay its working but now i want to include more novel features such as timer and also a score card too.

## 7. Production-grade UI/UX

> okay also make keep it a production grade UI/UX instead of a simple one.

## 8. Professional technical-product redesign

> i want the UI and UX to be changed as it is too usual and want it to be professional and also tech friendly. Also it has to be deployable later

The design direction was then specified as an editorial technical-product landing page:

> Build a single-page marketing/landing page for an AI-powered technical interview practice tool. Use a warm editorial cream/off-white background, a deep charcoal/olive contrast section, a restrained amber/orange accent, serif display typography for headlines, clean sans-serif UI text, soft rounded cards, subtle shadows, accessible contrast, responsive layout, no unnecessary stock photography, and a realistic interview-product mockup. Adapt every metric and label to an interview-prep product. Keep it self-contained and deployable.

## 9. Remove empty/placeholder UI

> The UI includes a lot of empty pictures and more slots so remove all and keep only necessary features and make it clean and do not overlap things. There is a lot of mistakes on UI so make all fixes. I want it to be sensible.

Design principle established:

> Fewer components, clear hierarchy, zero overlap, sensible information density, and one consistent visual language across the landing page and interview workspace.

## 10. Make the interview page visually consistent

> when i click run your assessment or start the UI is dark, make it same as the landing page. I want it to be same. Also change this error.

The resulting changes made the interview workspace use the same light visual language as the landing page and fixed the score-rendering bug that displayed JavaScript template expressions as literal text.

## 11. Exit interview and score history

> Add a exit interview option indicated with a danger kind of symbol during the interview and also make sure score is displayed at the last. Also keep score history to be displayed

The resulting behavior:

- Exit interview uses a clearly differentiated danger treatment and confirmation.
- An incomplete/abandoned interview does not create a fake score.
- A completed interview produces the final scorecard.
- Completed assessment results are stored in browser localStorage.
- Recent score history is displayed for comparison.

## 12. Deployment preparation

> okay now we have to deploy it and provide live url

Deployment requirements established:

- Use the GitHub repository as the source.
- Keep Groq credentials server-side.
- Use environment variables for secrets/configuration.
- Expose a health endpoint.
- Start the Node/Express service with `npm start`.
- Keep the application deployable without an unnecessary frontend build pipeline.

## 13. Deploy from main

> i want to connect the main branch so provide me accordingly

The feature work was merged into `main`, and deployment instructions were changed to deploy `main` instead of the feature branch.

## 14. Deployment Git cleanup

> our branch is ahead of 'origin/fix/groq-agent-improvements' by 2 commits. (use "git push" to publish your local commits) Changes not staged for commit: modified: .env.example, node_modules/.package-lock.json, package-lock.json

Follow-up:

> PS C:\Users\JYOTHIRADITHYA J\Documents\interview_agent> git status ... modified: .env.example, package-lock.json ... Untracked files: tore package-lock.json

The repository cleanup guidance was to remove the accidental generated file, restore generated lockfile changes where appropriate, preserve the real `.env` locally, and switch to a clean `main` branch before deployment.

## 15. Final deployment instructions

> okay give the deployment steps

Deployment plan:

```text
Repository: JyothiradithyaJ/int_agent_project
Branch: main
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check: /api/health
GROQ_MODEL=llama-3.3-70b-versatile
USE_MOCK_LLM=0
GROQ_TIMEOUT_MS=20000
```

The real `GROQ_API_KEY` is configured only in the hosting provider's secret environment variables and is never committed to GitHub.

## 16. AI-usage log for submission

> Since the submission requires a public GitHub repo, live deployed URL, and an AI-usage log, provide me with the prompt list.

This prompt log was expanded to include the original Claude session supplied by the user, followed by the subsequent ChatGPT/Codex development, debugging, UI/UX, and deployment prompts.

---

# Development principles established during the build

1. Keep the frontend simple and purposeful rather than adding decorative widgets.
2. Use a consistent visual system across landing and interview pages.
3. Keep API keys server-side and environment-configured.
4. Make local development and deployment use the same Express API paths.
5. Keep mock mode available for development, but use live Groq in deployment.
6. Make interview completion produce evidence-backed scoring rather than a meaningless number.
7. Do not save abandoned interviews as completed scores.
8. Keep score history lightweight with browser storage initially; a database can be added later for cross-device accounts.
9. Keep the project deployable without requiring an unnecessary frontend build pipeline.
10. Test Groq integration and interview simulation before deployment.

---

# Coverage note

The supplied Claude log states that if other AI tools such as Cursor, Lovable, or Copilot were used, their prompts should also be appended so the submission covers every AI tool used. This document therefore combines the supplied Claude log with the later ChatGPT/Codex-oriented development prompts recorded during this build. If another tool was used outside these recorded sessions, add that tool's prompts before submission.
