/**
 * Full-screen tap counter for /reps.
 * One click (a finger or a chest on the phone) adds one.
 * The total stays in localStorage on this device.
 */
(() => {
  const STORAGE_KEY = "namdinh.reps.v1";
  const COOLDOWN_MS = 280;
  const RESET_ARM_MS = 2000;

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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") keepAwake();
  });

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

  function boot() {
    const root = document.getElementById("reps");
    if (!root || root.dataset.bound === "1") return;

    const countEl = document.getElementById("reps-count");
    const addBtn = document.getElementById("reps-add");
    const undoBtn = document.getElementById("reps-undo");
    const resetBtn = document.getElementById("reps-reset");
    if (!countEl || !addBtn || !undoBtn || !resetBtn) return;

    root.dataset.bound = "1";

    let count = readCount();
    let lastAdd = 0;
    let resetArmed = false;
    let resetTimer = 0;

    function render() {
      countEl.textContent = String(count);
      addBtn.setAttribute("aria-label", `${count} reps. Tap to add one.`);
      undoBtn.disabled = count === 0;
      if (!resetArmed) resetBtn.disabled = count === 0;
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

    render();
    keepAwake();
  }

  if (typeof document$ !== "undefined" && document$.subscribe) {
    document$.subscribe(boot);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
