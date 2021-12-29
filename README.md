# massmint_tool

- WAX Testnet:
  "chain_id": "f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12"
  "network": "https://testnet.wax.pink.gg"

- Wax Mainnet:
  "chain_id": "1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4"
  "network": "https://wax.greymass.com"

# Steps:

- npm i (only once time)
- clear db
- modify config.json
- provide assets.csv
- node ./massmint.js

# Failed case:

- node ./fails_to_assets_csv.js
- clear db
- rename failed-assets.csv to assets.csv
