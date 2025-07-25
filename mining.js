const firebaseConfig = {
  apiKey: "AIzaSyBtoafs5RAPyMYO4VwIWEMb98Ye_X0w-EA",
  authDomain: "web3-iac.firebaseapp.com",
  databaseURL: "https://web3-iac-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "web3-iac",
  storageBucket: "web3-iac.firebasestorage.app",
  messagingSenderId: "177980099871",
  appId: "1:177980099871:web:9ecb0cc57ac00b757c342a",
  measurementId: "G-9VG2WXG47T"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// DOM Elements
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

// New DOM Elements for new features
const hashRateDisplay = document.getElementById('hashRateDisplay');
const themeToggle = document.getElementById('themeToggle');
const miningHistoryList = document.getElementById('miningHistoryList');
const clearHistoryButton = document.getElementById('clearHistoryButton');

// START: Tambahan DOM Elements untuk input perintah
const commandInput = document.getElementById('commandInput');
const runCommandButton = document.getElementById('runCommandButton');
const commandStatusMessage = document.getElementById('commandStatusMessage');
// END: Tambahan DOM Elements untuk input perintah


// Mining options
const miningOptions = {
    eth: {
        easy:   { rewardMin: 0.00100, rewardMax: 0.00550, time: 60000, baseHashRate: 1000 },
        medium: { rewardMin: 0.002500, rewardMax: 0.004000, time: 1800000, baseHashRate: 5000 },
        hard:   { rewardMin: 0.020000, rewardMax: 0.035000, time: 3600000, baseHashRate: 20000 }
    },
    optimism_eth: {
        easy:   { rewardMin: 0.000300, rewardMax: 0.00000700, time: 60000, baseHashRate: 3000 },
        medium: { rewardMin: 0.00006000, rewardMax: 0.00010000, time: 1800000, baseHashRate: 600 },
        hard:   { rewardMin: 0.00050000, rewardMax: 0.00080000, time: 3600000, baseHashRate: 2500 }
    },
       sol: {
           easy:   { rewardMin: 0.0050, rewardMax: 0.050, time: 60000, baseHashRate: 80 },
           medium: { rewardMin: 0.200, rewardMax: 0.800, time: 1800000, baseHashRate: 400 },
           hard:   { rewardMin: 1.10, rewardMax: 4.50, time: 3600000, baseHashRate: 1800 }
     },
     sui: {
           easy:   { rewardMin: 0.150, rewardMax: 0.350, time: 60000, baseHashRate: 3000 },
           medium: { rewardMin: 20, rewardMax: 0.800, time: 1800000, baseHashRate: 15000 },
           hard:   { rewardMin: 50, rewardMax: 4.50, time: 3600000, baseHashRate: 58000 }
     }
};

const tickerMap = { 
    eth: 'ETH', 
    optimism_eth: 'OPTIMISM', 
    sol: 'SOL' ,
    sui: 'SUI'
};

let isMining = false;
let autoMining = false;
let autoMiningInterval;
let userId = null;
let currentMiningParams = null;
let currentBlockHeight = 0;
let nextBlockId = '';
let currentGlobalSupplyListenerPath = null;
let MINING_REQUIRED_FOR_NEW_BLOCK = 3; // Initial value
let miningCountForBlock = 0;

let miningProgressIntervalId = null; // To manage hash rate display

// --- Utility Functions ---
function generateNewBlockId() {
    return `${generateRandomHash(64)}`;
}

function updateBlockInfoDisplay() {
    blockHeightDisplay.textContent = `#${currentBlockHeight}`;
    nextBlockIdDisplay.textContent = nextBlockId;
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
  return parseFloat(fee.toFixed(18));
}

// --- Firebase Related Functions ---
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
                    miningStatusText.textContent = `Mined a reward of +${lastReward.toFixed(18)} ${currentMiningParams.ticker}. ${MINING_REQUIRED_FOR_NEW_BLOCK - miningCountForBlock} more mines for new block.`;
                }
            }
        } else {
            await miningRequiredRef.set(MINING_REQUIRED_FOR_NEW_BLOCK);
        }
    }, (error) => {
        console.error("Error reading MINING_REQUIRED_FOR_NEW_BLOCK from Firebase:", error);
    });
}

