// src/ui/handlers.js
import * as tilings from '../dsymbols/tilings';
import * as delaney from '../dsymbols/delaney';
import * as delaney3d from '../dsymbols/delaney3d';
import * as netSyms from '../pgraphs/symmetries';
import * as cgd from '../io/cgd';
import { embed } from '../pgraphs/embedding';
import { identifySpacegroup } from '../spacegroups/spacegroupFinder';

export const handlers = {
  identifyGroupForNet(graph) {
    const syms = netSyms.symmetries(graph).symmetries;
    const symOps = netSyms.affineSymmetries(graph, syms);
    return identifySpacegroup(symOps);
  },

  identifyGroupForTiling({ ds, cov, skel }) {
    const symOps = tilings.affineSymmetries(ds, cov, skel);
    return identifySpacegroup(symOps);
  },

  embedding(graph) {
    return embed(graph);
  },

  dsCover(ds) {
    const dim = delaney.dim(ds);
    if (dim === 3) {
      return delaney3d.pseudoToroidalCover(ds);
    }
    return tilings.makeCover(ds);
  },

  skeleton(cov) {
    return tilings.skeleton(cov);
  },

  tilesByTranslations({ ds, cov, skel }) {
    return tilings.tilesByTranslations(ds, cov, skel);
  },

  parseCGD(data) {
    const blocks = Array.from(cgd.blocks(data));
    for (const b of blocks) {
      const spec = b.entries.find(s => s.key == 'name');
      b.name = ((spec || {}).args || [])[0];
    }
    return blocks;
  },

  processCGD(block) {
    return cgd.processed(block);
  }
};