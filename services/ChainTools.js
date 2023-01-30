const { JsonRpc, Api, Serialize } = require("eosjs");
const { TextEncoder, TextDecoder } = require("util");
const { JsSignatureProvider } = require("eosjs/dist/eosjs-jssig");
const fetch = require("node-fetch");

const pMap = require("p-map");

let httpEndpoint = null;
let chainId = null;
let logger = null;
let db = null;
let started = null;

const printEta = (processed, left) => {
  logger.info(`Processed ${processed} items, ${left} items left. `);
};

exports.setLogger = (_logger) => (logger = _logger);
exports.setDB = (_db) => (db = _db);

const processed = () => db.get("processed").value();
const failed = () => db.get("failed").value();

const getAPI = async (network, privateKey) => {
  logger.warn(`network: ${network}`);
  const rpc = new JsonRpc(network, { fetch });

  const signatureProvider = new JsSignatureProvider([privateKey]);
  return new Api({
    rpc,
    signatureProvider,
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder(),
  });
};

/***
 * Starts process.
 * Batches out requests to 10 transactions per batch.
 * Then waits 510 milliseconds between batches to hit the next block.
 */
exports.mass = async (items, config) => {
  const eos = await getAPI(config.network, config.privateKey);

  const auth = {
    authorization: [`${config.miner}@${config.permission}`],
  };

  let itemsFrom = items.slice(processed());

  started = Date.now();

  await recurseBatch(itemsFrom, eos, auth, config);
};

const recurseBatch = async (items, eos, auth, config) => {
  if (items.length == 0) return true;

  logger.info(`Total items to process: ${items.length}`);

  await pMap(
    items,
    (batch, index) => {
      printEta(index, items.length - index);
      return dropBatch(batch, eos, auth, config);
    },
    { concurrency: 1 }
  );
};

const dropBatch = async (batch, eos, auth, config, tries = 0) => {
  if (tries > 3) {
    db.update("failed", (tuples) => (tuples = tuples.concat(batch))).write();
    return false;
  }

  const { smartcontract, permission, sc_action } = config;
  const {
    authorized_creator,
    collection_name,
    schema_name,
    transferable,
    burnable,
    max_supply,
    immutable_data,
  } = batch;

  let transactionId;
  let actions = [];

  actions.push({
    account: smartcontract,
    name: sc_action,
    authorization: [
      {
        actor: authorized_creator,
        permission,
      },
    ],
    data: {
      authorized_creator,
      collection_name,
      schema_name,
      transferable,
      burnable,
      max_supply,
      immutable_data,
    },
  });

  try {
    const res = await eos.transact(
      {
        actions,
      },
      {
        blocksBehind: 0,
        expireSeconds: 100,
      }
    );

    transactionId = res.transaction_id;
  } catch (err) {
    logger.error("ERROR block\r\n-------------------------------------");
    logger.error(`ERROR: Failed batch! - ${err.message}`);

    return await dropBatch(eos, auth, config, tries + 1);
  }

  db.set("processed", processed() + 1).write();
  logger.warn(`${transactionId}`);
  return true;
};
