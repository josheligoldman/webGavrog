export const parseTilingFullName = (full_name, options) => {
  // Split and validate 4 non-empty sections
  const sections = full_name.split(';').map(s => s.trim());
  if (sections.filter(s => s.length > 0).length < 4) {
    throw new Error("Invalid format: Must have at least 4 non-empty sections.");
  }

  // Strict ID Section Regex
  // We use the exact phrase you provided, escaping the literal parentheses
  const idRegex = /Structure prediction by ZEFSAII \(Michael W. Deem and Ramdas Pophale\) SiO2PCOD(\d+)Probable space group:/;

  let tilingName;
  if (options.type == "rcsr") {
    tilingName = sections[0];
    const strictRcsrRegex = /^[a-z]{3}(-[a-z])?(-[a-z])?$/;
    if (!strictRcsrRegex.test(tilingName)) {
      throw new Error(`Invalid RCSR Name: "${tilingName}". Does not match file convention.`);
    }
  } else if (options.type == "zeolites") {
    const idRegex = /Structure prediction by ZEFSAII \(Michael W. Deem and Ramdas Pophale\) SiO2PCOD(\d+)Probable space group:/;
    const idMatch = sections[0].match(idRegex);
    if (!idMatch) {
        throw new Error("ID Section does not match the required ZEFSAII prefix or PCOD format.");
    }
    tilingName = idMatch[1]; // Extracts the digits from (\d+)
  } else {
    throw new Error(`Unknown type: ${options.type}. Expected "rcsr" or "zeolites".`);
  }

  // Strict Tiling Type Regex
  const tilingType = sections[1];
  if (!/^(NT|PPT\s\d+)$/.test(tilingType)) {
    throw new Error(`Invalid Tiling Type: Expected "NT" or "PPT {k}", found "${tilingType}".`);
  }

  return { tilingName, tilingType };
}