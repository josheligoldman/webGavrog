#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE file not found!"
  exit 1
fi

source "$ENV_FILE"

: "${DATA_DIR:?DATA_DIR is required in .env}"
: "${LOG_DIR:?LOG_DIR is required in .env}"

TOPOS_DIR="$DATA_DIR/topos"
OUTPUT_DIR="$DATA_DIR/gavrogs"
ERROR_DIR="$LOG_DIR/errors"
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
