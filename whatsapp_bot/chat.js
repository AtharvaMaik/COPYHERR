#!/usr/bin/env node
require("dotenv").config();

const fs = require("fs");
const http = require("http");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

const OLLAMA_MODEL = process.env.OLLAMA_MODEL_NAME || "target_persona_clone";
const TARGET_PERSONA = process.env.TARGET_PERSONA_NAME || "Target Persona";
const CHAT_PARTNER = process.env.CHAT_PARTNER_NAME || "Chat Partner";
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 60);

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
};

let history = [];
let socialGraph = {};

try {
  socialGraph = JSON.parse(fs.readFileSync(path.join(__dirname, "social_graph.json"), "utf-8"));
} catch {
  console.error(`${c.yellow}Warning: social_graph.json not found. Continuing without social context.${c.reset}`);
}

const getSocialContext = (query) => {
  const recentHistory = history.slice(-3).map((msg) => msg.content).join(" ");
  const contextText = `${query} ${recentHistory}`.toLowerCase();
  const relevantEntries = [];

  for (const category of Object.keys(socialGraph)) {
    for (const name of Object.keys(socialGraph[category])) {
      if (contextText.includes(name.toLowerCase())) {
        const info = socialGraph[category][name];
        relevantEntries.push(`${name} (${info.relationship}): ${info.context}`);
      }
    }
  }

  return relevantEntries.length ? `\n\nSOCIAL CONTEXT:\n- ${relevantEntries.join("\n- ")}` : "";
};

const getRagContext = (message) => {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ query: message });
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 5050,
        path: "/query",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const results = JSON.parse(data).results || [];
            resolve(results.length ? results.map((memory) => `- ${memory}`).join("\n") : "");
          } catch {
            resolve("");
          }
        });
      },
    );

    req.on("error", () => resolve(""));
    req.on("timeout", () => {
      req.destroy();
      resolve("");
    });
    req.write(postData);
    req.end();
  });
};

const buildPrompt = (userQuery, ragHint) => {
  let systemMsg = `# MODULE 1: IDENTITY
You are ${TARGET_PERSONA}. You are chatting over WhatsApp.
PERSONALITY: Match the target persona's conversational style from the fine-tuning data.

# MODULE 2: INTERACTION RULES
- You are chatting with ${CHAT_PARTNER}.
- Keep replies natural for WhatsApp: concise, context-aware, and not assistant-like.
- Match the target persona's casing, punctuation, message length, slang, and rhythm.
- Do not invent people, stories, memories, or events.
- If context is weak, answer naturally instead of forcing a memory.

# MODULE 3: REASONING PROTOCOL
- Inside <thought> ... </thought>, briefly check tone and relevance.
- Final output format: <thought>Reasons</thought>Actual Response`;

  const socialContext = getSocialContext(userQuery);
  if (socialContext) {
    systemMsg += `\n# MODULE 4: SOCIAL KNOWLEDGE\n${socialContext}`;
  }

  if (ragHint) {
    systemMsg += `\n# MODULE 5: STYLISTIC MEMORIES\nUse these for tone and recall only when relevant:\n${ragHint}`;
  }

  let prompt = `<|im_start|>system\n${systemMsg}<|im_end|>\n`;
  for (const msg of history) {
    const roleLabel = msg.role === "assistant" ? "assistant" : "user";
    prompt += `<|im_start|>${roleLabel}\n${msg.content}<|im_end|>\n`;
  }
  prompt += `<|im_start|>user\n${userQuery}<|im_end|>\n<|im_start|>assistant\n`;
  return prompt;
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${c.cyan}${c.bold}You > ${c.reset}`,
});

console.log(`${c.magenta}${c.bold}\nCOPYHERR Persona CLI${c.reset}`);
console.log(`${c.gray}Model: ${OLLAMA_MODEL} | Target: ${TARGET_PERSONA} | Window: ${MAX_HISTORY}${c.reset}`);
console.log(`${c.gray}Commands: /clear /exit${c.reset}\n`);

rl.on("line", async (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  if (input === "/exit") process.exit(0);
  if (input === "/clear") {
    history = [];
    console.log(`${c.yellow}History cleared.${c.reset}\n`);
    rl.prompt();
    return;
  }

  process.stdout.write(`${c.dim}thinking...${c.reset}`);

  const shortInput = input.toLowerCase().replace(/[?.,!]/g, "").trim();
  const commonShortInputs = ["hi", "hello", "hey", "yo", "gm", "gn"];
  let ragHint = "";

  if (shortInput.length >= 5 && !commonShortInputs.includes(shortInput)) {
    ragHint = await getRagContext(input);
  }

  const prompt = buildPrompt(input, ragHint);

  try {
    const payloadPath = path.join(__dirname, "cli_payload.json");
    fs.writeFileSync(
      payloadPath,
      JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.5,
          repeat_penalty: 1.2,
          top_p: 0.9,
          num_predict: 250,
        },
      }),
    );

    const wslPath = payloadPath.replace(/\\/g, "/").replace("C:", "").replace("c:", "");
    const wslCommand = `wsl -d Ubuntu -e bash -c "curl -s -X POST http://127.0.0.1:11434/api/generate -d @/mnt/c${wslPath}"`;
    const result = JSON.parse(execSync(wslCommand, { timeout: 60000 }).toString());
    let fullReply = (result.response || "").trim();

    process.stdout.write("\r\x1b[K");

    const thoughtRegex = /<thought[\s\S]*?>([\s\S]*?)<\/\s*thought\s*>/gi;
    const thoughts = [];
    let match;
    while ((match = thoughtRegex.exec(fullReply)) !== null) {
      thoughts.push(match[1].trim());
    }

    let replyText = fullReply.replace(thoughtRegex, "").trim();
    replyText = replyText.replace(/<\|im_end\|>/g, "").replace(/<\|im_start\|>/g, "").trim();

    if (thoughts.length) {
      console.log(`${c.gray}${c.dim}${thoughts.join(" | ")}${c.reset}`);
    }

    if (replyText) {
      history.push({ role: "user", content: input });
      history.push({ role: "assistant", content: replyText });
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      console.log(`${c.magenta}${c.bold}${TARGET_PERSONA} > ${c.reset}${replyText}`);
    }
  } catch (err) {
    process.stdout.write("\r\x1b[K");
    console.log(`${c.yellow}Error: ${err.message}${c.reset}`);
  }

  console.log();
  rl.prompt();
});

rl.prompt();
