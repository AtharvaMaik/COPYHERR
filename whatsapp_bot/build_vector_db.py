#!/usr/bin/env python3
import json
import os
import sys
import numpy as np
from sentence_transformers import SentenceTransformer

# Paths
PWD = os.path.dirname(os.path.abspath(__file__))
INPUT_PATH = os.path.join(PWD, 'rag_database_refined.json')
OUTPUT_PATH = os.path.join(PWD, 'rag_vectors.json')

def main():
    print("[RAG Build] Loading multilingual model...")
    model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')

    print(f"[RAG Build] Loading refined database from {INPUT_PATH}...")
    if not os.path.exists(INPUT_PATH):
        print(f"[ERROR] {INPUT_PATH} not found. Run refine_rag_data.js first.")
        return

    with open(INPUT_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"[RAG Build] Loaded {len(data)} chunks. Starting vectorization...")
    
    # Process in batches for speed
    BATCH_SIZE = 128
    vectors_output = []

    for i in range(0, len(data), BATCH_SIZE):
        batch = data[i:i + BATCH_SIZE]
        try:
            # Generate embeddings
            embeddings = model.encode(batch, convert_to_numpy=True, normalize_embeddings=True)
            
            for text, vec in zip(batch, embeddings):
                vectors_output.append({
                    "text": text,
                    "vector": vec.tolist()
                })
            
            if i % 1280 == 0:
                print(f"  Processed: {i} / {len(data)}")
        except Exception as e:
            print(f"  [ERROR] Processing batch starting at {i}: {e}")

    print(f"[RAG Build] Saving {len(vectors_output)} vectors to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(vectors_output, f)

    print("[SUCCESS] RAG memory is fully rebuilt and optimized.")

if __name__ == "__main__":
    main()
