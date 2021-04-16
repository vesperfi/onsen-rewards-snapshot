'use strict'

const BN = require('bn.js')
const config = require('config')
const args = require('minimist')(process.argv.slice(2))
const nodeUrl = args.u || config.get('nodeUrl')
const rewardsStartBlock = args.s || parseInt(config.get('rewardsStartBlock'))
const rewardsEndBlock = args.e || parseInt(config.get('rewardsEndBlock'))
const mnemonic = args.m || process.env.MNEMONIC

// Make +30 days as default expiry date
const date = new Date()
date.setDate(date.getDate() + 30)
const defaultExpiryDate = date.toISOString().split('T')[0] // "YYYY-MM-DD"
const expiryDate = args.d || defaultExpiryDate
const localTest = args.l || false
config.nodeUrl = nodeUrl
config.rewardsStartBlock = rewardsStartBlock
config.rewardsEndBlock = rewardsEndBlock
config.mnemonic = mnemonic
config.expiryDate = expiryDate
config.localTest = localTest

const fs = require('fs')
const { parseAsync } = require('json2csv')
const Web3 = require('web3')
const path = require('path')
const appRoot = require('app-root-path')

const lpStakingPoolAbi = require('./src/abi/masterChef.json')
const { getRewardsForAllEpoch } = require('./src/calculateRewards')
const { createDataSet } = require('./src/create-dataset')
const { createClaimGroup } = require('./src/create-claim-group')
const onsenData = require('./src/onsenData')
const dataDirectory = 'data'
const rewardFileName = `rewards-${rewardsStartBlock}-${rewardsEndBlock}.json`
const rewardFilePath = path.join(appRoot.path, dataDirectory, rewardFileName)

const dataSetFileName = `dataset-${rewardsStartBlock}-${rewardsEndBlock}.json`
const dataSetFilePath = path.join(appRoot.path, dataDirectory, dataSetFileName)
console.log(`Running as testing? : ${localTest}`)
console.log('Rewards Start Block:', rewardsStartBlock)
console.log('Rewards End Block:', rewardsEndBlock)

function totalRewards() {
  const DECIMAL = new BN('1000000000000000000')
  const totalBlocks = rewardsEndBlock - rewardsStartBlock
  const epochDuration = new BN(config.get('epochDuration'))
  const totalEpoch = new BN(totalBlocks).mul(DECIMAL).div(epochDuration)
  const rewardsPerEpoch = new BN(config.get('rewardsPerEpoch'))
  return rewardsPerEpoch.mul(totalEpoch).div(DECIMAL).toString()
}

function onlyUnique(value, index, self) {
  return self.indexOf(value) === index
}

// eslint-disable-next-line no-unused-vars
function writeEpochRewards(allEpochRewards) {
  const fields = ['address', 'balance', 'epochEnd', 'rewards']
  allEpochRewards.forEach(function (epochRewards) {
    const EpochfileName = `./output/${epochRewards[0].epochEnd}.csv`
    console.log('Writing epoch rewards data to', EpochfileName)
    return parseAsync(epochRewards, { fields }).then(csvData =>
      fs.writeFileSync(EpochfileName, csvData)
    )
  })
  return allEpochRewards
}

function consolidateRewards(allEpochRewards) {
  const accounts = {}
  allEpochRewards.forEach(function (epochRewards) {
    epochRewards.forEach(function (userInfo) {
      const userRewards = accounts[userInfo.address]
        ? new BN(accounts[userInfo.address].rewards)
            .add(new BN(userInfo.rewards))
            .toString()
        : userInfo.rewards

      accounts[userInfo.address] = {
        address: userInfo.address,
        rewards: userRewards
      }
    })
  })
  return accounts
}

function writeConsolidateRewards(allEpochRewards) {
  const accounts = consolidateRewards(allEpochRewards)
  const accountsList = []
  let calculateRewards = new BN('0')
  Object.values(accounts).forEach(function (account) {
    calculateRewards = calculateRewards.add(new BN(account.rewards))
    accountsList.push({ account: account.address, amount: account.rewards })
  })

  console.log('Unique address with rewards', accountsList.length)
  console.log('Total rewards to distibute:', totalRewards())
  console.log('Calculated total rewards:', calculateRewards.toString())

  console.log('Writing consolidated rewards data to', rewardFilePath)

  fs.writeFileSync(rewardFilePath, JSON.stringify(accountsList, null, 2))
  // Just to terminate the process once done
  setTimeout(() => process.exit(0), 3000)
}

async function getOnsenRewards() {
  const web3 = new Web3(nodeUrl)
  const lpStakingPool = new web3.eth.Contract(
    lpStakingPoolAbi,
    onsenData.lpStakingPoolAddress
  )

  return lpStakingPool
    .getPastEvents('Deposit', {
      filter: { pid: onsenData.poolId },
      fromBlock: onsenData.pair.deployBlock,
      toBlock: rewardsEndBlock,
      address: lpStakingPool.address
    })
    .then(function (depositEvents) {
      console.log('Total deposit events', depositEvents.length)
      const addressList = depositEvents.map(event => event.returnValues.user)
      const uniqueList = addressList.filter(onlyUnique)
      console.log('Unique address count', uniqueList.length)
      return uniqueList
    })
    .then(function (addresses) {
      return getRewardsForAllEpoch(
        addresses,
        rewardsStartBlock,
        rewardsEndBlock
      )
    })
}

function start() {
  getOnsenRewards()
    // if you want data for each epoch, uncomment below line
    // .then(writeEpochRewards)
    .then(writeConsolidateRewards)
    .then(function () {
      return createDataSet(rewardFilePath, dataSetFilePath).then(function () {
        console.log('data file created')
        return createClaimGroup(dataSetFilePath).then(function () {
          console.log('Claim group created.')
        })
      })
    })
    .catch(e => console.error('Error while calculating rewards', e))
}

// Start rewards generation process here.
start()
