# Qwen2.5 Style Adapter Dataset

This folder holds a lightweight supervision dataset (50–200 examples) for refining
`qwen2.5:1.5b-instruct` toward the AI Business Agent tone and template.

## Contents

- `examples.jsonl` – conversation-style records ready for PEFT/QLoRA fine-tuning.
- `schema.md` – reference for expected fields and formatting rules (optional additions go here).

## Usage

1. Collect additional examples following the structure in `examples.jsonl`.
2. Run your preferred PEFT pipeline pointing to this directory. Example snippet:

```bash
accelerate launch train_qwen_peft.py \
  --base_model qwen2.5:1.5b-instruct \
  --dataset training/sft_qwen/examples.jsonl \
  --output_dir adapters/qwen_business_style
```

3. Register the resulting adapter path with the LLM API via the `WRITER_ADAPTER` env var if needed.

Keep entries concise—focus on enforcing the executive summary → key facts → why it matters → next actions pattern and correct citation handling.
