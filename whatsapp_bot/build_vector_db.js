const fs = require('fs');
const path = require('path');

async function main() {
    console.log("Loading Multilingual Transformer Pipeline natively in Node...");
    // Dynamic import to support ESM modules
    const { pipeline } = await import('@xenova/transformers');
    
    console.log("Loading Rag Database...");
    let ragDatabase = [];
    try {
        ragDatabase = JSON.parse(fs.readFileSync(path.join(__dirname, 'rag_database_refined.json'), 'utf8'));
    } catch(e) {
        console.error("No database found!");
        return;
    }
    
    console.log(`Loaded ${ragDatabase.length} records. Prepping native Multilingual AI pipeline...`);
    // Load multilingual model
    // This explicitly protects "Hinglish" and Indian cultural semantics
    const extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
        quantized: true // Use INT8 to speed up the embedding exponentially
    });
    
    console.log("Model loaded. Vectorizing 60k strings in batches...");
    const vectors = [];
    const BATCH_SIZE = 64;
    
    for (let i = 0; i < ragDatabase.length; i += BATCH_SIZE) {
        const batch = ragDatabase.slice(i, i + BATCH_SIZE);
        try {
            // Extractor can process a batch of strings
            const outputs = await extractor(batch, { pooling: 'mean', normalize: true });
            
            // Map outputs back to our vector structure
            for (let j = 0; j < batch.length; j++) {
                const vectorArray = Array.from(outputs[j].data);
                vectors.push({
                    text: batch[j],
                    vector: vectorArray
                });
            }
            
            if (i % 640 === 0) {
                console.log(`Processed: ${i} / ${ragDatabase.length}`);
            }
        } catch(e) {
            console.error(`Error processing batch starting at ${i}:`, e);
        }
    }
    
    console.log(`Vectorization complete. Saving ${vectors.length} semantic vectors to rag_vectors.json...`);
    fs.writeFileSync(path.join(__dirname, 'rag_vectors.json'), JSON.stringify(vectors));
    console.log("Saved.");
}

main();
