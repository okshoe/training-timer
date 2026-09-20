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
const exerciseNames = [
  "スクワット",
  "壁腕立て",
  "バックランジ",
  "サイドランジ",
  "バードドッグ",
  "ヒップリフト",
  "デッドバグ",
  "サイドプランク"
];
let trainingSeconds = 40;
// 種目名と同じ順番で、対応する画像を並べます。
const allExerciseImages = [
  "assets/squat.svg",
  "assets/wall-pushup.svg",
  "assets/back-lunge.svg",
  "assets/side-lunge.svg",
  "assets/bird-dog.svg",
  "assets/hip-bridge.svg",
  "assets/dead-bug.svg",
  "assets/side-plank.svg"
];
const catalog = exerciseNames.map((name, index) => ({
  id: allExerciseImages[index].split("/").pop().replace(".svg", ""),
  name, image: allExerciseImages[index]
}));
// IDで保存すると、種目名と画像を一緒に並べ替えられます。
let exercisePlan = catalog.map(item => ({ id: item.id, enabled: true }));
try {
  const saved = JSON.parse(localStorage.getItem("motion-loop-exercises"));
  if (Array.isArray(saved)) {
    const valid = saved.filter((item, index) => item && typeof item.enabled === "boolean"
      && catalog.some(entry => entry.id === item.id)
      && saved.findIndex(entry => entry && entry.id === item.id) === index);
    if (valid.some(item => item.enabled)) {
      exercisePlan = valid.concat(catalog.filter(item => !valid.some(entry => entry.id === item.id))
        .map(item => ({ id: item.id, enabled: false })));
    }
  }
} catch (error) {}
let exercises = [];
let exerciseImages = [];
function applyExercisePlan() {
  const selected = exercisePlan.filter(item => item.enabled)
    .map(item => catalog.find(entry => entry.id === item.id));
  exercises = selected.map(item => item.name);
  exerciseImages = selected.map(item => item.image);
}
applyExercisePlan();

function changeExercise(id, action) {
  if (settingsLocked) return;
  const index = exercisePlan.findIndex(item => item.id === id);
  if (index < 0) return;
  if (action === "toggle") {
    if (exercisePlan[index].enabled && exercises.length === 1) return;
    exercisePlan[index].enabled = !exercisePlan[index].enabled;
  } else {
    const next = index + (action === "up" ? -1 : 1);
    if (next < 0 || next >= exercisePlan.length) return;
    [exercisePlan[index], exercisePlan[next]] = [exercisePlan[next], exercisePlan[index]];
  }
  applyExercisePlan();
  try { localStorage.setItem("motion-loop-exercises", JSON.stringify(exercisePlan)); } catch (error) {}
  updateSettings();
  updateDisplay();
  const row = document.getElementById("plan-" + id);
  const control = row.querySelector('[data-action="' + action + '"]');
  // 並べ替えで端に着いても、キーボードの操作位置を保ちます。
  (control.disabled ? row : control).focus();
}

