const fs = require('fs');
const path = require('path');

const RAW_CHAT_PATH = path.join(__dirname, '..', 'WhatsApp Chat with Aishani.txt');
const OUTPUT_PATH = path.join(__dirname, 'rag_database_refined.json');

// Regex to detect WhatsApp sender lines: "2/13/25, 19:01 - Atharva: Message"
const lineRegex = /^\d{1,2}\/\d{1,2}\/\d{2,4}, \d{1,2}:\d{2}\s*-\s*([^:]+):\s*([\s\S]*)$/;

async function refine() {
    console.log("Reading raw chat...");
    const content = fs.readFileSync(RAW_CHAT_PATH, 'utf-8');
    const lines = content.split('\n');

    let cleanedLines = [];
    console.log("Parsing and cleaning lines...");

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const match = line.match(lineRegex);
        if (match) {
            const sender = match[1].trim();
            const message = match[2].trim();

            // Skip garbage
            if (message.includes('<Media omitted>')) continue;
            if (message.includes('This message was edited')) continue;
            if (message.length < 5) continue;
            
            // Clean message of internal junk
            let cleanMsg = message.replace(/<\|im_end\|>/g, '').replace(/<\|im_start\|>/g, '').trim();
            
            cleanedLines.push(`${sender}: ${cleanMsg}`);
        } else {
            // This might be a continuation of the previous message (multi-line)
            if (cleanedLines.length > 0) {
                cleanedLines[cleanedLines.length - 1] += ' ' + line.trim();
            }
        }
    }

    console.log(`Extracted ${cleanedLines.length} clean messages. Chunking...`);
    
    let chunks = [];
    const CHUNK_SIZE = 3;

    for (let i = 0; i < cleanedLines.length; i += CHUNK_SIZE) {
        const chunk = cleanedLines.slice(i, i + CHUNK_SIZE).join('\n');
        
        // Final sanity check on chunks
        if (chunk.length > 50 && chunk.split('\n').length === CHUNK_SIZE) {
            const lowChunk = chunk.toLowerCase();
            
            // ❌ BLACKLIST PURGE: Remove generic logistic trap words and obsessive apologies
            const blacklist = [
                'shower', 'toilet', 'washroom', 'sleep', 'wake up', 'goodnight', 
                'byebye', 'bye boss', 'sleeping', 'sorry', 'sorri', 'apologize', 'disturbance'
            ];
            if (blacklist.some(word => lowChunk.includes(word))) continue;

            // ❌ Filter out sussy halluncinations known to cause issues
            if (lowChunk.includes('13 year old')) continue;
            if (lowChunk.includes('shweta')) continue; 

            chunks.push(chunk);
        }
    }

    // Deduplicate
    const uniqueChunks = [...new Set(chunks)];

    console.log(`Refining complete. Total chunks: ${uniqueChunks.length}`);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(uniqueChunks, null, 4));
    console.log(`Saved to ${OUTPUT_PATH}`);
}

refine();
