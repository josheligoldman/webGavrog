// cli.js

// 1. Enable Babel
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  ignore: [/node_modules/]
});

const fs = require('fs');

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

  let i = 0;
  for (const block of cgd.blocks(input)) {
    console.log(`\n=== Processing Structure: ${i} ===`);

    const structure = cgd.processed(block);
    data = preprocess(structure, options);
    result = makeDisplayList(data, options);

    console.log("RESULT:", JSON.stringify(result, null, 2));
    console.log("STRUCTURE:", JSON.stringify(structure, null, 2));
    console.log("DATA:", JSON.stringify(data, null, 2));
    console.log("RESULT:", JSON.stringify(result, null, 2));
    console.log("\n=== End of Structure ===\n");

    i++;
  }

} catch (error) {
  console.error("Pipeline Error:", error);
  process.exit(1);
}