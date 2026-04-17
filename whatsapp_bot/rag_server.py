#!/usr/bin/env python3
"""
Persistent RAG server — loads model + vectors ONCE, serves queries via HTTP.
Run:  python3 rag_server.py
Endpoint:  POST http://localhost:5050/query  {"query": "text"}
"""

import json, math, os, sys
from http.server import HTTPServer, BaseHTTPRequestHandler
import logging, traceback

logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
logging.getLogger("transformers").setLevel(logging.WARNING)

print("[RAG] Loading sentence transformer model...")
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')

print("[RAG] Loading vector database...")
pwd = os.path.dirname(os.path.abspath(__file__))
vectors_path = os.path.join(pwd, 'rag_vectors.json')

if not os.path.exists(vectors_path):
    print(f"[RAG] ERROR: {vectors_path} not found!")
    sys.exit(1)

with open(vectors_path, 'r', encoding='utf-8') as f:
    db = json.load(f)

print(f"[RAG] Loaded {len(db)} vectors. Ready to serve.")


import numpy as np

# Load vectors into a numpy matrix for fast math
print("[RAG] Optimized search: Loading matrix...")
data_texts = [item["text"] for item in db]
vectors_matrix = np.array([item["vector"] for item in db], dtype='float32')

# NORMALIZE the matrix once for fast cosine similarity later
norms = np.linalg.norm(vectors_matrix, axis=1, keepdims=True)
norms[norms == 0] = 1.0  # Avoid division by zero
vectors_matrix = vectors_matrix / norms

def search(query, top_k=3, threshold=0.65):
    print(f"\n[RAG Query] Incoming: \"{query}\"")
    # model.encode with normalize_embeddings=True gives us a unit vector
    q_vec = np.array(model.encode(query, normalize_embeddings=True), dtype='float32')
    
    # Fast cosine similarity via matrix multiplication
    # Matrix is (N, 384) [Unit], q_vec is (384,) [Unit] -> Dot is exactly Cosine
    similarities = np.dot(vectors_matrix, q_vec)
    
    top_indices = np.where(similarities > threshold)[0]
    top_indices = top_indices[np.argsort(similarities[top_indices])[::-1][:top_k]]
    
    results = [data_texts[i] for i in top_indices]
    
    if results:
        print(f"[RAG Hits] Found {len(results)} matches:")
        for i, idx in enumerate(top_indices):
            res = data_texts[idx]
            sim = similarities[idx]
            clean_res = res.replace('\n', ' ').strip()
            print(f"  {i+1}. [{sim:.3f}] {clean_res[:500]}..." if len(clean_res) > 500 else f"  {i+1}. [{sim:.3f}] {clean_res}")
    else:
        print("[RAG] No relevant memories found.")
        
    return results


class RAGHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
            query = data.get('query', '')
            results = search(query)
            response = json.dumps({"results": results})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(response.encode())
        except Exception as e:
            traceback.print_exc()
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e), "traceback": traceback.format_exc()}).encode())

    def log_message(self, format, *args):
        # Suppress per-request log spam
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5050
    server = HTTPServer(('0.0.0.0', port), RAGHandler)
    print(f"[RAG] Server listening on http://0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[RAG] Shutting down.")
        server.server_close()
