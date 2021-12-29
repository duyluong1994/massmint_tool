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
const total = () => db.get("total").value();

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
exports.massMint = async (config) => {
  const eos = await getAPI(config.network, config.privateKey);

  const auth = {
    authorization: [`${config.miner}@${config.permission}`],
  };

  const lastMinted = minted();
  const needToMint = total() - lastMinted;

  if (lastMinted > 0)
    logger.warn(`Massmint's already processed ${lastMinted} assets.`);

  started = Date.now();

  await recurseBatch(needToMint, eos, auth, config);
};

const recurseBatch = async (needToMint, eos, auth, config) => {
  if (needToMint == 0) return true;

  logger.info(`Total assets to process: ${needToMint}`);
  const mintingBatches = [];
  for (let i = 0; i < needToMint; i++) {
    mintingBatches.push(1);
  }

  await pMap(
    mintingBatches,
    (batch, index) => {
      printEta(index, mintingBatches.length - index);
      return dropBatch(eos, auth, config);
    },
    { concurrency: 1 }
  );

  // await Promise.all(mintingBatches);
};

const dropBatch = async (eos, auth, config, tries = 0) => {
  if (tries > 3) {
    return false;
  }

  const {
    smartcontract,
    miner,
    newassetowner,
    permission,
    collection_name,
    schema_name,
    template_id,
    immutable_data,
    mutable_data,
    batchSize,
  } = config;

  let transactionId;
  let actions = [];

  actions.push({
    account: smartcontract,
    name: "mintasset",
    authorization: [
      {
        actor: miner,
        permission,
      },
    ],
    data: {
      authorized_minter: miner,
      collection_name,
      schema_name,
      template_id,
      new_asset_owner: newassetowner,
      immutable_data,
      mutable_data,
      tokens_to_back: [],
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