function renderExerciseSettings() {
  const list = document.getElementById("exercise-list");
  list.replaceChildren();
  exercisePlan.forEach((item, index) => {
    const exercise = catalog.find(entry => entry.id === item.id);
    const row = document.createElement("li");
    row.id = "plan-" + item.id;
    row.tabIndex = -1;
    const label = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.dataset.action = "toggle";
    check.checked = item.enabled;
    check.disabled = settingsLocked || (item.enabled && exercises.length === 1);
    check.addEventListener("change", () => changeExercise(item.id, "toggle"));
    label.append(check, document.createTextNode(exercise.name));
    row.append(label);
    for (const [action, symbol, direction] of [["up", "↑", "上"], ["down", "↓", "下"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = symbol;
      button.dataset.action = action;
      button.setAttribute("aria-label", exercise.name + "を" + direction + "へ移動");
      button.disabled = settingsLocked || (action === "up" ? index === 0 : index === exercisePlan.length - 1);
      button.addEventListener("click", () => changeExercise(item.id, action));
      row.append(button);
    }
    list.append(row);
  });
}

let restSeconds = 20;
const preparationSeconds = 10;
let totalRounds = 2;
let illustration = "male";
let settingsLocked = false;
const settingButtons = document.querySelectorAll(".choices button");
const settingsDialog = document.getElementById("settings-dialog");
document.getElementById("open-settings").addEventListener("click", function () {
  settingsDialog.showModal();
});
document.getElementById("close-settings").addEventListener("click", function () {
  settingsDialog.close();
});

// 保存が使えない環境でも、初期値でそのまま動作します。
try {
  if (localStorage.getItem("motion-loop-training") === "30") {
    trainingSeconds = 30;
    restSeconds = 30;
  }
  if (localStorage.getItem("motion-loop-rounds") === "3") totalRounds = 3;
  if (localStorage.getItem("motion-loop-illustration") === "female") illustration = "female";
} catch (error) {}

function updateSettings() {
  renderExerciseSettings();
  document.getElementById("settings-help").textContent = settingsLocked
    ? "変更するにはタイマーをリセットしてください。"
    : "設定は自動で保存されます。";
  settingButtons.forEach(function (button) {
    const selected = button.dataset.training
      ? Number(button.dataset.training) === trainingSeconds
      : button.dataset.rounds
      ? Number(button.dataset.rounds) === totalRounds
      : button.dataset.illustration === illustration;
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = settingsLocked;
  });
}

settingButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    if (settingsLocked) return;
    if (button.dataset.training) {
      trainingSeconds = Number(button.dataset.training);
      restSeconds = 60 - trainingSeconds;
    }
    if (button.dataset.rounds) totalRounds = Number(button.dataset.rounds);
    if (button.dataset.illustration) illustration = button.dataset.illustration;
    try {
      localStorage.setItem("motion-loop-training", String(trainingSeconds));
      localStorage.setItem("motion-loop-rounds", String(totalRounds));
      localStorage.setItem("motion-loop-illustration", illustration);
    } catch (error) {}
    updateSettings();
    updateDisplay();
  });
});

// 配列の番号は0から始まり、0が選んだ最初の種目です。
let exerciseIndex = 0;
let currentRound = 1;
let isRest = false;
let isPreparing = true;
let remainingTime = preparationSeconds;
let timerId = null;
// 時刻の計算にはミリ秒を使います（1000ミリ秒 = 1秒）。
let remainingMilliseconds = preparationSeconds * 1000;
let phaseEndTime = null;
let workoutSession = null;
let lastCueSecond = null;
let midpointCuePlayed = false;
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

function playMidpointBeep() {
  // 左右の切り替えにも使えるよう、中間点で短く2回鳴らします。
  playSound(0.08, 880);
  playSound(0.08, 880, 0.16);
}

function playCompletionBeep() {
  // 全種目の終了は、聞き取りやすい長音3回で知らせます。
  for (let i = 0; i < 3; i++) {
    playSound(0.4, 1047, i * 0.55);
  }
}

