const firebaseConfig = {
  apiKey: "AIzaSyCtvxvFSXOT0fkRpl84U6LTD8xg8rGWrV8",
  authDomain: "web3-iac-wallet.firebaseapp.com",
  databaseURL: "https://web3-iac-wallet-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "web3-iac-wallet",
  storageBucket: "web3-iac-wallet.firebasestorage.app",
  messagingSenderId: "462702808978",
  appId: "1:462702808978:web:843402ceb14d9eb026bb4b",
  measurementId: "G-H8W6VMJJPH"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

const networkSelect = document.getElementById('networkSelect');
const miningOptionsSelect = document.getElementById('miningOptionsSelect');
const startMiningButton = document.getElementById('startMiningButton');
const autoMineBtn = document.getElementById("autoMineButton");
const miningStatusText = document.getElementById('miningStatus');
const miningBalanceElement = document.getElementById('miningBalance');
const miningTickerElement = document.getElementById('miningTicker');
const miningTimeElement = document.getElementById('miningTime');
const miningProgressBar = document.getElementById('miningProgressBar');
const authStatusMessage = document.getElementById('authStatusMessage');
const blockHeightDisplay = document.getElementById('blockHeightDisplay');
const nextBlockIdDisplay = document.getElementById('nextBlockIdDisplay');
const globalMinedSupplyElement = document.getElementById('globalMinedSupply');
const networkTotalTickerElement = document.getElementById('networkTotalTicker');
const miningWorker = new Worker('mining-worker.js');

const miningOptions = {
    eth: {
        easy:   { rewardMin: 0.000100, rewardMax: 0.000250, time: 60000 },
        medium: { rewardMin: 0.002500, rewardMax: 0.004000, time: 1800000 },
        hard:   { rewardMin: 0.020000, rewardMax: 0.035000, time: 3600000 }
    },
    optimism_eth: {
        easy:   { rewardMin: 0.00000300, rewardMax: 0.00000700, time: 60000 },
        medium: { rewardMin: 0.00006000, rewardMax: 0.00010000, time: 1800000 },
        hard:   { rewardMin: 0.00050000, rewardMax: 0.00080000, time: 3600000 }
    },
       sol: {
           easy:   { rewardMin: 0.00010, rewardMax: 0.00050, time: 60000 },
           medium: { rewardMin: 0.00200, rewardMax: 0.00800, time: 1800000 },
           hard:   { rewardMin: 0.01500, rewardMax: 0.04000, time: 3600000 }
     }
};

const tickerMap = { 
    eth: 'ETH', 
    optimism_eth: 'OPTIMISM_ETH', 
    sol: 'SOL' 
};

let isMining = false;
let autoMining = false;
let autoMiningInterval;
let userId = null;
let currentMiningParams = null;
let currentBlockHeight = 0;
let nextBlockId = '';
let currentGlobalSupplyListenerPath = null;

function generateNewBlockId() {
    return `${generateRandomHash(64)}`;
}

function updateBlockInfoDisplay() {
    blockHeightDisplay.textContent = `#${currentBlockHeight}`;
    nextBlockIdDisplay.textContent = nextBlockId;
}

async function initializeBlockInfo() {
    const blockHeightRef = database.ref('blocks/block/currentBlockHeight');
    const nextBlockIdRef = database.ref('blocks/block/nextBlockId');
    const miningRequiredRef = database.ref('config/MINING_REQUIRED_FOR_NEW_BLOCK');

    blockHeightRef.on('value', async (snapshot) => {
        if (snapshot.exists()) {
            const newHeight = parseInt(snapshot.val());
            if (newHeight !== currentBlockHeight) {
                currentBlockHeight = newHeight;
            }
        } else {
            currentBlockHeight = 1;
            await blockHeightRef.set(currentBlockHeight);
            if (!nextBlockId) {
                nextBlockId = generateNewBlockId();
                await nextBlockIdRef.set(nextBlockId);
            }
        }
        updateBlockInfoDisplay();
    }, (error) => {
        console.error("Error reading currentBlockHeight from Firebase:", error);
        currentBlockHeight = 1;
        if (!nextBlockId) nextBlockId = generateNewBlockId();
        updateBlockInfoDisplay();
    });

    nextBlockIdRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            const newNextBlockId = snapshot.val();
            if (newNextBlockId !== nextBlockId) {
                nextBlockId = newNextBlockId;
                updateBlockInfoDisplay();
            }
        } else {
             if (!nextBlockId) {
                 nextBlockId = generateNewBlockId();
                 nextBlockIdRef.set(nextBlockId).then(() => updateBlockInfoDisplay());
             }
        }
    }, (error) => {
        console.error("Error reading nextBlockId from Firebase:", error);
        if (!nextBlockId) {
            nextBlockId = generateNewBlockId();
            updateBlockInfoDisplay();
        }
    });
    
    miningRequiredRef.on('value', async (snapshot) => {
        if (snapshot.exists()) {
            const newValue = parseInt(snapshot.val());
            if (!isNaN(newValue) && newValue > 0 && newValue !== MINING_REQUIRED_FOR_NEW_BLOCK) {
                MINING_REQUIRED_FOR_NEW_BLOCK = newValue;
                console.log("MINING_REQUIRED_FOR_NEW_BLOCK updated from Firebase:", MINING_REQUIRED_FOR_NEW_BLOCK);
                if (!isMining && miningCountForBlock > 0 && currentMiningParams) {
                    const lastReward = currentMiningParams.lastActualReward || 0;
                    miningStatusText.textContent = `Mined a reward of +${lastReward.toFixed(8)} ${currentMiningParams.ticker}. ${MINING_REQUIRED_FOR_NEW_BLOCK - miningCountForBlock} more mines for new block.`;
                }
            }
        } else {
            await miningRequiredRef.set(MINING_REQUIRED_FOR_NEW_BLOCK);
        }
    }, (error) => {
        console.error("Error reading MINING_REQUIRED_FOR_NEW_BLOCK from Firebase:", error);
    });
}


