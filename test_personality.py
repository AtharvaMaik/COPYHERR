import os

import requests

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
MODEL_NAME = os.environ.get("OLLAMA_MODEL_NAME", "target_persona_clone")
TARGET_PERSONA = os.environ.get("TARGET_PERSONA_NAME", "Target Persona")


def chat():
    print(f"--- Chatting with {TARGET_PERSONA} clone ({MODEL_NAME}) ---")
    print("Type 'exit' to quit.\n")

    while True:
        user_input = input("You: ")
        if user_input.lower() in ["exit", "quit"]:
            break

        system_prompt = (
            f"You are {TARGET_PERSONA}. Keep responses short, casual, and in the style "
            "learned from the WhatsApp fine-tuning data."
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
            "options": {"temperature": 0.8},
        }

        try:
            response = requests.post(OLLAMA_URL, json=payload, timeout=60)
            if response.status_code == 200:
                reply = response.json().get("response", "").replace("<|im_end|>", "").strip()
                print(f"{TARGET_PERSONA}: {reply}\n")
            else:
                print(f"Error: {response.status_code} - {response.text}")
        except Exception as exc:
            print(f"Connectivity error: {exc}. Make sure Ollama is running at {OLLAMA_URL}.")


if __name__ == "__main__":
    chat()
