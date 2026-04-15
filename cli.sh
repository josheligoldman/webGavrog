#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE file not found!"
  exit 1
fi

source "$ENV_FILE"

: "${TOPOS_DIR:?TOPOS_DIR is required in .env}"
: "${OUTPUT_DIR:?OUTPUT_DIR is required in .env}"
: "${LOG_DIR:?LOG_DIR is required in .env}"

TOPOS_DIR="$TOPOS_DIR"
OUTPUT_DIR="$OUTPUT_DIR"
LOG_DIR="$LOG_DIR"
THREADS=4
TIMEOUT=120000
TYPE="iza"

node src/cli/cli.js \
  -i "$TOPOS_DIR" \
  -o "$OUTPUT_DIR" \
  -l "$LOG_DIR" \
  --threads "$THREADS" \
  --timeout "$TIMEOUT" \
  --type "$TYPE"
