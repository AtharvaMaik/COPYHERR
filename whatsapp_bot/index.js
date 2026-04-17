require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const OLLAMA_MODEL = process.env.OLLAMA_MODEL_NAME || 'aishani_clone';
const TEMP = parseFloat(process.env.TEMPERATURE) || 0.8;

// ── Social Graph (Dynamic Context Injection) ─────────────────────────
let socialGraph = {};
try {
    socialGraph = JSON.parse(fs.readFileSync(path.join(__dirname, 'social_graph.json'), 'utf-8'));
} catch (err) {
    console.error('[Error] Could not load social_graph.json:', err.message);
}

const getSocialContext = (query, history) => {
    const allNames = [];
    // Flatten all names from the graph
    for (const category in socialGraph) {
        allNames.push(...Object.keys(socialGraph[category]));
    }

    const recentHistoryStr = history.slice(-3).map(m => m.content).join(' ');
    const contextStr = (query + ' ' + recentHistoryStr).toLowerCase();
    
    const relevantEntries = [];
    allNames.forEach(name => {
        if (contextStr.includes(name.toLowerCase())) {
            // Find which category this name belongs to
            for (const cat in socialGraph) {
                if (socialGraph[cat][name]) {
                    const info = socialGraph[cat][name];
                    relevantEntries.push(`${name} (${info.relationship}): ${info.context}`);
                }
            }
        }
    });

    return relevantEntries.length > 0 
        ? `\n\nSOCIAL CONTEXT (Use these relationship details only if naturally relevant):\n- ${relevantEntries.join('\n- ')}`
        : "";
};

// ── Conversation Memory ──────────────────────────────────────────────
// Rolling window of messages per chat, keyed by chat ID.
// Each entry: { role: 'user'|'assistant', content: '...' }
const MAX_HISTORY = 60;          // Extended memory for deep context (~30 exchanges)
const chatHistories = {};        // chatId -> [ {role, content}, ... ]

const pushHistory = (chatId, role, content) => {
    if (!chatHistories[chatId]) chatHistories[chatId] = [];
    chatHistories[chatId].push({ role, content });
    // Trim to rolling window
    if (chatHistories[chatId].length > MAX_HISTORY) {
        chatHistories[chatId] = chatHistories[chatId].slice(-MAX_HISTORY);
    }
};

const getHistory = (chatId) => chatHistories[chatId] || [];

// ── Configurable state ───────────────────────────────────────────────
let botEnabled = true;

// ── RAG (via persistent HTTP server on port 5050) ────────────────────
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
            timeout: 10000
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
        req.on('timeout', () => { req.destroy(); resolve(""); });
        req.write(postData);
        req.end();
    });
};

// ── Helpers ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Random integer in [min, max]
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Split a long reply into multiple "messages" to feel human.
// Strategy: split on double-newlines first, then on single newlines if chunks
// are still too big. Merge tiny fragments. Cap at 3 messages.
const splitIntoMessages = (text) => {
    // First try splitting on double newlines (paragraph breaks)
    let parts = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

    // If only 1 part, try splitting on single newlines
    if (parts.length === 1) {
        parts = text.split(/\n/).map(p => p.trim()).filter(Boolean);
    }

    // If still 1 part and it's long-ish, split mid-sentence on period/question
    if (parts.length === 1 && text.length > 80) {
        const mid = Math.floor(text.length / 2);
        // Find nearest sentence boundary around midpoint
        const candidates = [];
        for (let i = mid - 30; i < mid + 30 && i < text.length; i++) {
            if (i > 0 && (text[i] === '.' || text[i] === '?' || text[i] === '!') && text[i + 1] === ' ') {
                candidates.push(i + 1);
            }
        }
        if (candidates.length > 0) {
            const splitAt = candidates[Math.floor(candidates.length / 2)];
            parts = [text.slice(0, splitAt).trim(), text.slice(splitAt).trim()];
        }
    }

    // Merge tiny fragments (< 5 chars) into previous
    const merged = [];
    for (const p of parts) {
        if (merged.length > 0 && p.length < 5) {
            merged[merged.length - 1] += ' ' + p;
        } else {
            merged.push(p);
        }
    }

    // Cap at 3 messages max
    if (merged.length > 3) {
        return [
            merged.slice(0, Math.ceil(merged.length / 3)).join('\n'),
            merged.slice(Math.ceil(merged.length / 3), Math.ceil(2 * merged.length / 3)).join('\n'),
            merged.slice(Math.ceil(2 * merged.length / 3)).join('\n')
        ].filter(Boolean);
    }

    return merged.length > 0 ? merged : [text];
};

