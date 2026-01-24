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
      
      const workerPromise = piscina.runTask({ block, options: OPTIONS, id: globalId });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
      );

      try {
        const res = await Promise.race([workerPromise, timeoutPromise]);
        
        // outputStream.write(JSON.stringify(res) + '\n');
        return res;

      } catch (err) {
        failures++;
        const errorLog = { id: globalId, error: err.message, success: false };
        outputStream.write(JSON.stringify(errorLog) + '\n');
        return errorLog;

      } finally {
        progressBar.increment({ failures });
      }
    };

    await pMap(allBlocks, runTaskWithTimeout, { concurrency: NUM_THREADS });

    progressBar.stop();

    await piscina.destroy();
    await new Promise((resolve) => outputStream.end(resolve));

    console.log(`\nFinished! Results saved to output.jsonl`);
    process.exit(0);

  } catch (error) {
    console.error("Critical Failure:", error);
    process.exit(1);
  }
}

run();