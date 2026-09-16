// HTMLの表示やボタンを、idで取得します。
const timeDisplay = document.getElementById("time");
const statusDisplay = document.getElementById("status");
const exerciseDisplay = document.getElementById("exercise");
const roundDisplay = document.getElementById("round");
const startButton = document.getElementById("start");
const pauseButton = document.getElementById("pause");
const resetButton = document.getElementById("reset");

// 配列には、種目を実行する順番で並べます。
const exercises = [
  "スクワット",
  "壁腕立て",
  "バックランジ",
  "バードドッグ",
  "ヒップリフト",
  "デッドバグ"
];
const trainingSeconds = 40;
const restSeconds = 20;
const totalRounds = 2;

// 配列の番号は0から始まるので、0がスクワットです。
let exerciseIndex = 0;
let currentRound = 1;
let isRest = false;
let remainingTime = trainingSeconds;
let timerId = null;
// 時刻の計算にはミリ秒を使います（1000ミリ秒 = 1秒）。
let remainingMilliseconds = trainingSeconds * 1000;
let phaseEndTime = null;
let lastCueSecond = null;
let audioContext = null;

// ブラウザ標準のWeb Audio APIで、音声ファイルなしに通知音を作ります。
async function prepareSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return false;
  }

  try {
    if (audioContext === null) {
      audioContext = new AudioContext();
    }

    // resume()は準備が終わるまで時間がかかるため、完了を待ちます。
    await audioContext.resume();
    return audioContext.state === "running";
  } catch (error) {
    console.warn("音を有効にできませんでした。", error);
    return false;
  }
}

function playSound(duration, frequency) {
  if (audioContext === null || audioContext.state !== "running") {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const startTime = audioContext.currentTime;

  oscillator.frequency.value = frequency;
  // 音量を短時間で上げ、最後まで保ってから下げます。
  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
  gain.gain.setValueAtTime(0.2, startTime + duration - 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
  oscillator.onended = function () {
    oscillator.disconnect();
    gain.disconnect();
  };
}

function playShortBeep() {
  playSound(0.12, 880);
}

function playLongBeep() {
  playSound(0.5, 1047);
}

// 種目・周回・残り時間の表示をまとめて更新します。
function updateDisplay() {
  exerciseDisplay.textContent = exercises[exerciseIndex];
  roundDisplay.textContent = currentRound + "周目 / " + totalRounds + "周";
  timeDisplay.textContent = remainingTime;
}

function showPhase() {
  if (isRest) {
    statusDisplay.textContent = "休憩中";
    statusDisplay.className = "rest";
  } else {
    statusDisplay.textContent = "トレーニング中";
    statusDisplay.className = "training";
  }
}

// 0秒になったとき、休憩または次の種目へ進みます。
function nextPhase() {
  // 区間の終了を長い音で知らせます。
  playLongBeep();

  if (!isRest) {
    isRest = true;
    remainingTime = restSeconds;
  } else {
    // 最後の種目の休憩まで終わったら、タイマーを止めます。
    if (exerciseIndex === exercises.length - 1 && currentRound === totalRounds) {
      clearInterval(timerId);
      timerId = null;
      phaseEndTime = null;
      statusDisplay.textContent = "すべて終了！";
      statusDisplay.className = "";
      return;
    }

    exerciseIndex = exerciseIndex + 1;
    if (exerciseIndex === exercises.length) {
      exerciseIndex = 0;
      currentRound = currentRound + 1;
    }
    isRest = false;
    remainingTime = trainingSeconds;
  }

  lastCueSecond = null;
  showPhase();
}

// 呼び出しが遅れても、実際に過ぎた時間に合わせて追いつきます。
function refreshTimer(now = Date.now()) {
  if (timerId === null) {
    return;
  }

  // 長く画面を離れた場合は、複数の種目や休憩を進めます。
  while (now >= phaseEndTime) {
    remainingTime = 0;
    remainingMilliseconds = 0;
    nextPhase();
    if (timerId === null) {
      updateDisplay();
      return;
    }
    // 現在時刻ではなく、前の終了予定時刻から次の終了を計算します。
    phaseEndTime = phaseEndTime + remainingTime * 1000;
  }

  remainingMilliseconds = phaseEndTime - now;
  remainingTime = Math.ceil(remainingMilliseconds / 1000);
  // 3、2、1秒の表示に変わったときだけ、短い音を一度鳴らします。
  if (remainingTime >= 1 && remainingTime <= 3 && remainingTime !== lastCueSecond) {
    playShortBeep();
    lastCueSecond = remainingTime;
  }
  updateDisplay();
}

function startTimer() {
  // 動作中や終了後に押されても、新しいタイマーを作りません。
  if (timerId !== null || remainingTime === 0) {
    return;
  }

  // スタートのクリックは、スマートフォンで音を鳴らす許可にもなります。
  const soundReady = prepareSound();
  const isBeginning = currentRound === 1 && exerciseIndex === 0 && !isRest
    && remainingMilliseconds === trainingSeconds * 1000;
  showPhase();
  phaseEndTime = Date.now() + remainingMilliseconds;
  // 画面を更新するきっかけです。経過時間は時刻の差から求めます。
  timerId = setInterval(function () {
    refreshTimer();
  }, 200);

  const startedTimerId = timerId;
  soundReady.then(function (ready) {
    // 準備中に停止・リセットした場合や、遅れて準備できた場合は鳴らしません。
    if (ready && isBeginning && timerId === startedTimerId
        && !isRest && exerciseIndex === 0 && currentRound === 1
        && phaseEndTime - Date.now() > (trainingSeconds - 1) * 1000) {
      playLongBeep();
    }
  });
}

function pauseTimer() {
  // 最後の画面更新から、一時停止を押すまでの時間も反映します。
  refreshTimer();
  if (timerId === null) {
    return;
  }

  clearInterval(timerId);
  timerId = null;
  phaseEndTime = null;
  statusDisplay.textContent = "一時停止中";
  statusDisplay.className = "";
}

function resetTimer() {
  clearInterval(timerId);
  timerId = null;
  exerciseIndex = 0;
  currentRound = 1;
  isRest = false;
  remainingTime = trainingSeconds;
  remainingMilliseconds = trainingSeconds * 1000;
  phaseEndTime = null;
  lastCueSecond = null;
  updateDisplay();
  statusDisplay.textContent = "開始前";
  statusDisplay.className = "";
}

// ボタンが押されたときに、対応する関数を実行します。
startButton.addEventListener("click", startTimer);
pauseButton.addEventListener("click", pauseTimer);
resetButton.addEventListener("click", resetTimer);

// 別のタブやアプリから戻ったとき、すぐに表示を更新します。
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) {
    refreshTimer();
  }
});

updateDisplay();