// ── Build the chat prompt with full history ──────────────────────────
const buildPrompt = (chatId, userQuery, ragHint) => {
    const history = getHistory(chatId);

    // System message: Social Knowledge (Dynamic Injection) + Thinking Protocol + Anonymization
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

    // Dynamic Social Context Injection
    const socialContext = getSocialContext(userQuery, history);
    const socialMsg = socialContext ? `\n# MODULE 4: SOCIAL KNOWLEDGE\n(Known context about the people mentioned):\n- ${socialContext}` : "";
    
    const memoryMsg = ragHint ? `\n# MODULE 5: STYLISTIC MEMORIES\n(FOR TONE ONLY - HE is Atharva, YOU is Aishani. DO NOT repeat these scenarios unless they fit the chat):\n${ragHint.replace(/Aishani:/gi, 'YOU:').replace(/Atharva:/gi, 'HE:')}` : "";

    systemMsg += socialMsg + memoryMsg;

    // Build ChatML-style prompt with conversation history
    let prompt = `<|im_start|>system\n${systemMsg}<|im_end|>\n`;

    // Add conversation history
    for (const msg of history) {
        const roleLabel = msg.role === 'assistant' ? 'assistant' : 'user';
        prompt += `<|im_start|>${roleLabel}\n${msg.content}<|im_end|>\n`;
    }

    // Add current user message
    prompt += `<|im_start|>user\n${userQuery}<|im_end|>\n<|im_start|>assistant\n`;

    return prompt;
};

// ── WhatsApp Client ──────────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    fs.writeFileSync(path.join(__dirname, 'last_qr.txt'), qr);
    console.log('QR Code generated and saved to last_qr.txt. Scan with WhatsApp!');
});

client.on('ready', async () => {
    console.log('Client is ready! Listening for messages...');
    
    // ── Brain Health Check ──────────────────────────────────────────
    console.log('[Check] Verifying Aishani\'s brain (Ollama)...');
    try {
        const checkCmd = `wsl -d Ubuntu -e curl -s http://127.0.0.1:11434/api/tags`;
        const result = JSON.parse(execSync(checkCmd).toString());
        const modelNames = result.models.map(m => m.name);
        if (modelNames.includes(`${OLLAMA_MODEL}:latest`) || modelNames.includes(OLLAMA_MODEL)) {
            console.log(`[Check] Success: Model "${OLLAMA_MODEL}" is loaded and ready.`);
        } else {
            console.warn(`[Check] Warning: Model "${OLLAMA_MODEL}" not found in Ollama list. This may cause issues.`);
            console.log(`[Check] Available models: ${modelNames.join(', ')}`);
        }
    } catch (err) {
        console.error(`[Check] CRITICAL: Couldn't reach Ollama in WSL. Error: ${err.message}`);
        console.error('Make sure WSL (Ubuntu) is running and Ollama is started inside it.');
    }
});

