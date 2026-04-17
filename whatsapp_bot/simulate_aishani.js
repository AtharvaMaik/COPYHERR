const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dns = require('dns');

// Fix for Node.js trying IPv6 before IPv4 on Windows
dns.setDefaultResultOrder('ipv4first');

// Simulation Config
const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const RAG_URL = 'http://127.0.0.1:5050/search';
const CHAT_LOG_PATH = path.join(__dirname, '..', 'WhatsApp Chat with Aishani.txt');

// Colors for terminal
const c = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    gray: "\x1b[90m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    bold: "\x1b[1m"
};

// Reuse logic from chat.js
const getRagContext = async (query) => {
    try {
        const res = await axios.post(RAG_URL, { query, top_k: 3 });
        return res.data.join('\n');
    } catch (e) {
        return "";
    }
};

const buildPrompt = (userQuery, ragHint) => {
    let systemMsg = `# MODULE 1: YOUR IDENTITY
You are Aishani. 20-year-old CS student at MAHE. Bangalore native. 
PERSONALITY: Playful, witty, slightly sarcastic, and CHILL. 

# MODULE 2: INTERACTION RULES
- You are chatting with your boyfriend, ATHARVA. You are a WOMAN.
- Do NOT use his name unless he mentions it. Focus on the vibe.
- ROLE CLARITY: In memories, 'YOU:' are your past words. 'HE:' is Atharva's past words. 
- NO CARICATURE: Do not over-use slang or emojis. Be a normal human girl.
- NATURAL BREVITY: Keep replies snappy. Match the chat's energy. 
- NEVER invent new people, stories, or drama (e.g., do NOT bring up showers, sleep, or toilets unless mentioned NOW).

# MODULE 3: REASONING PROTOCOL
- Inside <thought> ... </thought>, analyze the tone and check: "Is this memory relevant? Am I repeating a loop?".
- Final output format: <thought>Reasons</thought>Actual Response`;

    const memoryMsg = ragHint ? `\n# MODULE 5: STYLISTIC MEMORIES\n(FOR TONE ONLY - HE is Atharva, YOU is Aishani. DO NOT repeat these scenarios unless they fit the chat):\n${ragHint.replace(/Aishani:/gi, 'YOU:').replace(/Atharva:/gi, 'HE:')}` : "";

    systemMsg += memoryMsg;

    return `<|im_start|>system\n${systemMsg}<|im_end|>\n<|im_start|>user\n${userQuery}<|im_end|>\n<|im_start|>assistant\n`;
};

const simulate = async () => {
    console.log(`\n${c.bold}╔═══════════════════════════════════════╗`);
    console.log(`║     🤖  Aishani Simulation Engine     ║`);
    console.log(`╚═══════════════════════════════════════╝${c.reset}\n`);

    console.log("Reading chat logs for random samples...");
    const content = fs.readFileSync(CHAT_LOG_PATH, 'utf8');
    const lines = content.split('\n');
    
    // Pick 5 random messages from Atharva
    const atharvaLines = lines
        .filter(l => l.includes('- Atharva:'))
        .map(l => l.split('- Atharva:')[1].trim())
        .filter(l => l.length > 10 && l.length < 100);

    const samples = [];
    for (let i = 0; i < 5; i++) {
        samples.push(atharvaLines[Math.floor(Math.random() * atharvaLines.length)]);
    }

    // Include some "Hard" edge cases
    samples.push("hi");
    samples.push("i love you");

    for (const sample of samples) {
        console.log(`\n${c.cyan}Test Query ❯ ${c.bold}${sample}${c.reset}`);
        
        process.stdout.write(`${c.gray}  thinking...${c.reset}`);
        const ragHint = await getRagContext(sample);
        const prompt = buildPrompt(sample, ragHint);

        try {
            const response = await axios.post(OLLAMA_URL, {
                model: "aishani_clone",
                prompt: prompt,
                stream: false,
                options: { temperature: 0.3 }
            });

            const fullText = response.data.response;
            const thought = fullText.includes('<thought>') ? fullText.match(/<thought>([\s\S]*?)<\/thought>/)[1] : "No thinking logged";
            const reply = fullText.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();

            console.log(`\r${c.yellow}  Thought: ${c.dim}${thought}${c.reset}`);
            console.log(`${c.green}  Aishani: ${c.bold}${reply}${c.reset}`);
        } catch (e) {
            console.log(`\r${c.red}  Error calling model: ${e.message}${c.reset}`);
        }
    }
};

simulate();
