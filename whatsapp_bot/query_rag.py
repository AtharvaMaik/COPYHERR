import sys, json, math, os
import logging
logging.getLogger("sentence_transformers").setLevel(logging.WARNING)

from sentence_transformers import SentenceTransformer

def cosine_sim(a, b):
    dot = 0.0
    n1 = 0.0
    n2 = 0.0
    for x, y in zip(a, b):
        dot += x * y
        n1 += x * x
        n2 += y * y
    if n1 == 0 or n2 == 0:
        return 0.0
    return dot / (math.sqrt(n1) * math.sqrt(n2))

def main():
    if len(sys.argv) < 2:
        print("RAG_RESULT_START---[]---RAG_RESULT_END")
        return
        
    query = sys.argv[1]
    
    pwd = os.path.dirname(os.path.abspath(__file__))
    vectors_path = os.path.join(pwd, 'rag_vectors.json')
    
    if not os.path.exists(vectors_path):
        print("RAG_RESULT_START---[]---RAG_RESULT_END")
        return

    model = SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
    
    with open(vectors_path, 'r', encoding='utf-8') as f:
        db = json.load(f)

    q_vec = model.encode(query).tolist()

    scores = []
    for item in db:
        s = cosine_sim(q_vec, item["vector"])
        if s > 0.40:  # Context Threshold
            scores.append((item["text"], s))

    scores.sort(key=lambda x: x[1], reverse=True)
    top_3 = [x[0] for x in scores[:3]]

    print("RAG_RESULT_START---" + json.dumps(top_3) + "---RAG_RESULT_END")

if __name__ == "__main__":
    main()
