// cli.js

// 1. Enable Babel
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  ignore: [/node_modules/]
});

const fs = require('fs');
const cliProgress = require('cli-progress');

const cgd = require('./src/io/cgd.js');
const delaney = require('./src/dsymbols/delaney.js');
const { handlers } = require('./src/ui/handlers.js');
const { convertTile } = require('./src/ui/makeScene.js');
const { makeTileDisplayList } = require('./src/ui/makeScene.js');

const preprocess = (structure, options) => {
  const type = structure.type;
  const ds = structure.symbol;
  const dim = delaney.dim(ds);

  const cov = handlers.dsCover(ds);
  const skel = handlers.skeleton(cov);
  const { orbitReps, centers, tiles: rawTiles } = handlers.tilesByTranslations({ ds, cov, skel });
  const sgInfo = handlers.identifyGroupForTiling({ ds, cov, skel });
  const tiles = rawTiles.map(tile => convertTile(tile, centers));
  const embeddings = handlers.embedding(skel.graph);
  return { type, dim, ds, cov, skel, sgInfo, tiles, orbitReps, embeddings };
};

const makeDisplayList = (data, options) => {
  const result = makeTileDisplayList(data, options);
  return result;
};

const options = {
  "xExtent3d": 1,
  "yExtent3d": 1,
  "zExtent3d": 1,
  "tileScale": 1
};

try {
  const input = fs.readFileSync(0, 'utf-8');

  const allBlocks = [...cgd.blocks(input)];

  const progressBar = new cliProgress.SingleBar({
    format: 'Progress |{bar}| {percentage}% | {value}/{total} Structures | ETA: {eta}s',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);
  progressBar.start(allBlocks.length, 0);

  const finalResults = [];

  allBlocks.forEach((block, i) => {
    const structure = cgd.processed(block);
    const data = preprocess(structure, options);
    const result = makeDisplayList(data, options);

    finalResults.push({ id: i, result, structure, data });
    progressBar.update(i + 1);
  });

  progressBar.stop();

  console.log(`\nSuccessfully processed ${allBlocks.length} structures.`);
} catch (error) {
  console.error("Pipeline Error:", error);
  process.exit(1);
}