client.on('message', async (msg) => {
    const chat = await msg.getChat();
    const body = msg.body;

    // ── Fail-safes ───────────────────────────────────────────────────
    // ── Commands ────────────────────────────────────────────────────
    if (msg.fromMe || msg.from === client.info.wid._serialized) {
        if (body.startsWith('!disable')) {
            botEnabled = false;
            msg.reply('[System] Bot disabled.');
            return;
        }
        if (body.startsWith('!enable')) {
            botEnabled = true;
            msg.reply('[System] Bot enabled.');
            return;
        }
        return; // CRITICAL: Stop here to prevent the bot from responding to its own messages
    }

    if (body.startsWith('!reset')) {
        const chatId = msg.from;
        chatHistories[chatId] = [];
        msg.reply('[System] Chat memory wiped. I’m a clean slate now! ✨');
        console.log(`[Command] Memory reset for ${chatId}`);
        return;
    }

    if (!botEnabled) return;

    const contact = await msg.getContact();
    const contactName = contact.name || "";
    const pushName = contact.pushname || "";
    const isAishani = contactName.includes('Aishani') || pushName.includes('Aishani');

    console.log(`[Message] From: "${contactName}" (Push: "${pushName}") ID: ${msg.from} - isAishani: ${isAishani}`);

    // Only respond to Aishani — ignore everyone else
    if (!isAishani) {
        console.log(`[Filter] Ignoring message from ${contactName}.`);
        return;
    }

    const userQuery = body;
    if (!userQuery) return;

    const chatId = msg.from;

    // ── Small "read" delay before typing (humans don't reply instantly) ──
    await sleep(randInt(1000, 3000));
    chat.sendStateTyping();

    // GREETING FILTER: Skip RAG for simple greetings or very short messages
    const greetings = ['hi', 'hello', 'hey', 'yo', 'gm', 'gn', 'pookie', 'pookies', 'aishani'];
    const lowerInput = userQuery.toLowerCase().replace(/[?.,!]/g, '').trim();
    
    let ragHint = "";
    if (lowerInput.length >= 5 && !greetings.includes(lowerInput)) {
        ragHint = await getRagContext(userQuery);
    } else {
        console.log(`[RAG Filter] Skipping lookup for short/common phrase: "${userQuery}"`);
    }

    // ── Build prompt with full conversation history ──────────────
    // NOTE: userQuery is NOT in history yet — buildPrompt appends it once
    const prompt = buildPrompt(chatId, userQuery, ragHint);

    try {
        const payloadPath = path.join(__dirname, 'last_payload.json');
        fs.writeFileSync(payloadPath, JSON.stringify({
            model: OLLAMA_MODEL,
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.5,      // Higher for personality spark
                repeat_penalty: 1.2,    // Lower to allow common words
                top_p: 0.9,
                num_predict: 250
            }
        }));

        const wslCommand = `wsl -d Ubuntu -e bash -c "curl -s -X POST http://127.0.0.1:11434/api/generate -d @/mnt/c${payloadPath.replace(/\\/g, '/').replace('C:', '').replace('c:', '')}"`;
        const result = JSON.parse(execSync(wslCommand, { timeout: 60000 }).toString());
        let fullReply = (result.response || "").trim();

        // ── Robust Thinking Protocol Extraction ──────────────────────
        // Handles <thought>, <thought >, < thought >, </ thought>, etc.
        const thoughtRegex = /<thought[\s\S]*?>([\s\S]*?)<\/\s*thought\s*>/gi;
        const thoughts = [];
        let match;
        while ((match = thoughtRegex.exec(fullReply)) !== null) {
            thoughts.push(match[1].trim());
        }
        
        let replyText = fullReply.replace(thoughtRegex, '').trim();

        if (thoughts.length > 0) {
            console.log(`\n--- [Aishani's Thinking] ---\n${thoughts.join(' | ')}\n----------------------------\n`);
        }

        // Clean up remaining artifacts & tags
        replyText = replyText.replace(/<\|im_end\|>/g, '').replace(/<\|im_start\|>/g, '').trim();

        if (!replyText) {
            console.warn("Empty response from model, skipping.");
            chat.clearState();
            return;
        }

        // ── Store BOTH messages in history AFTER successful response ─
        pushHistory(chatId, 'user', userQuery);
        pushHistory(chatId, 'assistant', replyText);

        // ── Split into multiple messages for human feel ──────────
        const messages = splitIntoMessages(replyText);

        for (let i = 0; i < messages.length; i++) {
            if (i > 0) {
                // Pause between messages — like actually typing each one
                chat.sendStateTyping();
                const typingDelay = randInt(1500, 4000 + messages[i].length * 30);
                await sleep(typingDelay);
            } else {
                // Simulate typing duration for first message
                const typingTime = randInt(800, 2000 + messages[i].length * 25);
                await sleep(typingTime);
            }
            await chat.sendMessage(messages[i]);
        }

    } catch (error) {
        const errorMsg = error.message || "Unknown error";
        console.error("Shell Bridge Exception:", errorMsg);
        
        let contextMsg = "";
        if (errorMsg.includes("timed out")) contextMsg = " (Request timed out — Ollama might be slow/overloaded)";
        if (errorMsg.includes("wsl")) contextMsg = " (WSL/Ubuntu bridge failure)";
        
        msg.reply(`[System] Error: Aishani's brain is unreachable.${contextMsg}\nDetails: ${errorMsg.slice(0, 100)}...`);
    }
    chat.clearState();
});

client.initialize();
