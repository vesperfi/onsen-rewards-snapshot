'use strict'
const fs = require('fs')
const createMerkleBox = require('../packages/merkle-box-lib')

async function createDataSet(rewardsFile, dataSetFileName) {
  const recipients = require(rewardsFile)
  const dataset = createMerkleBox.util.calcDataset(recipients)
  console.log(`Writing file ${dataSetFileName}`)
  fs.writeFileSync(dataSetFileName, JSON.stringify(dataset, null, 2))
}

module.exports = { createDataSet }
