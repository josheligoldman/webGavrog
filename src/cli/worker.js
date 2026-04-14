// worker.js
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  ignore: [/node_modules/]
});

const cgd = require('../io/cgd.js');
const delaney = require('../dsymbols/delaney.js');
const props = require('../dsymbols/properties.js');
const { handlers } = require('../ui/handlers.js');
const { coordinateChangesQ: opsQ } = require('../geometry/types.js');
const { parseTilingFullName } = require('./utils.js');

const asString = x => `${x}`;
const serializeVector = v => (v || []).map(asString);

const preprocessCLI = structure => {
  const ds = structure.symbol;
  const cov = structure.cover || handlers.dsCover(ds);
  const skel = handlers.skeleton(cov);
  return { ds, cov, skel };
};

const makeChamberToCellMaps = cov => {
  const size = delaney.size(cov);
  const dim = delaney.dim(cov);
  const indices = delaney.indices(cov);
  const chambers = Array.from({ length: size }, (_, k) => k + 1);

  const chamberToCellByRank = {};
  const cellRepresentativeChamberByRank = {};

  for (let i = 0; i <= dim; ++i) {
    const rank = i + 1;
    const orbitIndices = indices.filter(j => j !== i);
    const orbits = props.orbits(cov, orbitIndices, delaney.elements(cov));

    const map = new Array(size + 1).fill(0);
    const reps = [];

    for (let id = 0; id < orbits.length; ++id) {
      const orb = orbits[id];
      reps.push(orb[0]);
      for (const D of orb)
        map[D] = id + 1;
    }

    chamberToCellByRank[rank] = chambers.map(D => map[D]);
    cellRepresentativeChamberByRank[rank] = reps;
  }

  return { chamberToCellByRank, cellRepresentativeChamberByRank };
};

const zeroVec = n => opsQ.vector(n);

const chamberShift = (skel, D, i, dim) =>
  ((skel.cornerShifts[D] || [])[i]) || zeroVec(dim);

const makeAllIncidences = (cov, skel, chamberMaps) => {
  const dim = delaney.dim(cov);
  const size = delaney.size(cov);
  const byPair = {};
  const seen = {};

  const getCell = (rank, D) => chamberMaps.chamberToCellByRank[rank][D - 1];

  for (let D = 1; D <= size; ++D) {
    for (let childRank = 1; childRank <= dim; ++childRank) {
      for (let parentRank = childRank + 1; parentRank <= dim + 1; ++parentRank) {
        const childIdx = childRank - 1;
        const parentIdx = parentRank - 1;

        const child = getCell(childRank, D);
        const parent = getCell(parentRank, D);

        const childShift = chamberShift(skel, D, childIdx, dim);
        const parentShift = chamberShift(skel, D, parentIdx, dim);
        const offset = serializeVector(opsQ.minus(childShift, parentShift));

        const key = `${parentRank}|${parent}|${childRank}|${child}|${offset.join(',')}`;
        if (!seen[key]) {
          seen[key] = true;
          const pairKey = `${parentRank}-${childRank}`;
          if (!byPair[pairKey])
            byPair[pairKey] = [];

          byPair[pairKey].push({ parent, child, offset });
        }
      }
    }
  }

  return byPair;
};

const makeTopologyPayload = (structure, parsedName, data) => {
  const { tilingName, tilingType } = parsedName;
  const { ds, cov, skel } = data;

  const chamberMaps = makeChamberToCellMaps(cov);
  const allIncidences = makeAllIncidences(cov, skel, chamberMaps);

  return {
    tilingName,
    tilingType,
    dim: delaney.dim(ds),
    coverTopology: {
      cellRepresentativeChamberByRank: chamberMaps.cellRepresentativeChamberByRank,
      allIncidences
    }
  };
};

module.exports = async ({ block, options, id }) => {
  const structure = cgd.processed(block);
  if (!structure)
    throw new Error(`Structure ${id} failed to parse (returned null/undefined)`);
  if (!structure.name)
    throw new Error(`Structure ${id} is missing a name property`);

  let parsedName;
  try {
    parsedName = parseTilingFullName(structure.name, options);
  }
  catch (_err) {
    parsedName = { tilingName: structure.name, tilingType: 'UNKNOWN' };
  }

  const { tilingType } = parsedName;
  if (tilingType !== 'NT' && tilingType !== 'PPT 1')
    return null;

  const data = preprocessCLI(structure);
  return makeTopologyPayload(structure, parsedName, data);
};

