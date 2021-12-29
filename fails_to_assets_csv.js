const fs = require("fs");
const CsvTools = require("./services/CsvTools");

const failsToSnapshot = async (inputDbPath, outputPath) => {
  if (fs.existsSync(outputPath))
    throw new Error(
      `Output file "${outputPath}" already exists. Rename or remove it before continuing.`
    );
  if (!fs.existsSync(inputDbPath))
    throw new Error(`Input db file "${inputDbPath}" does not exist.`);

  let mintResults = null;
  try {
    mintResults = JSON.parse(
      fs.readFileSync(inputDbPath, { encoding: `utf8` })
    );
  } catch (error) {
    throw new Error(`Invalid JSON in ${inputDbPath}. ${error.message}`);
  }

  const csv = CsvTools.jsonToCsv(mintResults.failed);
  fs.writeFileSync(outputPath, csv, { encoding: `utf8` });
};

failsToSnapshot("db/massmint.json", "failed-assets.csv");
