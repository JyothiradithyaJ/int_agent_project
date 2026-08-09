const fs = require("fs");
const path = require("path");

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const apiKey = String(process.env.GROQ_API_KEY || "").trim().replace(/^Bearer\s+/i, "");
const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const timeoutMs = Number(process.env.GROQ_TIMEOUT_MS || 20000);

if (!apiKey) {
  console.error("❌ GROQ_API_KEY is missing");
  process.exit(1);
}

async function main() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: "Return JSON only: {\"status\":\"GROQ_OK\"}",
        }],
        temperature: 0,
        max_tokens: 30,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    const body = await response.text();
    if (!response.ok) {
      console.error(`❌ Groq returned HTTP ${response.status}`);
      console.error(body.slice(0, 1000));
      process.exit(1);
    }

    const data = JSON.parse(body);
    const text = data.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text);

    if (parsed.status !== "GROQ_OK") {
      console.error("❌ Groq responded, but the JSON response was unexpected:", parsed);
      process.exit(1);
    }

    console.log("✅ Groq is working");
    console.log(`Model: ${model}`);
    console.log(`Response: ${text}`);
  } catch (err) {
    if (err.name === "AbortError") {
      console.error(`❌ Groq request timed out after ${timeoutMs}ms`);
    } else {
      console.error("❌ Groq test failed:", err.message);
    }
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }
}

main();
