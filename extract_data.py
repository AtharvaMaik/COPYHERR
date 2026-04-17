import re
import json
from collections import defaultdict
from datetime import datetime, timedelta
import os

def parse_whatsapp(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    date_regex = re.compile(r'^(\d{1,2}/\d{1,2}/\d{2}),\s(\d{2}:\d{2})\s-\s([^:]+):\s(.*)')
    
    messages = []
    current_msg = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        match = date_regex.match(line)
        if match:
            if current_msg:
                messages.append(current_msg)
                
            date_str, time_str, sender, content = match.groups()
            
            # WhatsApp format: M/D/YY or DD/MM/YY. 
            # In our data: 2/7/25 -> M/D/YY
            try:
                dt = datetime.strptime(f"{date_str} {time_str}", "%m/%d/%y %H:%M")
            except ValueError:
                try:
                    dt = datetime.strptime(f"{date_str} {time_str}", "%d/%m/%y %H:%M")
                except ValueError:
                    dt = None
            
            if sender != "Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. *Learn more*":
                current_msg = {
                    "datetime": dt,
                    "sender": sender.strip(),
                    "content": content.strip()
                }
        else:
            if current_msg:
                current_msg["content"] += "\n" + line
                
    if current_msg:
        messages.append(current_msg)
        
    return messages

def build_dataset(messages, target_personality="Aishani", max_samples=8000):
    dataset = []
    
    # We want to group by 30 minute intervals.
    sessions = []
    current_session = []
    
    for msg in messages:
        if not current_session:
            current_session.append(msg)
        else:
            prev_msg = current_session[-1]
            if msg['datetime'] and prev_msg['datetime']:
                diff = msg['datetime'] - prev_msg['datetime']
                if diff > timedelta(minutes=30):
                    sessions.append(current_session)
                    current_session = [msg]
                else:
                    current_session.append(msg)
            else:
                current_session.append(msg)
                
    if current_session:
        sessions.append(current_session)
        
    # Build SFT dataset from sessions
    memory_corpus = []
    for session in sessions:
        # We need a context rolling window.
        context_window = []
        
        # Consolidate consecutive messages from same sender
        consolidated = []
        for msg in session:
            # Skip media and empty tags completely
            if '<media omitted>' in msg['content'].lower() or not msg['content'].strip():
                continue
                
            if not consolidated:
                consolidated.append(msg)
            else:
                if consolidated[-1]['sender'] == msg['sender']:
                    consolidated[-1]['content'] += " " + msg['content']
                else:
                    consolidated.append(msg)
                    
        for i, msg in enumerate(consolidated):
            if msg['sender'].lower() == target_personality.lower():
                # Filter out meaningless responses like single-word generic replies for SFT
                if len(msg['content'].split()) < 2 and msg['content'].lower() not in ['yes', 'no', 'ok', 'okay', 'lmao', 'lol']:
                    pass # We allow them to exist in context, but maybe skip as the target label to build better logic
                # Actually, capturing their exact short texting style is fine.
                
                memory_corpus.append(msg['content'])
                # Only valid if there's a preceding context from the user
                if i > 0:
                    user_msg = consolidated[i-1]
                    # Up to 5 previous messages for instruction
                    start_idx = max(0, i-5)
                    context_history = consolidated[start_idx:i-1]
                    
                    instruction = "Context of the chat so far:\n"
                    if not context_history:
                        instruction += "No previous context.\n"
                    else:
                        for c in context_history:
                            instruction += f"{c['sender']}: {c['content']}\n"
                            
                    dataset.append({
                        "instruction": instruction.strip(),
                        "input": f"{user_msg['sender']}: {user_msg['content']}",
                        "output": msg['content']
                    })
                    
    # Take the latest max_samples
    if len(dataset) > max_samples:
        dataset = dataset[-max_samples:]
        
    return dataset, memory_corpus

def build_memory(memory_corpus):
    words = defaultdict(int)
    for text in memory_corpus:
        for word in re.findall(r'\b[a-zA-Z]{4,}\b', text.lower()):
            if word not in ["this", "that", "with", "have", "what", "like", "just", "know"]:
                words[word] += 1
                
    top_words = sorted(words.items(), key=lambda x: x[1], reverse=True)[:50]
    return {
        "frequently_used_words": [w[0] for w in top_words],
        "system_prompt_addition": f"You frequently use these words: {', '.join([w[0] for w in top_words])}."
    }

if __name__ == "__main__":
    pwd = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(pwd, "WhatsApp Chat with Aishani.txt")
    
    print("Parsing WhatsApp Export...")
    messages = parse_whatsapp(file_path)
    
    print(f"Total messages parsed: {len(messages)}")
    
    dataset, memory_corpus = build_dataset(messages, target_personality="Aishani")
    
    print(f"Total SFT pairs generated: {len(dataset)}")
    
    memory_data = build_memory(memory_corpus)
    
    out_jsonl = os.path.join(pwd, "train.jsonl")
    with open(out_jsonl, 'w', encoding='utf-8') as f:
        for d in dataset:
            f.write(json.dumps(d) + '\n')
            
    out_memory = os.path.join(pwd, "memory.json")
    with open(out_memory, 'w', encoding='utf-8') as f:
        json.dump(memory_data, f, indent=4)
        
    print(f"Saved {out_jsonl} and {out_memory}")
