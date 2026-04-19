import json
import os
import subprocess
import sys

import requests

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
MODEL_NAME = os.environ.get("OLLAMA_MODEL_NAME", "target_persona_clone")
TARGET_PERSONA = os.environ.get("TARGET_PERSONA_NAME", "Target Persona")
RAG_SCRIPT_PATH = os.environ.get("RAG_SCRIPT_PATH")


def get_rag_context(query):
    if not RAG_SCRIPT_PATH:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        default_path = os.path.join(script_dir, "whatsapp_bot", "query_rag.py")
    else:
        default_path = RAG_SCRIPT_PATH

    try:
        result = subprocess.check_output([sys.executable, default_path, query], text=True)
        start_str = "RAG_RESULT_START---"
        end_str = "---RAG_RESULT_END"

        if start_str in result and end_str in result:
            json_str = result.split(start_str)[1].split(end_str)[0]
            matches = json.loads(json_str)
            if matches:
                return f"(Relevant style memories: {', '.join(matches[:3])})\n"
    except Exception:
        pass
    return ""


def one_shot(user_input):
    context = get_rag_context(user_input)
    system_prompt = (
        f"You are {TARGET_PERSONA}. Keep responses short, casual, and in the style "
        f"learned from the provided WhatsApp training data. {context}"
    )

    prompt = (
        f"<|im_start|>system\n{system_prompt}\n"
        f"<|im_start|>user\n{user_input}<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )

    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.8,
            "stop": ["<|im_end|>", "<|im_start|>"],
        },
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=60)
        if response.status_code == 200:
            reply = response.json().get("response", "").strip()
            print("\n--- Persona Response ---\n")
            print(reply)
            print("\n------------------------\n")
        else:
            print(f"Error: {response.status_code} - {response.text}")
    except Exception as exc:
        print(f"Error: {exc}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        one_shot(sys.argv[1])
    else:
        print("Usage: python one_shot_chat.py 'your message'")
