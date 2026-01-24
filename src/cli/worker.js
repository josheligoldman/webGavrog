// worker.js
const { parentPort } = require('worker_threads');

require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  ignore: [/node_modules/]
});

const cgd = require('../io/cgd.js');
const delaney = require('../dsymbols/delaney.js');
const { handlers } = require('../ui/handlers.js');
const { convertTile, makeTileDisplayList, makeTilingModelGeo, mapTiles, makeTileInstances } = require('../ui/makeScene.js');
const { geometry, splitMeshes } = require('../ui/geometries.js');

const preprocessCLI = (structure, options) => {
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

const makeDisplayListCLI = (data, options) => {
  const result = makeTileDisplayList(data, options);
  return result;
};

const makeModelCLI = (data, options) => {
  const { ds, cov, skel, tiles, orbitReps, embeddings, displayList } = data;
  const { dim, embedding, basis } = makeTilingModelGeo(data, options);

  const { meshes: baseMeshes, scale } = handlers.makeTileMeshes(
    { cov, skel, pos: embedding.positions, seeds: orbitReps, basis, subDLevel: 0 }
  );

  const meshes = baseMeshes.map(m => geometry(m.pos, m.faces));
  const faceLabelLists = baseMeshes.map(m => m.faces.map((_, i) => i));

  const { partLists } = splitMeshes(meshes, faceLabelLists);

  const tileScale = options.tileScale || 1.0;
  const mappedTiles = mapTiles(tiles, basis, tileScale);

  const instances = makeTileInstances(
    displayList, mappedTiles, partLists, basis
  );

  return instances;
};

module.exports = async ({ block, options, id }) => {
  const structure = cgd.processed(block);
  const data = preprocessCLI(structure, options);
  data.displayList = makeDisplayListCLI(data, options);
  const instances = makeModelCLI(data, options);

  return { id, instances };
  
};

