// cli.js
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: '14' } }]],
  ignore: [/node_modules/],
});

// ---------------------------------------------------------
// IMPORTS
// ---------------------------------------------------------
const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');
const Piscina = require('piscina');
const pMap = require('p-map');
const cgd = require('../io/cgd.js'); 

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// ---------------------------------------------------------
// TIMEOUT ERROR DEFINITION
// ---------------------------------------------------------
class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ---------------------------------------------------------
// CLI ARGUMENTS CONFIGURATION
// ---------------------------------------------------------
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [input_file_or_dir] [options]')
  .option('input', {
    alias: 'i',
    type: 'string',
    description: 'The .cgd file or directory to process',
    demandOption: true
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Path to Output Directory',
    default: 'output_dir'
  })
  .option('threads', {
    type: 'number',
    description: 'Number of worker threads',
    default: 1
  })
  .option('timeout', {
    type: 'number',
    description: 'Timeout per structure in milliseconds',
    default: 15000
  })
  .option('type', {
    type: 'string',
    description: 'Type of tilings being processed. Options are `rcsr` or `zeolites`.',
    default: 'rcsr'
  })
  .option('log', {
    alias: 'l',
    type: 'string',
    description: 'Directory for log/checkpoint files',
    demandOption: true,
  })
  .help()
  .argv;

const OPTIONS = { "xExtent3d": 1, "yExtent3d": 1, "zExtent3d": 1, "tileScale": 1, "type": argv.type };

// ---------------------------------------------------------
// WORKER POOL SETUP
// ---------------------------------------------------------
const piscina = new Piscina({
  filename: path.resolve(__dirname, 'worker.js'),
  maxThreads: argv.threads
});

