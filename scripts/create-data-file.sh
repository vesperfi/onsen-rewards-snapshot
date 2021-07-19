#!/bin/bash
# Pre-requisite - Check and set below values once.
# 1. `NODE_URL` and `MNEMONIC` are set in .env file and github secrets on repo for validation. Use https instead of wss.
#     Set optional `REPO`, `REVIEWER`, `ASSIGNEE` in .env file
# 2. github cli `gh` is installed https://cli.github.com/. `jq` is required as well.
# 3. Need github personal access token to create PR (do not work with ssh keys). Set `TOKEN_FILE` with file with some external path contains PAT.
#    DO NOT commit `token.txt` file, if committed, github will automatically revoke the PAT.
# 4. Set `END_BLOCK_DIFF` parameter with desired value. This will be used to calculate endBlock value (Current block No - END_BLOCK_DIFF)
#     Alternatively set END_BLOCK value in .env
# 5. Set `REPO` Name - Handy if we want to raise PR in fork for testing.


# PARAMETERS
#TOEKN FILE - Keep it at external path and DO NOT COMMIT it in repo.
TOKEN_FILE=~/scripts/token.txt
# 1 hour old block (Current block No - END_BLOCK_DIFF)
# Considering 1 hour generate ~250 blocks on average. Using 3 hrs old blocks
END_BLOCK_DIFF=750

#Set NODE_URL (mandatory), MNEMONIC, REPO, REVIEWER, ASSIGNEE in .env file.
. .env

# `REPO` value can be set to fork for testing.
if [[ -z $REPO ]]; then
    REPO="vesperfi/onsen-rewards-snapshot"
fi
echo "Repo: $REPO"

# TODO REVIWER is not working at present, looks issue with `gh` cli
if [[ -z $REVIEWER ]]; then
    REVIEWER="rokso,kevinbeauregard,virendrapatidar"  
fi

if [[ -z $ASSIGNEE ]]; then
    ASSIGNEE="patidarmanoj10"
fi

# clean up
rm -rf ./scripts/output.log

# Checkout main branch and pull latest code.
git checkout main
git pull

# install node dependencies
npm i

# Read the last file from data folder and get Start Block number as End Block number from lastFileName.
lastFileName=$(ls -r data | head -1)
echo "Last data file: $lastFileName"
noprefix=${lastFileName/*-/}
startBlock=${noprefix/.json*/}
echo "Start Block: $startBlock"

if [[ -z $END_BLOCK ]]; then
    # Get the current block number (as end block number) from block chain.
    endBlockHex=$(curl -s -X POST --data '{"id":1,"jsonrpc":"2.0", "method":"eth_getBlockByNumber","params":["latest", true]}' -H "Content-Type: application/json" -H "Content-Type: application/json" -X POST "$NODE_URL" | jq -r '.result'.'number')
    eval endBlockNow=$(($endBlockHex))
    # echo "End Block Now: $endBlockNow"

    # Get end block number as node might not have synched so can't use current block number.
    eval endBlock=$(($endBlockNow - $END_BLOCK_DIFF))
else
    endBlock=$END_BLOCK
fi
echo "End Block: $endBlock"

# Run script to generate data file for onsen rewards
echo "Automated weekly onsen rewards" >> ./scripts/output.log
node index.js -s $startBlock -e $endBlock >> ./scripts/output.log
logs=$(<./scripts/output.log)

newFileName=$(ls -r data | head -1)
echo "New data file: $newFileName"
if [ $newFileName != $lastFileName ]; then
    echo "New rewards file generated: $newFileName"
    # Create branch Name using start and end block number, checkout branch, commit data file and push newly created branch.
    branchName="dataset-${startBlock}-${endBlock}"
    git branch "$branchName"
    git checkout "$branchName"
    commitMessage="Added dataset start block: ${startBlock}, end block: ${endBlock}"
    # Add and commit only new data file generated
    git add "data/$newFileName"
    git commit -m  "$commitMessage" "data/$newFileName"
    git push --set-upstream origin "$branchName"

    # Create a new PR using github cli and add reviewers.
    title="Automated weekly onsen rewards start block: ${startBlock}, end block: ${endBlock}"
    body="Summary: ${logs}"

    echo "PR Title: $title"
    echo "PR Reviewer: $REVIEWER"
    echo "Repo: $REPO"
    echo "Branch: $branchName"
    echo -e "PR Body: $body"


    gh auth login --with-token < $TOKEN_FILE
    gh pr create --assignee "$ASSIGNEE" --reviewer "$REVIEWER" --title "$title" --body "$body" --repo "$REPO" --base "main" --head "$branchName"

    # Checkout main branch and delete local branch.
    git checkout package-lock.json
    git checkout main
    git branch -D "$branchName"
    echo "Create data file completed"

else
    echo "Failed to generate new rewards data file. Please check logs and rerun script."
fi
