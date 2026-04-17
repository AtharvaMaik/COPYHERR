import os
import torch
from unsloth import FastLanguageModel
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments

# Define hardware bounds
max_seq_length = 1024 # Reduced for 8GB VRAM RTX 4060
dtype = None # Auto detect
load_in_4bit = True # 4bit quantization

def format_prompt(examples):
    instructions = examples["instruction"]
    inputs       = examples["input"]
    outputs      = examples["output"]
    texts = []
    
    # We will use ChatML or standard prompt format
    # Aishani's style cloning prompt
    prompt_template = """<|im_start|>system
You are Aishani. You are chatting over WhatsApp. Emulate her personality, tone, quirks, slang, and way of typing perfectly based on the context. Keep your responses exactly as Aishani would naturally reply—usually short, casual, and using lowercase unless emphasizing.
<|im_start|>user
{instruction}
{input}<|im_end|>
<|im_start|>assistant
{output}<|im_end|>"""

    for inst, inp, out in zip(instructions, inputs, outputs):
        text = prompt_template.format(instruction=inst, input=inp, output=out)
        texts.append(text)
    return { "text" : texts }

def main():
    model_name = "unsloth/Qwen2.5-Coder-7B-Instruct-bnb-4bit"
    print(f"Loading {model_name}...")
    
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name = model_name,
        max_seq_length = max_seq_length,
        dtype = dtype,
        load_in_4bit = load_in_4bit,
    )
    
    # Setup QLoRA
    model = FastLanguageModel.get_peft_model(
        model,
        r = 16, # Rank 16
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                          "gate_proj", "up_proj", "down_proj"],
        lora_alpha = 32, # Alpha 32
        lora_dropout = 0, # Optimization
        bias = "none",
        use_gradient_checkpointing = "unsloth",
        random_state = 3407,
        use_rslora = False,
        loftq_config = None,
    )
    
    dataset = load_dataset("json", data_files="train.jsonl", split="train")
    
    # For a laptop RTX, 42k rows is a LOT. We'll take a subset if we just want a "smart clone"
    # But since it's 3 epochs, it might take ~10 hours. I'll just keep the full dataset for pure accuracy, 
    # but print a warning that it's heavy computing. 
    
    dataset = dataset.map(format_prompt, batched = True)
    
    # Training Arguments
    args = TrainingArguments(
        per_device_train_batch_size = 1,
        gradient_accumulation_steps = 4,
        warmup_steps = 5,
        max_steps = 150, # Replaces epochs to enforce ~30 minute cutoff
        learning_rate = 2e-4,
        fp16 = not torch.cuda.is_bf16_supported(),
        bf16 = torch.cuda.is_bf16_supported(),
        logging_steps = 50,
        optim = "adamw_8bit",
        weight_decay = 0.01,
        lr_scheduler_type = "linear",
        seed = 3407,
        output_dir = "outputs",
    )
    
    trainer = SFTTrainer(
        model = model,
        tokenizer = tokenizer,
        train_dataset = dataset,
        dataset_text_field = "text",
        max_seq_length = max_seq_length,
        dataset_num_proc = 2,
        packing = True, # Massive speedup at the cost of slight crossover
        args = args,
    )
    
    print("Starting training...")
    trainer_stats = trainer.train()
    print("Training finished!")
    
    # Export to GGUF
    export_name = "aishani_qwen2.5_clone"
    print(f"Exporting to GGUF (q4_k_m) as {export_name}...")
    model.save_pretrained_gguf(export_name, tokenizer, quantization_method = "q4_k_m")
    
if __name__ == "__main__":
    main()