function resetMiningState(clearStatus = true) {
    isMining = false;
    miningTimeElement.textContent = '0';
    miningProgressBar.style.width = '0%';
    if (clearStatus) {
      miningStatusText.textContent = userId ? 'Not started' : 'Please log in to start mining.';
    }
    enableControls();
}

function enableControls() {
    startMiningButton.disabled = !userId || isMining;
    networkSelect.disabled = isMining;
    miningOptionsSelect.disabled = isMining;
    autoMineBtn.disabled = !userId;
}

function disableControls() {
    startMiningButton.disabled = true;
    networkSelect.disabled = true;
    miningOptionsSelect.disabled = true;
}

function updateUIForAuth(user) {
    if (user) {
        userId = user.uid;
        authStatusMessage.textContent = '';
        miningBalanceElement.textContent = '0';
        miningTickerElement.textContent = tickerMap[networkSelect.value] || 'ETH';
        enableControls();
        if(miningStatusText.textContent.includes("log in")) {
            miningStatusText.textContent = "Not started";
        }
        listenToGlobalMinedSupply(networkSelect.value); 
    } else {
        userId = null;
        if (isMining) {
            miningWorker.postMessage({ command: 'stop' });
             isMining = false;
             currentMiningParams = null;
        }
        resetMiningState();
        authStatusMessage.textContent = 'Please log in to use the mining features.';
        miningBalanceElement.textContent = '0';
        miningTickerElement.textContent = tickerMap[networkSelect.value] || 'ETH';
        autoMining = false;
        autoMineBtn.textContent = "⚙️ Auto Mining: OFF";
        autoMineBtn.classList.remove('auto-mining-on');
        if (autoMiningInterval) clearInterval(autoMiningInterval);

        disableControls();
        startMiningButton.disabled = true;
        autoMineBtn.disabled = true;
        if (currentGlobalSupplyListenerPath) {
            database.ref(currentGlobalSupplyListenerPath).off();
            currentGlobalSupplyListenerPath = null;
        }
        globalMinedSupplyElement.textContent = '0';
        networkTotalTickerElement.textContent = tickerMap[networkSelect.value] || 'ETH';
    }
}

function listenToGlobalMinedSupply(network) {
    if (currentGlobalSupplyListenerPath) {
        database.ref(currentGlobalSupplyListenerPath).off();
    }

    const newPath = `minedSupply/${network}/totalMined`;
    currentGlobalSupplyListenerPath = newPath;
    networkTotalTickerElement.textContent = tickerMap[network] || network.toUpperCase();

    database.ref(newPath).on('value', (snapshot) => {
        let totalMined = 0;
        if (snapshot.exists()) {
            totalMined = parseFloat(snapshot.val());
        }
        globalMinedSupplyElement.textContent = totalMined.toFixed(8);
    }, (error) => {
        console.error(`Error fetching global mined supply for ${network}:`, error);
        globalMinedSupplyElement.textContent = 'Error';
    });
}

function updateGlobalMinedSupplyInFirebase(network, amountMined) {
    const supplyRef = database.ref(`minedSupply/${network}/totalMined`);
    supplyRef.transaction((currentTotal) => {
        if (currentTotal === null) {
            return parseFloat(amountMined.toFixed(8));
        }
        return parseFloat((currentTotal + amountMined).toFixed(8));
    }).catch(error => {
        console.error("Error updating global mined supply:", error);
    });
}


auth.onAuthStateChanged(user => {
    updateUIForAuth(user);
});

