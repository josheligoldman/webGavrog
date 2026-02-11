# !/bin/bash
DATA_DIR="data/zeolites/zeolite_topos"
OUTPUT_DIR="data/zeolites/zeolite_gavrog"
ERROR_DIR="data/zeolites/zeolite_errors"
THREADS=24
TIMEOUT=120000
TYPE="zeolites"

node src/cli/cli.js -i $DATA_DIR -o $OUTPUT_DIR -e $ERROR_DIR --threads $THREADS --timeout $TIMEOUT --type $TYPE
