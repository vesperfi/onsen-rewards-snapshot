#!/usr/bin/env node
'use strict'
const config = require('config')
const path = require('path')
const createErc20 = require('../packages/erc-20-lib')
const HDWalletProvider = require('@truffle/hdwallet-provider')
const Web3 = require('web3')
const baseRepoUrl = 'https://github.com/bloqpriv/onsen-rewards-snapshot'
const dataDirectory = '/data'
const createMerkleBox = require('../packages/merkle-box-lib')
// VSP Token address
const token = "0xbA4cFE5741b357FA371b506e5db0774aBFeCf8Fc"
const unlock = config.get('expiryDate')
const localForkUrl = 'http://localhost:8545'
const nodeUrl = config.get('localTest') ? localForkUrl : config.get('nodeUrl')

const provider = new HDWalletProvider({
  addressIndex: process.env.ACCOUNT || 0,
  mnemonic: config.get('mnemonic'),
  numberOfAddresses: 1,
  providerOrUrl: nodeUrl
})
const from = provider.getAddress(0)
const web3 = new Web3(provider)
const merkleBoxAddress = createMerkleBox.addresses.mainnet
const merkleBox = createMerkleBox(web3, merkleBoxAddress, { from })

const tokenAddress = token.startsWith('0x')
  ? token
  : createErc20.util.tokenAddress(token)

const toTimestamp = str =>
  /^[0-9]+$/.test(str)
    ? Number.parseInt(str)
    : Math.round(new Date(str).getTime() / 1000)

function createClaimGroup(dataSetFilePath) {
  console.log(`nodeUrl = ${nodeUrl}`)
  console.log(`tokenAddress = ${tokenAddress}`)
  const dataSetFileName = path.parse(dataSetFilePath).base
  const dataSetFileUrl = `${baseRepoUrl + dataDirectory}/${dataSetFileName}`
  const memo = `datasetUri=${dataSetFileUrl}`
  console.log(memo)
  console.log('Creating claim group.')
  const recipients = require(dataSetFilePath)
  const totalPromise = recipients
    .reduce((sum, recipient) => sum + BigInt(recipient.amount), BigInt(0))
    .toString()
  const rootPromise = createMerkleBox.util.bufferToHex(
    createMerkleBox.util.calcMerkleTree(recipients).getRoot()
  )
  return Promise.all([
    totalPromise,
    rootPromise,
    createErc20(web3, tokenAddress, { from }).approve(
      merkleBoxAddress,
      totalPromise
    )
  ])
    .then(function ([total, root]) {
      console.log(`total = ${total}`)
      console.log(`root = ${root}`)
      return merkleBox
        .newClaimsGroup(tokenAddress, total, root, toTimestamp(unlock), memo)
        .then(function (receipt) {
          console.log(`receipt = ${receipt}`)
          if (receipt) {
            console.log(receipt)
            console.log(receipt.events.NewMerkle.returnValues)
          } else {
            console.log('WARNING : Receipt is null')
          }
        })
    })
    .finally(function () {
      console.log('Stopping engine.')
      provider.engine.stop()
    })
}

module.exports = { createClaimGroup }