// ---------------------------------------------------------
// MAIN LOGIC
// ---------------------------------------------------------
async function run() {
  const jobStartTime = Date.now();

  try {
    const errorsDir = path.join(argv.log, 'errors');

    // Analyze & Setup Directories
    // This enforces that output/log/errors are dirs and all paths are unique
    setupDirectories(argv.input, argv.output, argv.log, errorsDir);

    // Initialize global counters
    let globalIdCounter = 0;
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalTimeouts = 0;
    let totalSkipped = 0;

    // Initial Report
    console.log(`\n=============================================`);
    console.log("Input Path:      ", argv.input);
    console.log("Output Directory:", argv.output);
    console.log("Error Directory: ", errorsDir);
    console.log("Log Directory:   ", argv.log);
    console.log("Threads:         ", argv.threads);
    console.log("Timeout (ms):    ", argv.timeout);
    console.log(`=============================================\n`);

    // Get Files List
    const filesToProcess = getFilesToProcess(argv.input);

    // Load checkpoint (resume support)
    const CHECKPOINT_FILE = path.join(argv.log, 'checkpoint.json');
    let completedFiles = new Set();
    if (fs.existsSync(CHECKPOINT_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
        completedFiles = new Set(data.completed || []);
        console.log(`Resuming: ${completedFiles.size} file(s) already done, skipping.`);
      } catch {
        console.warn(`Warning: Could not read checkpoint file — starting fresh.`);
      }
    }

    const remainingFiles = filesToProcess.filter(f => !completedFiles.has(f));
    const alreadyDoneCount = completedFiles.size;
    console.log(`Found ${filesToProcess.length} file(s) total, ${remainingFiles.length} to process.`);

    // Process Loop
    for (let i = 0; i < remainingFiles.length; i++) {
      const currentFile = remainingFiles[i];
      const fileNum = alreadyDoneCount + i + 1;
      const fileCount = filesToProcess.length;

      console.log(`---------------------------------------------`);

      // Determine Filenames
      // We need a clean filename (fname) to use for both output and error files
      const inputBaseName = path.basename(currentFile).trim();
      // Removes .3dt.cgd or .cgd or .3dt etc, adjusts regex as needed for your specific naming convention
      const fname = inputBaseName.replace(/[._-]?3dt\.cgd$/i, ''); 
      
      const currentOutputPath = path.join(argv.output, `${fname}.jsonl`);
      const currentErrorPath = path.join(errorsDir, `${fname}.jsonl`);

      console.log(`Processing file ${fileNum} of ${fileCount}: ${inputBaseName}`);
      console.log(`   > Output: ${currentOutputPath}`);
      console.log(`   > Error:  ${currentErrorPath}`);

      // Create Streams (One pair per input file)
      const outputStream = fs.createWriteStream(currentOutputPath);
      const errorStream = fs.createWriteStream(currentErrorPath);

      const result = await processSingleFile(
        currentFile, 
        fileNum, 
        fileCount, 
        globalIdCounter, 
        outputStream, 
        errorStream 
      );

      // Close streams immediately after file is done
      await new Promise(r => outputStream.end(r));
      await new Promise(r => errorStream.end(r));

      // Write checkpoint
      completedFiles.add(currentFile);
      fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ completed: [...completedFiles] }, null, 2));

      // Aggregate results
      globalIdCounter += result.processed;
      totalProcessed += result.processed;
      totalErrors += result.errors;
      totalTimeouts += result.timeouts;
      totalSkipped += result.skipped;
    }

    // Cleanup Worker Pool
    await piscina.destroy();

    const jobEndTime = Date.now();
    const durationSeconds = (jobEndTime - jobStartTime) / 1000;
    const totalSuccess = totalProcessed - totalErrors - totalTimeouts - totalSkipped;

    // Clean up checkpoint — job completed successfully
    if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);

    // Final Report
    console.log(`\n=============================================`);
    console.log(`Job Complete.`);
    console.log(`Total Time:       ${durationSeconds.toFixed(2)}s`);
    console.log(`Total Structures: ${totalProcessed} (Input)`);
    console.log(`Total Success:    ${totalSuccess}`);
    console.log(`Total Skipped:    ${totalSkipped}`);
    console.log(`Total Errors:     ${totalErrors}`);
    console.log(`Total Timeouts:   ${totalTimeouts}`);
    console.log(`Output Dir:       ${argv.output}`);
    console.log(`Error Dir:        ${errorsDir}`);
    console.log(`=============================================`);

  } catch (error) {
    console.error("Critical Failure:", error);
    process.exit(1);
  }
}

// ---------------------------------------------------------
// HELPER: Ensure Directory Exists (Recursive)
// ---------------------------------------------------------
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
  } else if (!fs.statSync(dirPath).isDirectory()) {
      console.error(`Error: Path "${dirPath}" exists but is not a directory.`);
      process.exit(1);
  }
};

// ---------------------------------------------------------
// HELPER: Setup and Validate Directories
// ---------------------------------------------------------
function setupDirectories(inputPath, outputDir, logDir, errorDir) {
    if (!fs.existsSync(inputPath)) {
        console.error(`Error: Input path not found at ${inputPath}`);
        process.exit(1);
    }

    // Resolve Input Directory Context
    // If input is a file, we check against its parent dir. If it's a dir, we check against itself.
    const inputStats = fs.statSync(inputPath);
    let inputContextDir;
    if (inputStats.isDirectory()) {
        inputContextDir = path.resolve(inputPath);
    } else {
        inputContextDir = path.resolve(path.dirname(inputPath));
    }

    // Resolve Output, Log, and Error Dirs
    const absOutputDir = path.resolve(outputDir);
    const absLogDir = path.resolve(logDir);
    const absErrorDir = path.resolve(errorDir);

    // Strict Uniqueness Check
    const pathsToCheck = [
        { label: 'Input Context',    path: inputContextDir },
        { label: 'Output Directory', path: absOutputDir },
        { label: 'Log Directory',    path: absLogDir },
        { label: 'Error Directory',  path: absErrorDir }
    ];

    // Compare every pair to ensure they are unique
    for (let i = 0; i < pathsToCheck.length; i++) {
        for (let j = i + 1; j < pathsToCheck.length; j++) {
            const a = pathsToCheck[i];
            const b = pathsToCheck[j];

            if (a.path === b.path) {
                console.error(`Error: ${a.label} and ${b.label} must be different.`);
                console.error(`   ${a.label}: ${a.path}`);
                console.error(`   ${b.label}: ${b.path}`);
                process.exit(1);
            }
        }
    }

    // Ensure Directories Exist
    ensureDir(absOutputDir);
    ensureDir(absLogDir);
    ensureDir(absErrorDir);
}

