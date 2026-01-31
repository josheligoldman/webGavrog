# !/bin/bash
DATA_DIR="data/zeolite_topos"
OUTPUT_DIR="data/zeolite_gavrog"
ERROR_DIR="data/zeolite_errors"
THREADS=24
TIMEOUT=30000

LOG_FILE="data/zeolites.log"
# Make the parent of the log file
mkdir -p $(dirname $LOG_FILE)

node src/cli/cli.js -i $DATA_DIR -o $OUTPUT_DIR -e $ERROR_DIR --threads $THREADS --timeout $TIMEOUT # > $LOG_FILE
