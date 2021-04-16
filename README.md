# Onsen rewards snapshot

Generate snapshot for distributing Vesper rewards to staker of VSP-ETH LP token in Sushi Onsen.

## Setup
1. Install 
```
npm i
```

2. Set required properties. There are 3 ways to do it, choose what seems best to you.
- Using env var
```bash
export NODE_URL="eth_mainnet_url"
export REWARDS_START_BLOCK="eth_block_number"
export REWARDS_END_BLOCK="eth_block_number"
```
- Using `config/local.json`
```json
{
    "nodeUrl": "eth_mainnet_url",
    "rewardsStartBlock": "eth_block_number",
    "rewardsEndBlock": "eth_block_number"
}
```
- Using command line args (which take precedence over the other two methods)
```bash
node index.js -s <start_block_num> -e <end_block_num> -u <node_url> -m <mnemonic> -d <date in yyyy-mm-dd>
```

Local Testing example - use `-l` option for local test run.
```
npm i
npm run fork
node index.js -s 12194440 -e 12240161 -u "wss://af68cec7d3a5dbbe4d5b65e4663225:7711bcd7a76297e861732906cf2bc0@random-impulse-student.bloqcloudcluster.com:8546" -m "opera tired scrap latin mosquito wall file diesel mad aware one merry" -d "2021-12-31" -l
```

3. Verify that default properties are valid for you case, if not use env var or `local.json` to override them.
- Default properties
```json
{
  "epochDuration": 1440,
  "rewardsPerEpoch": "625000000000000000000"
}
```

4. Run app to generate snopshot
```node
node index.js
```
> It will generate `rewards.json` file in root of the project. This file contains all the addresses and their rewards for given strat and end block.