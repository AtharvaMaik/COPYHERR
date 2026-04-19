const fs = require("fs");
const path = require("path");
const axios = require("axios");
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const RAG_URL = process.env.RAG_URL || "http://127.0.0.1:5050/query";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL_NAME || "target_persona_clone";
const TARGET_PERSONA = process.env.TARGET_PERSONA_NAME || "Target Persona";
const CHAT_PARTNER = process.env.CHAT_PARTNER_NAME || "Chat Partner";
const CHAT_LOG_PATH = process.env.WHATSAPP_EXPORT_PATH
  ? path.resolve(process.env.WHATSAPP_EXPORT_PATH)
  : path.join(__dirname, "..", "whatsapp_chat.txt");

const getRagContext = async (query) => {
  try {
    const res = await axios.post(RAG_URL, { query, top_k: 3 }, { timeout: 5000 });
    const results = res.data.results || res.data || [];
    return Array.isArray(results) ? results.join("\n") : "";
  } catch {
    return "";
  }
};

const buildPrompt = (userQuery, ragHint) => {
  let systemMsg = `# MODULE 1: IDENTITY
You are ${TARGET_PERSONA}. You are chatting over WhatsApp with ${CHAT_PARTNER}.
Match the target persona's style from the fine-tuning data.
Keep replies concise, natural, and not assistant-like.
Do not invent people, stories, memories, or events.`;

  if (ragHint) {
    systemMsg += `\n# STYLISTIC MEMORIES\nUse only if relevant:\n${ragHint}`;
  }

  return `<|im_start|>system\n${systemMsg}<|im_end|>\n<|im_start|>user\n${userQuery}<|im_end|>\n<|im_start|>assistant\n`;
};

const simulate = async () => {
  console.log("\nCOPYHERR Simulation Engine\n");

  if (!fs.existsSync(CHAT_LOG_PATH)) {
    console.error(`Chat log not found: ${CHAT_LOG_PATH}`);
    return;
  }

  const content = fs.readFileSync(CHAT_LOG_PATH, "utf8");
  const lines = content.split("\n");
  const partnerLines = lines
    .filter((line) => line.includes(`- ${CHAT_PARTNER}:`))
    .map((line) => line.split(`- ${CHAT_PARTNER}:`)[1].trim())
    .filter((line) => line.length > 10 && line.length < 100);

  const samples = [];
  for (let i = 0; i < Math.min(5, partnerLines.length); i++) {
    samples.push(partnerLines[Math.floor(Math.random() * partnerLines.length)]);
  }
  samples.push("hi");
  samples.push("how are you?");

  for (const sample of samples) {
    console.log(`\nTest Query > ${sample}`);
    const ragHint = await getRagContext(sample);
    const prompt = buildPrompt(sample, ragHint);

    try {
      const response = await axios.post(OLLAMA_URL, {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.3 },
      });

      const fullText = response.data.response || "";
      const thoughtMatch = fullText.match(/<thought>([\s\S]*?)<\/thought>/);
      const thought = thoughtMatch ? thoughtMatch[1] : "No thinking logged";
      const reply = fullText.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();

      console.log(`Thought: ${thought}`);
      console.log(`${TARGET_PERSONA}: ${reply}`);
    } catch (err) {
      console.error(`Model error: ${err.message}`);
    }
  }
};

simulate();
