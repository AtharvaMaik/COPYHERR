import json, os
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
with open('rag_vectors.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

def cosine_sim(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    n1 = sum(x * x for x in a)
    n2 = sum(y * y for y in b)
    if n1 == 0 or n2 == 0:
        return 0.0
    return dot / ((n1**0.5) * (n2**0.5))

query = "hi"
q_vec = model.encode(query).tolist()
try:
    for item in db[:10]:
        s = cosine_sim(q_vec, item["vector"])
        print(f"Text: {item['text'][:50]}... Score: {s}")
    print("Test successful")
except Exception as e:
    print(f"Error: {e}")
