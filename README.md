# COPYHERR: WhatsApp Persona Training Engine

![Language](https://img.shields.io/badge/Language-Python-blue)
![License](https://img.shields.io/badge/License-No%20license%20specified-lightgrey)

COPYHERR is a research project for building a private, local conversational model from your own exported WhatsApp chats. It turns a WhatsApp text export into supervised fine-tuning data, builds a vector memory store for retrieval-augmented generation, and connects the trained model to a WhatsApp Web bridge or CLI test harness.

> Privacy first: this repository contains only code and templates. Do not commit raw chat exports, generated training data, vector databases, session files, model weights, or private relationship graphs.

## What It Does

- Parses an exported WhatsApp chat into instruction/input/output training pairs.
- Extracts target-persona messages into a memory corpus for RAG.
- Fine-tunes a local model with Unsloth and exports it for Ollama.
- Builds semantic memory vectors from your own chat history.
- Runs a local RAG server that injects relevant memories into prompts.
- Provides a WhatsApp Web bridge with QR login, typing delay simulation, session persistence, and multi-message replies.
- Includes CLI scripts for one-shot testing and interactive local testing before connecting WhatsApp.

## Training Signal

- Successfully trained a local persona model on 80,000+ rows of WhatsApp chat data.
- Converts 1 exported `.txt` chat into 2 private artifacts: `train.jsonl` for fine-tuning and `memory.json` for retrieval memory.
- Uses QLoRA fine-tuning, GGUF export, Ollama inference, and a local RAG server for end-to-end private deployment.
- Includes a guarded WhatsApp bridge that only auto-replies to 1 explicitly configured contact.

## Project Structure

```text
copyherr/
|-- whatsapp_bot/
|   |-- index.js              # WhatsApp Web bridge
|   |-- chat.js               # Interactive CLI tester
|   |-- rag_server.py         # Persistent RAG HTTP server
|   |-- refine_rag_data.js    # Cleans chat export into RAG chunks
|   |-- build_vector_db.py    # Builds semantic vector memory
|   `-- social_graph.json     # Safe example relationship graph
|-- extract_data.py           # Builds train.jsonl and memory.json
|-- extract_rag_memory.py     # Extracts persona memory snippets
|-- train_unsloth.py          # QLoRA fine-tuning script
|-- train_wsl.sh              # WSL setup and training helper
|-- Modelfile                 # Ollama model template for Windows paths
|-- Modelfile.wsl             # Ollama model template for WSL paths
`-- README.md
```

## Safety And Consent

Only train on chats you are allowed to use. WhatsApp exports can contain sensitive personal information about multiple people, so keep the raw export local and review generated data before using it. The `.gitignore` is configured to block common private outputs such as `.txt`, `.jsonl`, `memory.json`, generated vector stores, model files, and WhatsApp session folders.

## Prerequisites

- Node.js and npm for the WhatsApp bridge.
- Python 3.10+ for data processing and RAG.
- WSL2 with Ubuntu if you want the same Windows/WSL workflow used by the scripts.
- Ollama for local inference.
- A CUDA-capable GPU is strongly recommended for Unsloth fine-tuning.

## 1. Export Your Own WhatsApp Chat

1. Open WhatsApp on your phone.
2. Open the chat you want to use.
3. Tap the contact/group name.
4. Choose `Export chat`.
5. Select `Without media`.
6. Save the `.txt` export into the project root.
7. Rename it to:

```text
whatsapp_chat.txt
```

If you prefer another filename, set `WHATSAPP_EXPORT_PATH` when running the scripts.

## 2. Configure The Target Persona

The target persona is the speaker whose style the model should learn. Their display name must match the sender name in the WhatsApp export.

PowerShell:

```powershell
$env:TARGET_PERSONA_NAME="Exact WhatsApp Sender Name"
$env:CHAT_PARTNER_NAME="Your Name Or Other Speaker Name"
$env:WHATSAPP_EXPORT_PATH="whatsapp_chat.txt"
$env:OLLAMA_MODEL_NAME="target_persona_clone"
```

Bash/WSL:

```bash
export TARGET_PERSONA_NAME="Exact WhatsApp Sender Name"
export CHAT_PARTNER_NAME="Your Name Or Other Speaker Name"
export WHATSAPP_EXPORT_PATH="whatsapp_chat.txt"
export OLLAMA_MODEL_NAME="target_persona_clone"
```

Optional WhatsApp bridge filter:

```bash
export RESPOND_TO_CONTACT_NAME="Exact WhatsApp Contact Name"
```

If `RESPOND_TO_CONTACT_NAME` is unset, the WhatsApp bridge logs incoming messages but does not auto-reply. This prevents accidental replies to the wrong contact.

## 3. Build Fine-Tuning Data

From the project root:

```bash
python extract_data.py
```

This creates:

```text
train.jsonl
memory.json
```

These files are private and ignored by git.

## 4. Fine-Tune The Model

On WSL/Linux with the required GPU setup:

```bash
bash train_wsl.sh
```

Or run the trainer directly:

```bash
python train_unsloth.py
```

By default, the trainer reads `train.jsonl` and exports a quantized model folder named:

```text
target_persona_qwen2_5_clone
```

You can override the export name:

```bash
export EXPORT_MODEL_NAME="my_persona_clone"
python train_unsloth.py
```

## 5. Create The Ollama Model

Edit the first line of `Modelfile` or `Modelfile.wsl` so the `FROM` path points to your exported model folder.

Windows-style example:

```text
FROM c:\path\to\copyherr\target_persona_qwen2_5_clone
```

WSL-style example:

```text
FROM /mnt/c/path/to/copyherr/target_persona_qwen2_5_clone
```

Then create the Ollama model:

```bash
ollama create target_persona_clone -f Modelfile.wsl
```

## 6. Build RAG Memory

Create cleaner RAG chunks:

```bash
cd whatsapp_bot
node refine_rag_data.js
```

Build vectors:

```bash
python build_vector_db.py
```

Start the RAG server:

```bash
python rag_server.py
```

The server listens on:

```text
http://127.0.0.1:5050/query
```

## 7. Test Locally

In one terminal, keep Ollama running with your created model.

In another terminal:

```bash
python one_shot_chat.py "say something casual"
```

Or use the interactive CLI:

```bash
cd whatsapp_bot
npm install
node chat.js
```

## 8. Connect WhatsApp

Install bridge dependencies:

```bash
cd whatsapp_bot
npm install
```

Set the contact filter before starting:

```bash
export RESPOND_TO_CONTACT_NAME="Exact WhatsApp Contact Name"
```

Start the bridge:

```bash
npm start
```

Scan the QR code with WhatsApp. The bridge uses local session persistence through `whatsapp-web.js`; generated auth/session folders are ignored by git.

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `TARGET_PERSONA_NAME` | `Target Persona` | Sender name to learn from in the exported chat. |
| `CHAT_PARTNER_NAME` | `Chat Partner` | Optional label for the other speaker in prompts. |
| `WHATSAPP_EXPORT_PATH` | `whatsapp_chat.txt` | Path to your exported WhatsApp text file. |
| `OLLAMA_MODEL_NAME` | `target_persona_clone` | Ollama model used for inference. |
| `EXPORT_MODEL_NAME` | `target_persona_qwen2_5_clone` | Fine-tuned model export folder. |
| `RESPOND_TO_CONTACT_NAME` | unset | WhatsApp contact name the bridge is allowed to answer. |
| `RAG_SCRIPT_PATH` | auto-detected | Optional path to `query_rag.py` for one-shot scripts. |

## What Not To Commit

Keep these private:

- WhatsApp `.txt` exports
- `train.jsonl`
- `memory.json`
- `rag_database.json`
- `rag_database_refined.json`
- `rag_vectors.json`
- `.env`
- `.wwebjs_auth/`
- `.wwebjs_cache/`
- model folders, `.gguf`, `.bin`, and other weights

## Tech Stack

- Python for parsing, training orchestration, RAG, and one-shot testing.
- Node.js for WhatsApp Web automation and CLI testing.
- Unsloth + QLoRA for fine-tuning.
- Ollama for local model serving.
- Sentence Transformers for semantic memory search.
- `whatsapp-web.js` for WhatsApp integration.

## Contributing

Contributions are welcome. You can help by reporting bugs, suggesting features, improving documentation, or opening pull requests.

1. Fork the repository.
2. Create a feature branch.
3. Make a focused change.
4. Test the project locally when possible.
5. Open a pull request with a clear summary of what changed.

## License
Created for personal AI research and local experimentation.
