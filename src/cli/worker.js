// worker.js
const { parentPort } = require('worker_threads');

require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  ignore: [/node_modules/]
});

const cgd = require('../io/cgd.js');
const delaney = require('../dsymbols/delaney.js');
const { handlers } = require('../ui/handlers.js');
const { convertTile, makeTileDisplayList } = require('../ui/makeScene.js');

const preprocess = (structure, options) => {
  const type = structure.type;
  const ds = structure.symbol;
  const dim = delaney.dim(ds);

  const cov = structure.cover || handlers.dsCover(ds);
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

module.exports = async ({ block, options, id }) => {
  const structure = cgd.processed(block);
  const data = preprocess(structure, options);
  const result = makeDisplayList(data, options);

  return { id, result, structure, data};
  
};

