/**
 * Full-screen counter for /reps.
 * Tap to add one, or tap Listen and count out loud.
 * Phones listen on-device for one through nine. Other browsers use the
 * built-in speech recognizer, which can hear twenty, thirty, and so on.
 * The total stays in localStorage on this device.
 */
(() => {
  const STORAGE_KEY = "namdinh.reps.v1";
  const COOLDOWN_MS = 280;
  const RESET_ARM_MS = 2000;
  const MAX_COUNT = 999;
  const HEARD_GAP_MS = 380;
  const SAME_WORD_MS = 700;
  const TFJS_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
  const SPEECH_COMMANDS_URL =
    "https://cdn.jsdelivr.net/npm/@tensorflow-models/speech-commands@0.5.4/dist/speech-commands.min.js";

  const SMALL = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    won: 1,
    too: 2,
    to: 2,
    tree: 3,
    for: 4,
    ate: 8,
  };

  const TENS = {
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };

  const DIGITS = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
  };

  function parseUnderHundred(tokens, index) {
    let i = index;
    if (tokens[i] === "and") i += 1;
    const token = tokens[i];
    if (!token) return null;
    if (Object.prototype.hasOwnProperty.call(TENS, token)) {
      let value = TENS[token];
      let next = i + 1;
      if (tokens[next] === "and") next += 1;
      const ones = tokens[next];
      if (Object.prototype.hasOwnProperty.call(SMALL, ones) && SMALL[ones] < 10) {
        value += SMALL[ones];
        next += 1;
      }
      return { value, next };
    }
    if (Object.prototype.hasOwnProperty.call(SMALL, token)) {
      return { value: SMALL[token], next: i + 1 };
    }
    return null;
  }

  function parseNumber(tokens, index) {
    const token = tokens[index];
    if (/^\d+$/.test(token)) {
      const value = Number(token);
      if (value > MAX_COUNT) return null;
      return { value, next: index + 1 };
    }
    if (Object.prototype.hasOwnProperty.call(SMALL, token) && SMALL[token] < 10) {
      let value = SMALL[token];
      let next = index + 1;
      if (tokens[next] === "thousand" || tokens[next] === "million") return null;
      if (tokens[next] === "hundred") {
        value *= 100;
        next += 1;
        const rest = parseUnderHundred(tokens, next);
        if (rest) {
          value += rest.value;
          next = rest.next;
        }
      }
      if (value > MAX_COUNT) return null;
      return { value, next };
    }
    const under = parseUnderHundred(tokens, index);
    if (!under || under.value > MAX_COUNT) return null;
    if (tokens[under.next] === "thousand" || tokens[under.next] === "million") return null;
    return under;
  }

  function extractSpokenNumbers(text) {
    const tokens = String(text || "")
      .toLowerCase()
      .replace(/-/g, " ")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const numbers = [];
    let i = 0;
    while (i < tokens.length) {
      const parsed = parseNumber(tokens, i);
      if (!parsed) {
        i += 1;
        continue;
      }
      numbers.push(parsed.value);
      i = Math.max(parsed.next, i + 1);
    }
    return numbers;
  }

  function countFromHeardDigit(count, digit) {
    if (!Number.isInteger(digit) || digit < 1 || digit > 9) return count;
    if (count < digit) return digit;
    return count + 1;
  }

  /** @type {WakeLockSentinel | null} */
  let wakeLock = null;

  async function keepAwake() {
    if (typeof document === "undefined" || !document.getElementById("reps")) return;
    if (!navigator.wakeLock || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch {
      wakeLock = null;
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") keepAwake();
    });
  }

  function readCount() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(value) && value >= 0) return Math.floor(value);
    } catch {
      /* private mode or blocked storage */
    }
    return 0;
  }

  function writeCount(count) {
    try {
      localStorage.setItem(STORAGE_KEY, String(count));
    } catch {
      /* keep the in-memory count if storage is unavailable */
    }
  }

  function speechRecognitionCtor() {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function isIOS() {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  function isPhone() {
    if (typeof window !== "undefined" && window.__repsForceOnDevice) return true;
    if (isIOS()) return true;
    return /Android|Mobile/i.test(navigator.userAgent || "");
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing && existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("script")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = "1";
        resolve();
      };
      script.onerror = () => reject(new Error("script"));
      document.head.appendChild(script);
    });
  }

  function boot() {
    const root = document.getElementById("reps");
    if (!root || root.dataset.bound === "1") return;

    const countEl = document.getElementById("reps-count");
    const addBtn = document.getElementById("reps-add");
    const undoBtn = document.getElementById("reps-undo");
    const resetBtn = document.getElementById("reps-reset");
    const listenBtn = document.getElementById("reps-listen");
    const noteEl = document.getElementById("reps-note");
    if (!countEl || !addBtn || !undoBtn || !resetBtn || !listenBtn || !noteEl) return;

    root.dataset.bound = "1";

    let count = readCount();
    let lastAdd = 0;
    let resetArmed = false;
    let resetTimer = 0;
    let wantListen = false;
    let usingCloud = false;
    let heardNote = "";
    let statusNote = "";
    let lastHeardAt = 0;
    let lastHeardWord = "";
    /** @type {SpeechRecognition | null} */
    let recognition = null;
    /** @type {Promise<any> | null} */
    let recognizerPromise = null;
    /** @type {any} */
    let deviceRecognizer = null;

    function noteText() {
      if (statusNote) return statusNote;
      if (wantListen && heardNote) return heardNote;
      if (wantListen) return "Say one, two, three…";
      return "Saved on this phone";
    }

    function render() {
      countEl.textContent = String(count);
      addBtn.setAttribute("aria-label", `${count} reps. Tap to add one.`);
      undoBtn.disabled = count === 0;
      if (!resetArmed) resetBtn.disabled = count === 0;
      listenBtn.textContent = wantListen ? "Stop" : "Listen";
      listenBtn.setAttribute("aria-pressed", wantListen ? "true" : "false");
      listenBtn.setAttribute(
        "aria-label",
        wantListen ? "Stop listening" : "Listen for one, two, three"
      );
      listenBtn.classList.toggle("is-listening", wantListen);
      noteEl.textContent = noteText();
    }

    function persist(next) {
      count = next;
      writeCount(count);
      render();
    }

    function flash() {
      root.classList.remove("is-hit");
      void root.offsetWidth;
      root.classList.add("is-hit");
    }

    function bumpFromSpeech(next, heard) {
      heardNote = heard;
      statusNote = "";
      if (next === count) {
        render();
        return;
      }
      persist(next);
      flash();
      if (navigator.vibrate) navigator.vibrate(12);
      keepAwake();
    }

    function applyTranscript(transcript) {
      const numbers = extractSpokenNumbers(transcript);
      if (!numbers.length) {
        heardNote = `Heard ${transcript.trim()}`;
        statusNote = "";
        render();
        return;
      }
      bumpFromSpeech(numbers[numbers.length - 1], `Heard ${numbers[numbers.length - 1]}`);
    }

    function handleSpeechResult(event) {
      const result = event.results && event.results[event.results.length - 1];
      if (!result) return;
      for (let i = 0; i < result.length; i += 1) {
        const transcript = result[i] && result[i].transcript;
        if (transcript && extractSpokenNumbers(transcript).length) {
          applyTranscript(transcript);
          return;
        }
      }
      const fallback = result[0] && result[0].transcript;
      if (fallback && fallback.trim()) applyTranscript(fallback);
    }

    function stopStream(stream) {
      if (!stream) return;
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* already stopped */
        }
      });
    }

    async function primeMic() {
      const session = navigator.audioSession;
      if (session) {
        try {
          session.type = "play-and-record";
        } catch {
          /* the browser decides the audio session */
        }
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("no mic");
      }
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    }

    function loadRecognizer() {
      if (!recognizerPromise) {
        recognizerPromise = (async () => {
          if (!window.speechCommands || !window.speechCommands.create) {
            await loadScript(TFJS_URL);
            await loadScript(SPEECH_COMMANDS_URL);
          }
          const recognizer = window.speechCommands.create("BROWSER_FFT");
          await recognizer.ensureModelLoaded();
          deviceRecognizer = recognizer;
          return recognizer;
        })().catch((error) => {
          recognizerPromise = null;
          throw error;
        });
      }
      return recognizerPromise;
    }

    function onDeviceResult(recognizer, result) {
      if (!wantListen || !result || !result.scores) return;
      const labels = recognizer.wordLabels();
      let best = 0;
      for (let i = 1; i < result.scores.length; i += 1) {
        if (result.scores[i] > result.scores[best]) best = i;
      }
      const word = labels[best];
      const digit = DIGITS[word];
      if (!digit) return;
      const now = Date.now();
      if (word === lastHeardWord && now - lastHeardAt < SAME_WORD_MS) return;
      if (now - lastHeardAt < HEARD_GAP_MS) return;
      lastHeardWord = word;
      lastHeardAt = now;
      bumpFromSpeech(countFromHeardDigit(count, digit), `Heard ${word}`);
    }

    async function startOnDevice(stream) {
      usingCloud = false;
      statusNote = "Starting the mic…";
      render();
      try {
        const recognizer = await loadRecognizer();
        if (!wantListen) {
          stopStream(stream);
          return;
        }
        stopStream(stream);
        if (recognizer.isListening()) {
          try {
            await recognizer.stopListening();
          } catch {
            /* already stopped */
          }
        }
        await recognizer.listen((result) => onDeviceResult(recognizer, result), {
          probabilityThreshold: 0.85,
          overlapFactor: 0.5,
          includeSpectrogram: false,
          invokeCallbackOnNoiseAndUnknown: false,
          suppressionTimeMillis: 450,
        });
        if (!wantListen) {
          if (recognizer.isListening()) {
            try {
              await recognizer.stopListening();
            } catch {
              /* ignore */
            }
          }
          return;
        }
        statusNote = "";
        render();
      } catch {
        stopStream(stream);
        wantListen = false;
        statusNote = "Couldn't start the mic";
        render();
      }
    }

    function startCloud() {
      const Ctor = speechRecognitionCtor();
      if (!Ctor) return false;
      usingCloud = true;
      if (!recognition) {
        recognition = new Ctor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.maxAlternatives = 3;
        recognition.onstart = () => {
          statusNote = "";
          render();
        };
        recognition.onresult = handleSpeechResult;
        recognition.onerror = (event) => {
          const code = event && event.error;
          if (code === "no-speech" || code === "aborted") return;
          usingCloud = false;
          try {
            recognition.stop();
          } catch {
            /* already stopped */
          }
          startOnDevice(null);
        };
        recognition.onend = () => {
          if (!usingCloud || !wantListen || document.visibilityState === "hidden") return;
          window.setTimeout(() => {
            if (!usingCloud || !wantListen) return;
            try {
              recognition.start();
            } catch {
              /* start() throws when the engine is already running */
            }
          }, 200);
        };
      }
      try {
        recognition.start();
        statusNote = "";
        render();
        return true;
      } catch {
        usingCloud = false;
        return false;
      }
    }

    function stopListening() {
      wantListen = false;
      usingCloud = false;
      heardNote = "";
      statusNote = "";
      if (recognition) {
        try {
          if (recognition.abort) recognition.abort();
          else recognition.stop();
        } catch {
          /* already stopped */
        }
      }
      if (deviceRecognizer && deviceRecognizer.isListening()) {
        deviceRecognizer.stopListening().catch(() => {});
      }
      render();
    }

    async function begin() {
      if (wantListen) return;
      wantListen = true;
      heardNote = "";
      statusNote = "Starting the mic…";
      render();
      let stream = null;
      try {
        stream = await primeMic();
      } catch {
        wantListen = false;
        statusNote = "Mic blocked";
        render();
        return;
      }
      if (!wantListen) {
        stopStream(stream);
        return;
      }
      const cloudOk = !isPhone() && startCloud();
      if (cloudOk) {
        stopStream(stream);
        keepAwake();
        return;
      }
      await startOnDevice(stream);
      keepAwake();
    }

    addBtn.addEventListener("click", () => {
      const now = Date.now();
      if (now - lastAdd < COOLDOWN_MS) return;
      lastAdd = now;
      persist(count + 1);
      flash();
      if (navigator.vibrate) navigator.vibrate(12);
      keepAwake();
    });

    undoBtn.addEventListener("click", () => {
      if (count === 0) return;
      persist(count - 1);
    });

    function disarmReset() {
      resetArmed = false;
      resetBtn.textContent = "Reset";
      window.clearTimeout(resetTimer);
      render();
    }

    resetBtn.addEventListener("click", () => {
      if (!resetArmed) {
        resetArmed = true;
        resetBtn.disabled = false;
        resetBtn.textContent = "Reset?";
        resetTimer = window.setTimeout(disarmReset, RESET_ARM_MS);
        return;
      }
      persist(0);
      disarmReset();
    });

    listenBtn.addEventListener("click", () => {
      if (wantListen) stopListening();
      else begin();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && wantListen && usingCloud && recognition) {
        try {
          recognition.start();
        } catch {
          /* already running */
        }
      }
    });

    render();
    keepAwake();
  }

  if (typeof document !== "undefined") {
    if (typeof document$ !== "undefined" && document$.subscribe) {
      document$.subscribe(boot);
    } else if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  }

  const api = { extractSpokenNumbers, countFromHeardDigit };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