function updateBalanceToFirebase(currentUserId, selectedNetwork, actualReward) {
  if (!currentUserId) {
    console.error("User ID is null, cannot update balance.");
    return;
  }
  const balanceRef = database.ref(`wallets/${currentUserId}/${selectedNetwork}/balance`);
  balanceRef.transaction(currentBalance => {
    const balance = parseFloat(currentBalance) || 0;
    const newBalance = balance + actualReward;
    return parseFloat(newBalance.toFixed(18));
  }).then(transactionResult => {
    if (transactionResult.committed) {
      miningBalanceElement.textContent = transactionResult.snapshot.val().toFixed(18);
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
        sender: "0000000000000000000000000000",
        recipient: currentUserId,
        amount: parseFloat(actualReward.toFixed(18)),
        amountReceived: parseFloat(actualReward.toFixed(18)),
        memo: `Mining reward for Block #${blockHeightLog} 【BLOCK_ID: ${minedBlockIdLog}】`,
        gasFee: getRandomGasFee(0.00001, 0.00050),
        type: "mining",
        timestamp: new Date().toISOString(),
    };
    database.ref(`transactions/allnetwork/${transactionHash}`).set(transactionData)
    .catch(error => {
        console.error("Error saving transaction: ", error);
    });

    // Add to local mining history
    addMiningHistory(transactionData);
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
        globalMinedSupplyElement.textContent = totalMined.toFixed(18);
    }, (error) => {
        console.error(`Error fetching global mined supply for ${network}:`, error);
        globalMinedSupplyElement.textContent = 'Error';
    });
}

function updateGlobalMinedSupplyInFirebase(network, amountMined) {
    const supplyRef = database.ref(`minedSupply/${network}/totalMined`);
    supplyRef.transaction((currentTotal) => {
        if (currentTotal === null) {
            return parseFloat(amountMined.toFixed(18));
        }
        return parseFloat((currentTotal + amountMined).toFixed(18));
    }).catch(error => {
        console.error("Error updating global mined supply:", error);
    });
}

// --- UI State Management ---
function resetMiningState(clearStatus = true) {
    isMining = false;
    miningTimeElement.textContent = '0';
    miningProgressBar.style.width = '0%';
    hashRateDisplay.textContent = '0 H/s'; // Reset hash rate
    clearInterval(miningProgressIntervalId); // Stop hash rate update
    miningProgressIntervalId = null;

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
    // START: Nonaktifkan input perintah saat mining berlangsung
    commandInput.disabled = isMining;
    runCommandButton.disabled = isMining;
    // END: Nonaktifkan input perintah saat mining berlangsung
}

function disableControls() {
    startMiningButton.disabled = true;
    networkSelect.disabled = true;
    miningOptionsSelect.disabled = true;
    // START: Nonaktifkan input perintah saat mining berlangsung
    commandInput.disabled = true;
    runCommandButton.disabled = true;
    // END: Nonaktifkan input perintah saat mining berlangsung
}

function updateUIForAuth(user) {
    if (user) {
        userId = user.uid;
        authStatusMessage.textContent = '';
        // Fetch and display user's balance for the selected network
        database.ref(`wallets/${userId}/${networkSelect.value}/balance`).on('value', (snapshot) => {
            const balance = snapshot.val() || 0;
            miningBalanceElement.textContent = parseFloat(balance).toFixed(18);
        });
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
        // START: Pastikan input perintah juga dinonaktifkan jika belum login
        commandInput.disabled = true;
        runCommandButton.disabled = true;
        // END: Pastikan input perintah juga dinonaktifkan jika belum login

        if (currentGlobalSupplyListenerPath) {
            database.ref(currentGlobalSupplyListenerPath).off();
            currentGlobalSupplyListenerPath = null;
        }
        globalMinedSupplyElement.textContent = '0';
        networkTotalTickerElement.textContent = tickerMap[networkSelect.value] || 'ETH';
    }
}

