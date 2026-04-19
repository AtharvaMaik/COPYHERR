import re
import json
import os

def extract_lore(file_path, target_personality):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    date_regex = re.compile(r'^(\d{1,2}/\d{1,2}/\d{2}),\s(\d{2}:\d{2})\s-\s([^:]+):\s(.*)')
    lore_keywords = re.compile(r'\b(i|im|i\'m|my|mine|me|mera|meri|mujhe|hum|hate|love|like|am|was|went|always|never)\b', re.IGNORECASE)
    
    rag_database = []
    
    current_msg = ""
    current_sender = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        match = date_regex.match(line)
        if match:
            # Process previous msg
            if current_sender and current_sender.lower() == target_personality.lower():
                # Skip media
                if '<media omitted>' not in current_msg.lower():
                    # Check if it has lore keywords
                    if lore_keywords.search(current_msg) and len(current_msg.split()) > 3:
                        rag_database.append(current_msg)
            
            # Start new msg
            _, _, sender, content = match.groups()
            current_sender = sender.strip()
            current_msg = content.strip()
        else:
            if current_msg:
                current_msg += " " + line
                
    # Process the very last message in the file
    if current_sender and current_sender.lower() == target_personality.lower() and '<media omitted>' not in current_msg.lower():
        if lore_keywords.search(current_msg) and len(current_msg.split()) > 3:
            rag_database.append(current_msg)
            
    # Deduplicate logic if the same exact phrase was sent multiple times
    rag_database = list(set(rag_database))
    return rag_database

if __name__ == "__main__":
    pwd = os.path.dirname(os.path.abspath(__file__))
    export_path = os.environ.get("WHATSAPP_EXPORT_PATH", "whatsapp_chat.txt")
    file_path = export_path if os.path.isabs(export_path) else os.path.join(pwd, export_path)
    target_personality = os.environ.get("TARGET_PERSONA_NAME", "Target Persona")
    
    print("Starting Deep Lore RAG Extraction...")
    rag_data = extract_lore(file_path, target_personality)
    print(f"Extracted {len(rag_data)} memory sentences for the target persona.")
    
    out_json = os.path.join(pwd, "whatsapp_bot", "rag_database.json")
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(rag_data, f, indent=4)
        
    print(f"Successfully saved to {out_json}")
