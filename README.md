# Interview Agent

Groq-powered AI Interview Agent for the AI Cohort hackathon. It exposes the required `POST /api/interview` endpoint and serves a chat UI at `http://localhost:3000`.

## Setup

Install dependencies:

```powershell
npm.cmd install
```

Set your Groq key in the same PowerShell window before starting:

```powershell
$env:GROQ_API_KEY="your-groq-api-key"
npm.cmd start
```

Or create a `.env` file in the project root:

```text
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile
```

When Groq is active, startup should say:

```text
Groq live: llama-3.3-70b-versatile
```

You can also check:

```text
http://localhost:3000/api/health
```

Expected live response:

```json
{ "ok": true, "mode": "groq-live", "model": "llama-3.3-70b-versatile", "hasGroqKey": true, "forceMock": false }
```

## Mock Mode

Mock mode is only used when:

- `GROQ_API_KEY` is missing
- `USE_MOCK_LLM=1`
- Groq has an API/network/JSON error

To force mock mode:

```powershell
$env:USE_MOCK_LLM="1"
npm.cmd start
```

To turn mock mode off in the same terminal:

```powershell
Remove-Item Env:\USE_MOCK_LLM
```

## API

Start:

```json
{ "sessionId": "abc-123", "candidate": { "...": "one candidate object" } }
```

Continue:

```json
{ "sessionId": "abc-123", "message": "candidate answer" }
```

Responses always match one of:

```json
{ "reply": "string", "done": false }
```

```json
{
  "reply": "string",
  "done": true,
  "feedback": { "summary": "string", "strengths": [], "gaps": [], "next": [] }
}
```

## Verify

```powershell
npm.cmd run test:planner
npm.cmd run test:simulate
```

The simulation uses local mode intentionally so tests do not spend Groq quota.

## Submission Note

The hackathon also requires a root-level `PROMPTS.md` describing the prompts used while building. Fill that in manually as part of the submission record.