// --- Mining Logic ---
function doMining() {
  if (isMining) return;

  if (!userId) {
    miningStatusText.textContent = "Please log in to mine.";
    authStatusMessage.textContent = "You need to be logged in to start mining.";
    commandStatusMessage.textContent = "Error: Not logged in."; // Feedback for command input
    return;
  }

  if (!nextBlockId) {
    miningStatusText.textContent = "Waiting for next block ID... please wait.";
    console.warn("Next Block ID not available yet.");
    if (autoMining) {
        setTimeout(() => {
            if (autoMining && !isMining && userId) doMining();
        }, 1000); // Wait 1 second before retrying
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

  const { rewardMin, rewardMax, time, baseHashRate } = miningOptions[selectedNetwork][selectedOption];
  currentMiningParams = { 
      userId, 
      selectedNetwork, 
      selectedOption, 
      rewardMin, 
      rewardMax, 
      time, 
      ticker: tickerMap[selectedNetwork],
      blockIdToMine: nextBlockId,
      baseHashRate: baseHashRate // Pass base hash rate to params
  };

  miningWorker.postMessage({
      command: 'start',
      params: currentMiningParams
  });

  miningTickerElement.textContent = tickerMap[selectedNetwork] || 'ETH';
  miningStatusText.textContent = `Mining Block ${nextBlockId} [♦>${tickerMap[selectedNetwork]}]`;
  miningProgressBar.style.width = '0%';
  miningTimeElement.textContent = time / 1000;

  // Start updating hash rate display
  let currentHashRate = baseHashRate;
  hashRateDisplay.textContent = `${currentHashRate} H/s`;
  if (miningProgressIntervalId) clearInterval(miningProgressIntervalId);
  miningProgressIntervalId = setInterval(() => {
      // Simulate slight fluctuation in hash rate
      currentHashRate = Math.max(0, baseHashRate + (Math.random() * 20 - 10)); // +/- 10 H/s fluctuation
      hashRateDisplay.textContent = `${currentHashRate.toFixed(2)} H/s`;
  }, 500); // Update every 0.5 seconds
}

// --- Web Worker Message Handler ---
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
        let statusMessage = `Mined a reward of +${actualReward.toFixed(18)} ${currentMiningParams.ticker} `;

        // Adaptive difficulty logic: Adjust MINING_REQUIRED_FOR_NEW_BLOCK based on time taken
        // This is a simple example. A more robust system would involve server-side logic and
        // more complex calculations based on average mining times across all users.
        const actualMiningDuration = (currentMiningParams.time / 1000) - remainingTime; // seconds
        const targetDuration = currentMiningParams.time / 1000;

        if (actualMiningDuration < targetDuration * 0.9 && MINING_REQUIRED_FOR_NEW_BLOCK < 20) { // If too fast
            MINING_REQUIRED_FOR_NEW_BLOCK = Math.min(20, MINING_REQUIRED_FOR_NEW_BLOCK + 1);
            statusMessage += ` Difficulty increased.`;
            database.ref('config/MINING_REQUIRED_FOR_NEW_BLOCK').set(MINING_REQUIRED_FOR_NEW_BLOCK); // Update Firebase
        } else if (actualMiningDuration > targetDuration * 1.1 && MINING_REQUIRED_FOR_NEW_BLOCK > 5) { // If too slow
            MINING_REQUIRED_FOR_NEW_BLOCK = Math.max(5, MINING_REQUIRED_FOR_NEW_BLOCK - 1);
            statusMessage += ` Difficulty decreased.`;
            database.ref('config/MINING_REQUIRED_FOR_NEW_BLOCK').set(MINING_REQUIRED_FOR_NEW_BLOCK); // Update Firebase
        }


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
        commandStatusMessage.textContent = ""; // Clear command status after mining completes

        updateBalanceToFirebase(currentMiningParams.userId, currentMiningParams.selectedNetwork, rewardToApply);
        updateGlobalMinedSupplyInFirebase(currentMiningParams.selectedNetwork, rewardToApply);
        logTransaction(currentMiningParams.userId, currentMiningParams.selectedNetwork, rewardToApply, currentMiningParams.ticker, currentBlockHeight, minedBlockId);
        
        resetMiningState(false);
        if (autoMining && userId) {
            miningStatusText.textContent += " Auto-mining next cycle...";
        }
    }
};

// --- Event Listeners ---
auth.onAuthStateChanged(user => {
    updateUIForAuth(user);
});

networkSelect.addEventListener('change', () => {
    const selectedNetwork = networkSelect.value;
    miningTickerElement.textContent = tickerMap[selectedNetwork] || 'ETH';
    if (userId) {
        listenToGlobalMinedSupply(selectedNetwork);
        // Also update user's balance display for the newly selected network
        database.ref(`wallets/${userId}/${selectedNetwork}/balance`).once('value', (snapshot) => {
            const balance = snapshot.val() || 0;
            miningBalanceElement.textContent = parseFloat(balance).toFixed(18);
        });
    } else {
        networkTotalTickerElement.textContent = tickerMap[selectedNetwork] || selectedNetwork.toUpperCase();
        globalMinedSupplyElement.textContent = '0';
    }
    if (isMining) return;
});

