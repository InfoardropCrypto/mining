// mining.js (Modified to include Block Feature with Firebase storage)

const firebaseConfig = {
  apiKey: "AIzaSyCtvxvFSXOT0fkRpl84U6LTD8xg8rGWrV8", // Pastikan ini kunci API Anda yang sebenarnya
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
// DOM Elements for Block Info
const blockHeightDisplay = document.getElementById('blockHeightDisplay');
const nextBlockIdDisplay = document.getElementById('nextBlockIdDisplay');


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
    }
};

const tickerMap = { eth: 'ETH', optimism_eth: 'OP' };

let isMining = false;
let autoMining = false;
let autoMiningInterval;
let userId = null;
let currentMiningParams = null;

// Block related variables
let currentBlockHeight = 0; // Initialize to 0, will be fetched from Firebase
let nextBlockId = '';

function generateNewBlockId() {
    return `${generateRandomHash(64)}`; // Shorter hash for block ID
}

function updateBlockInfoDisplay() {
    blockHeightDisplay.textContent = `#${currentBlockHeight}`;
    nextBlockIdDisplay.textContent = nextBlockId;
}

async function initializeBlockInfo() {
    const blockRef = database.ref('blocks/block/currentBlockHeight');
    try {
        const snapshot = await blockRef.once('value');
        if (snapshot.exists()) {
            currentBlockHeight = parseInt(snapshot.val());
        } else {
            // If no block height exists in Firebase, initialize it
            currentBlockHeight = 1; // Start from 1 or desired initial value
            await blockRef.set(currentBlockHeight);
        }
    } catch (error) {
        conoptimism_ethe.error("Error fetching block height from Firebase:", error);
        // Fallback to a default if Firebase fails
        currentBlockHeight = 1;
    }
    nextBlockId = generateNewBlockId();
    updateBlockInfoDisplay();
}


function resetMiningState(clearStatus = true) {
    isMining = false;
    miningTimeElement.textContent = '0';
    miningProgressBar.style.width = '0%';
    if (clearStatus) {
      miningStatusText.textContent = userId ? 'Not started' : 'Please log in to start mining.';
    }
    enableControls();
    currentMiningParams = null;
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
    } else {
        userId = null;
        if (isMining) {
            miningWorker.postMessage({ command: 'stop' });
        }
        resetMiningState();
        authStatusMessage.textContent = 'Please log in to use the mining features.';
        miningStatusText.textContent = 'Please log in to start mining.';
        miningBalanceElement.textContent = '0';
        miningTickerElement.textContent = tickerMap[networkSelect.value] || 'ETH';

        autoMining = false;
        autoMineBtn.textContent = "⚙️ Auto Mining: OFF";
        autoMineBtn.classList.remove('auto-mining-on');
        if (autoMiningInterval) clearInterval(autoMiningInterval);

        disableControls();
        startMiningButton.disabled = true;
        autoMineBtn.disabled = true;
    }
}

auth.onAuthStateChanged(user => {
    updateUIForAuth(user);
});

networkSelect.addEventListener('change', () => {
    if (isMining) return;
    miningTickerElement.textContent = tickerMap[networkSelect.value] || 'ETH';
});

miningWorker.onmessage = async function(event) {
    const { command, remainingTime, totalDuration, actualReward, paramsForMainThread } = event.data;

    if (command === 'progress') {
        if (!isMining && remainingTime < (totalDuration -1) ) {
             miningWorker.postMessage({ command: 'stop' });
             return;
        }
        miningTimeElement.textContent = remainingTime;
        const progressPercentage = ((totalDuration - remainingTime) / totalDuration) * 100;
        miningProgressBar.style.width = `${progressPercentage}%`;
    } else if (command === 'completed') {
        if (!isMining || !currentMiningParams) {
            conoptimism_ethe.warn("Worker completed a task that the main thread was not tracking.");
            resetMiningState(true); // Reset if state is inconsistent
            return;
        }

        // Increment block height and save to Firebase
        const blockRef = database.ref('blocks/block/currentBlockHeight');
        currentBlockHeight++;
        try {
            await blockRef.set(currentBlockHeight);
        } catch (error) {
            conoptimism_ethe.error("Error updating block height in Firebase:", error);
            // Handle error, maybe revert block height or notify user
        }

        const minedBlockId = nextBlockId; // The block that was just "mined"
        nextBlockId = generateNewBlockId(); // Generate ID for the *next* block
        updateBlockInfoDisplay();

        updateBalanceToFirebase(currentMiningParams.userId, currentMiningParams.selectedNetwork, actualReward);
        // Pass currentBlockHeight to logTransaction for the memo
        logTransaction(currentMiningParams.userId, currentMiningParams.selectedNetwork, actualReward, currentMiningParams.ticker, currentBlockHeight, minedBlockId);

        miningStatusText.textContent = `Block #${currentBlockHeight-1} Mined! +${actualReward.toFixed(8)} ${currentMiningParams.ticker}`;
        resetMiningState(false);

    }
};

