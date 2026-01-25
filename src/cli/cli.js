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
    description: 'Path to output file (if single input) or directory',
    default: 'output'
  })
  .option('errors', {
    alias: 'e',
    type: 'string',
    description: 'Path to single error JSONL file (must end in .jsonl)',
    default: 'errors.jsonl'
  })
  .option('threads', {
    alias: 't',
    type: 'number',
    description: 'Number of worker threads',
    default: 1
  })
  .option('timeout', {
    alias: 'ms',
    type: 'number',
    description: 'Timeout per structure in milliseconds',
    default: 10000
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
    const { isInputDir, isOutputDir } = setupDirectories(argv.input, argv.output, argv.errors);

    // Get Files List
    const filesToProcess = getFilesToProcess(argv.input);
    console.log(`Found ${filesToProcess.length} file(s) to process.`);

    // Initialize global counters
    let globalIdCounter = 0;
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalTimeouts = 0;

    console.log(`Starting processing with ${argv.threads} threads...`);

    // Create GLOBAL Error Stream (One file for everything)
    const errorStream = fs.createWriteStream(argv.errors);

    // Process Loop
    for (let i = 0; i < filesToProcess.length; i++) {
      const currentFile = filesToProcess[i];
      const fileNum = i + 1;
      const fileCount = filesToProcess.length;

      console.log(`---------------------------------------------`);

      // Determine specific OUTPUT path for this file
      const currentOutputPath = getOutputPathForFile(
          currentFile, 
          argv.output, 
          isInputDir, 
          isOutputDir
      );

      console.log(`Processing file ${fileNum} of ${fileCount}: ${currentFile}.`);
      console.log(`Writing output to ${currentOutputPath}.`);

      // Create stream for THIS output file
      const outputStream = fs.createWriteStream(currentOutputPath);

      const result = await processSingleFile(
        currentFile, 
        fileNum, 
        fileCount, 
        globalIdCounter, 
        outputStream, 
        errorStream // Pass the shared error stream
      );

      // Close output stream immediately
      await new Promise(r => outputStream.end(r));

      // Aggregate results
      globalIdCounter += result.processed;
      totalProcessed += result.processed;
      totalErrors += result.errors;
      totalTimeouts += result.timeouts;
    }

    // Cleanup & Close Global Error Stream
    await piscina.destroy();
    await new Promise(r => errorStream.end(r));

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
    console.log(`Output Location:  ${argv.output}`);
    console.log(`Error Log:        ${argv.errors}`);
    console.log(`=============================================`);

  } catch (error) {
    console.error("Critical Failure:", error);
    process.exit(1);
  }
}

// ---------------------------------------------------------
// HELPER: Ensure Directory Exists
// ---------------------------------------------------------
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) { // Create directory if it doesn't exist
      fs.mkdirSync(dirPath, { recursive: true });
  } else if (!fs.statSync(dirPath).isDirectory()) { // Exists but is not a directory, throw error
      console.error(`Error: Cannot create directory "${dirPath}" because a file with that name already exists.`);
      process.exit(1);
  }
  // Directory exists, nothing to do
};

// ---------------------------------------------------------
// HELPER: Setup Directories
// ---------------------------------------------------------
function setupDirectories(inputPath, outputPath, errorFilePath) {
    if (!fs.existsSync(inputPath)) {
        console.error(`Error: Path not found at ${inputPath}`);
        process.exit(1);
    }
    const inputStats = fs.statSync(inputPath);
    const isInputDir = inputStats.isDirectory();
    let isOutputDir = false;

    // --- OUTPUT LOGIC ---
    // Logic: If input is Dir, output MUST be Dir.
    if (isInputDir) {
        if (fs.existsSync(outputPath) && !fs.statSync(outputPath).isDirectory()) {
            console.error(`Error: Input is a directory, so Output must be a directory. Found existing file at: ${outputPath}`);
            process.exit(1);
        }
        isOutputDir = true;
    } else {
        // Input is File. Determine if output is intended as Directory or File.
        // If it exists and is a directory -> Directory Mode
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
            isOutputDir = true;
        } 
        // If it has NO extension -> Directory Mode (User likely meant a folder)
        else if (path.extname(outputPath) === '') {
            isOutputDir = true;
        }
        // If it HAS an extension, strictly enforce .jsonl -> File Mode
        else {
            if (!outputPath.endsWith('.jsonl')) {
                console.error(`Error: Output file must end with .jsonl. Given: ${outputPath}`);
                process.exit(1);
            }
            isOutputDir = false;
        }
    }

    // Create Output Directories
    if (isInputDir || isOutputDir) {
        ensureDir(outputPath);
    } else {
        const outDir = path.dirname(outputPath);
        if (outDir !== '.') ensureDir(outDir);
    }

    // --- ERROR LOGIC ---
    // argv.errors is strict: IT IS A FILE that must end in .jsonl. We only ensure the parent dir exists.
    if (!errorFilePath.endsWith('.jsonl')) {
        console.error(`Error: --errors argument must be a file path ending in .jsonl. Given: ${errorFilePath}`);
        process.exit(1);
    }
    const errorParentDir = path.dirname(errorFilePath);
    if (errorParentDir !== '.') ensureDir(errorParentDir);

    return { isInputDir, isOutputDir };
}

// ---------------------------------------------------------
// HELPER: Determine Output Path
// ---------------------------------------------------------
function getOutputPathForFile(currentFile, mainOutputPath, isInputDir, isOutputDir) {
    if (isInputDir || isOutputDir) {
        const inputFileName = path.basename(currentFile).trim();
        const inputFileNameNoExt = inputFileName.replace(/3dt\.cgd$/i, '');
        console.log(`file name no ext: ${inputFileNameNoExt}`);
        // If inputFileNameNoExt doesn't end with _, append _
        if (!inputFileNameNoExt.endsWith('_')) {
            inputFileNameNoExt += '_';
        }
        const outName = `${inputFileNameNoExt}output.jsonl`;
        return path.join(mainOutputPath, outName);
    } else {
        // Mode: Single file input -> Single file output
        return mainOutputPath;
    }
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