networkSelect.addEventListener('change', () => {
    const selectedNetwork = networkSelect.value;
    miningTickerElement.textContent = tickerMap[selectedNetwork] || 'ETH';
    if (userId) {
        listenToGlobalMinedSupply(selectedNetwork);
    } else {
        networkTotalTickerElement.textContent = tickerMap[selectedNetwork] || selectedNetwork.toUpperCase();
        globalMinedSupplyElement.textContent = '0';
    }
    if (isMining) return;
});

let miningCountForBlock = 0;
let MINING_REQUIRED_FOR_NEW_BLOCK = 10;

miningWorker.onmessage = async function(event) {
    const { command, remainingTime, totalDuration, actualReward, paramsForMainThread } = event.data;

    if (command === 'progress') {
        if (!isMining && remainingTime < (totalDuration -1) ) {
             console.warn("Orphaned worker progress detected, stopping worker.");
             miningWorker.postMessage({ command: 'stop' });
             return;
        }
        miningTimeElement.textContent = remainingTime;
        const progressPercentage = ((totalDuration - remainingTime) / totalDuration) * 100;
        miningProgressBar.style.width = `${progressPercentage}%`;
    } else if (command === 'completed') {
        if (!isMining || !currentMiningParams || 
            currentMiningParams.userId !== paramsForMainThread.userId ||
            currentMiningParams.selectedNetwork !== paramsForMainThread.selectedNetwork ||
            currentMiningParams.selectedOption !== paramsForMainThread.selectedOption ||
            currentMiningParams.time !== paramsForMainThread.time ||
            currentMiningParams.blockIdToMine !== paramsForMainThread.blockIdToMine
        ) {
            console.warn("Worker completed an outdated or irrelevant task. Reward ignored.");
            if (!autoMining) {
                resetMiningState(true);
            }
            return;
        }
        
        currentMiningParams.lastActualReward = actualReward;

        const minedBlockId = paramsForMainThread.blockIdToMine;
        miningCountForBlock++;

        let rewardToApply = actualReward;
        let statusMessage = `Mined a reward of +${actualReward.toFixed(8)} ${currentMiningParams.ticker} `;

        if (miningCountForBlock >= MINING_REQUIRED_FOR_NEW_BLOCK) {
            const bonusFactor = 21;
            rewardToApply = actualReward * bonusFactor;
            statusMessage += `x${bonusFactor} BONUS! Congratulations miner, you have successfully solved block ${minedBlockId}! `;
            
            const blockHeightRef = database.ref('blocks/block/currentBlockHeight');
            const nextBlockIdRef = database.ref('blocks/block/nextBlockId');
            
            const newBlockHeight = currentBlockHeight + 1;
            const newNextBlockIdValue = generateNewBlockId();

            try {
                await blockHeightRef.set(newBlockHeight);
                await nextBlockIdRef.set(newNextBlockIdValue);
                statusMessage += `New Block ${newNextBlockIdValue} is now active.`;
            } catch (error) {
                console.error("Error updating block info in Firebase:", error);
                statusMessage += `Error creating new block. Retrying next cycle.`;
            }
            miningCountForBlock = 0;
        } else {
            statusMessage += `${MINING_REQUIRED_FOR_NEW_BLOCK - miningCountForBlock} more mines needed for new block.`;
        }

        miningStatusText.textContent = statusMessage;

        updateBalanceToFirebase(currentMiningParams.userId, currentMiningParams.selectedNetwork, rewardToApply);
        updateGlobalMinedSupplyInFirebase(currentMiningParams.selectedNetwork, rewardToApply);
        logTransaction(currentMiningParams.userId, currentMiningParams.selectedNetwork, rewardToApply, currentMiningParams.ticker, currentBlockHeight, minedBlockId);
        resetMiningState(false);
        if (autoMining && userId) {
            miningStatusText.textContent += " Auto-mining next cycle...";
        }
    }
};

function updateBalanceToFirebase(currentUserId, selectedNetwork, actualReward) {
  if (!currentUserId) {
    console.error("User ID is null, cannot update balance.");
    return;
  }
  const balanceRef = database.ref(`wallets/${currentUserId}/${selectedNetwork}/balance`);
  balanceRef.transaction(currentBalance => {
    const balance = parseFloat(currentBalance) || 0;
    const newBalance = balance + actualReward;
    return parseFloat(newBalance.toFixed(8));
  }).then(transactionResult => {
    if (transactionResult.committed) {
      miningBalanceElement.textContent = transactionResult.snapshot.val().toFixed(8);
    }
  }).catch(error => {
    console.error("Error updating balance: ", error);
    miningStatusText.textContent = "Error updating balance.";
  });
}

