export const parseTilingFullName = (full_name, options) => {
  // Split and validate 4 non-empty sections
  const sections = full_name.split(';').map(s => s.trim());
  if (sections.filter(s => s.length > 0).length < 4) {
    throw new Error("Invalid format: Must have at least 4 non-empty sections.");
  }

  const fullTilingName = sections[0];
  let tilingName;

  if (options.type == "rcsr") {
    const match = fullTilingName.match(/^([a-z-]+)\/Systre$/);
    if (!match) {
      throw new Error(`Invalid RCSR Name: "${fullTilingName}". Does not match file convention.`);
    }
    tilingName = match[1];

  } else if (options.type == "zeolites") {
    const match = fullTilingName.match(/Structure prediction by ZEFSAII \(Michael W. Deem and Ramdas Pophale\) SiO2PCOD(\d+)Probable space group:/);
    if (!match) {
        throw new Error(`ID Section does not match prefix. Full name: ${fullTilingName}`);
    }
    tilingName = match[1];
  } else {
    throw new Error(`Unknown type: ${options.type}`);
  }

  // Strict Tiling Type Regex
  const tilingType = sections[1];
  if (!/^(NT|PPT\s\d+)$/.test(tilingType)) {
    throw new Error(`Invalid Tiling Type: Expected "NT" or "PPT {k}", found "${tilingType}".`);
  }

  return { tilingName, tilingType };
}