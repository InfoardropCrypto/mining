// mining-worker.js

let miningIntervalId = null;
let currentRewardMin, currentRewardMax; // Removed currentTotalTime as it's passed with params.time

self.onmessage = function(event) {
    const { command, params } = event.data;

    if (command === 'start') {
        if (miningIntervalId) {
            clearInterval(miningIntervalId); // Clear any existing interval
        }

        currentRewardMin = params.rewardMin;
        currentRewardMax = params.rewardMax;
        let duration = params.time / 1000; // seconds

        miningIntervalId = setInterval(() => {
            duration--;
            self.postMessage({
                command: 'progress',
                remainingTime: duration,
                totalDuration: params.time / 1000
            });

            if (duration <= 0) {
                clearInterval(miningIntervalId);
                miningIntervalId = null;

                const actualReward = Math.random() * (currentRewardMax - currentRewardMin) + currentRewardMin;
                self.postMessage({
                    command: 'completed',
                    actualReward: actualReward,
                    paramsForMainThread: params // Send original params back for context
                });
            }
        }, 1000);
    } else if (command === 'stop') {
        if (miningIntervalId) {
            clearInterval(miningIntervalId);
            miningIntervalId = null;
        }
        // Optionally, post a message back to confirm stoppage
        // self.postMessage({ command: 'stopped' });
    }
};