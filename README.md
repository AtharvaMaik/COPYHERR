#  CopyHer: The AI Personality Replication Engine

> [!TIP]
> **Anyone can do this.** CopyHer makes it possible for anyone to export their WhatsApp chat and clone a person's digital persona. No complex AI setup required—just your data and our engine.

A state-of-the-art personality cloning system that reproduces a specific individual's conversational style, memories, and social dynamics. Built with a fine-tuned LLM, vector-based RAG memory, and a seamless WhatsApp integration.

![Aishani Project](https://img.shields.io/badge/Status-Active-brightgreen)
![LLM-FineTuning](https://img.shields.io/badge/Model-Llama3--Ollama-blue)
![RAG-Enhanced](https://img.shields.io/badge/Memory-RAG--Vector-orange)

## 🎯 The Clone Protocol

The mission of CopyHer is to democratize digital persona replication. By leveraging raw WhatsApp exports, we can extract the unique "soul" of a conversation—slang, sarcasm, emojis, and all—and transplant it into a high-performance LLM.

## ✨ Core Features

### 🧠 Fine-Tuned Personality (Ollama + Unsloth)
- **Identity Locked**: The model is hard-coded into the target persona (e.g., "RAMESH"—a 20-year-old CS student with a playful, witty, and slightly sarcastic tone).
- **Thinking Protocol**: Uses internal `<thought>` blocks to analyze tone and ensure non-robotic responses before outputting.
- **WSL Bridge**: Optimized to run high-performance inference in a WSL2 (Ubuntu) environment while bridging to Windows for WhatsApp integration.

### 📜 Persistent Semantic Memory (RAG)
- **Deep Recall**: Utilizes a custom RAG (Retrieval-Augmented Generation) engine to search through historical chat logs and personal memories.
- **Contextual Injection**: Relevant memories are injected dynamically into the prompt only when relevant, maintaining a natural flow.
- **High Performance**: RAG lookups are handled by a dedicated HTTP server for sub-second responses.

### 🤝 Social Graph Awareness
- **Relationship Mapping**: Uses a `social_graph.json` to understand connections with friends and family.
- **Dynamic Context**: Automatically identifies people mentioned in chat and pulls related relationship context (e.g., "Rahul (Friend): Met at college...").

### 📱 WhatsApp Integration
- **Human-Feel Interaction**: Simulates typing states, varying delays, and multi-message splitting to mirror real human texting patterns.
- **Robust Connection**: Powered by `whatsapp-web.js` with session persistence and automatic QR code generation.

---

## 🏗️ Project Structure

```text
copyher/
├── whatsapp_bot/        # Node.js WhatsApp Engine
│   ├── index.js         # Main bot entry point & WhatsApp logic
│   ├── chat.js          # CLI-based chat interface for testing
│   ├── rag_server.py    # Python-based RAG HTTP server
│   └── social_graph.json # Anonymized relationship graph (Template)
├── Modelfile.wsl        # Ollama model definition for Aishani
├── train_unsloth.py     # Fine-tuning script using Llama-3 + Unsloth
├── extract_data.py      # Script to process raw WhatsApp exports into JSONL
└── README.md            # Project documentation
```

> [!IMPORTANT]
> **Privacy Notice**: This repository contains the logic and structure for the Aishani Persona AI. Raw chat logs, fine-tuning datasets (`train.jsonl`), and the pre-computed vector database (`rag_vectors.json`) have been excluded for privacy. You can regenerate these using the provided scripts and your own data.

---

## 🚀 Quick Start

### 1. Prerequisites (WSL2 + Ubuntu)
This project is designed to run its "brain" (LLM) inside WSL2 for performance and the WhatsApp bridge on Windows/WSL depending on your preference.

### 2. Setup Memory (RAG)
Start the RAG server to enable Aishani's memory:
```bash
cd whatsapp_bot
python rag_server.py
```

### 3. Launch the Bot
Install dependencies and start the WhatsApp client:
```bash
cd whatsapp_bot
npm install
node index.js
```
Scan the generated QR code in your terminal to link your WhatsApp account.

## 🚀 Detailed Setup & Execution

Since the personal data has been removed for privacy, following these steps will allow you to reconstruct the "brain" of the project using your own chat history.

### 1. Data Preparation (Universal Process)
- **Select a Target**: Choose any person you have a long chat history with.
- **Export Chat**: Open the chat on WhatsApp -> Settings -> Export Chat -> Without Media. 
- **Process**: Save the resulting `.txt` file in the project root. This is the only "fuel" the AI needs to clone their personality.

### 2. Personality Extraction & Fine-Tuning
- **Extract Dataset**: Run the extraction script to generate the training JSONL and memory profile.
  ```bash
  python extract_data.py
  ```
- **Fine-Tune (WSL/GPU)**: If you have a matching GPU in WSL/Ubuntu, use the Unsloth script to fine-tune Llama-3.
  ```bash
  bash train_wsl.sh
  ```
- **Import to Ollama**: Create the model in Ollama using the generated GGUF/weights.
  ```bash
  ollama create aishani_clone -f Modelfile.wsl
  ```

### 3. Rebuilding the RAG Memory
- **Refine Data**: Prepare the chat logs for vectorization.
  ```bash
  cd whatsapp_bot
  node refine_rag_data.js
  ```
- **Build Vectors**: Generate the high-dimensional embeddings.
  ```bash
  python build_vector_db.py
  ```

### 4. Running the Bot
- **Start RAG Server**: Keep the memory server running in the background.
  ```bash
  cd whatsapp_bot
  python rag_server.py
  ```
- **Start WhatsApp Client**: In a new terminal, launch the bot.
  ```bash
  cd whatsapp_bot
  npm start
  ```
- **Scan QR**: Use your phone to scan the QR code displayed in the terminal.

---

## 🛠️ Tech Stack
- **Backend**: Node.js, Python (FastAPI/Flask-style RAG).
- **Core AI**: Ollama, Unsloth (for fine-tuning Llama-3).
- **Database**: JSON-based Vector Store for RAG.
- **Environment**: Windows 11 + WSL2 (Ubuntu 22.04).

---

## 📄 License
Created for personal research into AI personality replication.
