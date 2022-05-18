'use strict'
require('dotenv').config()
require('dotenv-defaults').config()
const BN = require('bn.js')
const args = require('minimist')(process.argv.slice(2))
const rewardsStartBlock = parseInt(args.s || process.env.REWARDS_START_BLOCK)
const rewardsEndBlock = parseInt(args.e || process.env.REWARDS_END_BLOCK)
const totalRewards = process.env.TOTAL_REWARDS
const nodeUrl = process.env.NODE_URL
const epochDuration = parseInt(process.env.EPOCH_DURATION)
const fs = require('fs')
const { parseAsync } = require('json2csv')
const Web3 = require('web3')

const lpStakingPoolAbi = require('./src/abi/masterChef.json')
const { getRewardsForAllEpoch } = require('./src/calculateRewards')
const { createDataSet } = require('./src/create-dataset')
const onsenData = require('./src/onsenData')
const dataDirectory = process.env.DIRECTORY || 'data'
// eslint-disable-next-line max-len
const rewardFile = `./${dataDirectory}/rewards-${rewardsStartBlock}-${rewardsEndBlock}.json`
// eslint-disable-next-line max-len
const dataSetFile = `./${dataDirectory}/dataset-${rewardsStartBlock}-${rewardsEndBlock}.json`

console.log('Rewards Start Block:', rewardsStartBlock)
console.log('Rewards End Block:', rewardsEndBlock)

function rewardsPerEpoch() {
  const DECIMAL = new BN('1000000000000000000')
  const totalBlocks = rewardsEndBlock - rewardsStartBlock
  const _epochDuration = new BN(epochDuration)
  const _totalRewards = new BN(totalRewards)
  const _totalEpoch = new BN(totalBlocks).mul(DECIMAL).div(_epochDuration)
  return _totalRewards.mul(DECIMAL).div(_totalEpoch).toString()
}

function onlyUnique(value, index, self) {
  return self.indexOf(value) === index
}

// eslint-disable-next-line no-unused-vars
function writeEpochRewards(allEpochRewards) {
  const fields = ['address', 'balance', 'epochEnd', 'rewards']
  allEpochRewards.forEach(function (epochRewards) {
    const epochFileName = `./output/${epochRewards[0].epochEnd}.csv`
    console.log('Writing epoch rewards data to', epochFileName)
    return parseAsync(epochRewards, { fields }).then(csvData =>
      fs.writeFileSync(epochFileName, csvData)
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
  console.log('Calculated total rewards:', calculateRewards.toString())

  console.log('Writing consolidated rewards data to', rewardFile)

  fs.writeFileSync(rewardFile, JSON.stringify(accountsList, null, 2))
}

async function getOnsenStakers() {
  const web3 = new Web3(nodeUrl)
  const lpStakingPool = new web3.eth.Contract(
    lpStakingPoolAbi,
    onsenData.lpStakingPoolAddress
  )
  const promises = []
  let startBlock = rewardsStartBlock
  // Read deposit event during reward period
  while (startBlock < rewardsEndBlock) {
    let endBlock = startBlock + epochDuration
    if (endBlock > rewardsEndBlock) {
      endBlock = rewardsEndBlock
    }
    const promise = lpStakingPool.getPastEvents('Deposit', {
      filter: { pid: onsenData.poolId },
      fromBlock: startBlock,
      toBlock: endBlock,
      address: lpStakingPool.address
    })
    promises.push(promise)
    startBlock = endBlock
  }

  return Promise.all(promises)
    .then(function (depositEvents) {
      // depositEvents is array of arrays
      const filteredEvents = depositEvents
        .filter(eventArray => eventArray.length > 0)
        .flat()
      console.log('New deposit events', filteredEvents.length)
      return filteredEvents.map(event => event.returnValues.user)
    })
    .then(function (newStakers) {
      // Get last rewards file name
      const fileName = fs
        .readdirSync(dataDirectory)
        .filter(value => value.includes(`${rewardsStartBlock}.json`))[0]
      // Read last rewards data file
      const fileContent = JSON.parse(fs.readFileSync(`data/${fileName}`))
      const lastRewardsRecipient = fileContent.map(data => data.account)
      // Merge last reward recipients and new stakers
      const totalStakers = lastRewardsRecipient.concat(newStakers)
      const uniqueList = totalStakers.filter(onlyUnique)
      console.log('Unique address count', uniqueList.length)
      return uniqueList
    })
}

async function getOnsenRewards() {
  return getOnsenStakers().then(function (addresses) {
    const _rewardsPerEpoch = rewardsPerEpoch()
    console.log('rewardsPerEpoch', _rewardsPerEpoch)
    return getRewardsForAllEpoch(
      addresses,
      rewardsStartBlock,
      rewardsEndBlock,
      _rewardsPerEpoch
    )
  })
}

async function start() {
  return getOnsenRewards()
    .then(writeConsolidateRewards)
    .then(function () {
      return createDataSet(rewardFile, dataSetFile).then(function () {
        console.log('data file created')
        fs.unlinkSync(rewardFile)
      })
    })
    .catch(function (error) {
      console.error('Error while calculating rewards', error)
      throw new Error(error)
    })
}

module.exports = {
  start
}