// 種目・周回・残り時間の表示をまとめて更新します。
function updateDisplay() {
  // 説明文も設定値から作り、時間や種目数を変えたときに追従させます。
  sessionNote.textContent = exercises.length + "種目 · " + trainingSeconds
    + "秒トレーニング / " + restSeconds + "秒休憩 · " + totalRounds + "周";
  let displayedIndex = exerciseIndex;
  exerciseImage.hidden = false;
  if (remainingTime === 0 && !isPreparing && !isRest
    && currentRound === totalRounds && exerciseIndex === exercises.length - 1) {
    exerciseDisplay.textContent = "おつかれさまでした！";
    exerciseImage.hidden = true;
  } else if (isPreparing) {
    exerciseDisplay.textContent = "最初は、" + exercises[0];
  } else if (isRest) {
    if (exerciseIndex === exercises.length - 1 && currentRound === totalRounds) {
      exerciseDisplay.textContent = "おつかれさまでした！";
      exerciseImage.hidden = true;
    } else {
      // 最後の種目の次は、次の周の最初の種目に戻ります。
      const nextIndex = (exerciseIndex + 1) % exercises.length;
      displayedIndex = nextIndex;
      exerciseDisplay.textContent = "次は、" + exercises[nextIndex];
    }
  } else {
    exerciseDisplay.textContent = exercises[exerciseIndex];
  }
  // 休憩中は、次の種目名と画像をそろえて表示します。
  const imagePath = illustration === "female"
    ? exerciseImages[displayedIndex].replace(".svg", "_f.svg")
    : exerciseImages[displayedIndex];
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
    // 準備時間を除き、最初の運動が始まった時刻を記録します。
    workoutSession.startedAt = new Date(phaseEndTime).toISOString();
    remainingTime = trainingSeconds;
    if (announce) playStartBeep();
  } else if (!isRest) {
    // 最後のトレーニングが終わったら、休憩を入れずに終了します。
    if (exerciseIndex === exercises.length - 1 && currentRound === totalRounds) {
      // 復帰時に日付をまたいでいても、実際の終了予定日の記録にします。
      recordWorkoutCompletion(new Date(phaseEndTime));
      if (announce) playCompletionBeep();
      clearInterval(timerId);
      timerId = null;
      phaseEndTime = null;
      statusDisplay.textContent = "すべて終了！";
      document.body.dataset.phase = "finished";
      statusDisplay.className = "";
      return;
    }
    isRest = true;
    remainingTime = restSeconds;
    if (announce) playEndBeep();
  } else {
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
  midpointCuePlayed = false;
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
  if (!isPreparing && !isRest && !midpointCuePlayed
    && remainingMilliseconds <= trainingSeconds * 500) {
    midpointCuePlayed = true;
    // 画面を長く離れた場合、過ぎた中間点の音は鳴らしません。
    if (trainingSeconds * 500 - remainingMilliseconds < 1000) playMidpointBeep();
  }
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
  if (!settingsLocked) {
    workoutSession = {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      startedAt: null,
      exerciseIds: exercisePlan.filter(item => item.enabled).map(item => item.id),
      exerciseCount: exercises.length,
      rounds: totalRounds,
      trainingSeconds,
      restSeconds
    };
  }
  settingsLocked = true;
  updateSettings();
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
  workoutSession = null;
  settingsLocked = false;
  updateSettings();
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
  midpointCuePlayed = false;
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

updateSettings();
updateDisplay();
keepScreenAwake();

// カレンダーは端末の現地日付、開始・終了日時はUTCで保存します。
function localDateKey(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0")
    + "-" + String(date.getDate()).padStart(2, "0");
}

let workoutDatabase = null;
function openWorkoutDatabase() {
  if (workoutDatabase) return workoutDatabase;
  workoutDatabase = new Promise((resolve, reject) => {
    const request = indexedDB.open("motion-loop", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("completed-days")) {
        request.result.createObjectStore("completed-days", { keyPath: "date" });
      }
      // 旧データは日付だけのまま残し、不明な種目数や時間を補いません。
      if (!request.result.objectStoreNames.contains("workouts")) {
        const store = request.result.createObjectStore("workouts", { keyPath: "id" });
        store.createIndex("completedDate", "completedDate", { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); workoutDatabase = null; };
      resolve(database);
    };
    request.onerror = () => reject(request.error);
  }).catch(error => { workoutDatabase = null; throw error; });
  return workoutDatabase;
}

let completionSaveFailed = false;
async function recordWorkoutCompletion(date) {
  if (!workoutSession || !workoutSession.startedAt) return;
  // 保存待ちの間にリセットされても、完了した回の内容を保持します。
  const intervalCount = workoutSession.exerciseCount * workoutSession.rounds;
  const activeSeconds = intervalCount * workoutSession.trainingSeconds;
  const completedRestSeconds = (intervalCount - 1) * workoutSession.restSeconds;
  const record = {
    ...workoutSession,
    exerciseIds: [...workoutSession.exerciseIds],
    completedDate: localDateKey(date),
    endedAt: date.toISOString(),
    endUtcOffsetMinutes: -date.getTimezoneOffset(),
    activeSeconds,
    completedRestSeconds,
    // 分数は表示時に60で割ります。準備・一時停止・最後の休憩は含みません。
    totalSeconds: activeSeconds + completedRestSeconds
  };
  try {
    const database = await openWorkoutDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(["completed-days", "workouts"], "readwrite");
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.objectStore("workouts").put(record);
      transaction.objectStore("completed-days").put({ date: record.completedDate });
    });
    completionSaveFailed = false;
  } catch (error) {
    completionSaveFailed = true;
    console.warn("完了日の保存ができませんでした。", error);
  }
  if (calendarDialog.open) renderCalendar();
}

