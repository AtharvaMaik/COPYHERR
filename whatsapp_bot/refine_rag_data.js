const fs = require("fs");
const path = require("path");

const RAW_CHAT_PATH = process.env.WHATSAPP_EXPORT_PATH
  ? path.resolve(process.env.WHATSAPP_EXPORT_PATH)
  : path.join(__dirname, "..", "whatsapp_chat.txt");
const OUTPUT_PATH = path.join(__dirname, "rag_database_refined.json");

const lineRegex = /^\d{1,2}\/\d{1,2}\/\d{2,4}, \d{1,2}:\d{2}\s*-\s*([^:]+):\s*([\s\S]*)$/;

async function refine() {
  console.log("Reading raw chat...");
  const content = fs.readFileSync(RAW_CHAT_PATH, "utf-8");
  const lines = content.split("\n");

  const cleanedLines = [];
  console.log("Parsing and cleaning lines...");

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const match = line.match(lineRegex);
    if (match) {
      const sender = match[1].trim();
      const message = match[2].trim();

      if (message.includes("<Media omitted>")) continue;
      if (message.includes("This message was edited")) continue;
      if (message.length < 5) continue;

      const cleanMsg = message.replace(/<\|im_end\|>/g, "").replace(/<\|im_start\|>/g, "").trim();
      cleanedLines.push(`${sender}: ${cleanMsg}`);
    } else if (cleanedLines.length > 0) {
      cleanedLines[cleanedLines.length - 1] += ` ${line.trim()}`;
    }
  }

  console.log(`Extracted ${cleanedLines.length} clean messages. Chunking...`);

  const chunks = [];
  const chunkSize = Number(process.env.RAG_CHUNK_SIZE || 3);
  const blacklist = [
    "shower",
    "toilet",
    "washroom",
    "sleep",
    "wake up",
    "goodnight",
    "sleeping",
    "sorry",
    "apologize",
    "disturbance",
  ];

  for (let i = 0; i < cleanedLines.length; i += chunkSize) {
    const chunk = cleanedLines.slice(i, i + chunkSize).join("\n");
    if (chunk.length <= 50 || chunk.split("\n").length !== chunkSize) continue;

    const lowChunk = chunk.toLowerCase();
    if (blacklist.some((word) => lowChunk.includes(word))) continue;
    if (lowChunk.includes("13 year old")) continue;

    chunks.push(chunk);
  }

  const uniqueChunks = [...new Set(chunks)];
  console.log(`Refining complete. Total chunks: ${uniqueChunks.length}`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(uniqueChunks, null, 4));
  console.log(`Saved to ${OUTPUT_PATH}`);
}

refine();
