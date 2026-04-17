#!/usr/bin/env node
require('dotenv').config();
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');

const OLLAMA_MODEL = process.env.OLLAMA_MODEL_NAME || 'aishani_clone';
const MAX_HISTORY = 60; 

// ── Colors ───────────────────────────────────────────────────────────
const c = {
    reset:   '\x1b[0m',
    bold:    '\x1b[1m',
    dim:     '\x1b[2m',
    cyan:    '\x1b[36m',
    magenta: '\x1b[35m',
    yellow:  '\x1b[33m',
    green:   '\x1b[32m',
    gray:    '\x1b[90m',
};

// ── Context Management ───────────────────────────────────────────────
let history = []; 
let socialGraph = {};
try {
    socialGraph = JSON.parse(fs.readFileSync(path.join(__dirname, 'social_graph.json'), 'utf-8'));
} catch (err) {
    console.error(`${c.yellow}  ⚠ Warning: social_graph.json not found.${c.reset}`);
}

const getSocialContext = (query, history) => {
    const allNames = [];
    for (const category in socialGraph) {
        allNames.push(...Object.keys(socialGraph[category]));
    }
    const recentHistoryStr = history.slice(-3).map(m => m.content).join(' ');
    const contextStr = (query + ' ' + recentHistoryStr).toLowerCase();
    const relevantEntries = [];
    allNames.forEach(name => {
        if (contextStr.includes(name.toLowerCase())) {
            for (const cat in socialGraph) {
                if (socialGraph[cat][name]) {
                    const info = socialGraph[cat][name];
                    relevantEntries.push(`${name} (${info.relationship}): ${info.context}`);
                }
            }
        }
    });
    return relevantEntries.length > 0 
        ? `\n\nSOCIAL CONTEXT:\n- ${relevantEntries.join('\n- ')}`
        : "";
};

const getRagContext = (message) => {
    return new Promise((resolve) => {
        const postData = JSON.stringify({ query: message });
        const req = http.request({
            hostname: '127.0.0.1',
            port: 5050,
            path: '/query',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const results = JSON.parse(data).results || [];
                    resolve(results.length > 0 ? results.map(m => `- ${m}`).join('\n') : "");
                } catch { resolve(""); }
            });
        });
        req.on('error', () => resolve(""));
        req.write(postData);
        req.end();
    });
};

const buildPrompt = (userQuery, ragHint) => {
    let systemMsg = `# MODULE 1: YOUR IDENTITY
You are Aishani. 20-year-old CS student at MAHE. Bangalore native. 
PERSONALITY: Playful, witty, slightly sarcastic, and CHILL. 

# MODULE 2: INTERACTION RULES
- You are chatting with your boyfriend, ATHARVA. You are a WOMAN.
- Do NOT use his name unless he mentions it. Focus on the vibe.
- ROLE CLARITY: In memories, 'YOU:' are your past words. 'HE:' is Atharva's past words. 
- CONFIDENT PERSONA: Never say "I'm sorry" or apologize. You are witty and chill.
- NO ASSISTANT VIBE: Avoid formal phrasing like "let me know". Talk like a normal girl.
- SNAPPY: If the query is minor, keep it under 10 words. Don't yap.
- NEVER invent new people, stories, or drama.

# MODULE 3: REASONING PROTOCOL
- Inside <thought> ... </thought>, analyze the tone and check: "Am I sounding like a bot? Am I being too formal? Did I say sorry?".
- YOU MUST ALWAYS INCLUDE A <thought> BLOCK.
- Final output format: <thought>Reasons</thought>Actual Response`;

    const socialContext = getSocialContext(userQuery, history);
    const socialMsg = socialContext ? `\n# MODULE 4: SOCIAL KNOWLEDGE\n(Known context about the people mentioned):\n${socialContext}` : "";
    
    const memoryMsg = ragHint ? `\n# MODULE 5: STYLISTIC MEMORIES\n(FOR TONE ONLY - HE is Atharva, YOU is Aishani. DO NOT repeat these scenarios unless they fit the chat):\n${ragHint.replace(/Aishani:/gi, 'YOU:').replace(/Atharva:/gi, 'HE:')}` : "";

    systemMsg += socialMsg + memoryMsg;

    let prompt = `<|im_start|>system\n${systemMsg}<|im_end|>\n`;
    for (const msg of history) {
        const roleLabel = msg.role === 'assistant' ? 'assistant' : 'user';
        prompt += `<|im_start|>${roleLabel}\n${msg.content}<|im_end|>\n`;
    }
    prompt += `<|im_start|>user\n${userQuery}<|im_end|>\n<|im_start|>assistant\n`;
    return prompt;
};

