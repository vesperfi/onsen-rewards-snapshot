/* eslint-disable max-len */

'use strict'
const fs = require('fs')
const core = require('@actions/core')
const titlePrefix = 'Automated weekly onsen rewards start block:'
const title = process.env.PULL_REQUEST_TITLE || process.argv.splice(2)[0]
console.log(`title: '${title}'`)
if (title && title.startsWith(titlePrefix)) {
  // Get Start and End block number from PR title.
  const numberPattern = /\d+/g
  const numbers = title.match(numberPattern)
  process.env.REWARDS_START_BLOCK = numbers[0]
  process.env.REWARDS_END_BLOCK = numbers[1]

  // generate reward file in temp directory for validation.
  const tempDirectory = 'temp'
  process.env.DIRECTORY = tempDirectory
  const { start } = require('./onsenRewards')
  let msg = ''
  try {
    if (!fs.existsSync(tempDirectory)) {
      fs.mkdirSync(tempDirectory)
      console.log(`Created ${tempDirectory} directory.`)
    }
    return start()
      .then(function () {
        const filename = `dataset-${process.env.REWARDS_START_BLOCK}-${process.env.REWARDS_END_BLOCK}.json`
        console.log(`Generated file: ${tempDirectory}/${filename}`)
        const originalDataFileContent = fs.readFileSync(`data/${filename}`)
        const tempDataFileContent = fs.readFileSync(
          `${tempDirectory}/${filename}`
        )
        if (originalDataFileContent.equals(tempDataFileContent)) {
          msg = `Reward file: ${filename} is valid.`
        } else {
          msg = `Can't verify reward file: ${filename}`
          core.setFailed(msg)
        }
        console.log(msg)
      })
      .catch(function (_error) {
        core.setFailed(`Something went wrong. Please check logs: ${_error}`)
      })
  } catch (error) {
    console.log(error)
    core.setFailed(`Something went wrong. Please check logs: ${error}`)
  }
}