// ---------------------------------------------------------
// HELPER: Input Discovery
// ---------------------------------------------------------
function getFilesToProcess(inputPath) {
  const stats = fs.statSync(inputPath);

  if (stats.isDirectory()) {
    const allFiles = fs.readdirSync(inputPath);
    const validFiles = allFiles
      .filter(file => file.endsWith('3dt.cgd'))
      .map(file => path.join(inputPath, file));

    if (validFiles.length === 0) {
      console.error(`Error: No files ending in "3dt.cgd" found in directory: ${inputPath}`);
      process.exit(1);
    }
    return validFiles;
  } else {
    // Strict extension check for single file input
    if (!inputPath.endsWith('3dt.cgd')) {
      console.error(`Error: Input file must end with "3dt.cgd". Given: ${inputPath}`);
      process.exit(1);
    }
    return [inputPath];
  }
}

// ---------------------------------------------------------
// HELPER: Process Single File
// ---------------------------------------------------------
async function processSingleFile(filePath, fileIndex, totalFiles, startId, outputStream, errorStream) {
  const fileName = path.basename(filePath);
  
  // Read file into RAM
  const input = fs.readFileSync(filePath, 'utf-8');
  const blocks = [...cgd.blocks(input)];
  const total = blocks.length;

  console.log(`File has ${total} structure(s) to process.`);

  if (total === 0) return { processed: 0, errors: 0, timeouts: 0, skipped: 0 };

  const progressBar = new cliProgress.SingleBar({
    format: '  Progress | {bar} | {percentage}% | {value}/{total} | ETA: {eta}s | S: {success} | SK: {skipped} | E: {errors} | T: {timeouts}',
  }, cliProgress.Presets.shades_classic);

  let localErrors = 0;
  let localTimeouts = 0;
  let localSuccess = 0;
  let localSkipped = 0;

  progressBar.start(total, 0, { success: 0, skipped: 0, errors: 0, timeouts: 0 });

  const runTask = async (block, index) => {
    const currentGlobalId = startId + index;
    let timer = null;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError());
        }, argv.timeout);
      });

      const workerPromise = piscina.runTask({ block, options: OPTIONS, id: currentGlobalId });
      const res = await Promise.race([workerPromise, timeoutPromise]);

      if (res === null) {
        localSkipped++;
      } else {
        if (!outputStream.write(JSON.stringify(res) + '\n')) {
          await new Promise(r => outputStream.once('drain', r));
        }
        localSuccess++;
      }

    } catch (err) {
      const isTimeout = err instanceof TimeoutError;

      if (isTimeout) {
        localTimeouts++;
      } else {
        localErrors++;
      }

      const errorLog = {
        id: currentGlobalId,
        file: fileName,
        localIndex: index,
        type: isTimeout ? 'TIMEOUT' : 'ERROR',
        error: err.message,
        success: false
      };

      if (!errorStream.write(JSON.stringify(errorLog) + '\n')) {
        await new Promise(r => errorStream.once('drain', r));
      }

    } finally {
      if (timer) clearTimeout(timer);

      progressBar.increment(1, {
        success: localSuccess,
        skipped: localSkipped,
        errors: localErrors,
        timeouts: localTimeouts,
      });
    }
  };

  await pMap(blocks, runTask, { concurrency: argv.threads });

  progressBar.stop();

  return { processed: total, errors: localErrors, timeouts: localTimeouts, skipped: localSkipped };
}

run();