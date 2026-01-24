// cli.js

// 1. Enable Babel
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  ignore: [/node_modules/]
});

const fs = require('fs');

const cgd = require('./src/io/cgd.js');
const tilings = require('./src/dsymbols/tilings.js');
const delaney = require('./src/dsymbols/delaney.js');
const delaney3d = require('./src/dsymbols/delaney3d.js');
const { identifySpacegroup } = require('./src/spacegroups/spacegroupFinder.js');
const { embed } = require('./src/pgraphs/embedding.js');
const {
  coordinateChangesQ: opsQ,
  coordinateChangesF: opsF
} = require('./src/geometry/types.js');
const { makeTileDisplayList } = require('./src/ui/makeScene.js');
const { handlers } = require('./src/ui/handlers.js');
const { convertTile } = require('./src/ui/makeScene.js');

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

    const type = structure.type;
    const ds = structure.symbol;
    const dim = delaney.dim(ds);

    const cov = handlers.dsCover(ds);
    const skel = handlers.skeleton(cov);
    const { orbitReps, centers, tiles: rawTiles } = handlers.tilesByTranslations({ ds, cov, skel });
    const sgInfo = handlers.identifyGroupForTiling({ ds, cov, skel });
    const tiles = rawTiles.map(tile => convertTile(tile, centers));
    const embeddings = handlers.embedding(skel.graph);
    // const result = makeTileDisplayList({ tiles, dim, sgInfo: { toStd } }, options);

    console.log("\n--- Output ---");
    console.log("SKELETON:", JSON.stringify(skel, null, 2));
    console.log("TILES BY TRANSLATIONS:", JSON.stringify({ orbitReps, centers, rawTiles }, null, 2));
    console.log("SPACEGROUP IDENTIFICATION:", JSON.stringify(sgInfo, null, 2));
    console.log("TILES:", JSON.stringify(tiles, null, 2));
    console.log("EMBEDDING:", JSON.stringify(embeddings, null, 2));
    console.log("\n=== End of Structure ===\n");

    i++;
  }

} catch (error) {
  console.error("Pipeline Error:", error);
  process.exit(1);
}