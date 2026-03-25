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
: "${ERROR_DIR:?ERROR_DIR is required in .env}"

TOPOS_DIR="$TOPOS_DIR"
OUTPUT_DIR="$OUTPUT_DIR"
ERROR_DIR="$ERROR_DIR"
THREADS=24
TIMEOUT=120000
TYPE="zeolites"

node src/cli/cli.js \
  -i "$TOPOS_DIR" \
  -o "$OUTPUT_DIR" \
  -e "$ERROR_DIR" \
  --threads "$THREADS" \
  --timeout "$TIMEOUT" \
  --type "$TYPE"
