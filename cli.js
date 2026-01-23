// cli.js

// 1. Enable Babel to translate 'import' syntax in other files on the fly
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  ignore: [/node_modules/]
});

// 2. Standard CommonJS imports
const fs = require('fs');

try {
  // 3. Import the library
  // Babel handles the 'import' statements inside the source files
  const cgd = require('./src/io/cgd.js');

  // 4. Read input from stdin
  const input = fs.readFileSync(0, 'utf-8');

  // 5. Parse and Process
  for (const block of cgd.blocks(input)) {
    // Action: Convert the parsed CGD block into a Delaney Symbol (ds)
    // This performs the mathematical data conversion required by the engine.
    const ds = cgd.processed(block);
    
    // Output the processed mathematical representation (Delaney Symbol)
    console.log(JSON.stringify(ds, null, 2));
  }

} catch (error) {
  // This will now catch errors from both the parsing and the processing stages
  console.error("Error during execution:", error);
  process.exit(1);
}