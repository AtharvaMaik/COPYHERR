#!/usr/bin/env python3
"""
Persistent RAG server. It loads the embedding model and vector database once,
then serves memory queries over HTTP.
"""

import json
import logging
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer

import numpy as np
from sentence_transformers import SentenceTransformer

logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
logging.getLogger("transformers").setLevel(logging.WARNING)

print("[RAG] Loading sentence transformer model...")
model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")

print("[RAG] Loading vector database...")
pwd = os.path.dirname(os.path.abspath(__file__))
vectors_path = os.path.join(pwd, "rag_vectors.json")

if not os.path.exists(vectors_path):
    print(f"[RAG] ERROR: {vectors_path} not found.")
    sys.exit(1)

with open(vectors_path, "r", encoding="utf-8") as file:
    db = json.load(file)

print(f"[RAG] Loaded {len(db)} vectors. Ready to serve.")

print("[RAG] Optimized search: loading matrix...")
data_texts = [item["text"] for item in db]
vectors_matrix = np.array([item["vector"] for item in db], dtype="float32")

norms = np.linalg.norm(vectors_matrix, axis=1, keepdims=True)
norms[norms == 0] = 1.0
vectors_matrix = vectors_matrix / norms


def search(query, top_k=3, threshold=0.65):
    print(f'\n[RAG Query] Incoming: "{query}"')
    q_vec = np.array(model.encode(query, normalize_embeddings=True), dtype="float32")
    similarities = np.dot(vectors_matrix, q_vec)

    top_indices = np.where(similarities > threshold)[0]
    top_indices = top_indices[np.argsort(similarities[top_indices])[::-1][:top_k]]
    results = [data_texts[i] for i in top_indices]

    if results:
        print(f"[RAG Hits] Found {len(results)} matches:")
        for index, vector_index in enumerate(top_indices):
            result = data_texts[vector_index]
            similarity = similarities[vector_index]
            clean_result = result.replace("\n", " ").strip()
            preview = f"{clean_result[:500]}..." if len(clean_result) > 500 else clean_result
            print(f"  {index + 1}. [{similarity:.3f}] {preview}")
    else:
        print("[RAG] No relevant memories found.")

    return results


class RAGHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
            query = data.get("query", "")
            results = search(query)
            response = json.dumps({"results": results})
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode())
        except Exception as exc:
            traceback.print_exc()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc), "traceback": traceback.format_exc()}).encode())

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5050
    server = HTTPServer(("0.0.0.0", port), RAGHandler)
    print(f"[RAG] Server listening on http://0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[RAG] Shutting down.")
        server.server_close()
