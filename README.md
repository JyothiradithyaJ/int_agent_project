# Interview Agent

Groq-powered AI Interview Agent for the AI Cohort hackathon. It exposes `POST /api/interview` and serves a chat UI at `http://localhost:3000`.

## Setup

Install dependencies:

```powershell
npm.cmd install
```

Create `.env` from `.env.example` and add your Groq key:

```text
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile
USE_MOCK_LLM=0
PORT=3000
GROQ_TIMEOUT_MS=20000
```

Never commit `.env` or your real API key.

Start the application:

```powershell
npm.cmd start
```

Open:

```text
http://localhost:3000
```

## Groq Diagnostics

Check configuration:

```text
http://localhost:3000/api/health
```

Run the direct Groq test:

```powershell
npm.cmd run test:groq
```

The test checks the API key, selected model, HTTP response, JSON response, and request timeout.

The browser also shows whether the server is configured for Groq Live or Local Mock Mode.

### Common errors

- `401`: check `GROQ_API_KEY`.
- `403`: check API key permissions.
- `429`: Groq rate limit reached; wait and retry.
- `400`: check model/request configuration.
- Timeout: check network connectivity or increase `GROQ_TIMEOUT_MS`.

Groq errors are no longer silently converted into mock interview responses. Mock mode is only used when `USE_MOCK_LLM=1`.

## Mock Mode

Mock mode is intentionally deterministic for tests:

```powershell
$env:USE_MOCK_LLM="1"
npm.cmd run test:simulate
```

For normal operation, use:

```text
USE_MOCK_LLM=0
```

## API

Start a session:

```json
{ "sessionId": "abc-123", "candidate": { "...": "one candidate object" } }
```

Continue:

```json
{ "sessionId": "abc-123", "message": "candidate answer" }
```

Interview responses include `coverage`, `day_covered`, and `quality_signal` so the frontend does not need to infer curriculum progress from generated text.

Final feedback includes:

- summary
- strengths
- gaps
- next steps
- category scores
- evidence tied to the transcript

## Verification

```powershell
npm.cmd run test:planner
npm.cmd run test:simulate
npm.cmd run test:groq
```

The simulation uses local mode intentionally so tests do not spend Groq quota. The Groq test is the only test that calls the live API.

## Project Improvements

The interview agent now supports adaptive weak/partial/strong answer handling, stronger failed/skipped topic prioritization, topic diversity, session expiry, request validation, Groq timeouts, explicit AI status, retry behavior, 31-day curriculum progress, and evidence-based final scoring.

## Submission Note

The hackathon requires a root-level `PROMPTS.md` describing the prompts used while building. Fill that in manually as part of the submission record.
