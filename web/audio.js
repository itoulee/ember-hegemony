/**
 * Web Audio：BGM + 扩展音效（无外部文件）
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
    if (localStorage.getItem("ember_audio") === "0") enabled = false;
    if (localStorage.getItem("ember_bgm") === "1") bgmOn = true;
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

  function chord(freqs, dur, type, gain) {
    freqs.forEach((f, i) => setTimeout(() => beep(f, dur, type, gain), i * 40));
  }

  function sfx(name) {
    if (!enabled) return;
    switch (name) {
      case "click":
        beep(520, 0.04, "triangle", 0.028);
        break;
      case "move":
        beep(260, 0.07, "sine", 0.03);
        beep(320, 0.06, "sine", 0.02);
        break;
      case "claim":
        chord([440, 554, 659], 0.1, "square", 0.025);
        break;
      case "win":
        chord([523, 659, 784, 1046], 0.12, "sine", 0.035);
        break;
      case "lose":
        beep(220, 0.18, "sawtooth", 0.03);
        setTimeout(() => beep(160, 0.22, "sawtooth", 0.025), 100);
        break;
      case "event":
        beep(360, 0.08, "triangle", 0.035);
        setTimeout(() => beep(480, 0.1, "triangle", 0.03), 70);
        break;
      case "achieve":
        chord([600, 800, 1000], 0.1, "sine", 0.035);
        break;
      case "turn":
        beep(180, 0.05, "sine", 0.022);
        break;
      case "coup":
        beep(120, 0.15, "square", 0.04);
        setTimeout(() => chord([300, 450, 600], 0.12, "sawtooth", 0.03), 120);
        break;
      case "intimacy":
        beep(480, 0.1, "sine", 0.03);
        setTimeout(() => beep(720, 0.14, "sine", 0.028), 90);
        setTimeout(() => beep(960, 0.1, "triangle", 0.02), 180);
        break;
      case "research":
        beep(700, 0.06, "square", 0.02);
        setTimeout(() => beep(900, 0.08, "square", 0.02), 60);
        break;
      case "ally":
        chord([392, 494, 587], 0.1, "triangle", 0.03);
        break;
      case "break":
        beep(400, 0.05, "sawtooth", 0.03);
        setTimeout(() => beep(280, 0.1, "sawtooth", 0.025), 50);
        break;
      case "ui":
        beep(640, 0.03, "triangle", 0.02);
        break;
      case "skip":
        beep(300, 0.04, "square", 0.02);
        beep(200, 0.05, "square", 0.015);
        break;
      case "open":
        beep(200, 0.05, "sine", 0.02);
        setTimeout(() => beep(400, 0.08, "sine", 0.025), 40);
        break;
      default:
        beep(400, 0.05, "sine", 0.02);
    }
  }

  function startBgm() {
    if (!enabled || !bgmOn) return;
    stopBgm();
    bgmOn = true;
    const c = ensure();
    if (!c) return;
    const notes = [110, 130.81, 146.83, 164.81, 146.83, 130.81, 123.47, 110];
    let i = 0;
    function tick() {
      if (!bgmOn || !enabled) return;
      const f = notes[i % notes.length];
      i++;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.value = 0.011;
      o.connect(g);
      g.connect(c.destination);
      const t = c.currentTime;
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
      o.start(t);
      o.stop(t + 1.2);
      bgmTimer = setTimeout(tick, 1350);
    }
    tick();
  }

  function stopBgm() {
    bgmOn = false;
    if (bgmTimer) clearTimeout(bgmTimer);
    bgmTimer = null;
  }

  return {
    sfx, setEnabled, setBgm, isEnabled: () => enabled,
    isBgm: () => bgmOn && enabled, startBgm, stopBgm, ensure,
  };
})();
