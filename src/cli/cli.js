// cli_parallel.js
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

const NUM_THREADS = 24;
const TIMEOUT_MS = 1000 * 20; // <--- 5 Second Timeout per structure

const OPTIONS = { "xExtent3d": 1, "yExtent3d": 1, "zExtent3d": 1, "tileScale": 1 };

const piscina = new Piscina({
  filename: path.resolve(__dirname, 'worker.js'),
  maxThreads: NUM_THREADS
});

async function run() {
  try {
    const input = fs.readFileSync(0, 'utf-8');
    const allBlocks = [...cgd.blocks(input)];
    const total = allBlocks.length;
    
    const progressBar = new cliProgress.SingleBar({
      format: 'Processing | {bar} | {percentage}% | {value}/{total} | {eta}s | Failures: {failures}',
    }, cliProgress.Presets.shades_classic);

    let failures = 0;
    progressBar.start(total, 0, { failures: 0 });

    const outputStream = fs.createWriteStream('output.jsonl');

    const runTaskWithTimeout = async (block, index) => {
      const globalId = index;
      let timer = null;

      try {
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('TIMEOUT'));
          }, TIMEOUT_MS);
        });

        const workerPromise = piscina.runTask({ block, options: OPTIONS, id: globalId });

        const res = await Promise.race([workerPromise, timeoutPromise]);
        
        return res;

      } catch (err) {
        failures++;
        const errorLog = { id: globalId, error: err.message, success: false };
        outputStream.write(JSON.stringify(errorLog) + '\n');
        return errorLog;

      } finally {
        if (timer) clearTimeout(timer);
        progressBar.increment({ failures });
      }
    };

    await pMap(allBlocks, runTaskWithTimeout, { concurrency: NUM_THREADS });

    progressBar.stop();

    await piscina.destroy();
    await new Promise((resolve) => outputStream.end(resolve));

    console.log(`\nFinished! Results saved to output.jsonl`);

  } catch (error) {
    console.error("Critical Failure:", error);
    process.exit(1);
  }
}

run();