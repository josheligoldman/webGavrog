
# !/bin/bash
BASE_DIR="data/rcsr"

DATA_DIR="$BASE_DIR/topos"
OUTPUT_DIR="$BASE_DIR/gavrog"
ERROR_DIR="$BASE_DIR/errors"
THREADS=24
TIMEOUT=120000
TYPE="rcsr"

node src/cli/cli.js -i $DATA_DIR -o $OUTPUT_DIR -e $ERROR_DIR --threads $THREADS --timeout $TIMEOUT --type $TYPE
