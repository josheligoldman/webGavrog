// cli.js
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: '14' } }]],
  ignore: [/node_modules/],
});

const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');
const Piscina = require('piscina');
const pMap = require('p-map');
const cgd = require('../io/cgd.js');

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [input_file] [options]')
  .option('input', {
    alias: 'i',
    type: 'string',
    description: 'The .cgd file to process',
    demandOption: true
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Path to output JSONL file',
    default: 'output.jsonl'
  })
  .option('errors', {
    alias: 'e',
    type: 'string',
    description: 'Path to error JSONL file',
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

const piscina = new Piscina({
  filename: path.resolve(__dirname, 'worker.js'),
  maxThreads: argv.threads
});

async function run() {
  try {
    if (!fs.existsSync(argv.input)) {
      console.error(`Error: File not found at ${argv.input}`);
      process.exit(1);
    }
    const input = fs.readFileSync(argv.input, 'utf-8');

    const allBlocks = [...cgd.blocks(input)];
    const total = allBlocks.length;

    fs.mkdirSync(path.dirname(argv.output), { recursive: true });
    fs.mkdirSync(path.dirname(argv.errors), { recursive: true });
    const outputStream = fs.createWriteStream(argv.output);
    const errorStream = fs.createWriteStream(argv.errors);
    
    const progressBar = new cliProgress.SingleBar({
      format: 'Processing | {bar} | {percentage}% | {value}/{total} | ETA: {eta}s | Failures: {failures}',
    }, cliProgress.Presets.shades_classic);

    let failures = 0;
    progressBar.start(total, 0, { failures: 0 });

    const runTaskWithTimeout = async (block, index) => {
      const globalId = index;
      let timer = null;

      try {
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('TIMEOUT'));
          }, argv.timeout);
        });

        const workerPromise = piscina.runTask({ block, options: OPTIONS, id: globalId });

        const res = await Promise.race([workerPromise, timeoutPromise]);
        
        outputStream.write(JSON.stringify(res) + '\n');

        return res;

      } catch (err) {
        failures++;
        const errorLog = { id: globalId, error: err.message, success: false };
        errorStream.write(JSON.stringify(errorLog) + '\n');
        return errorLog;

      } finally {
        if (timer) clearTimeout(timer);
        progressBar.increment({ failures });
      }
    };

    await pMap(allBlocks, runTaskWithTimeout, { concurrency: argv.threads });

    progressBar.stop();

    await piscina.destroy();
    await new Promise((resolve) => outputStream.end(resolve));

    console.log(`\nFinished! Results saved to ${argv.output} and errors to ${argv.errors}`);

  } catch (error) {
    console.error("Critical Failure:", error);
    process.exit(1);
  }
}

run();