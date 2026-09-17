// HTMLの表示やボタンを、idで取得します。
const timeDisplay = document.getElementById("time");
const statusDisplay = document.getElementById("status");
const exerciseDisplay = document.getElementById("exercise");
const exerciseImage = document.getElementById("exercise-image");
const roundDisplay = document.getElementById("round");
const startButton = document.getElementById("start");
const pauseButton = document.getElementById("pause");
const resetButton = document.getElementById("reset");
const timerRing = document.getElementById("timer-ring");
const sessionNote = document.getElementById("session-note");
let screenLock = null;
let screenLockPending = false;

// このページを表示している間、自動消灯を抑えます。
async function keepScreenAwake() {
  if (!("wakeLock" in navigator)) {
    return;
  }
  if (document.hidden || screenLockPending || (screenLock && !screenLock.released)) {
    return;
  }

  screenLockPending = true;
  try {
    const lock = await navigator.wakeLock.request("screen");
    screenLock = lock;
    lock.addEventListener("release", function () {
      if (screenLock === lock) {
        screenLock = null;
      }
    });
    if (document.hidden) {
      await lock.release();
    }
  } catch (error) {
    // 端末が点灯維持を許可しない場合も、タイマーはそのまま動かします。
  } finally {
    screenLockPending = false;
  }
}

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
// 種目名と同じ順番で、対応する画像を並べます。
const exerciseImages = [
  "assets/squat.svg",
  "assets/wall-pushup.svg",
  "assets/back-lunge.svg",
  "assets/bird-dog.svg",
  "assets/hip-bridge.svg",
  "assets/dead-bug.svg"
];
const restSeconds = 20;
const preparationSeconds = 10;
const totalRounds = 2;

// 配列の番号は0から始まるので、0がスクワットです。
let exerciseIndex = 0;
let currentRound = 1;
let isRest = false;
let isPreparing = true;
let remainingTime = preparationSeconds;
let timerId = null;
// 時刻の計算にはミリ秒を使います（1000ミリ秒 = 1秒）。
let remainingMilliseconds = preparationSeconds * 1000;
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

function playSound(duration, frequency, delay = 0) {
  if (audioContext === null || audioContext.state !== "running") {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const startTime = audioContext.currentTime + delay;

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
  // 終了予告も、スマートフォンで聞こえやすい高さにします。
  const beforeTraining = isPreparing || (isRest
    && !(currentRound === totalRounds && exerciseIndex === exercises.length - 1));
  playSound(0.12, beforeTraining ? 880 : 784);
}

function playStartBeep() {
  playSound(0.5, 1047);
}

function playEndBeep() {
  // 開始の長音と区別できるよう、中高音を2回鳴らします。
  playSound(0.16, 784);
  playSound(0.16, 784, 0.24);
}

// 種目・周回・残り時間の表示をまとめて更新します。
function updateDisplay() {
  // 説明文も設定値から作り、時間や種目数を変えたときに追従させます。
  sessionNote.textContent = exercises.length + "種目 · " + trainingSeconds
    + "秒トレーニング / " + restSeconds + "秒休憩 · " + totalRounds + "周";
  let displayedIndex = exerciseIndex;
  exerciseImage.hidden = false;
  if (isPreparing) {
    exerciseDisplay.textContent = "最初は、" + exercises[0];
  } else if (isRest) {
    if (exerciseIndex === exercises.length - 1 && currentRound === totalRounds) {
      exerciseDisplay.textContent = "おつかれさまでした！";
      exerciseImage.hidden = true;
    } else {
      // 最後の種目の次は、次の周のスクワットに戻ります。
      const nextIndex = (exerciseIndex + 1) % exercises.length;
      displayedIndex = nextIndex;
      exerciseDisplay.textContent = "次は、" + exercises[nextIndex];
    }
  } else {
    exerciseDisplay.textContent = exercises[exerciseIndex];
  }
  // 休憩中は、次の種目名と画像をそろえて表示します。
  const imagePath = exerciseImages[displayedIndex];
  if (exerciseImage.getAttribute("src") !== imagePath) {
    exerciseImage.setAttribute("src", imagePath);
  }
  roundDisplay.textContent = currentRound + " / " + totalRounds + "周";
  timeDisplay.textContent = remainingTime;
  const phaseSeconds = isPreparing ? preparationSeconds : (isRest ? restSeconds : trainingSeconds);
  timerRing.style.setProperty("--progress", (remainingTime / phaseSeconds * 360) + "deg");
}

function showPhase() {
  document.body.dataset.phase = isPreparing ? "preparing" : (isRest ? "rest" : "training");
  if (isPreparing) {
    statusDisplay.textContent = "準備中";
    statusDisplay.className = "";
  } else if (isRest) {
    statusDisplay.textContent = "休憩中";
    statusDisplay.className = "rest";
  } else {
    statusDisplay.textContent = "トレーニング中";
    statusDisplay.className = "training";
  }
}

// 0秒になったとき、休憩または次の種目へ進みます。
function nextPhase(announce = true) {
  if (isPreparing) {
    isPreparing = false;
    remainingTime = trainingSeconds;
    if (announce) playStartBeep();
  } else if (!isRest) {
    isRest = true;
    remainingTime = restSeconds;
    if (announce) playEndBeep();
  } else {
    // 最後の種目の休憩まで終わったら、タイマーを止めます。
    if (exerciseIndex === exercises.length - 1 && currentRound === totalRounds) {
      if (announce) playEndBeep();
      clearInterval(timerId);
      timerId = null;
      phaseEndTime = null;
      statusDisplay.textContent = "すべて終了！";
      document.body.dataset.phase = "finished";
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
    if (announce) playStartBeep();
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
    // 画面を長く離れた場合、過去の合図をまとめて鳴らしません。
    nextPhase(now - phaseEndTime < 1000);
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
  keepScreenAwake();
  // 動作中や終了後に押されても、新しいタイマーを作りません。
  if (timerId !== null || remainingTime === 0) {
    return;
  }

  // スタートのクリックは、スマートフォンで音を鳴らす許可にもなります。
  prepareSound();
  showPhase();
  phaseEndTime = Date.now() + remainingMilliseconds;
  // 画面を更新するきっかけです。経過時間は時刻の差から求めます。
  timerId = setInterval(function () {
    refreshTimer();
  }, 200);

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
  isPreparing = true;
  remainingTime = preparationSeconds;
  remainingMilliseconds = preparationSeconds * 1000;
  phaseEndTime = null;
  lastCueSecond = null;
  updateDisplay();
  statusDisplay.textContent = "開始前";
  document.body.dataset.phase = "idle";
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
    keepScreenAwake();
  }
});

updateDisplay();
keepScreenAwake();
