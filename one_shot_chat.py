import requests
import json
import subprocess
import os
import sys

# Configuration
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "aishani_clone"

def get_rag_context(query):
    try:
        rag_path = '/mnt/c/AISH20/COPYHER/whatsapp_bot/query_rag.py'
        result = subprocess.check_output(['python3', rag_path, query], text=True)
        
        start_str = "RAG_RESULT_START---"
        end_str = "---RAG_RESULT_END"
        
        if start_str in result and end_str in result:
            json_str = result.split(start_str)[1].split(end_str)[0]
            matches = json.loads(json_str)
            if matches:
                 return f"(Context from Aishani's life: {', '.join(matches[:3])})\n"
    except Exception as e:
        pass
    return ""

def one_shot(user_input):
    context = get_rag_context(user_input)
    # Strict personality and language instructions
    system_prompt = f"You are Aishani. Keep responses short, casual, and in lowercase. You are chatting over WhatsApp. SPEAK ONLY IN ENGLISH. {context}"
    
    prompt = f"<|im_start|>system\n{system_prompt}\n<|im_start|>user\n{user_input}<|im_end|>\n<|im_start|>assistant\n"
    
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.8,
            "stop": ["<|im_end|>", "<|im_start|>"]
        }
    }
    
    try:
        response = requests.post(OLLAMA_URL, json=payload)
        if response.status_code == 200:
            reply = response.json().get('response', '').strip()
            print(f"\n--- Aishani's Response ---\n")
            print(reply)
            print(f"\n---------------------------\n")
        else:
            print(f"Error: {response.status_code} - {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        one_shot(sys.argv[1])
    else:
        print("Usage: python3 one_shot_chat.py 'your message'")
