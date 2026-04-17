#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
echo "Installing Unsloth and dependencies..."
python3 -m pip install unsloth[colab-bitandbytes] texttable --break-system-packages
python3 -m pip install "git+https://github.com/huggingface/transformers.git" --break-system-packages
python3 -m pip install trl peft accelerate datasets huggingface_hub --break-system-packages

echo "Starting training run..."
python3 train_unsloth.py
