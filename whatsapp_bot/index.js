require("dotenv").config();

const fs = require("fs");
const http = require("http");
const path = require("path");
const { execSync } = require("child_process");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const OLLAMA_MODEL = process.env.OLLAMA_MODEL_NAME || "target_persona_clone";
const TARGET_PERSONA = process.env.TARGET_PERSONA_NAME || "Target Persona";
const CHAT_PARTNER = process.env.CHAT_PARTNER_NAME || "Chat Partner";
const RESPOND_TO_CONTACT_NAME = process.env.RESPOND_TO_CONTACT_NAME || "";
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 60);

let socialGraph = {};
try {
  socialGraph = JSON.parse(fs.readFileSync(path.join(__dirname, "social_graph.json"), "utf-8"));
} catch (err) {
  console.error("[Warning] Could not load social_graph.json:", err.message);
}

const chatHistories = {};
let botEnabled = true;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const pushHistory = (chatId, role, content) => {
  if (!chatHistories[chatId]) chatHistories[chatId] = [];
  chatHistories[chatId].push({ role, content });
  if (chatHistories[chatId].length > MAX_HISTORY) {
    chatHistories[chatId] = chatHistories[chatId].slice(-MAX_HISTORY);
  }
};

const getHistory = (chatId) => chatHistories[chatId] || [];

const getSocialContext = (query, history) => {
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

  return relevantEntries.length
    ? `\n\nSOCIAL CONTEXT (use only if naturally relevant):\n- ${relevantEntries.join("\n- ")}`
    : "";
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
        timeout: 10000,
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

const splitIntoMessages = (text) => {
  let parts = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) {
    parts = text.split(/\n/).map((part) => part.trim()).filter(Boolean);
  }
  if (parts.length === 1 && text.length > 80) {
    const mid = Math.floor(text.length / 2);
    const candidates = [];
    for (let i = mid - 30; i < mid + 30 && i < text.length; i++) {
      if (i > 0 && [".", "?", "!"].includes(text[i]) && text[i + 1] === " ") {
        candidates.push(i + 1);
      }
    }
    if (candidates.length) {
      const splitAt = candidates[Math.floor(candidates.length / 2)];
      parts = [text.slice(0, splitAt).trim(), text.slice(splitAt).trim()];
    }
  }
  return parts.length ? parts.slice(0, 3) : [text];
};

const buildPrompt = (chatId, userQuery, ragHint) => {
  const history = getHistory(chatId);

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

  const socialContext = getSocialContext(userQuery, history);
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

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  fs.writeFileSync(path.join(__dirname, "last_qr.txt"), qr);
  console.log("QR code generated and saved to last_qr.txt. Scan it with WhatsApp.");
});

client.on("ready", async () => {
  console.log("Client is ready. Listening for messages...");
  console.log(RESPOND_TO_CONTACT_NAME
    ? `Auto-reply filter: ${RESPOND_TO_CONTACT_NAME}`
    : "Auto-reply filter is not set. Set RESPOND_TO_CONTACT_NAME before enabling replies.");

  try {
    const checkCmd = "wsl -d Ubuntu -e curl -s http://127.0.0.1:11434/api/tags";
    const result = JSON.parse(execSync(checkCmd).toString());
    const modelNames = result.models.map((model) => model.name);
    if (modelNames.includes(`${OLLAMA_MODEL}:latest`) || modelNames.includes(OLLAMA_MODEL)) {
      console.log(`[Check] Model "${OLLAMA_MODEL}" is loaded and ready.`);
    } else {
      console.warn(`[Check] Model "${OLLAMA_MODEL}" was not found. Available models: ${modelNames.join(", ")}`);
    }
  } catch (err) {
    console.error(`[Check] Could not reach Ollama in WSL: ${err.message}`);
  }
});

client.on("message", async (msg) => {
  const chat = await msg.getChat();
  const body = msg.body;

  if (msg.fromMe || msg.from === client.info.wid._serialized) {
    if (body.startsWith("!disable")) {
      botEnabled = false;
      msg.reply("[System] Bot disabled.");
    }
    if (body.startsWith("!enable")) {
      botEnabled = true;
      msg.reply("[System] Bot enabled.");
    }
    return;
  }

  if (body.startsWith("!reset")) {
    chatHistories[msg.from] = [];
    msg.reply("[System] Chat memory wiped.");
    return;
  }

  if (!botEnabled || !body) return;

  const contact = await msg.getContact();
  const contactName = contact.name || "";
  const pushName = contact.pushname || "";
  const allowedContact = RESPOND_TO_CONTACT_NAME
    && (contactName.includes(RESPOND_TO_CONTACT_NAME) || pushName.includes(RESPOND_TO_CONTACT_NAME));

  console.log(`[Message] From: "${contactName}" (Push: "${pushName}") ID: ${msg.from} allowed=${Boolean(allowedContact)}`);

  if (!allowedContact) {
    console.log("[Filter] Ignoring message because RESPOND_TO_CONTACT_NAME does not match.");
    return;
  }

  const chatId = msg.from;
  await sleep(randInt(1000, 3000));
  chat.sendStateTyping();

  const commonShortInputs = ["hi", "hello", "hey", "yo", "gm", "gn"];
  const lowerInput = body.toLowerCase().replace(/[?.,!]/g, "").trim();

  let ragHint = "";
  if (lowerInput.length >= 5 && !commonShortInputs.includes(lowerInput)) {
    ragHint = await getRagContext(body);
  }

  const prompt = buildPrompt(chatId, body, ragHint);

  try {
    const payloadPath = path.join(__dirname, "last_payload.json");
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
    const fullReply = (result.response || "").trim();

    const thoughtRegex = /<thought[\s\S]*?>([\s\S]*?)<\/\s*thought\s*>/gi;
    let replyText = fullReply.replace(thoughtRegex, "").trim();
    replyText = replyText.replace(/<\|im_end\|>/g, "").replace(/<\|im_start\|>/g, "").trim();

    if (!replyText) {
      chat.clearState();
      return;
    }

    pushHistory(chatId, "user", body);
    pushHistory(chatId, "assistant", replyText);

    const messages = splitIntoMessages(replyText);
    for (let i = 0; i < messages.length; i++) {
      if (i > 0) {
        chat.sendStateTyping();
        await sleep(randInt(1500, 4000 + messages[i].length * 30));
      } else {
        await sleep(randInt(800, 2000 + messages[i].length * 25));
      }
      await chat.sendMessage(messages[i]);
    }
  } catch (error) {
    const errorMsg = error.message || "Unknown error";
    console.error("Shell bridge exception:", errorMsg);
    msg.reply(`[System] Error: local model is unreachable. Details: ${errorMsg.slice(0, 100)}...`);
  }

  chat.clearState();
});

client.initialize();
