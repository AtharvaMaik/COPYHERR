import requests
import json
import subprocess
import os

# Configuration
OLLAMA_URL = "http://127.0.0.1:11434/api/generate" # Internal WSL address
MODEL_NAME = "aishani_clone"

def get_rag_context(query):
    try:
        # Run the existing RAG script with absolute WSL path
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
        print(f"RAG Error: {e}")
    return ""

def chat():
    print(f"--- Chatting with Aishani Clone ({MODEL_NAME}) ---")
    print("Type 'exit' to quit.\n")
    
    while True:
        user_input = input("You: ")
        if user_input.lower() in ['exit', 'quit']:
            break
            
        context = get_rag_context(user_input)
        system_prompt = f"You are Aishani. Keep responses short, casual, and in lowercase. You are chatting over WhatsApp. Use English. {context}"
        
        prompt = f"<|im_start|>system\n{system_prompt}\n<|im_start|>user\n{user_input}<|im_end|>\n<|im_start|>assistant\n"
        
        payload = {
            "model": MODEL_NAME,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.8
            }
        }
        
        try:
            response = requests.post(OLLAMA_URL, json=payload)
            if response.status_code == 200:
                reply = response.json().get('response', '').replace("<|im_end|>", "").strip()
                print(f"Aishani: {reply}\n")
            else:
                print(f"Error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Connectivity Error: {e}. (Make sure Ollama is running in WSL at {OLLAMA_URL})")

if __name__ == "__main__":
    chat()