// ── CLI Interface ────────────────────────────────────────────────────
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c.cyan}${c.bold}You ❯ ${c.reset}`
});

console.log(`${c.magenta}${c.bold}\n  ╔═══════════════════════════════════════╗`);
console.log(`  ║     💭  Aishani Reasoning Engine CLI  ║`);
console.log(`  ╚═══════════════════════════════════════╝${c.reset}`);
console.log(`${c.gray}  Model: ${OLLAMA_MODEL} | Window: ${MAX_HISTORY}${c.reset}`);
console.log(`${c.gray}  Commands: /clear  /exit${c.reset}\n`);

rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input === '/exit') process.exit(0);
    if (input === '/clear') {
        history = [];
        console.log(`${c.yellow}  ✓ History cleared.${c.reset}\n`);
        rl.prompt();
        return;
    }

    // Thinking log
    process.stdout.write(`${c.dim}  thinking...${c.reset}`);

    // GREETING FILTER: Skip RAG for simple greetings or very short messages
    const greetings = ['hi', 'hello', 'hey', 'yo', 'gm', 'gn', 'pookie', 'pookies', 'aishani'];
    const lowerInput = input.toLowerCase().replace(/[?.,!]/g, '').trim();
    
    let ragHint = "";
    if (lowerInput.length >= 5 && !greetings.includes(lowerInput)) {
        ragHint = await getRagContext(input);
        
        // RAG transparency log
        if (ragHint) {
            console.log(`${c.gray}${c.dim}  [RAG Context Found]${c.reset}`);
        } else {
            console.log(`${c.gray}${c.dim}  [No Strong RAG Context]${c.reset}`);
        }
    } else {
        console.log(`${c.gray}${c.dim}  [RAG Skipped: Greeting/Short Query]${c.reset}`);
    }

    const prompt = buildPrompt(input, ragHint);

    try {
        const payloadPath = path.join(__dirname, 'cli_payload.json');
        fs.writeFileSync(payloadPath, JSON.stringify({
            model: OLLAMA_MODEL,
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.5,      // Spark
                repeat_penalty: 1.2,
                top_p: 0.9,
                num_predict: 250
            }
        }));

        const wslCommand = `wsl -d Ubuntu -e bash -c "curl -s -X POST http://127.0.0.1:11434/api/generate -d @/mnt/c${payloadPath.replace(/\\/g, '/').replace('C:', '').replace('c:', '')}"`;
        const result = JSON.parse(execSync(wslCommand, { timeout: 60000 }).toString());
        let fullReply = (result.response || "").trim();

        // Strip "thinking..."
        process.stdout.write('\r\x1b[K');

        // Thinking Protocol Extraction - even more robust for spaces inside tags
        const thoughtRegex = /<thought[\s\S]*?>([\s\S]*?)<\/\s*thought\s*>/gi;
        const thoughts = [];
        let match;
        while ((match = thoughtRegex.exec(fullReply)) !== null) {
            thoughts.push(match[1].trim());
        }
        let replyText = fullReply.replace(thoughtRegex, '').trim();
        replyText = replyText.replace(/<\|im_end\|>/g, '').replace(/<\|im_start\|>/g, '').trim();

        if (thoughts.length > 0) {
            console.log(`${c.gray}${c.dim}  ${thoughts.join(' | ')}${c.reset}`);
        }

        if (replyText) {
            history.push({ role: 'user', content: input });
            history.push({ role: 'assistant', content: replyText });
            if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

            console.log(`${c.magenta}${c.bold}Aishani ❯ ${c.reset}${replyText}`);
        }

    } catch (err) {
        process.stdout.write('\r\x1b[K');
        console.log(`${c.yellow}  ⚠ Error: ${err.message}${c.reset}`);
    }

    console.log();
    rl.prompt();
});

rl.prompt();
