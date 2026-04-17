import json
import os
import random
import requests
import re
import subprocess

os.environ['NO_PROXY'] = '127.0.0.1,localhost'

# Config
# Get the Windows Host IP from inside WSL
try:
    HOST_IP = subprocess.getoutput("ip route | grep default | awk '{print $3}'")
except:
    HOST_IP = 'localhost'

OLLAMA_URL = 'http://localhost:11434/api/generate'
RAG_URL = f'http://{HOST_IP}:5050/search'
PWD = os.path.dirname(os.path.abspath(__file__))
CHAT_LOG_PATH = os.path.join(PWD, '..', 'WhatsApp Chat with Aishani.txt')

def get_rag_context(query):
    try:
        res = requests.post(RAG_URL, json={"query": query, "top_k": 3}, timeout=5)
        return "\n".join(res.json())
    except Exception as e:
        print(f"  [RAG Error] {e}")
        return ""

def build_prompt(user_query, rag_hint):
    system_msg = """# MODULE 1: YOUR IDENTITY
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
- Final output format: <thought>Reasons</thought>Actual Response"""

    memory_msg = ""
    if rag_hint:
        # Transform Aishani -> YOU, Atharva -> HE
        transformed = rag_hint.replace("Aishani:", "YOU:").replace("Atharva:", "HE:")
        memory_msg = f"\n# MODULE 5: STYLISTIC MEMORIES\n(FOR TONE ONLY - HE is Atharva, YOU is Aishani. DO NOT repeat these scenarios):\n{transformed}"

    full_system = system_msg + memory_msg
    return f"<|im_start|>system\n{full_system}<|im_end|>\n<|im_start|>user\n{user_query}<|im_end|>\n<|im_start|>assistant\n"

def simulate():
    print("\n" + "="*40)
    print("      Aishani Simulation Engine (Python)")
    print("="*40 + "\n")

    if not os.path.exists(CHAT_LOG_PATH):
        print(f"[Error] Chat log not found at {CHAT_LOG_PATH}")
        return

    print("Reading chat logs...")
    with open(CHAT_LOG_PATH, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    atharva_lines = [l.split('- Atharva:')[1].strip() for l in lines if '- Atharva:' in l]
    atharva_lines = [l for l in atharva_lines if 10 < len(l) < 100]

    samples = random.sample(atharva_lines, 5)
    samples.append("hi")
    samples.append("i love you")

    for sample in samples:
        print(f"\nTest Query > {sample}")
        
        rag_hint = get_rag_context(sample)
        prompt = build_prompt(sample, rag_hint)

        try:
            res = requests.post(OLLAMA_URL, json={
                "model": "aishani_clone",
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.5}
            }, timeout=30)
            
            full_text = res.json()['response']
            
            thought_match = re.search(r'<thought>(.*?)</thought>', full_text, re.DOTALL)
            thought = thought_match.group(1).strip() if thought_match else "No thinking logged"
            reply = re.sub(r'<thought>.*?</thought>', '', full_text, flags=re.DOTALL).strip()

            print(f"  Thought: {thought}")
            print(f"  Aishani: {reply}")
        except Exception as e:
            print(f"  [Model Error] {e}")

if __name__ == "__main__":
    simulate()
