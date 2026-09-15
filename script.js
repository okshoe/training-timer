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
  updateDisplay();
}

function startTimer() {
  // 動作中や終了後に押されても、新しいタイマーを作りません。
  if (timerId !== null || remainingTime === 0) {
    return;
  }

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
  remainingTime = trainingSeconds;
  remainingMilliseconds = trainingSeconds * 1000;
  phaseEndTime = null;
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
