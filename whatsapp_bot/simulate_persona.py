import os
import random
import re

import requests

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
RAG_URL = os.environ.get("RAG_URL", "http://127.0.0.1:5050/query")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL_NAME", "target_persona_clone")
TARGET_PERSONA = os.environ.get("TARGET_PERSONA_NAME", "Target Persona")
CHAT_PARTNER = os.environ.get("CHAT_PARTNER_NAME", "Chat Partner")

PWD = os.path.dirname(os.path.abspath(__file__))
export_path = os.environ.get("WHATSAPP_EXPORT_PATH", "whatsapp_chat.txt")
CHAT_LOG_PATH = export_path if os.path.isabs(export_path) else os.path.join(PWD, "..", export_path)


def get_rag_context(query):
    try:
        response = requests.post(RAG_URL, json={"query": query, "top_k": 3}, timeout=5)
        data = response.json()
        results = data.get("results", data if isinstance(data, list) else [])
        return "\n".join(results)
    except Exception as exc:
        print(f"[RAG Error] {exc}")
        return ""


def build_prompt(user_query, rag_hint):
    system_msg = f"""# MODULE 1: IDENTITY
You are {TARGET_PERSONA}. You are chatting over WhatsApp with {CHAT_PARTNER}.
Match the target persona's style from the fine-tuning data.
Keep replies concise, natural, and not assistant-like.
Do not invent people, stories, memories, or events."""

    if rag_hint:
        system_msg += f"\n# STYLISTIC MEMORIES\nUse only if relevant:\n{rag_hint}"

    return (
        f"<|im_start|>system\n{system_msg}<|im_end|>\n"
        f"<|im_start|>user\n{user_query}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )


def simulate():
    print("\nCOPYHERR Simulation Engine\n")

    if not os.path.exists(CHAT_LOG_PATH):
        print(f"[Error] Chat log not found at {CHAT_LOG_PATH}")
        return

    with open(CHAT_LOG_PATH, "r", encoding="utf-8") as file:
        lines = file.readlines()

    partner_lines = [
        line.split(f"- {CHAT_PARTNER}:")[1].strip()
        for line in lines
        if f"- {CHAT_PARTNER}:" in line
    ]
    partner_lines = [line for line in partner_lines if 10 < len(line) < 100]

    samples = random.sample(partner_lines, min(5, len(partner_lines))) if partner_lines else []
    samples.extend(["hi", "how are you?"])

    for sample in samples:
        print(f"\nTest Query > {sample}")
        rag_hint = get_rag_context(sample)
        prompt = build_prompt(sample, rag_hint)

        try:
            response = requests.post(
                OLLAMA_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.5},
                },
                timeout=30,
            )

            full_text = response.json()["response"]
            thought_match = re.search(r"<thought>(.*?)</thought>", full_text, re.DOTALL)
            thought = thought_match.group(1).strip() if thought_match else "No thinking logged"
            reply = re.sub(r"<thought>.*?</thought>", "", full_text, flags=re.DOTALL).strip()

            print(f"Thought: {thought}")
            print(f"{TARGET_PERSONA}: {reply}")
        except Exception as exc:
            print(f"[Model Error] {exc}")


if __name__ == "__main__":
    simulate()