const calendarDialog = document.getElementById("calendar-dialog");
const calendarDays = document.getElementById("calendar-days");
const calendarMessage = document.getElementById("calendar-message");
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarRenderId = 0;

async function renderCalendar() {
  const renderId = ++calendarRenderId;
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  document.getElementById("calendar-month").textContent = year + "年" + (month + 1) + "月";
  calendarDays.replaceChildren();
  calendarMessage.textContent = "読み込み中…";
  const cells = new Map();
  const firstWeekday = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  const today = localDateKey(new Date());
  let row;
  for (let index = 0; index < Math.ceil((firstWeekday + dayCount) / 7) * 7; index++) {
    if (index % 7 === 0) { row = document.createElement("tr"); calendarDays.append(row); }
    const cell = document.createElement("td");
    const day = index - firstWeekday + 1;
    if (day >= 1 && day <= dayCount) {
      const key = localDateKey(new Date(year, month, day));
      cell.textContent = day;
      cell.setAttribute("aria-label", key);
      if (key === today) cell.setAttribute("aria-current", "date");
      cells.set(key, cell);
    }
    row.append(cell);
  }
  try {
    const database = await openWorkoutDatabase();
    const dates = await new Promise((resolve, reject) => {
      const transaction = database.transaction("completed-days", "readonly");
      const range = IDBKeyRange.bound(localDateKey(new Date(year, month, 1)),
        localDateKey(new Date(year, month, dayCount)));
      const request = transaction.objectStore("completed-days").getAllKeys(range);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
    // 月を素早く切り替えた場合、古い読み込み結果を表示しません。
    if (renderId !== calendarRenderId) return;
    for (const date of dates) {
      const cell = cells.get(date);
      if (!cell) continue;
      const dot = document.createElement("span");
      dot.className = "completion-dot";
      dot.textContent = "●";
      dot.setAttribute("aria-hidden", "true");
      cell.append(dot);
      cell.setAttribute("aria-label", date + " トレーニング完了");
    }
    calendarMessage.textContent = completionSaveFailed ? "直前の完了日を保存できませんでした。" : "";
  } catch (error) {
    if (renderId === calendarRenderId) calendarMessage.textContent = "記録を読み込めませんでした。閉じてもう一度お試しください。";
  }
}

document.getElementById("open-calendar").addEventListener("click", () => {
  const today = new Date();
  calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  calendarDialog.showModal();
  renderCalendar();
});
document.getElementById("close-calendar").addEventListener("click", () => calendarDialog.close());
document.getElementById("previous-month").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById("next-month").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});

// ローカル開発では通常の読み込みを保ち、?pwa=1 を付けたときに試せます。
if ("serviceWorker" in navigator && (location.hostname !== "localhost"
  && location.hostname !== "127.0.0.1" || new URLSearchParams(location.search).has("pwa"))) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(error => {
    console.warn("オフラインの準備ができませんでした。", error);
  });
}
