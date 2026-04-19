import os

import torch
from datasets import load_dataset
from transformers import TrainingArguments
from trl import SFTTrainer
from unsloth import FastLanguageModel

TARGET_PERSONA = os.environ.get("TARGET_PERSONA_NAME", "Target Persona")
BASE_MODEL = os.environ.get("BASE_MODEL_NAME", "unsloth/Qwen2.5-Coder-7B-Instruct-bnb-4bit")
EXPORT_MODEL_NAME = os.environ.get("EXPORT_MODEL_NAME", "target_persona_qwen2_5_clone")
TRAIN_FILE = os.environ.get("TRAIN_FILE", "train.jsonl")

max_seq_length = int(os.environ.get("MAX_SEQ_LENGTH", "1024"))
dtype = None
load_in_4bit = True


def format_prompt(examples):
    instructions = examples["instruction"]
    inputs = examples["input"]
    outputs = examples["output"]
    texts = []

    prompt_template = """<|im_start|>system
You are {target_persona}. You are chatting over WhatsApp. Emulate the target persona's tone, quirks, slang, response length, punctuation, and casing based only on the provided training data.
<|im_start|>user
{instruction}
{input}<|im_end|>
<|im_start|>assistant
{output}<|im_end|>"""

    for inst, inp, out in zip(instructions, inputs, outputs):
        texts.append(
            prompt_template.format(
                target_persona=TARGET_PERSONA,
                instruction=inst,
                input=inp,
                output=out,
            )
        )
    return {"text": texts}


def main():
    print(f"Loading {BASE_MODEL}...")

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=BASE_MODEL,
        max_seq_length=max_seq_length,
        dtype=dtype,
        load_in_4bit=load_in_4bit,
    )

    model = FastLanguageModel.get_peft_model(
        model,
        r=16,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_alpha=32,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=3407,
        use_rslora=False,
        loftq_config=None,
    )

    dataset = load_dataset("json", data_files=TRAIN_FILE, split="train")
    dataset = dataset.map(format_prompt, batched=True)

    args = TrainingArguments(
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        max_steps=int(os.environ.get("MAX_STEPS", "150")),
        learning_rate=float(os.environ.get("LEARNING_RATE", "2e-4")),
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=50,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="linear",
        seed=3407,
        output_dir="outputs",
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=max_seq_length,
        dataset_num_proc=2,
        packing=True,
        args=args,
    )

    print("Starting training...")
    trainer.train()
    print("Training finished!")

    print(f"Exporting to GGUF (q4_k_m) as {EXPORT_MODEL_NAME}...")
    model.save_pretrained_gguf(EXPORT_MODEL_NAME, tokenizer, quantization_method="q4_k_m")


if __name__ == "__main__":
    main()