autoMineBtn.addEventListener("click", () => {
  if (!userId) {
    authStatusMessage.textContent = "Please log in to use auto-mining.";
    commandStatusMessage.textContent = "Error: Not logged in to use auto-mining."; // Feedback for command
    return;
  }

  autoMining = !autoMining;
  autoMineBtn.textContent = autoMining ? "⚙️ Auto Mining: ON" : "⚙️ Auto Mining: OFF";

  if (autoMining) {
    autoMineBtn.classList.add('auto-mining-on');
    miningStatusText.textContent = "Auto-mining enabled. Waiting for next cycle...";
    commandStatusMessage.textContent = "Auto-mining enabled."; // Feedback for command
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
    }, 2500); // Check every 2.5 seconds if mining can start
  } else {
    autoMineBtn.classList.remove('auto-mining-on');
    if (autoMiningInterval) {
      clearInterval(autoMiningInterval);
    }
    if (!isMining) {
        miningStatusText.textContent = "Auto-mining disabled.";
    }
    commandStatusMessage.textContent = "Auto-mining disabled."; // Feedback for command
  }
});

startMiningButton.addEventListener('click', () => {
  if (!userId) {
    authStatusMessage.textContent = "Please log in to start mining.";
    commandStatusMessage.textContent = "Error: Not logged in to start mining."; // Feedback for command
    return;
  }
  if (isMining) {
      commandStatusMessage.textContent = "Error: Mining already in progress."; // Feedback for command
      return;
  }
  if (autoMining) {
      miningStatusText.textContent = "Auto-mining is ON. New cycle will start automatically if not already mining.";
      commandStatusMessage.textContent = "Auto-mining is ON. Manual start not needed."; // Feedback for command
      return;
  }
  doMining();
  commandStatusMessage.textContent = "Manual mining started."; // Feedback for command
});

// START: Event Listener dan Fungsi untuk Input Perintah
runCommandButton.addEventListener('click', () => {
    executeCommand();
});

commandInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        executeCommand();
    }
});

// mining.js (updated with advanced command handler)

// Tambahkan di dalam function executeCommand()
function executeCommand() {
    const input = commandInput.value.trim();
    const parts = input.split(' ');
    const command = parts[0].toLowerCase();
    const arg = parts[1];
    commandStatusMessage.textContent = '';

    if (!userId) {
        commandStatusMessage.textContent = "Error: Please log in to run commands.";
        return;
    }

    if (command === 'mining.js') {
        if (isMining) {
            commandStatusMessage.textContent = "Mining is already in progress.";
        } else if (autoMining) {
            commandStatusMessage.textContent = "Auto-mining is ON. Manual start not needed.";
        } else {
            doMining();
            commandStatusMessage.textContent = "Manual mining started.";
        }
    } else if (command === 'miningauto.js') {
        autoMineBtn.click();
        commandStatusMessage.textContent = autoMining ? "Auto-mining enabled." : "Auto-mining disabled.";
    } else if (command === 'darkmode.js') {
        themeToggle.checked = !themeToggle.checked;
        themeToggle.dispatchEvent(new Event('change'));
        commandStatusMessage.textContent = `Light mode ${themeToggle.checked ? 'enabled' : 'disabled'}.`;
    } else if (command === 'miningeth.js') {
        if (isMining) {
            commandStatusMessage.textContent = "Error: Mining is already in progress.";
            return;
        }
        networkSelect.value = 'eth';
        networkSelect.dispatchEvent(new Event('change'));
        doMining();
        commandStatusMessage.textContent = "Mining started on Ethereum.";
    } else if (command === 'miningopeth.js') {
        if (isMining) {
            commandStatusMessage.textContent = "Error: Mining is already in progress.";
            return;
        }
        networkSelect.value = 'optimism_eth';
        networkSelect.dispatchEvent(new Event('change'));
        doMining();
        commandStatusMessage.textContent = "Mining started on Optimism.";
    } else if (command === 'miningsol.js') {
        if (isMining) {
            commandStatusMessage.textContent = "Error: Mining is already in progress.";
            return;
        }
        networkSelect.value = 'sol';
        networkSelect.dispatchEvent(new Event('change'));
        doMining();
        commandStatusMessage.textContent = "Mining started on Solana.";
    } else if (command === 'clearhistory.js') {
        if (confirm('Are you sure you want to clear all mining history?')) {
            localStorage.removeItem('miningHistory');
            renderMiningHistory();
            commandStatusMessage.textContent = "Mining history cleared.";
        } else {
            commandStatusMessage.textContent = "Clear history cancelled.";
        }
    } else if (command === 'balance.js') {
        const balanceRef = database.ref(`wallets/${userId}/${networkSelect.value}/balance`);
        balanceRef.once('value', (snapshot) => {
            const balance = snapshot.val() || 0;
            commandStatusMessage.textContent = `Current Balance: ${balance.toFixed(18)} ${tickerMap[networkSelect.value] || 'ETH'}`;
        });
    } else if (command === 'status.js') {
        if (isMining) {
            commandStatusMessage.textContent = `Mining in progress: Block ${nextBlockId} on ${tickerMap[networkSelect.value] || 'ETH'}`;
        } else if (autoMining) {
            commandStatusMessage.textContent = "Auto-mining is currently enabled.";
        } else {
            commandStatusMessage.textContent = "Mining is currently idle.";
        }
    } else if (command === 'help.js') {
        commandStatusMessage.textContent =
`Available Commands:\n- mining.js\n- miningauto.js\n- darkmode.js\n- miningeth.js\n- miningopeth.js\n- miningsol.js\n- clearhistory.js\n- balance.js\n- status.js\n- changename.js\n- resetblock.js\n- showblock.js`;
    } else if (command === 'changename.js') {
    const newName = prompt('Enter your new miner name:');
    if (newName && newName.trim() !== '') {
        localStorage.setItem('minerName', newName.trim());
        updateMinerNameDisplay();
        commandStatusMessage.textContent = `Miner name changed to: ${newName.trim()}`;
    } else {
        commandStatusMessage.textContent = "Name change cancelled or invalid input.";
    }
} else if (command === 'showblock.js') {
        commandStatusMessage.textContent = `Current Block: ${currentBlockHeight}, Target: ${MINING_REQUIRED_FOR_NEW_BLOCK} mines, Next Block ID: ${nextBlockId.substring(0, 15)}...`;
    } else {
        commandStatusMessage.textContent = "Unknown command. Try 'help.js' for list.";
    }

    commandInput.value = '';
}

