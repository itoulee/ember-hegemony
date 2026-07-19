/**
 * 简易 Web Audio：环境 BGM + 点击/胜负音效（无外部资源）
 */
window.EmberAudio = (() => {
  let ctx = null;
  let enabled = true;
  let bgmTimer = null;
  let bgmOn = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function loadPref() {
    const v = localStorage.getItem("ember_audio");
    if (v === "0") enabled = false;
    const b = localStorage.getItem("ember_bgm");
    if (b === "1") bgmOn = true;
  }
  loadPref();

  function setEnabled(on) {
    enabled = !!on;
    localStorage.setItem("ember_audio", enabled ? "1" : "0");
    if (!enabled) stopBgm();
  }

  function setBgm(on) {
    bgmOn = !!on;
    localStorage.setItem("ember_bgm", bgmOn ? "1" : "0");
    if (bgmOn) startBgm();
    else stopBgm();
  }

  function beep(freq, dur, type, gain) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = gain == null ? 0.04 : gain;
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime;
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function sfx(name) {
    if (!enabled) return;
    switch (name) {
      case "click":
        beep(520, 0.05, "triangle", 0.03);
        break;
      case "move":
        beep(280, 0.08, "sine", 0.035);
        break;
      case "claim":
        beep(440, 0.1, "square", 0.03);
        beep(660, 0.12, "sine", 0.025);
        break;
      case "win":
        beep(523, 0.12, "sine", 0.04);
        setTimeout(() => beep(659, 0.12, "sine", 0.04), 100);
        setTimeout(() => beep(784, 0.18, "sine", 0.04), 200);
        break;
      case "lose":
        beep(200, 0.2, "sawtooth", 0.03);
        setTimeout(() => beep(150, 0.25, "sawtooth", 0.025), 120);
        break;
      case "event":
        beep(360, 0.1, "triangle", 0.04);
        setTimeout(() => beep(480, 0.1, "triangle", 0.03), 80);
        break;
      case "achieve":
        beep(600, 0.08, "sine", 0.04);
        setTimeout(() => beep(800, 0.1, "sine", 0.04), 90);
        setTimeout(() => beep(1000, 0.15, "sine", 0.035), 180);
        break;
      case "turn":
        beep(180, 0.06, "sine", 0.025);
        break;
      default:
        beep(400, 0.05, "sine", 0.02);
    }
  }

  function startBgm() {
    if (!enabled || !bgmOn) return;
    stopBgm();
    const c = ensure();
    if (!c) return;
    bgmOn = true;
    const notes = [110, 130.81, 146.83, 164.81, 146.83, 130.81];
    let i = 0;
    function tick() {
      if (!bgmOn || !enabled) return;
      const f = notes[i % notes.length];
      i++;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.value = 0.012;
      o.connect(g);
      g.connect(c.destination);
      const t = c.currentTime;
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.start(t);
      o.stop(t + 1.25);
      bgmTimer = setTimeout(tick, 1400);
    }
    tick();
  }

  function stopBgm() {
    bgmOn = false;
    if (bgmTimer) clearTimeout(bgmTimer);
    bgmTimer = null;
  }

  function isEnabled() { return enabled; }
  function isBgm() { return bgmOn && enabled; }

  return { sfx, setEnabled, setBgm, isEnabled, isBgm, startBgm, stopBgm, ensure };
})();
