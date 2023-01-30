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
  const adapter = new FileSync("db/mass.json");
  const _db = low(adapter);

  _db.defaults({ total: 0, processed: 0, failed: [] }).write();

  const logFormat = winston.format.printf(
    (info) => `${new Date().toLocaleString()} - ${info.message}`
  );

  const _logger = winston.createLogger({
    format: logFormat,
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({
        filename: `logs/${+new Date()}_mass.log`,
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

  asserter(config.privateKey !== "", "Miner's private key must not be empty");

  if (
    (await Prompter.prompt(
      `\r\nYou are performing an MASS. Is this correct? Have you reset the DB? \r\nPress enter to continue`
    )) !== ""
  )
    process.exit();

  logger.warn(
    "\r\n------------------------------------------------------------------\r\n"
  );

  let items = await CsvTools.getCSV("items.csv");
  const itemsJSON = CsvTools.csvToJson(items);

  db.set("total", itemsJSON.length).write();
  const processed = db.get("processed").value();
  const total = db.get("total").value();

  logger.warn(
    `Starting to minting. Already processed: ${processed}. Need to mint: ${
      total - processed
    } `
  );
  logger.warn(
    "\r\n------------------------------------------------------------------\r\n"
  );

  // Shutting off IO
  Prompter.donePrompting();

  await ChainTools.mass(itemsJSON, config);

  logger.warn(`Finished MASS at ${new Date().toLocaleString()}`);
  process.exit();
};

setup();
run();