function logTransaction(currentUserId, selectedNetwork, actualReward, ticker, blockHeightLog, minedBlockIdLog) {
    if (!currentUserId) {
        console.error("User ID is null, cannot log transaction.");
        return;
    }
    const transactionHash = generateRandomHash(64);
    const transactionData = {
        network: selectedNetwork,
        sender: "00000000O0000000000O00000000",
        recipient: currentUserId,
        amount: parseFloat(actualReward.toFixed(8)),
        amountReceived: parseFloat(actualReward.toFixed(8)),
        memo: `Mining reward for Block #${blockHeightLog} [BLOCK_ID: ${minedBlockIdLog}]`,
        gasFee: getRandomGasFee(0.00001, 0.00050),
        type: "mining",
        timestamp: new Date().toISOString(),
    };
    database.ref(`transactions/allnetwork/${transactionHash}`).set(transactionData)
    .catch(error => {
        console.error("Error saving transaction: ", error);
    });
}


function doMining() {
  if (isMining) return;

  if (!userId) {
    miningStatusText.textContent = "Please log in to mine.";
    authStatusMessage.textContent = "You need to be logged in to start mining.";
    return;
  }

  if (!nextBlockId) {
    miningStatusText.textContent = "Waiting for next block ID... please wait.";
    console.warn("HELLO WORLD");
    if (autoMining) {
        setTimeout(() => {
            if (autoMining && !isMining && userId) doMining();
        }, 3000);
    }
    return;
  }

  isMining = true;
  disableControls();

  const selectedNetwork = networkSelect.value;
  const selectedOption = miningOptionsSelect.value;

  if (!miningOptions[selectedNetwork] || !miningOptions[selectedNetwork][selectedOption]) {
      miningStatusText.textContent = "Selected mining option is not available.";
      resetMiningState(false);
      isMining = false;
      enableControls();
      return;
  }

  const { rewardMin, rewardMax, time } = miningOptions[selectedNetwork][selectedOption];
  currentMiningParams = { 
      userId, 
      selectedNetwork, 
      selectedOption, 
      rewardMin, 
      rewardMax, 
      time, 
      ticker: tickerMap[selectedNetwork],
      blockIdToMine: nextBlockId
  };

  miningWorker.postMessage({
      command: 'start',
      params: currentMiningParams
  });

  miningTickerElement.textContent = tickerMap[selectedNetwork] || 'ETH';
  miningStatusText.textContent = `Mining Block ${nextBlockId} for ${tickerMap[selectedNetwork]}...`;
  miningProgressBar.style.width = '0%';
  miningTimeElement.textContent = time / 1000;
}

function generateRandomHash(length = 64) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let hash = '';
  for (let i = 0; i < length; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function getRandomGasFee(min, max) {
  const fee = Math.random() * (max - min) + min;
  return parseFloat(fee.toFixed(8));
}

autoMineBtn.addEventListener("click", () => {
  if (!userId) {
    authStatusMessage.textContent = "Please log in to use auto-mining.";
    return;
  }

  autoMining = !autoMining;
  autoMineBtn.textContent = autoMining ? "⚙️ Auto Mining: ON" : "⚙️ Auto Mining: OFF";

  if (autoMining) {
    autoMineBtn.classList.add('auto-mining-on');
    miningStatusText.textContent = "Auto-mining enabled. Waiting for next cycle...";
    if (!isMining) {
        doMining();
    }
    autoMiningInterval = setInterval(() => {
      if (userId && autoMining && !isMining) { 
        doMining();
      } else if (!userId || !autoMining) {
        clearInterval(autoMiningInterval);
        autoMineBtn.textContent = "⚙️ Auto Mining: OFF";
        autoMineBtn.classList.remove('auto-mining-on');
        if(!userId) updateUIForAuth(null);
      }
    }, 5000);
  } else {
    autoMineBtn.classList.remove('auto-mining-on');
    if (autoMiningInterval) {
      clearInterval(autoMiningInterval);
    }
    if (!isMining) {
        miningStatusText.textContent = "Auto-mining disabled.";
    }
  }
});

startMiningButton.addEventListener('click', () => {
  if (!userId) {
    authStatusMessage.textContent = "Please log in to start mining.";
    return;
  }
  if (isMining) return;
  if (autoMining) {
      miningStatusText.textContent = "Auto-mining is ON. New cycle will start automatically if not already mining.";
      return;
  }
  doMining();
});

document.addEventListener('DOMContentLoaded', () => {
    initializeBlockInfo();
    updateUIForAuth(auth.currentUser);
    if (!auth.currentUser) {
        networkTotalTickerElement.textContent = tickerMap[networkSelect.value] || networkSelect.value.toUpperCase();
        globalMinedSupplyElement.textContent = '0';
    }
    miningTickerElement.textContent = tickerMap[networkSelect.value] || 'ETH';
});
