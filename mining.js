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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// DOM elements
const networkSelect = document.getElementById('networkSelect');
const miningOptionsSelect = document.getElementById('miningOptionsSelect');
const startMiningButton = document.getElementById('startMiningButton');
const miningStatusText = document.getElementById('miningStatus');
const miningBalanceElement = document.getElementById('miningBalance');
const miningTickerElement = document.getElementById('miningTicker');
const miningTimeElement = document.getElementById('miningTime');

// Define mining options
const miningOptions = {
    eth: {
        easy: { reward: 0.000176, time: 60000 },
        medium: { reward: 0.00310, time: 1800000 },
        hard: { reward: 0.0276, time: 3600000 }
    },
}

// Define ticker map
const tickerMap = {
    eth: 'ETH'
};

let isMining = false;
let autoMining = false;
let autoMiningInterval;

function updateBalanceToFirebase(userId, selectedNetwork, reward) {
  const balanceRef = firebase.database().ref(`wallets/${userId}/${selectedNetwork}/balance`);
  balanceRef.once('value').then(snapshot => {
    let currentBalance = snapshot.val() || 0; // Jika null atau undefined, set ke 0

    // Pastikan currentBalance adalah angka
    currentBalance = parseFloat(currentBalance);
    if (isNaN(currentBalance)) {
      currentBalance = 0; // Jika bukan angka, set ke 0
    }

    const newBalance = (currentBalance + reward).toFixed(8); // Tambah reward dan format
    balanceRef.set(newBalance); // Simpan saldo baru ke Firebase

    // Update UI balance
    miningBalanceElement.textContent = newBalance;
    miningStatusText.textContent = `Completed! (+${reward.toFixed(8)} ${tickerMap[selectedNetwork]})`;
    isMining = false;
    startMiningButton.disabled = false;
  });
}

function doMining() {
  if (isMining) return;
  isMining = true;

  // Get selected network and mining option
  const selectedNetwork = networkSelect.value;
  const selectedOption = miningOptionsSelect.value;
  const { reward, time } = miningOptions[selectedNetwork][selectedOption];
  const userId = firebase.auth().currentUser.uid;

  // Set mining ticker
  miningTickerElement.textContent = tickerMap[selectedNetwork] || 'ETH';

  // Simulate mining duration
  let duration = time / 1000; // convert to seconds
  miningTimeElement.textContent = duration;

  // Start mining timer
  const interval = setInterval(() => {
    duration--;
    miningTimeElement.textContent = duration;

    if (duration <= 0) {
      clearInterval(interval);

      // Update balance to Firebase
      updateBalanceToFirebase(userId, selectedNetwork, reward);

      // Simulate transaction
      const transactionHash = generateRandomHash();
      const transactionData = {
        network: selectedNetwork,
        sender: "00000000O0000000000O00000000",
        recipient: userId,
        amount: reward,
        gasFee: getRandomGasFee(0.0001, 0.0050),
        memo: "Mining reward",
        type: "mining",
        timestamp: new Date().toISOString()
      };
      const transactionRef = firebase.database().ref(`transactions/allnetwork/${transactionHash}`);
      transactionRef.set(transactionData);

      // Show notification
      alert(`You mined ${reward.toFixed(8)} ${tickerMap[selectedNetwork]}`);
    }
  }, 1000);
}

function generateRandomHash() {
  const chars = 'abcdef0123456789';
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function getRandomGasFee(min, max) {
  const fee = Math.random() * (max - min) + min;
  return fee.toFixed(6); // Return string with 6 decimal places
}

// Auto mining logic
const autoMineBtn = document.getElementById("autoMineButton");

autoMineBtn.addEventListener("click", () => {
  autoMining = !autoMining;
  autoMineBtn.textContent = autoMining ? "⚙️ Auto Mining: ON" : "⚙️ Auto Mining: OFF";

  if (autoMining) {
    autoMiningInterval = setInterval(() => {
      doMining(); // Start mining process every 1 seconds
    }, 1000);
  } else {
    clearInterval(autoMiningInterval);
  }
});

// Event listener for manual mining button
startMiningButton.addEventListener('click', () => {
  if (isMining) return;
  doMining();
});
