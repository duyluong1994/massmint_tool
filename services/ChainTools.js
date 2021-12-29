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
  logger.info(`Processed ${processed} assets, ${left} assets left. `);
};

exports.setLogger = (_logger) => (logger = _logger);
exports.setDB = (_db) => (db = _db);

const minted = () => db.get("minted").value();
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
 * Starts minting assets.
 * Batches out requests to 10 transactions per batch.
 * Then waits 510 milliseconds between batches to hit the next block.
 */
exports.massMint = async (assets, config) => {
  const eos = await getAPI(config.network, config.privateKey);

  const auth = {
    authorization: [`${config.miner}@${config.permission}`],
  };

  let assetsFrom = assets.slice(minted());

  started = Date.now();

  await recurseBatch(assetsFrom, eos, auth, config);
};

const recurseBatch = async (assets, eos, auth, config) => {
  if (assets.length == 0) return true;

  logger.info(`Total assets to process: ${assets.length}`);

  await pMap(
    assets,
    (batch, index) => {
      printEta(index, assets.length - index);
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

  const { smartcontract, permission } = config;
  const {
    authorized_minter,
    new_asset_owner,
    collection_name,
    schema_name,
    template_id,
    immutable_data,
    mutable_data,
    tokens_to_back,
  } = batch;

  let transactionId;
  let actions = [];

  actions.push({
    account: smartcontract,
    name: "mintasset",
    authorization: [
      {
        actor: authorized_minter,
        permission,
      },
    ],
    data: {
      authorized_minter,
      collection_name,
      schema_name,
      template_id,
      new_asset_owner,
      immutable_data,
      mutable_data,
      tokens_to_back,
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

  db.set("minted", minted() + 1).write();
  logger.warn(`${transactionId}`);
  return true;
};