function updateBalanceToFirebase(currentUserId, selectedNetwork, actualReward) {
  const balanceRef = database.ref(`wallets/${currentUserId}/${selectedNetwork}/balance`);
  balanceRef.once('value').then(snapshot => {
    let currentBalance = parseFloat(snapshot.val()) || 0;
    if (isNaN(currentBalance)) currentBalance = 0;

    const newBalance = currentBalance + actualReward;
    balanceRef.set(parseFloat(newBalance.toFixed(8)));

    miningBalanceElement.textContent = newBalance.toFixed(8);
  }).catch(error => {
    conoptimism_ethe.error("Error updating balance: ", error);
    miningStatusText.textContent = "Error updating balance.";
  });
}

// Modified logTransaction to include block information
function logTransaction(currentUserId, selectedNetwork, actualReward, ticker, blockHeight, minedBlockId) {
    const transactionHash = generateRandomHash(64); // Standard length for tx hash
    const transactionData = {
        network: selectedNetwork,
        sender: "00000000O0000000000O00000000", // Coinbase / Mining Pool
        recipient: currentUserId,
        amount: parseFloat(actualReward.toFixed(8)),
        amountReceived: parseFloat(actualReward.toFixed(8)),
        gasFee: getRandomGasFee(0.00001, 0.00050),
        memo: `Mining reward for Block #${blockHeight} [BLOCKID: ${minedBlockId}]`,
        type: "mining",
        blockHeight: blockHeight, // Store block height with transaction
        minedBlockId: minedBlockId, // Store mined block ID
        timestamp: new Date().toISOString()
    };
    database.ref(`transactions/allnetwork/${transactionHash}`).set(transactionData)
    .catch(error => {
        conoptimism_ethe.error("Error saving transaction: ", error);
    });
}


function doMining() {
  if (isMining) return;

  if (!userId) {
    miningStatusText.textContent = "Please log in to mine.";
    authStatusMessage.textContent = "You need to be logged in to start mining.";
    return;
  }

  isMining = true;
  disableControls();

  const selectedNetwork = networkSelect.value;
  const selectedOption = miningOptionsSelect.value;

  if (!miningOptions[selectedNetwork] || !miningOptions[selectedNetwork][selectedOption]) {
      miningStatusText.textContent = "Selected mining option is not available.";
      resetMiningState(false);
      return;
  }

  const { rewardMin, rewardMax, time } = miningOptions[selectedNetwork][selectedOption];
  // Include current nextBlockId in params sent to worker, though worker doesn't use it, main thread uses it for context on completion.
  currentMiningParams = { userId, selectedNetwork, selectedOption, rewardMin, rewardMax, time, ticker: tickerMap[selectedNetwork], blockIdToMine: nextBlockId };

  miningWorker.postMessage({
      command: 'start',
      params: currentMiningParams // Pass all params, worker will use what it needs
  });

  miningTickerElement.textContent = tickerMap[selectedNetwork] || 'ETH';
  // Update status to show which block ID is being mined
  miningStatusText.textContent = `Mining Block ${nextBlockId} for ${tickerMap[selectedNetwork]}...`;
  miningProgressBar.style.width = '0%';
  miningTimeElement.textContent = time / 1000;
}

// Modified to allow specifying length for shorter hashes (like for block IDs)
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
    }, 3000);
  } else {
    autoMineBtn.classList.remove('auto-mining-on');
    if (autoMiningInterval) {
      clearInterval(autoMiningInterval);
    }
    miningStatusText.textContent = "Auto-mining disabled.";
  }
});

startMiningButton.addEventListener('click', () => {
  if (!userId) {
    authStatusMessage.textContent = "Please log in to start mining.";
    return;
  }
  if (isMining) return;
  if (autoMining) {
      miningStatusText.textContent = "Auto-mining is ON. New cycle will start automatically.";
      return;
  }
  doMining();
});

document.addEventListener('DOMContentLoaded', () => {
    initializeBlockInfo(); // Initialize block info when DOM is ready
    updateUIForAuth(auth.currentUser);
    miningTickerElement.textContent = tickerMap[networkSelect.value] || 'ETH';
});
