/**
 * Full-screen counter for /reps.
 * Tap the screen to add one, or say the count out loud: one, two, three.
 * The total stays in localStorage on this device.
 */
(() => {
  const STORAGE_KEY = "namdinh.reps.v1";
  const COOLDOWN_MS = 280;
  const RESET_ARM_MS = 2000;
  const MAX_COUNT = 999;

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

  /** @type {WakeLockSentinel | null} */
  let wakeLock = null;

  async function keepAwake() {
    if (!document.getElementById("reps") || !navigator.wakeLock || wakeLock) return;
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
    let listening = false;
    let heardNote = "";
    let statusNote = "";
    /** @type {SpeechRecognition | null} */
    let recognition = null;

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

    function applySpoken(transcript) {
      const numbers = extractSpokenNumbers(transcript);
      if (!numbers.length) return;
      const spoken = numbers[numbers.length - 1];
      heardNote = `Heard ${spoken}`;
      statusNote = "";
      if (spoken === count) {
        render();
        return;
      }
      persist(spoken);
      flash();
      if (navigator.vibrate) navigator.vibrate(12);
      keepAwake();
    }

    function handleSpeechResult(event) {
      const result = event.results && event.results[event.results.length - 1];
      if (!result) return;
      for (let i = 0; i < result.length; i += 1) {
        const transcript = result[i] && result[i].transcript;
        if (transcript && extractSpokenNumbers(transcript).length) {
          applySpoken(transcript);
          return;
        }
      }
    }

    function ensureRecognition() {
      if (recognition) return recognition;
      const Ctor = speechRecognitionCtor();
      if (!Ctor) return null;
      recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 3;
      recognition.onstart = () => {
        listening = true;
        statusNote = "";
        render();
      };
      recognition.onresult = handleSpeechResult;
      recognition.onerror = (event) => {
        const code = event && event.error;
        if (code === "not-allowed" || code === "service-not-allowed") {
          wantListen = false;
          statusNote = "Mic blocked";
        } else if (code === "audio-capture") {
          wantListen = false;
          statusNote = "No microphone";
        } else if (code === "network") {
          wantListen = false;
          statusNote = "Voice needs a connection";
        } else if (code === "language-not-supported") {
          wantListen = false;
          statusNote = "This browser can't listen";
        }
        render();
      };
      recognition.onend = () => {
        listening = false;
        if (!wantListen || document.visibilityState === "hidden") {
          render();
          return;
        }
        try {
          recognition.start();
        } catch {
          render();
        }
      };
      return recognition;
    }

    function startListening() {
      const engine = ensureRecognition();
      if (!engine) {
        statusNote = "This browser can't listen";
        wantListen = false;
        render();
        return;
      }
      wantListen = true;
      statusNote = "";
      heardNote = "";
      render();
      if (listening) return;
      try {
        engine.start();
      } catch {
        /* start() throws if the engine is already running */
      }
      keepAwake();
    }

    function stopListening() {
      wantListen = false;
      heardNote = "";
      if (recognition && listening) {
        try {
          recognition.stop();
        } catch {
          listening = false;
        }
      }
      render();
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
      else startListening();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && wantListen) startListening();
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

  const api = { extractSpokenNumbers };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
