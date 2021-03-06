'use strict'

const BN = require('bn.js')
const Web3 = require('web3')
require('dotenv').config()
require('dotenv-defaults').config()
const lpStakingPoolAbi = require('./abi/masterChef.json')
const lpPairAbi = require('./abi/lpPair.json')
const onsenData = require('./onsenData')
const epochDuration = parseInt(process.env.EPOCH_DURATION)
const poolId = onsenData.poolId
const web3 = new Web3(process.env.NODE_URL)

const lpStakingPool = new web3.eth.Contract(
  lpStakingPoolAbi,
  onsenData.lpStakingPoolAddress
)

const lpPair = new web3.eth.Contract(lpPairAbi, onsenData.pair.address)

function getRewards(
  addressList,
  epochEndBlock,
  thisEpochDuration,
  rewardsPerEpoch
) {
  return lpPair.methods
    .balanceOf(onsenData.lpStakingPoolAddress)
    .call(epochEndBlock)
    .then(function (lpBalance) {
      const promises = []
      addressList.forEach(function (address) {
        const promise = lpStakingPool.methods
          .userInfo(poolId, address)
          .call(epochEndBlock)
          .then(function (userInfo) {
            const rewards = new BN(userInfo.amount)
              .mul(new BN(rewardsPerEpoch))
              .mul(new BN(thisEpochDuration))
              .div(new BN(epochDuration))
              .div(new BN(lpBalance))
            return {
              address,
              balance: userInfo.amount,
              epochEnd: epochEndBlock,
              rewards: rewards.toString()
            }
          })
        promises.push(promise)
      })
      return Promise.all(promises).then(function (rewardsDataList) {
        return rewardsDataList.filter(data => data.balance !== '0')
      })
    })
}

async function getRewardsForAllEpoch(
  addressList,
  startBlock,
  endBlock,
  rewardsPerEpoch
) {
  const promises = []
  let epochEndBlock = startBlock
  while (epochEndBlock < endBlock) {
    epochEndBlock = epochEndBlock + epochDuration
    if (epochEndBlock > endBlock) {
      promises.push(
        getRewards(
          addressList,
          endBlock,
          endBlock + epochDuration - epochEndBlock,
          rewardsPerEpoch
        )
      )
    } else {
      promises.push(
        getRewards(addressList, epochEndBlock, epochDuration, rewardsPerEpoch)
      )
    }
  }
  return Promise.all(promises)
}

module.exports = { getRewardsForAllEpoch }
