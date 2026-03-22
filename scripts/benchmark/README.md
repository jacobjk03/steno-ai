# Steno Benchmark Harness

Runs LongMemEval against Steno to measure SOTA retrieval accuracy.

## Setup
```bash
# Download dataset
cd scripts/benchmark/data
wget https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json
```

## Run
```bash
npx tsx scripts/benchmark/run-longmemeval.ts --limit 50  # test with 50 questions first
npx tsx scripts/benchmark/run-longmemeval.ts              # full 500 questions
```

## Cost Estimate
- 50 questions: ~$0.50-1.00
- 500 questions: ~$5-8.00
