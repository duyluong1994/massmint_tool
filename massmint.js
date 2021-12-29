const fs = require("fs");
const winston = require("winston");
const Prompter = require("./services/Prompter");
const ChainTools = require("./services/ChainTools");
const CsvTools = require("./services/CsvTools");

let config = {};
let logger = null;
let db = null;

const setup = () => {
  // Setting configs
  config = require("./config.json");

  // Creating the logs directory
  if (!fs.existsSync("logs")) fs.mkdirSync("logs");
  if (!fs.existsSync("db")) fs.mkdirSync("db");

  const low = require("lowdb");
  const FileSync = require("lowdb/adapters/FileSync");
  const adapter = new FileSync("db/massmint.json");
  const _db = low(adapter);

  _db.defaults({ total: 0, minted: 0, lastIndex: 0 }).write();

  const logFormat = winston.format.printf(
    (info) => `${new Date().toLocaleString()} - ${info.message}`
  );

  const _logger = winston.createLogger({
    format: logFormat,
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({
        filename: `logs/${+new Date()}_massmint.log`,
        level: "silly",
      }),
    ],
  });

  logger = _logger;
  db = _db;
  ChainTools.setLogger(_logger);
  ChainTools.setDB(_db);
};

const run = async () => {
  logger.warn(`Started Mass mint at ${new Date().toLocaleString()}`);

  const asserter = (condition, msg) => {
    if (!condition) {
      throw new Error(msg);
      process.exit();
    }
  };

  asserter(
    config.network !== "",
    "Network must be a fully qualified URL ( example: http://domain.com:8888 )"
  );
  asserter(
    config.smartcontract !== "",
    "Smart contract account must not be empty"
  );
  asserter(config.miner !== "", "Miner account must not be empty");
  asserter(
    config.newassetowner !== "",
    "New asset owner account must not be empty"
  );

  asserter(config.privateKey !== "", "Miner's private key must not be empty");
  asserter(config.collection_name !== "", "Collection name must not be empty");
  asserter(config.schema_name !== "", "Schema name must not be empty");
  asserter(config.template_id > 0, "Template ID name must be greater than 0");
  asserter(config.amount > 0, "Amount can not be less than 0");

  if (
    (await Prompter.prompt(
      `\r\nYou are performing an MASSMINT. Is this correct? Have you reset the DB? \r\nPress enter to continue`
    )) !== ""
  )
    process.exit();

  logger.warn(
    "\r\n------------------------------------------------------------------\r\n"
  );

  let assets = await CsvTools.getCSV("assets.csv");
  const assetsJSON = CsvTools.csvToJson(assets);
  console.log(assetsJSON);

  db.set("total", config.amount).write();
  const minted = db.get("minted").value();
  const total = db.get("total").value();
  logger.warn(
    `Starting to minting from  minted: ${minted}. Need to mint: ${
      total - minted
    } `
  );
  logger.warn(
    "\r\n------------------------------------------------------------------\r\n"
  );

  // Shutting off IO
  Prompter.donePrompting();

  await ChainTools.massMint(config);

  logger.warn(`Finished MASSMINT at ${new Date().toLocaleString()}`);
  process.exit();
};

setup();
run();
