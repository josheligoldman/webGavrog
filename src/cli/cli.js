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
  .option('errors', {
    alias: 'e',
    type: 'string',
    description: 'Path to Error Directory',
    default: 'error_dir'
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
  .help()
  .argv;

const OPTIONS = { "xExtent3d": 1, "yExtent3d": 1, "zExtent3d": 1, "tileScale": 1 };

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
    // Analyze & Setup Directories
    // This enforces that output/errors are dirs and all paths are unique
    setupDirectories(argv.input, argv.output, argv.errors);

    // Initialize global counters
    let globalIdCounter = 0;
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalTimeouts = 0;

    // Initial Report
    console.log(`\n=============================================`);
    console.log("Input Path:      ", argv.input);
    console.log("Output Directory:", argv.output);
    console.log("Error Directory: ", argv.errors);
    console.log("Threads:         ", argv.threads);
    console.log("Timeout (ms):    ", argv.timeout);
    console.log(`=============================================\n`);

    // Get Files List
    const filesToProcess = getFilesToProcess(argv.input);
    console.log(`Found ${filesToProcess.length} file(s) to process.`);

    // Process Loop
    for (let i = 0; i < filesToProcess.length; i++) {
      const currentFile = filesToProcess[i];
      const fileNum = i + 1;
      const fileCount = filesToProcess.length;

      console.log(`---------------------------------------------`);

      // Determine Filenames
      // We need a clean filename (fname) to use for both output and error files
      const inputBaseName = path.basename(currentFile).trim();
      // Removes .3dt.cgd or .cgd or .3dt etc, adjusts regex as needed for your specific naming convention
      const fname = inputBaseName.replace(/[._-]?3dt\.cgd$/i, ''); 
      
      const currentOutputPath = path.join(argv.output, `${fname}.jsonl`);
      const currentErrorPath = path.join(argv.errors, `${fname}.jsonl`);

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

      // Aggregate results
      globalIdCounter += result.processed;
      totalProcessed += result.processed;
      totalErrors += result.errors;
      totalTimeouts += result.timeouts;
    }

    // Cleanup Worker Pool
    await piscina.destroy();

    const jobEndTime = Date.now();
    const durationSeconds = (jobEndTime - jobStartTime) / 1000;
    const totalSuccess = totalProcessed - totalErrors - totalTimeouts;

    // Final Report
    console.log(`\n=============================================`);
    console.log(`Job Complete.`);
    console.log(`Total Time:       ${durationSeconds.toFixed(2)}s`);
    console.log(`Total Structures: ${totalProcessed} (Input)`);
    console.log(`Total Success:    ${totalSuccess}`);
    console.log(`Total Errors:     ${totalErrors}`);
    console.log(`Total Timeouts:   ${totalTimeouts}`);
    console.log(`Output Dir:       ${argv.output}`);
    console.log(`Error Dir:        ${argv.errors}`);
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
function setupDirectories(inputPath, outputDir, errorDir) {
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

    // Resolve Output and Error Dirs
    const absOutputDir = path.resolve(outputDir);
    const absErrorDir = path.resolve(errorDir);

    // Strict Uniqueness Check
    const pathsToCheck = [
        { label: 'Input Context',    path: inputContextDir },
        { label: 'Output Directory', path: absOutputDir },
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

  if (total === 0) return { processed: 0, errors: 0, timeouts: 0 };

  const progressBar = new cliProgress.SingleBar({
    format: '  Progress | {bar} | {percentage}% | {value}/{total} | ETA: {eta}s | S: {success} | E: {errors} | T: {timeouts}',
  }, cliProgress.Presets.shades_classic);

  let localErrors = 0;
  let localTimeouts = 0;
  let localSuccess = 0;
  
  progressBar.start(total, 0, { success: 0, errors: 0, timeouts: 0 });

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
      
      outputStream.write(JSON.stringify(res) + '\n');
      
      localSuccess++;
      return res;

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
      
      errorStream.write(JSON.stringify(errorLog) + '\n');
      return errorLog;

    } finally {
      if (timer) clearTimeout(timer);
      
      progressBar.increment(1, { 
        success: localSuccess,
        errors: localErrors, 
        timeouts: localTimeouts, 
      });
    }
  };

  await pMap(blocks, runTask, { concurrency: argv.threads });

  progressBar.stop();

  return { processed: total, errors: localErrors, timeouts: localTimeouts };
}

run();