themeToggle.addEventListener('change', () => {
    document.body.classList.toggle('light-mode', themeToggle.checked);
    localStorage.setItem('theme', themeToggle.checked ? 'light' : 'dark');
});

function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.checked = true;
    } else {
        document.body.classList.remove('light-mode');
        themeToggle.checked = false;
    }
}

function getMiningHistory() {
    const history = localStorage.getItem('miningHistory');
    return history ? JSON.parse(history) : [];
}

function saveMiningHistory(history) {
    localStorage.setItem('miningHistory', JSON.stringify(history));
}

function addMiningHistory(transactionData) {
    const history = getMiningHistory();
    const newEntry = {
        amount: transactionData.amount,
        ticker: transactionData.network, // Use network as ticker for history display
        timestamp: transactionData.timestamp,
        blockId: transactionData.memo.match(/BLOCK_ID: (.*?)]/)?.[1] || 'N/A'
    };
    history.unshift(newEntry); // Add to the beginning
    if (history.length > 20) { // Keep history limited to, say, 20 entries
        history.pop();
    }
    saveMiningHistory(history);
    renderMiningHistory();
}

function renderMiningHistory() {
    miningHistoryList.innerHTML = ''; // Clear current list
    const history = getMiningHistory();
    if (history.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No mining history yet.';
        miningHistoryList.appendChild(li);
        return;
    }
    history.forEach(entry => {
        const li = document.createElement('li');
        const date = new Date(entry.timestamp).toLocaleString();
        li.innerHTML = `
            <div>${date}</div>
            <div>+${entry.amount.toFixed(18)} ${tickerMap[entry.ticker] || entry.ticker.toUpperCase()}</div>
            <div style="font-size: 0.8em; color: #888;">Block: ${entry.blockId.substring(0, 8)}...</div>
        `;
        miningHistoryList.appendChild(li);
    });
}

clearHistoryButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all mining history?')) {
        localStorage.removeItem('miningHistory');
        renderMiningHistory();
    }
});


// --- DOM Content Loaded ---
document.addEventListener('DOMContentLoaded', () => {
    initializeBlockInfo();
    applySavedTheme(); // Apply theme on load
    renderMiningHistory(); // Render history on load

    updateUIForAuth(auth.currentUser);
    if (!auth.currentUser) {
        networkTotalTickerElement.textContent = tickerMap[networkSelect.value] || networkSelect.value.toUpperCase();
        globalMinedSupplyElement.textContent = '0';
    }
    miningTickerElement.textContent = tickerMap[networkSelect.value] || 'ETH';
});

function updateMinerNameDisplay() {
    const savedName = localStorage.getItem('minerName') || 'Anonymous';
    minerNameDisplay.textContent = savedName;
}

updateMinerNameDisplay();
