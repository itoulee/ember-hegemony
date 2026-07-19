/**
 * 星域制霸：余烬 — P0 + P1 网页核心
 * 存档/教程/事件/战棋地形远程/小屏 / 身份/科技/外交/政变/AI v2/36星图/模组
 */
(() => {
  "use strict";

  const SAVE_PREFIX = "ember_hegemony_slot_";
  const ACH_KEY = "ember_hegemony_achievements";
  const CODEX_KEY = "ember_hegemony_codex";
  const VERSION = "2.3.0-arcs";
  const MATURE_KEY = "ember_mature_enabled";
  const CG_URL_KEY = "ember_cg_urls";

  let EVENT_DEFS = [];
  let TECH_DEFS = { branches: [] };
  let MOD_EVENTS = [];
  /** 内置剧本（不依赖 fetch，避免 Pages 路径问题导致空白列表） */
  const BUILTIN_SCENARIOS = [
    { id: "tutorial", name_zh: "教程：余烬港一百天", name_en: "Tutorial", mode: "magistrate", tutorial: true, desc_zh: "引导：航行、占星、回合、交战、事件。", desc_en: "Guided start." },
    { id: "sandbox", name_zh: "沙盒：无主星域", name_en: "Sandbox", mode: "magistrate", desc_zh: "标准开局，自由游玩。", desc_en: "Free play." },
    { id: "weak", name_zh: "剧本：小国中兴", name_en: "Weak Revival", mode: "magistrate", flags: { weakStart: true }, desc_zh: "国力薄弱，合纵连横。", desc_en: "Weak start." },
    { id: "coup", name_zh: "剧本：北阙夜（政变）", name_en: "Coup Night", mode: "officer", flags: { boostCoup: true }, desc_zh: "航官开局，黄袍加身。", desc_en: "Officer coup." },
    { id: "raider", name_zh: "剧本：黑旗十年", name_en: "Black Flag", mode: "raider", desc_zh: "掠航者占星建国。", desc_en: "Raider founding." },
    { id: "civilian", name_zh: "剧本：布衣卿相", name_en: "Commoner", mode: "civilian", desc_zh: "流民起步。", desc_en: "Civilian path." },
    { id: "hegemony", name_zh: "剧本：制霸主环", name_en: "Hegemony", mode: "magistrate", flags: { winHegemony: true }, desc_zh: "控制 80% 节点并维持 3 月。", desc_en: "Hold 80% nodes 3 months." },
  ];
  let SCENARIOS = BUILTIN_SCENARIOS.slice();
  let CHARACTERS = [];
  let ACH_DEFS = [];
  let STORY_ARCS = {};
  let CG_SLOTS = [];
  let unlockedAch = {};
  let codex = { nodes: {}, factions: {}, chars: {}, techs: {} };
  let cgUrls = {};

  function startScenarioById(id) {
    const sc = (SCENARIOS.length ? SCENARIOS : BUILTIN_SCENARIOS).find((s) => s.id === id) || BUILTIN_SCENARIOS[1];
    try {
      if (window.EmberAudio) EmberAudio.ensure();
    } catch (_) {}
    newGame({
      scenarioId: sc.id,
      mode: sc.mode || "magistrate",
      tutorial: !!sc.tutorial,
      flags: sc.flags || {},
      seed: Date.now() & 0xffffffff,
    });
    state.mapView.scale = 0.85;
    state.mapView.ox = 20;
    state.mapView.oy = 10;
    render();
  }

  const TUTORIAL_STEPS = [
    { id: "move", text: "教程①：点击邻星「灰轨一号/正交矿带」等，再点「航行」。", need: "move" },
    { id: "claim", text: "教程②：选中一颗无主星（灰色），点「登记无主」。若附近无无主，先结束回合或航行靠近。", need: "claim" },
    { id: "end", text: "教程③：点「结束回合」，观察 AI 与收入。", need: "end" },
    { id: "attack", text: "教程④：贴近敌星并「进攻」，任选战报或战棋。", need: "attack" },
    { id: "event", text: "教程⑤：若弹出事件请选一项；若无事件可再结束回合直到出现。完成后点「沙盒新周目」自由玩。", need: "event" },
  ];

  const state = {
    version: VERSION,
    month: 1,
    ap: 3,
    maxAp: 3,
    seed: 1,
    rngState: 1,
    hexModePrefer: false,
    pendingEvent: null,
    eventCooldown: {},
    log: [],
    selected: null,
    factions: {},
    nodes: {},
    edges: [],
    player: null,
    research: null,
    jointResearchWith: null,
    incomeBoost: 0,
    debt: 0,
    tutorial: null,
    pendingBattle: null,
    hex: null,
    mapView: { scale: 1, ox: 0, oy: 0 },
    scenarioId: "sandbox",
    scenarioFlags: {},
    hegemonyStreak: 0,
    metChars: {},
    hexWins: 0,
    victoryClaimed: false,
    matureEnabled: false,
    maturePackLoaded: false,
    relationshipHooks: null,
    /** charId -> intimacy level 0-10 */
    bonds: {},
    globalIntimacy: 0,
    harem: [],
    /** arcId -> step index completed (0 = none) */
    arcProgress: {},
    storyFlags: {},
    unlockedCgs: {},
    haremFav: "",
    haremSchedule: {},
  };

  function bondOf(charId) {
    return state.bonds[charId] || 0;
  }
  function addBond(charId, v) {
    if (!charId) return;
    state.bonds[charId] = clamp((state.bonds[charId] || 0) + v, 0, 10);
    if (state.bonds[charId] >= 3 && state.harem.indexOf(charId) < 0) {
      state.harem.push(charId);
    }
  }
  function maxBond() {
    let m = state.globalIntimacy || 0;
    for (const k of Object.keys(state.bonds)) m = Math.max(m, state.bonds[k] || 0);
    return m;
  }

  function isMatureEnabled() {
    return !!state.matureEnabled;
  }

  function eventAllowed(e) {
    const r = (e && e.rating) || "all";
    if (r === "r18" || r === "explicit") return isMatureEnabled();
    return true;
  }

  function sfx(n) {
    try { if (window.EmberAudio) EmberAudio.sfx(n); } catch (_) {}
  }
  function t(k) {
    try { return window.EmberI18n ? EmberI18n.t(k) : k; } catch (_) { return k; }
  }
  function loadMeta() {
    try { unlockedAch = JSON.parse(localStorage.getItem(ACH_KEY) || "{}") || {}; } catch (_) { unlockedAch = {}; }
    try { codex = Object.assign({ nodes: {}, factions: {}, chars: {}, techs: {} }, JSON.parse(localStorage.getItem(CODEX_KEY) || "{}")); } catch (_) {}
    try { state.matureEnabled = localStorage.getItem(MATURE_KEY) === "1"; } catch (_) { state.matureEnabled = false; }
    try { cgUrls = JSON.parse(localStorage.getItem(CG_URL_KEY) || "{}") || {}; } catch (_) { cgUrls = {}; }
  }
  function saveMeta() {
    try {
      localStorage.setItem(ACH_KEY, JSON.stringify(unlockedAch));
      localStorage.setItem(CODEX_KEY, JSON.stringify(codex));
      localStorage.setItem(CG_URL_KEY, JSON.stringify(cgUrls));
    } catch (_) {}
  }
  function unlockAchieve(id) {
    if (unlockedAch[id]) return;
    unlockedAch[id] = { at: Date.now(), month: state.month };
    saveMeta();
    const def = ACH_DEFS.find((a) => a.id === id);
    const name = def ? (window.EmberI18n ? EmberI18n.nameOf(def) : def.name_zh) : id;
    toast((window.EmberI18n && EmberI18n.getLang() === "en" ? "Achievement: " : "成就解锁：") + name);
    sfx("achieve");
    log("★ " + name);
    renderMeta();
  }
  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
  }
  function codexNode(id) {
    if (!id || !node(id)) return;
    codex.nodes[id] = true;
    saveMeta();
  }
  function codexFac(id) {
    if (id) { codex.factions[id] = true; saveMeta(); }
  }
  function codexChar(id) {
    if (id) { codex.chars[id] = true; state.metChars[id] = true; saveMeta(); }
  }
  function meetFactionLeaders() {
    for (const ch of CHARACTERS) {
      if (ch.faction === "player") { codexChar(ch.id); continue; }
      if (ch.faction && fac(ch.faction)) codexFac(ch.faction);
      // unlock character when player borders or shares relation path
      if (ch.faction === state.player.factionId) codexChar(ch.id);
    }
  }

  /* ---------- RNG ---------- */
  function seedRng(s) {
    state.rngState = s >>> 0 || 1;
  }
  function rand() {
    let t = (state.rngState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randi(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
  function chance(p) { return rand() < p; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  let _logRaf = 0;
  function log(msg) {
    const line = `[星月${state.month}] ${msg}`;
    state.log.push(line);
    if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
    if (_logRaf) return;
    _logRaf = requestAnimationFrame(() => {
      _logRaf = 0;
      const el = document.getElementById("log");
      if (el) {
        el.textContent = state.log.join("\n");
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  function fac(id) { return state.factions[id]; }
  function node(id) { return state.nodes[id]; }
  function playerFac() { return fac(state.player.factionId); }
  function isPlayerFac(id) { return id === state.player.factionId; }

  function neighbors(id) {
    const out = [];
    for (const [a, b] of state.edges) {
      if (a === id) out.push(b);
      else if (b === id) out.push(a);
    }
    return out;
  }
  function adjacent(a, b) { return neighbors(a).includes(b); }

  function setRel(a, b, v) {
    if (!fac(a) || !fac(b) || a === b) return;
    fac(a).rel[b] = clamp(v, -100, 100);
    fac(b).rel[a] = clamp(v, -100, 100);
  }
  function addRel(a, b, d) {
    if (!fac(a) || !fac(b)) return;
    setRel(a, b, (fac(a).rel[b] || 0) + d);
  }
  function areAllied(a, b) {
    const fa = fac(a);
    return fa && (fa.allies || []).includes(b);
  }

  /* ---------- Tech bonuses ---------- */
  function techBonus() {
    const b = { manpowerMult: 1, atkMult: 1, defenseBonus: 0, incomeMult: 1, claimBonus: 0, garrisonBonus: 0, intelGain: 0 };
    const done = state.player.techDone || {};
    for (const br of TECH_DEFS.branches || []) {
      for (const lv of br.levels) {
        if (!done[lv.id]) continue;
        const x = lv.bonus || {};
        if (x.manpowerMult) b.manpowerMult *= x.manpowerMult;
        if (x.atkMult) b.atkMult *= x.atkMult;
        if (x.defenseBonus) b.defenseBonus += x.defenseBonus;
        if (x.incomeMult) b.incomeMult *= x.incomeMult;
        if (x.claimBonus) b.claimBonus += x.claimBonus;
        if (x.garrisonBonus) b.garrisonBonus += x.garrisonBonus;
        if (x.intelGain) b.intelGain += x.intelGain;
        if (x.legitimacy) state.player.legitimacy = (state.player.legitimacy || 0) + 0; // applied on unlock
      }
    }
    return b;
  }

  /* ---------- Map gen 36 nodes ---------- */
  function buildWorld(mode) {
    state.factions = {};
    const facDefs = [
      ["fac_ember", "余烬航阀", "#f08a30", true],
      ["fac_cold", "冷环合议", "#3d8bfd", false],
      ["fac_free", "自由港盟", "#4caf7a", false],
      ["fac_iron", "铁幕船团", "#c070d0", false],
      ["fac_dust", "尘带公社", "#d0a060", false],
      ["fac_void", "虚空教团", "#70c0c8", false],
      ["fac_corp", "赫利俄斯公司", "#e0e060", false],
    ];
    for (const [id, name, color, player] of facDefs) {
      state.factions[id] = {
        id, name, color, ai: !player,
        credits: player ? 12000 : 8000 + randi(0, 4000),
        manpower: player ? 120 : 70 + randi(0, 50),
        rel: {}, allies: [], vassals: [], overlord: null,
        capital: null,
      };
    }
    // relations
    const ids = Object.keys(state.factions);
    for (const a of ids) for (const b of ids) if (a < b) setRel(a, b, randi(-15, 15));
    setRel("fac_ember", "fac_cold", -25);
    setRel("fac_ember", "fac_free", 10);

    // 36 nodes on concentric rings
    state.nodes = {};
    state.edges = [];
    const named = {
      0: "余烬港", 1: "灰轨一号", 2: "正交矿带", 5: "冷环主星",
      8: "自由港", 12: "密钥库", 18: "铁幕坞", 24: "尘带市",
      30: "虚空尖塔", 33: "公司中枢",
    };
    const ownersStart = {
      0: "fac_ember", 1: "fac_ember", 2: "fac_ember",
      5: "fac_cold", 6: "fac_cold", 7: "fac_cold", 12: "fac_cold",
      8: "fac_free", 9: "fac_free",
      18: "fac_iron", 19: "fac_iron",
      24: "fac_dust", 25: "fac_dust",
      30: "fac_void", 31: "fac_void",
      33: "fac_corp", 34: "fac_corp",
    };
    const capitals = {
      fac_ember: "n0", fac_cold: "n5", fac_free: "n8",
      fac_iron: "n18", fac_dust: "n24", fac_void: "n30", fac_corp: "n33",
    };

    const cx = 450, cy = 320;
    for (let i = 0; i < 36; i++) {
      const ring = i < 1 ? 0 : i < 7 ? 1 : i < 19 ? 2 : 3;
      const idxInRing = ring === 0 ? 0 : ring === 1 ? i - 1 : ring === 2 ? i - 7 : i - 19;
      const count = ring === 0 ? 1 : ring === 1 ? 6 : ring === 2 ? 12 : 17;
      const rad = ring === 0 ? 0 : 70 + ring * 85;
      const ang = (Math.PI * 2 * idxInRing) / count - Math.PI / 2;
      const x = cx + rad * Math.cos(ang) + (ring ? (rand() - 0.5) * 18 : 0);
      const y = cy + rad * Math.sin(ang) * 0.92 + (ring ? (rand() - 0.5) * 14 : 0);
      const id = "n" + i;
      const owner = ownersStart[i] || "";
      const garrison = owner ? 40 + randi(0, 50) : 15 + randi(0, 20);
      const terrains = ["normal", "normal", "normal", "nebula", "fort"];
      state.nodes[id] = {
        id,
        name: named[i] || `节点${i}`,
        x, y,
        owner,
        income: 8 + randi(0, 14) + (named[i] ? 6 : 0),
        garrison,
        defense: 1 + garrison / 200,
        terrain: i === 12 ? "fort" : terrains[randi(0, terrains.length - 1)],
      };
    }
    for (const [fid, nid] of Object.entries(capitals)) {
      if (fac(fid)) fac(fid).capital = nid;
    }

    // edges: connect near neighbors
    const arr = Object.values(state.nodes);
    for (let i = 0; i < arr.length; i++) {
      const dists = [];
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const dx = arr[i].x - arr[j].x, dy = arr[i].y - arr[j].y;
        dists.push({ j, d: dx * dx + dy * dy });
      }
      dists.sort((a, b) => a.d - b.d);
      const k = 2 + (i % 2);
      for (let t = 0; t < k && t < dists.length; t++) {
        const a = arr[i].id, b = arr[dists[t].j].id;
        const key = a < b ? a + "|" + b : b + "|" + a;
        if (!state.edges.find((e) => e[0] + "|" + e[1] === key || e[1] + "|" + e[0] === key)) {
          state.edges.push(a < b ? [a, b] : [b, a]);
        }
      }
    }

    // player setup by mode
    const pFac = "fac_ember";
    state.player = {
      name: "你",
      factionId: pFac,
      loc: "n0",
      identity: "执政官",
      command: 70,
      charm: 55,
      spouse: "",
      spouseFac: "",
      merit: 0,
      rank: 9,
      factionPower: 0,
      coupTimer: 0,
      legitimacy: 50,
      influence: 10,
      intel: 5,
      xp: 0,
      prison: 0,
      techDone: {},
      techQueue: null,
    };
    state.selected = "n0";
    state.research = null;
    state.jointResearchWith = null;
    state.incomeBoost = 0;
    state.debt = 0;
    state.eventCd = {};
    state.pendingEvent = null;
    state.pendingBattle = null;
    state.hex = null;

    if (mode === "officer") {
      state.player.identity = "航官";
      state.player.rank = 5;
      state.player.merit = 20;
      state.player.factionPower = 5;
      // player not leader - still use fac_ember but as officer fiction
      log("开局：航官。积累功勋与派系力可政变。");
    } else if (mode === "civilian") {
      state.player.identity = "流民";
      state.player.factionId = "fac_free";
      state.player.loc = "n8";
      state.player.rank = 0;
      state.selected = "n8";
      fac("fac_ember").ai = true;
      log("开局：流民。可接事件、申请入仕或叛逃。");
    } else if (mode === "raider") {
      state.player.identity = "掠航者";
      state.player.factionId = "fac_raider";
      state.factions.fac_raider = {
        id: "fac_raider", name: "黑旗中队", color: "#aa4444", ai: false,
        credits: 5000, manpower: 80, rel: {}, allies: [], vassals: [], overlord: null, capital: null,
      };
      for (const id of Object.keys(state.factions)) {
        if (id !== "fac_raider") setRel("fac_raider", id, -10);
      }
      state.player.loc = "n15";
      state.selected = "n15";
      // unclaim a node for raider start
      node("n15").owner = "";
      node("n15").name = "黑旗泊地";
      fac("fac_ember").ai = true;
      log("开局：掠航者。劫掠、占星、建国。");
    } else {
      log("开局：执政官 · 余烬航阀。");
    }
  }

  function newGame(opts = {}) {
    const seed = opts.seed || (Date.now() & 0xffffffff);
    state.seed = seed;
    seedRng(seed);
    state.version = VERSION;
    state.month = 1;
    state.ap = 3;
    state.maxAp = 3;
    state.log = [];
    state.mapView = { scale: 1, ox: 0, oy: 0 };
    state.scenarioId = opts.scenarioId || "sandbox";
    state.scenarioFlags = Object.assign({}, opts.flags || {});
    state.hegemonyStreak = 0;
    state.hexWins = 0;
    state.metChars = {};
    state.victoryClaimed = false;
    state.bonds = {};
    state.globalIntimacy = 0;
    state.harem = [];
    state.arcProgress = {};
    state.storyFlags = {};
    state.unlockedCgs = { generic_night: true };
    state.haremFav = "";
    state.haremSchedule = {};
    buildWorld(opts.mode || "magistrate");
    applyScenarioFlags(state.scenarioFlags);
    if (opts.tutorial) {
      state.tutorial = { step: 0, done: {} };
      showTutorial();
      log("教程模式开始。请按顶部提示操作。");
    } else {
      state.tutorial = null;
      hideTutorial();
    }
    const sc = SCENARIOS.find((s) => s.id === state.scenarioId);
    const scName = sc ? (window.EmberI18n ? EmberI18n.nameOf(sc) : sc.name_zh) : state.scenarioId;
    const ban = document.getElementById("scenario-banner");
    if (ban) {
      ban.classList.remove("hidden");
      ban.textContent = scName;
    }
    log(`新周目 v${VERSION} 剧本=${scName} 种子=${seed}`);
    meetFactionLeaders();
    codexNode(state.player.loc);
    showApp(true);
    refreshDipSelect();
    renderTech();
    renderMeta();
    renderGoalCompass();
    renderArcPanel();
    renderHaremPanel();
    renderCgPanel();
    applyI18nUi();
    render();
    sfx("click");
  }

  function applyScenarioFlags(flags) {
    if (!flags) return;
    if (flags.weakStart) {
      const pf = playerFac();
      pf.manpower = 55;
      pf.credits = 5000;
      // keep only capital + one neighbor
      for (const n of Object.values(state.nodes)) {
        if (n.owner === pf.id && n.id !== pf.capital && n.id !== "n1") n.owner = "";
      }
      const c = node(pf.capital || "n0");
      if (c) c.garrison = 35;
      log("剧本修正：小国中兴 — 国力薄弱。");
    }
    if (flags.boostCoup) {
      state.player.merit = 35;
      state.player.factionPower = 25;
      log("剧本修正：北阙夜 — 已有部分派系根基。");
    }
  }

  function showApp(on) {
    const boot = document.getElementById("boot");
    const app = document.getElementById("app");
    if (boot) boot.classList.toggle("hidden", !!on);
    if (app) app.classList.toggle("hidden", !on);
  }

  /* ---------- AP / actions ---------- */
  function blocked() {
    if (state.pendingEvent) { log("请先处理事件。"); return true; }
    if (state.hex) { log("战棋进行中。"); return true; }
    if (state.player.prison > 0) { log(`监禁中（剩余 ${state.player.prison} 月）。可尝试越狱。`); return true; }
    return false;
  }

  function spendAp(n = 1) {
    if (blocked()) return false;
    if (state.ap < n) { log("行动点不足。"); return false; }
    state.ap -= n;
    return true;
  }

  function tutNeed(need) {
    return state.tutorial && TUTORIAL_STEPS[state.tutorial.step] && TUTORIAL_STEPS[state.tutorial.step].need === need;
  }
  function tutAdvance(need) {
    if (!state.tutorial) return;
    const st = TUTORIAL_STEPS[state.tutorial.step];
    if (!st || st.need !== need) return;
    state.tutorial.done[need] = true;
    state.tutorial.step++;
    if (state.tutorial.step >= TUTORIAL_STEPS.length) {
      log("教程完成！可自由游玩或读档。");
      state.tutorial = null;
      hideTutorial();
      unlockAchieve("tutorial_done");
      tryVictory("tutorial", "教程结业。目标罗盘将切换为自由目标提示。");
      renderGoalCompass();
    } else {
      showTutorial();
      renderGoalCompass();
    }
  }
  function showTutorial() {
    const el = document.getElementById("tutorial-bar");
    if (!state.tutorial) { hideTutorial(); return; }
    const st = TUTORIAL_STEPS[state.tutorial.step];
    el.classList.remove("hidden");
    el.textContent = st ? st.text : "";
  }
  function hideTutorial() {
    document.getElementById("tutorial-bar").classList.add("hidden");
  }

  function moveTo(id) {
    if (!spendAp(1)) return;
    if (!adjacent(state.player.loc, id)) {
      log("目标不在相邻航道。"); state.ap += 1; return;
    }
    // nebula on destination costs extra if not enough - already spent 1, optional second
    const dest = node(id);
    if (dest.terrain === "nebula" && state.ap >= 1) {
      state.ap -= 1;
      log("进入星云，额外消耗 1 AP。");
    } else if (dest.terrain === "nebula" && state.ap < 1) {
      log("星云需要额外 AP，本回合强行进入（舰况受损）。");
      playerFac().manpower = Math.max(5, playerFac().manpower - 3);
    }
    state.player.loc = id;
    state.selected = id;
    log(`航行至 ${dest.name}。`);
    codexNode(id);
    unlockAchieve("first_move");
    sfx("move");
    // meet nearby faction leaders
    if (dest.owner) {
      codexFac(dest.owner);
      const ch = CHARACTERS.find((c) => c.faction === dest.owner);
      if (ch) codexChar(ch.id);
    }
    tutAdvance("move");
    render();
  }

  function claim() {
    const n = node(state.selected);
    if (!n) return;
    if (n.owner) { log("节点非无主。"); return; }
    if (!adjacent(state.player.loc, n.id) && state.player.loc !== n.id) {
      log("需位于目标或邻接。"); return;
    }
    if (state.player.identity === "流民") {
      log("流民无法登记主权（请入仕或成为掠航者）。"); return;
    }
    if (!spendAp(1)) return;
    const bonus = techBonus().claimBonus;
    n.owner = state.player.factionId;
    n.garrison = Math.max(15, playerFac().manpower * (0.12 + bonus));
    if (!playerFac().capital) playerFac().capital = n.id;
    log(`登记节点：${n.name}`);
    codexNode(n.id);
    unlockAchieve("first_claim");
    checkNodeCountAchieve();
    sfx("claim");
    tutAdvance("claim");
    render();
  }

  function raid() {
    if (state.player.identity !== "掠航者") return;
    const n = node(state.selected);
    if (!n || !n.owner || isPlayerFac(n.owner)) { log("选敌方/中立有主星劫掠。"); return; }
    if (!adjacent(state.player.loc, n.id) && state.player.loc !== n.id) {
      log("需邻接。"); return;
    }
    if (!spendAp(1)) return;
    const gain = 400 + randi(0, 800);
    playerFac().credits += gain;
    n.garrison = Math.max(5, n.garrison - 15);
    addRel(state.player.factionId, n.owner, -10);
    log(`劫掠 ${n.name}，获得 ${gain} 信用点。`);
    render();
  }

  /* ---------- Battle ---------- */
  function requestAttack() {
    const n = node(state.selected);
    if (!n || !n.owner || isPlayerFac(n.owner)) {
      log("无法进攻无主或己方。"); return;
    }
    if (areAllied(state.player.factionId, n.owner)) {
      log("同盟不可进攻（请先废盟）。"); return;
    }
    if (!adjacent(state.player.loc, n.id) && state.player.loc !== n.id) {
      log("必须位于目标或邻接。"); return;
    }
    if (blocked()) return;
    if (state.ap < 1) { log("行动点不足。"); return; }
    state.pendingBattle = { nodeId: n.id };
    document.getElementById("battle-choice-text").textContent =
      `进攻 ${n.name}（${fac(n.owner).name}）驻军 ${n.garrison.toFixed(0)} · 地形 ${terrainName(n.terrain)}`;
    document.getElementById("battle-choice").classList.remove("hidden");
  }

  function terrainName(t) {
    if (t === "nebula") return "星云";
    if (t === "fort") return "要塞";
    return "常规";
  }

  function cancelBattle() {
    state.pendingBattle = null;
    document.getElementById("battle-choice").classList.add("hidden");
  }

  function confirmBattle(mode) {
    const pb = state.pendingBattle;
    if (!pb) return;
    if (!spendAp(1)) { cancelBattle(); return; }
    const n = node(pb.nodeId);
    cancelBattle();
    const tb = techBonus();
    const atk = playerFac().manpower * (1 + state.player.command / 100) * tb.atkMult;
    let def = n.garrison * n.defense * (1 + tb.defenseBonus * 0);
    if (n.terrain === "fort") def *= 1.25;
    if (mode === "hex") startHex(n, atk, def);
    else {
      const result = resolveReport(atk, def, n);
      applyBattle(result, n, state.player.factionId, n.owner);
      tutAdvance("attack");
      render();
    }
  }

  function resolveReport(atkP, defP, n) {
    let atk = Math.max(1, atkP), def = Math.max(1, defP);
    const lines = [`【战报】${n.name}`, `攻 ${atk.toFixed(0)} / 守 ${def.toFixed(0)}（${terrainName(n.terrain)}）`];
    const atk0 = atk, def0 = def;
    for (let w = 0; w < 3 + randi(0, 2) && atk > 0 && def > 0; w++) {
      const ah = atk * (0.12 + rand() * 0.16);
      const dh = def * (0.1 + rand() * 0.16);
      def = Math.max(0, def - ah);
      atk = Math.max(0, atk - dh);
      lines.push(`第${w + 1}波`);
    }
    const won = def <= 0 || atk / atk0 > def / def0;
    lines.push(won ? "进攻方胜利" : "防守方胜利");
    return { won, atkLoss: atk0 - atk, defLoss: def0 - def, lines };
  }

  function applyBattle(result, n, atkId, defId) {
    result.lines.forEach((l) => log(l));
    const af = fac(atkId), df = fac(defId);
    if (af) af.manpower = Math.max(10, af.manpower - result.atkLoss * 0.12);
    n.garrison = Math.max(0, n.garrison - result.defLoss);
    if (result.won) {
      n.owner = atkId;
      n.garrison = Math.max(20, (af ? af.manpower : 50) * 0.2);
      if (af && df) addRel(atkId, defId, -15);
      if (isPlayerFac(atkId)) {
        state.player.merit = (state.player.merit || 0) + 8;
        log(`占领 ${n.name}。功勋+8`);
        unlockAchieve("first_win");
        checkNodeCountAchieve();
        sfx("win");
      } else log(`${af.name} 占领 ${n.name}`);
    } else if (isPlayerFac(atkId)) {
      log("进攻失败。");
      sfx("lose");
      if (state.player.identity === "航官" && chance(0.15)) {
        state.player.prison = 2;
        log("你因战败被扣查（监禁 2 月）。");
      }
    }
  }

  function checkNodeCountAchieve() {
    const c = Object.values(state.nodes).filter((n) => n.owner === state.player.factionId).length;
    if (c >= 10) unlockAchieve("ten_nodes");
  }

  /* ---------- Hex with terrain + ranged ---------- */
  function startHex(n, atkP, defP) {
    const atkHp = Math.max(40, atkP / 3);
    const defHp = Math.max(35, defP / 3);
    const atkD = 22 + atkP * 0.04;
    const defD = 20 + defP * 0.035;
    // terrain map on hex grid
    const terrain = {};
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 7; c++) {
        let t = "normal";
        if (n.terrain === "nebula" && (c + r) % 3 === 0) t = "nebula";
        if (n.terrain === "fort" && c >= 4) t = "fort";
        if (rand() < 0.12) t = chance(0.5) ? "nebula" : "fort";
        terrain[c + "," + r] = t;
      }
    }
    state.hex = {
      nodeId: n.id, defOwner: n.owner, w: 7, h: 5, terrain,
      turnPlayer: true, selected: null, finished: false,
      log: [`战棋：${n.name} · 紫=星云(移2) 红框=要塞(+防) · 火力舰射程2`],
      units: [
        hu("a0", 0, "突击1", 1, 1, atkHp, atkD, 1),
        hu("a1", 0, "突击2", 1, 3, atkHp, atkD, 1),
        hu("a2", 0, "火力舰", 0, 2, atkHp * 0.95, atkD * 0.9, 2),
        hu("d0", 1, "哨1", 5, 1, defHp, defD, 1),
        hu("d1", 1, "哨2", 5, 3, defHp, defD, 1),
        hu("d2", 1, "要塞炮", 6, 2, defHp * 1.15, defD * 1.05, 2),
      ],
    };
    document.getElementById("hex-box").classList.remove("hidden");
    document.getElementById("hex-hint").textContent = "点己方→邻移/射程内攻击";
    drawHex();
    render();
  }
  function hu(id, team, name, c, r, hp, atk, range) {
    return { id, team, name, c, r, hp, max: hp, atk, range: range || 1, moved: false, attacked: false, moveLeft: 1 };
  }
  function hideHex() {
    document.getElementById("hex-box").classList.add("hidden");
    state.hex = null;
  }
  const HEX_SIZE = 28;
  function hexPix(c, r) {
    return {
      x: 50 + HEX_SIZE * Math.sqrt(3) * (c + 0.5 * (r % 2)),
      y: 40 + HEX_SIZE * 1.5 * r,
    };
  }
  function hexNeighbors(c, r) {
    const odd = r % 2 === 1;
    const dirs = odd
      ? [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]
      : [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
    return dirs.map(([dc, dr]) => [c + dc, r + dr]);
  }
  function hexDist(c1, r1, c2, r2) {
    // approximate via BFS
    const q = [[c1, r1, 0]];
    const seen = new Set([c1 + "," + r1]);
    while (q.length) {
      const [c, r, d] = q.shift();
      if (c === c2 && r === r2) return d;
      if (d > 6) continue;
      for (const [nc, nr] of hexNeighbors(c, r)) {
        const k = nc + "," + nr;
        if (seen.has(k)) continue;
        seen.add(k);
        q.push([nc, nr, d + 1]);
      }
    }
    return 99;
  }
  function unitAt(c, r) {
    return state.hex.units.find((x) => x.hp > 0 && x.c === c && x.r === r);
  }

  function drawHex() {
    const h = state.hex;
    if (!h) return;
    const canvas = document.getElementById("hex");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0d131c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < h.h; r++) {
      for (let c = 0; c < h.w; c++) {
        const p = hexPix(c, r);
        const t = h.terrain[c + "," + r] || "normal";
        let col = "#1a2433";
        if (t === "nebula") col = "#2a1a40";
        if (t === "fort") col = "#3a2222";
        drawHexCell(ctx, p.x, p.y, HEX_SIZE * 0.95, col, t === "fort");
      }
    }
    for (const un of h.units) {
      if (un.hp <= 0) continue;
      const p = hexPix(un.c, un.r);
      if (h.selected === un.id) {
        ctx.beginPath(); ctx.arc(p.x, p.y, HEX_SIZE * 0.75, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, HEX_SIZE * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = un.team === 0 ? "#f08a30" : "#3d8bfd"; ctx.fill();
      if (un.range > 1) {
        ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = "#fff"; ctx.font = "10px sans-serif";
      ctx.fillText(un.name, p.x - 16, p.y - 16);
      ctx.strokeStyle = "#3c9"; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x - 14, p.y + 16);
      ctx.lineTo(p.x - 14 + 28 * (un.hp / un.max), p.y + 16);
      ctx.stroke();
    }
    document.getElementById("hex-log").textContent = h.log.slice(-14).join("\n");
  }
  function drawHexCell(ctx, x, y, size, color, fort) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = ((60 * i - 30) * Math.PI) / 180;
      const px = x + size * Math.cos(ang), py = y + size * Math.sin(ang);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = fort ? "#c44" : "#3a4a5c";
    ctx.lineWidth = fort ? 2 : 1;
    ctx.stroke();
  }

  function hexClick(mx, my) {
    const h = state.hex;
    if (!h || h.finished || !h.turnPlayer) return;
    let best = null, bestD = 1e9;
    for (let r = 0; r < h.h; r++) for (let c = 0; c < h.w; c++) {
      const p = hexPix(c, r);
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bestD) { bestD = d; best = { c, r }; }
    }
    if (!best || bestD > HEX_SIZE * HEX_SIZE) return;
    const occ = unitAt(best.c, best.r);
    if (!h.selected) {
      if (occ && occ.team === 0) {
        h.selected = occ.id;
        occ.moveLeft = (h.terrain[occ.c + "," + occ.r] === "nebula") ? 0 : 1;
      }
      drawHex(); return;
    }
    const sel = h.units.find((x) => x.id === h.selected);
    if (!sel || sel.hp <= 0) { h.selected = null; drawHex(); return; }
    if (occ && occ.team === 1) {
      const dist = hexDist(sel.c, sel.r, occ.c, occ.r);
      if (sel.attacked) h.log.push("已攻击过");
      else if (dist > sel.range) h.log.push(`超出射程(需≤${sel.range})`);
      else {
        let dmg = sel.atk;
        const tt = h.terrain[occ.c + "," + occ.r];
        if (tt === "fort") dmg *= 0.75;
        occ.hp = Math.max(0, occ.hp - dmg);
        sel.attacked = true; sel.moved = true;
        h.log.push(`${sel.name} 攻击 ${occ.name} 伤${dmg.toFixed(0)}${tt === "fort" ? "(要塞减免)" : ""}`);
        checkHexEnd();
      }
    } else if (!occ) {
      const dist = hexDist(sel.c, sel.r, best.c, best.r);
      const destT = h.terrain[best.c + "," + best.r];
      const need = destT === "nebula" || (h.terrain[sel.c + "," + sel.r] === "nebula") ? 2 : 1;
      if (sel.moved || sel.attacked) h.log.push("无法再移动");
      else if (dist !== 1) h.log.push("只能移到相邻格");
      else if (need > 1 && sel.moveLeft < 1 && state.ap < 0) {
        // single-step with nebula: require not already moved - treat as full move
        sel.c = best.c; sel.r = best.r; sel.moved = true;
        h.log.push(`${sel.name} 进入星云（耗尽移动）`);
      } else {
        sel.c = best.c; sel.r = best.r;
        sel.moved = need > 1 || dist >= 1;
        if (need > 1) h.log.push(`${sel.name} → 星云格`);
        else h.log.push(`${sel.name} → (${best.c},${best.r})`);
        if (need > 1) sel.moved = true;
      }
    }
    drawHex();
  }

  function hexEndTurn() {
    const h = state.hex;
    if (!h || h.finished) return;
    h.selected = null;
    h.turnPlayer = false;
    for (const e of h.units.filter((x) => x.team === 1 && x.hp > 0)) {
      const foes = h.units.filter((x) => x.team === 0 && x.hp > 0);
      if (!foes.length) break;
      foes.sort((a, b) => hexDist(e.c, e.r, a.c, a.r) - hexDist(e.c, e.r, b.c, b.r));
      const t = foes[0];
      const dist = hexDist(e.c, e.r, t.c, t.r);
      if (dist <= e.range) {
        let dmg = e.atk;
        if (h.terrain[t.c + "," + t.r] === "fort") dmg *= 0.75;
        t.hp = Math.max(0, t.hp - dmg);
        h.log.push(`敌 ${e.name} 开火`);
      } else {
        let best = null, bd = 99;
        for (const [c, r] of hexNeighbors(e.c, e.r)) {
          if (c < 0 || r < 0 || c >= h.w || r >= h.h) continue;
          if (unitAt(c, r)) continue;
          const d = hexDist(c, r, t.c, t.r);
          if (d < bd) { bd = d; best = { c, r }; }
        }
        if (best) {
          e.c = best.c; e.r = best.r;
          if (hexDist(e.c, e.r, t.c, t.r) <= e.range) {
            t.hp = Math.max(0, t.hp - e.atk);
            h.log.push(`敌 ${e.name} 接敌`);
          }
        }
      }
      if (checkHexEnd()) break;
    }
    if (!h.finished) {
      h.turnPlayer = true;
      for (const u of h.units) if (u.team === 0) { u.moved = false; u.attacked = false; u.moveLeft = 1; }
    }
    drawHex();
  }

  function checkHexEnd() {
    const h = state.hex;
    if (!h) return false;
    const atkA = h.units.filter((x) => x.team === 0 && x.hp > 0);
    const defA = h.units.filter((x) => x.team === 1 && x.hp > 0);
    if (defA.length && atkA.length) return false;
    h.finished = true;
    const won = !defA.length && atkA.length;
    if (h.sandbox) {
      h.log.push(won ? "沙盘：攻方演习胜利" : "沙盘：守方演习胜利");
      if (won) {
        state.hexWins = (state.hexWins || 0) + 1;
        unlockAchieve("first_hex");
        sfx("win");
      } else sfx("lose");
      drawHex();
      setTimeout(() => { hideHex(); render(); }, 600);
      return true;
    }
    const atkLoss = h.units.filter((x) => x.team === 0).reduce((s, x) => s + (x.max - Math.max(0, x.hp)), 0);
    const defLoss = h.units.filter((x) => x.team === 1).reduce((s, x) => s + (x.max - Math.max(0, x.hp)), 0);
    const n = node(h.nodeId);
    if (!n || !fac(h.defOwner)) {
      h.log.push(won ? "战棋结束" : "战棋结束");
      setTimeout(() => { hideHex(); render(); }, 500);
      return true;
    }
    applyBattle({
      won, atkLoss, defLoss,
      lines: h.log.concat([won ? "战棋胜利" : "战棋失败"]),
    }, n, state.player.factionId, h.defOwner);
    if (won) {
      state.hexWins = (state.hexWins || 0) + 1;
      unlockAchieve("first_hex");
    }
    tutAdvance("attack");
    setTimeout(() => { hideHex(); render(); }, 500);
    return true;
  }

  function hexFlee() {
    const h = state.hex;
    if (!h) return;
    const n = node(h.nodeId);
    applyBattle({ won: false, atkLoss: 25, defLoss: 5, lines: ["撤退。"] }, n, state.player.factionId, h.defOwner);
    hideHex();
    tutAdvance("attack");
    render();
  }

  /* ---------- Diplomacy ---------- */
  function dipTarget() {
    return document.getElementById("dip-target").value;
  }

  function ally() {
    const t = dipTarget();
    if (!t || isPlayerFac(t)) return;
    if (areAllied(state.player.factionId, t)) { log("已是同盟。"); return; }
    if ((fac(state.player.factionId).rel[t] || 0) < 0) {
      log("关系过差，需先改善（联姻/事件）。"); return;
    }
    if (!spendAp(1)) return;
    fac(state.player.factionId).allies.push(t);
    fac(t).allies.push(state.player.factionId);
    addRel(state.player.factionId, t, 15);
    log(`与 ${fac(t).name} 缔结同盟。`);
    unlockAchieve("allied");
    codexFac(t);
    sfx("click");
    render();
  }

  function breakAlly() {
    const t = dipTarget();
    if (!areAllied(state.player.factionId, t)) { log("并无同盟。"); return; }
    if (!spendAp(1)) return;
    fac(state.player.factionId).allies = fac(state.player.factionId).allies.filter((x) => x !== t);
    fac(t).allies = fac(t).allies.filter((x) => x !== state.player.factionId);
    addRel(state.player.factionId, t, -25);
    // loyalty hit if fleets "abroad" simplified
    playerFac().manpower = Math.max(10, playerFac().manpower - 5);
    log(`废除与 ${fac(t).name} 的同盟。舰队整肃 -5 兵力。`);
    render();
  }

  function vassal() {
    const t = dipTarget();
    if (!t || isPlayerFac(t)) return;
    if (!spendAp(1)) return;
    const pf = playerFac(), tf = fac(t);
    if (tf.manpower < pf.manpower * 0.45 && (pf.rel[t] || 0) > -20) {
      tf.overlord = pf.id;
      if (!pf.vassals.includes(t)) pf.vassals.push(t);
      addRel(pf.id, t, 10);
      log(`${tf.name} 成为从属，将缴纳贡赋。`);
    } else {
      addRel(pf.id, t, -8);
      log("对方拒绝从属。");
    }
    render();
  }

  function tribute() {
    const t = dipTarget();
    if (!t) return;
    const tf = fac(t);
    if (tf.overlord !== state.player.factionId && !areAllied(state.player.factionId, t)) {
      log("仅可对从属或强索对象（需从属）。"); return;
    }
    if (!spendAp(1)) return;
    const gain = Math.min(1500, Math.floor(tf.credits * 0.15) + 300);
    tf.credits = Math.max(0, tf.credits - gain);
    playerFac().credits += gain;
    addRel(state.player.factionId, t, -5);
    log(`索贡获得 ${gain}。`);
    render();
  }

  function marry() {
    const t = dipTarget() || "fac_free";
    if (state.player.spouse) { log("已有联姻。"); return; }
    if (state.player.identity === "流民") { log("流民难以政治联姻。"); return; }
    if (playerFac().credits < 5000) { log("需要 5000 信用点。"); return; }
    if (!spendAp(1)) return;
    playerFac().credits -= 5000;
    state.player.spouse = fac(t).name + "联姻";
    state.player.spouseFac = t;
    addRel(state.player.factionId, t, 30);
    if (!areAllied(state.player.factionId, t)) {
      fac(state.player.factionId).allies.push(t);
      fac(t).allies.push(state.player.factionId);
    }
    log(`政治联姻：与 ${fac(t).name}（关系+30，同盟）。`);
    unlockAchieve("married");
    const ch = CHARACTERS.find((c) => c.faction === t);
    if (ch) {
      codexChar(ch.id);
      addBond(ch.id, isMatureEnabled() ? 2 : 1);
    }
    state.globalIntimacy = Math.max(state.globalIntimacy, isMatureEnabled() ? 2 : 1);
    if (isMatureEnabled()) {
      log("【成人】联姻开启亲密线：可在身份页「召见/共度」推进关系。");
    }
    sfx("claim");
    render();
  }

  function intimateWith(charId) {
    if (!isMatureEnabled()) {
      log("需启用成人内容（系统页）。");
      openAgeGate(() => {
        loadMatureSkeletonPack().then(() => intimateWith(charId));
      });
      return;
    }
    if (state.player.prison > 0) { log("监禁中无法召见。"); return; }
    if (!spendAp(1)) return;
    const ch = CHARACTERS.find((c) => c.id === charId);
    const name = ch ? ch.name_zh : charId;
    addBond(charId, 1 + randi(0, 1));
    state.globalIntimacy = Math.max(state.globalIntimacy, bondOf(charId));
    playerFac().credits = Math.max(0, playerFac().credits - 150);
    const lv = bondOf(charId);
    const scenes = [
      `${name} 把你按在舱门上深吻，手指解开你的束带。`,
      `你们在半暗的灯下做到腿软，通讯器被故意静音。`,
      `${name} 骑在你身上喘息，要你今晚只叫自己的名字。`,
      `事后你们分享一支烟与航道图，体温还没退。`,
    ];
    log(`【成人·召见】${scenes[randi(0, scenes.length - 1)]}（亲密 ${lv}/10）`);
    if (lv >= 5) state.player.legitimacy = (state.player.legitimacy || 0) + 1;
    sfx("claim");
    if (bondOf(charId) >= 3) unlockCg("generic_night");
    renderIntimacyPanel();
    renderHaremPanel();
    renderArcPanel();
    render();
  }

  function renderIntimacyPanel() {
    const el = document.getElementById("intimacy-panel");
    if (!el) return;
    if (!isMatureEnabled()) {
      el.innerHTML = "<p class='hint'>启用成人内容后可召见角色、触发情欲事件。</p>";
      return;
    }
    const list = CHARACTERS.filter((c) => c.faction !== "player" && c.id !== "player_echo");
    el.innerHTML = "<p class='hint'>亲密对象（点击召见，1AP）· 全局亲密度 " + (state.globalIntimacy || 0) + "</p>";
    const wrap = document.createElement("div");
    wrap.className = "intimacy-list";
    for (const ch of list) {
      const known = codex.chars[ch.id] || bondOf(ch.id) > 0 || ch.faction === state.player.spouseFac;
      const b = document.createElement("button");
      b.type = "button";
      const lv = bondOf(ch.id);
      b.textContent = known
        ? `${ch.name_zh} · 亲密${lv}/10${lv >= 3 ? " ♥" : ""}`
        : `??? · 未结识`;
      b.disabled = !known;
      if (known) b.onclick = () => intimateWith(ch.id);
      wrap.appendChild(b);
    }
    el.appendChild(wrap);
  }

  /* ---------- 角色线 / CG / 后宫 ---------- */
  function arcStep(arcId) {
    return state.arcProgress[arcId] || 0;
  }
  function bumpArc(arcId, v) {
    state.arcProgress[arcId] = (state.arcProgress[arcId] || 0) + (v || 1);
    renderArcPanel();
    renderHaremPanel();
  }
  function unlockCg(slotId) {
    if (!slotId) return;
    state.unlockedCgs[slotId] = true;
    toast("CG 解锁：" + slotId);
    renderCgPanel();
  }
  function cgThumbUrl(slot) {
    if (cgUrls[slot.id]) return cgUrls[slot.id];
    // 程序占位：渐变 data URI 由 canvas 生成
    return placeholderCgDataUrl(slot);
  }
  function placeholderCgDataUrl(slot) {
    const c = document.createElement("canvas");
    c.width = 320; c.height = 200;
    const ctx = c.getContext("2d");
    const hue = slot.char === "lia" ? 20 : slot.char === "mira" ? 150 : 220;
    const g = ctx.createLinearGradient(0, 0, 320, 200);
    g.addColorStop(0, `hsl(${hue},40%,18%)`);
    g.addColorStop(1, `hsl(${(hue + 40) % 360},35%,10%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 320, 200);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "16px sans-serif";
    ctx.fillText(slot.title_zh || slot.id, 16, 36);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "rgba(200,210,220,0.7)";
    ctx.fillText("CG 占位 · 可粘贴自定义 URL", 16, 58);
    ctx.strokeStyle = `hsl(${hue},60%,50%)`;
    ctx.strokeRect(12, 80, 120, 100);
    ctx.beginPath();
    ctx.arc(72, 120, 28, 0, Math.PI * 2);
    ctx.stroke();
    return c.toDataURL("image/png");
  }

  function getAvailableArcEvent(arcId) {
    const arc = STORY_ARCS[arcId];
    if (!arc) return null;
    const done = arcStep(arcId);
    const step = arc.steps[done];
    if (!step) return null;
    if ((step.needBond || 0) > bondOf(arc.charId)) return null;
    if ((step.needArc || 0) > done) return null;
    return step;
  }

  function playArcStep(arcId) {
    const arc = STORY_ARCS[arcId];
    const step = getAvailableArcEvent(arcId);
    if (!step) {
      log("该角色线暂无新节（提高亲密或推进前置）。");
      return;
    }
    if (step.id && step.id.indexOf("_he") >= 0 && !isMatureEnabled() && step.rating === "r18") {
      // HE can be all-age for some - our HE is fine without mature for emotional
    }
    // 以事件 UI 展示
    const ev = {
      id: step.id,
      title: "【角色线】" + step.title,
      text: step.text,
      choices: step.choices,
      rating: "all",
    };
    state.pendingEvent = ev;
    showEvent(ev);
    sfx("event");
  }

  function renderArcPanel() {
    const el = document.getElementById("arc-panel");
    if (!el) return;
    el.innerHTML = "<p class='hint'>角色线：莉娅 / 米拉（亲密达标后可推进）</p>";
    for (const arcId of ["lia", "mira"]) {
      const arc = STORY_ARCS[arcId];
      if (!arc) continue;
      const done = arcStep(arcId);
      const total = (arc.steps || []).length;
      const he = !!state.storyFlags["he_" + arcId];
      const card = document.createElement("div");
      card.className = "arc-card";
      card.innerHTML = `<h4>${arc.name_zh} ${he ? "★HE" : ""} · ${done}/${total}</h4>`;
      const ul = document.createElement("ul");
      ul.className = "steps";
      (arc.steps || []).forEach((s, i) => {
        const li = document.createElement("li");
        li.className = i < done ? "done" : "";
        li.textContent = (i < done ? "✓ " : i === done ? "→ " : "○ ") + s.title;
        ul.appendChild(li);
      });
      card.appendChild(ul);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = he ? "已完结 HE" : (getAvailableArcEvent(arcId) ? "推进本段（事件）" : "条件未满足");
      btn.disabled = he || !getAvailableArcEvent(arcId);
      btn.onclick = () => playArcStep(arcId);
      card.appendChild(btn);
      el.appendChild(card);
    }
  }

  function renderHaremPanel() {
    const el = document.getElementById("harem-panel");
    if (!el) return;
    if (!isMatureEnabled()) {
      el.innerHTML = "<p class='hint'>开启成人内容后，亲密度≥3 的角色进入后宫名册。</p>";
      return;
    }
    // sync harem from bonds
    for (const ch of CHARACTERS) {
      if (ch.faction === "player") continue;
      if (bondOf(ch.id) >= 3 && state.harem.indexOf(ch.id) < 0) state.harem.push(ch.id);
    }
    if (!state.harem.length) {
      el.innerHTML = "<p class='hint'>名册为空。联姻、事件或召见提升亲密至 3。</p>";
      return;
    }
    el.innerHTML = `<p class='hint'>后宫管理 · ${state.harem.length} 人 · 收藏：${state.haremFav ? (CHARACTERS.find((c) => c.id === state.haremFav) || {}).name_zh || state.haremFav : "无"}</p>`;
    for (const id of state.harem) {
      const ch = CHARACTERS.find((c) => c.id === id) || { id, name_zh: id };
      const card = document.createElement("div");
      card.className = "harem-card";
      const fav = state.haremFav === id ? " <span class='fav-star'>★</span>" : "";
      const night = state.haremSchedule[id] || "—";
      card.innerHTML = `<h4>${ch.name_zh || id}${fav}</h4>
        <div class="muted">亲密 ${bondOf(id)}/10 · 排班：${night}</div>`;
      const row = document.createElement("div");
      row.className = "row-btns";
      const b1 = document.createElement("button");
      b1.type = "button"; b1.textContent = "召见 (1AP)";
      b1.onclick = () => intimateWith(id);
      const b2 = document.createElement("button");
      b2.type = "button"; b2.textContent = "设为收藏";
      b2.onclick = () => { state.haremFav = id; log(`${ch.name_zh} 设为收藏。`); renderHaremPanel(); };
      const b3 = document.createElement("button");
      b3.type = "button"; b3.textContent = "排今晚";
      b3.onclick = () => {
        state.haremSchedule[id] = "星月" + state.month + " 夜";
        unlockCg("harem_lounge");
        log(`排班：${ch.name_zh} → 今晚。`);
        renderHaremPanel();
      };
      const b4 = document.createElement("button");
      b4.type = "button"; b4.textContent = "移出名册";
      b4.onclick = () => {
        state.harem = state.harem.filter((x) => x !== id);
        if (state.haremFav === id) state.haremFav = "";
        renderHaremPanel();
      };
      row.appendChild(b1); row.appendChild(b2); row.appendChild(b3); row.appendChild(b4);
      card.appendChild(row);
      el.appendChild(card);
    }
  }

  function renderCgPanel() {
    const el = document.getElementById("cg-panel");
    if (!el) return;
    if (!CG_SLOTS.length) {
      el.innerHTML = "<p class='hint'>CG 槽位表未加载。</p>";
      return;
    }
    el.innerHTML = "<p class='hint'>解锁后可粘贴图片 URL（图床）或使用程序占位图。成人槽需开启 18+ 才显示缩略内容。</p>";
    const grid = document.createElement("div");
    grid.className = "cg-grid";
    for (const slot of CG_SLOTS) {
      const unlocked = !!state.unlockedCgs[slot.id];
      const needMature = slot.rating === "r18" && !isMatureEnabled();
      const card = document.createElement("div");
      card.className = "cg-card" + (unlocked ? "" : " cg-locked");
      const title = slot.title_zh || slot.id;
      card.innerHTML = `<h4>${unlocked ? "" : "🔒 "}${title}</h4>`;
      if (unlocked && !needMature) {
        const img = document.createElement("img");
        img.className = "cg-thumb";
        img.alt = title;
        img.src = cgThumbUrl(slot);
        card.appendChild(img);
        const input = document.createElement("input");
        input.type = "url";
        input.placeholder = "https://... 自定义图片 URL";
        input.value = cgUrls[slot.id] || "";
        const actions = document.createElement("div");
        actions.className = "cg-actions";
        const save = document.createElement("button");
        save.type = "button";
        save.textContent = "保存 URL";
        save.onclick = () => {
          const v = input.value.trim();
          if (v) cgUrls[slot.id] = v;
          else delete cgUrls[slot.id];
          saveMeta();
          renderCgPanel();
          log("CG URL 已保存：" + slot.id);
        };
        const reset = document.createElement("button");
        reset.type = "button";
        reset.textContent = "恢复占位";
        reset.onclick = () => {
          delete cgUrls[slot.id];
          saveMeta();
          renderCgPanel();
        };
        actions.appendChild(save);
        actions.appendChild(reset);
        card.appendChild(input);
        card.appendChild(actions);
      } else if (needMature) {
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = "成人 CG：请先开启成人内容。";
        card.appendChild(p);
      } else {
        const p = document.createElement("p");
        p.className = "hint";
        p.textContent = "未解锁。推进角色线或后宫排班可获得。";
        card.appendChild(p);
      }
      grid.appendChild(card);
    }
    el.appendChild(grid);
  }

  function exportSave() {
    if (!state.player) {
      log("无进行中的周目可导出。");
      return;
    }
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const name = `ember-save-m${state.month}-${Date.now()}.json`;
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    log("已导出存档：" + name);
    sfx("click");
  }

  function importSaveFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        applySave(data);
        toast("存档已导入");
        log("导入存档成功。");
      } catch (e) {
        log("导入失败：" + e.message);
        showBootError("导入失败：" + e.message);
      }
    };
    reader.readAsText(file);
  }

  function jointResearch() {
    const t = dipTarget();
    if (!areAllied(state.player.factionId, t) && state.player.spouseFac !== t) {
      log("需同盟或联姻对象。"); return;
    }
    if (!spendAp(1)) return;
    state.jointResearchWith = t;
    log(`与 ${fac(t).name} 签订合研：研究费用减半。`);
    render();
  }

  /* ---------- Tech ---------- */
  function canResearch(branch, levelIndex) {
    const br = TECH_DEFS.branches.find((b) => b.id === branch);
    if (!br) return false;
    const lv = br.levels[levelIndex];
    if (!lv || state.player.techDone[lv.id]) return false;
    if (levelIndex > 0 && !state.player.techDone[br.levels[levelIndex - 1].id]) return false;
    if (state.player.techQueue) return false;
    return true;
  }

  function startResearch(branchId, levelIndex) {
    if (state.player.identity === "流民") { log("流民无法主导国策科研。"); return; }
    const br = TECH_DEFS.branches.find((b) => b.id === branchId);
    const lv = br.levels[levelIndex];
    if (!canResearch(branchId, levelIndex)) { log("无法研究（前置/队列）。"); return; }
    let cost = lv.cost;
    if (state.jointResearchWith) cost = Math.floor(cost / 2);
    if (playerFac().credits < cost) { log("信用点不足。"); return; }
    playerFac().credits -= cost;
    state.player.techQueue = { branchId, levelIndex, left: lv.months, id: lv.id, name: lv.name };
    log(`开始研究：${br.name} · ${lv.name}（${lv.months} 月${state.jointResearchWith ? "·合研" : ""}）`);
    renderTech();
    render();
  }

  function tickResearch() {
    const q = state.player.techQueue;
    if (!q) return;
    q.left--;
    if (q.left <= 0) {
      state.player.techDone[q.id] = true;
      log(`研究完成：${q.name}`);
      codex.techs[q.id] = true;
      saveMeta();
      unlockAchieve("tech1");
      checkTechBranchAchieve();
      if (q.id === "a4") state.player.legitimacy += 5;
      state.player.techQueue = null;
      sfx("event");
    }
  }

  function checkTechBranchAchieve() {
    for (const br of TECH_DEFS.branches || []) {
      if (br.levels.every((lv) => state.player.techDone[lv.id])) {
        unlockAchieve("tech_branch");
        return;
      }
    }
  }

  function renderTech() {
    const el = document.getElementById("tech-panel");
    if (!el) return;
    el.innerHTML = "";
    if (state.player.techQueue) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = `研究中：${state.player.techQueue.name} 剩余 ${state.player.techQueue.left} 月`;
      el.appendChild(p);
    }
    for (const br of TECH_DEFS.branches || []) {
      const box = document.createElement("div");
      box.className = "tech-branch";
      box.innerHTML = `<h4>${br.name}</h4>`;
      br.levels.forEach((lv, i) => {
        const row = document.createElement("div");
        const done = !!state.player.techDone[lv.id];
        const locked = i > 0 && !state.player.techDone[br.levels[i - 1].id];
        row.className = "tech-level" + (done ? " done" : locked ? " locked" : "");
        const info = document.createElement("span");
        info.textContent = `${lv.name} · ${lv.cost}c / ${lv.months}月`;
        row.appendChild(info);
        if (!done && !locked) {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = "研究";
          b.onclick = () => startResearch(br.id, i);
          row.appendChild(b);
        } else {
          const s = document.createElement("span");
          s.textContent = done ? "完成" : "锁定";
          row.appendChild(s);
        }
        box.appendChild(row);
      });
      el.appendChild(box);
    }
  }

  /* ---------- Identity / coup ---------- */
  function setPlayerFaction(fid) {
    const old = state.player.factionId;
    if (old && fac(old) && old !== fid) fac(old).ai = true;
    state.player.factionId = fid;
    if (fac(fid)) fac(fid).ai = false;
  }

  function joinOfficer() {
    if (state.player.identity !== "流民") { log("仅流民申请入仕。"); return; }
    if (!spendAp(1)) return;
    const loc = node(state.player.loc);
    const fid = loc.owner || "fac_free";
    setPlayerFaction(fid);
    state.player.identity = "航官";
    state.player.rank = 3;
    state.player.merit = 5;
    log(`加入 ${fac(fid).name} 任航官。`);
    render();
  }

  function goRaider() {
    if (state.player.identity === "掠航者") return;
    if (!spendAp(1)) return;
    const oldFac = playerFac();
    if (!fac("fac_raider")) {
      state.factions.fac_raider = {
        id: "fac_raider", name: "黑旗中队", color: "#aa4444", ai: false,
        credits: Math.floor((oldFac ? oldFac.credits : 3000) * 0.3),
        manpower: Math.floor((oldFac ? oldFac.manpower : 60) * 0.4),
        rel: {}, allies: [], vassals: [], overlord: null, capital: null,
      };
      for (const id of Object.keys(state.factions)) {
        if (id !== "fac_raider") setRel("fac_raider", id, -15);
      }
    }
    const old = state.player.factionId;
    addRel(old, "fac_raider", -30);
    setPlayerFaction("fac_raider");
    state.player.identity = "掠航者";
    state.player.rank = 0;
    log("你叛逃成为掠航者。");
    document.getElementById("btn-raid").classList.remove("hidden");
    render();
  }

  function foundNation(fromEvent) {
    if (state.player.identity !== "掠航者") { log("仅掠航者建国。"); return; }
    const owned = Object.values(state.nodes).filter((n) => n.owner === state.player.factionId);
    if (!owned.length) { log("需要至少控制 1 颗星。"); return; }
    if (!fromEvent && !spendAp(1)) return;
    state.player.identity = "执政官";
    state.player.rank = 9;
    state.player.legitimacy = 40;
    playerFac().capital = owned[0].id;
    playerFac().name = "黑旗航阀";
    log("建国成功：掠航者→执政官。");
    unlockAchieve("found_nation");
    sfx("win");
    if (state.scenarioId === "raider" || state.player._fromRaiderScenario) {
      tryVictory("found", "黑旗建国成功。航阀法统已登记。");
    }
    renderGoalCompass();
    render();
  }

  function coupPrep() {
    if (state.player.identity !== "航官") { log("仅航官可筹备政变。"); return; }
    if (!spendAp(1)) return;
    state.player.factionPower = (state.player.factionPower || 0) + 10 + Math.floor(state.player.charm / 20);
    log(`政变筹备：派系力=${state.player.factionPower}`);
    render();
  }

  function coupStart() {
    if (state.player.identity !== "航官") return;
    if ((state.player.factionPower || 0) < 40) { log("派系力需 ≥40。"); return; }
    if ((state.player.merit || 0) < 30) { log("功勋需 ≥30。"); return; }
    if (!spendAp(1)) return;
    if (state.player.coupTimer > 0) { log("政变已在倒计时。"); state.ap += 1; return; }
    state.player.coupTimer = 3;
    log("政变倒计时 3 个月！");
    render();
  }

  function tickCoup() {
    if (state.player.identity !== "航官" || state.player.coupTimer <= 0) return;
    state.player.coupTimer--;
    if (state.player.coupTimer > 0) {
      log(`政变倒计时：${state.player.coupTimer}`);
      if (chance(0.2)) {
        log("政变计划泄露，派系力-8。");
        state.player.factionPower -= 8;
      }
      return;
    }
    // resolve coup
    const power = state.player.factionPower + state.player.merit * 0.3 + state.player.command * 0.2;
    const resist = 50 + (playerFac().manpower || 50) * 0.15;
    if (power + rand() * 20 > resist) {
      state.player.identity = "执政官";
      state.player.rank = 9;
      state.player.legitimacy = 35;
      log("政变成功！你成为执政官。");
      unlockAchieve("coup_ok");
      sfx("win");
      if (state.scenarioId === "coup" || state.scenarioFlags.boostCoup) {
        tryVictory("coup", "北阙夜落幕。你已黄袍加身。");
      }
      renderGoalCompass();
    } else {
      state.player.prison = 3;
      state.player.factionPower = 0;
      log("政变失败，你被监禁 3 月。");
    }
  }

  function escapePrison() {
    if (state.player.prison <= 0) { log("你并未监禁。"); return; }
    if (playerFac().credits < 500 && state.player.identity !== "流民") {
      // allow attempt
    }
    if (!spendAp(1)) return;
    if (chance(0.45 + state.player.intel / 200)) {
      state.player.prison = 0;
      unlockAchieve("prison_break");
      if (chance(0.3)) {
        state.player.identity = "流民";
        log("越狱成功，但失去官身成为流民。");
      } else log("越狱成功。");
      sfx("win");
    } else {
      state.player.prison += 1;
      log("越狱失败，刑期+1。");
    }
    render();
  }

  /* ---------- AI v2 ---------- */
  function aiTurn() {
    for (const f of Object.values(state.factions)) {
      if (!f.ai) continue;
      if (f.id === state.player.factionId) continue;

      // recruit utility
      if (f.credits > 2500 && f.manpower < 180 && chance(0.55)) {
        const spend = Math.min(1800, Math.floor(f.credits / 4));
        f.credits -= spend;
        f.manpower += spend / 85;
        log(`【AI】${f.name} 征召。`);
      }

      // claim empty near capital
      if (chance(0.5)) {
        const owned = Object.values(state.nodes).filter((n) => n.owner === f.id);
        const cands = [];
        for (const n of owned) {
          for (const nid of neighbors(n.id)) {
            const m = node(nid);
            if (m && !m.owner) cands.push(m);
          }
        }
        if (cands.length) {
          const t = cands[randi(0, cands.length - 1)];
          t.owner = f.id;
          t.garrison = Math.max(12, f.manpower * 0.1);
          log(`【AI】${f.name} 扩张至 ${t.name}`);
        }
      }

      // diplomacy: ally vs common threat (player strong)
      const playerPower = (() => {
        try { return playerFac().manpower; } catch { return 100; }
      })();
      if (playerPower > f.manpower * 1.2 && chance(0.25)) {
        const others = Object.values(state.factions).filter((x) => x.id !== f.id && x.ai && !areAllied(f.id, x.id));
        if (others.length) {
          const o = others[randi(0, others.length - 1)];
          if ((f.rel[o.id] || 0) > -5) {
            f.allies.push(o.id);
            o.allies.push(f.id);
            log(`【AI】${f.name} 与 ${o.name} 结盟。`);
          }
        }
      }

      // attack utility: never suicide
      if (f.manpower >= 45 && chance(0.4)) {
        const targets = [];
        for (const n of Object.values(state.nodes).filter((x) => x.owner === f.id)) {
          for (const nid of neighbors(n.id)) {
            const m = node(nid);
            if (!m || !m.owner || m.owner === f.id) continue;
            if (areAllied(f.id, m.owner)) continue;
            if (fac(m.owner) && fac(m.owner).overlord === f.id) continue;
            const atk = f.manpower * 0.38;
            let def = m.garrison * m.defense;
            if (m.terrain === "fort") def *= 1.2;
            const threatOwner = fac(m.owner);
            const enemyPower = threatOwner ? threatOwner.manpower : def;
            // utility: prefer weak garrison, prefer player if player not much stronger
            let u = (atk / Math.max(1, def)) * 10;
            if (m.owner === state.player.factionId) u += 3;
            if (atk < def * 0.9) u -= 20; // no suicide
            if (enemyPower > f.manpower * 1.8) u -= 10;
            if (u > 0) targets.push({ m, u, atk, def });
          }
        }
        targets.sort((a, b) => b.u - a.u);
        if (targets.length && targets[0].u > 2) {
          const { m, atk, def } = targets[0];
          const res = resolveReport(atk, def, m);
          log(`【AI】${f.name} 进攻 ${m.name}`);
          applyBattle(res, m, f.id, m.owner);
        }
      }

      // vassal tribute income
      for (const v of f.vassals || []) {
        const vf = fac(v);
        if (!vf) continue;
        const g = Math.min(400, Math.floor(vf.credits * 0.08));
        vf.credits -= g;
        f.credits += g;
      }
    }
  }

  /* ---------- Events ---------- */
  function allEvents() {
    return EVENT_DEFS.concat(MOD_EVENTS);
  }

  function rollEvent() {
    // 基线约 50% 出事件；成人模式提高到约 62%
    if (!chance(isMatureEnabled() ? 0.62 : 0.5)) return;
    const pool = allEvents().filter((e) => {
      if (!eventAllowed(e)) return false;
      if (e.weight === 0) return false;
      if (e.minMonth && state.month < e.minMonth) return false;
      if (e.needSpouse && !state.player.spouse) return false;
      if (e.needAlly && !(playerFac().allies || []).length) return false;
      if (e.needIdentity && state.player.identity !== e.needIdentity) return false;
      if (e.needPrison && state.player.prison <= 0) return false;
      if (e.needTech && !Object.keys(state.player.techDone || {}).length) return false;
      if (e.needIntimacy && maxBond() < (e.needIntimacy || 0)) return false;
      const cd = e.cooldown || e.cooldown_months || 0;
      const last = state.eventCd[e.id] || -999;
      if (state.month - last < cd) return false;
      return true;
    });
    if (!pool.length) return;
    // 成人事件加权
    let total = 0;
    for (const e of pool) {
      let w = e.weight || 1;
      if (isMatureEnabled() && (e.rating === "r18" || (e.title || "").indexOf("成人") >= 0)) w *= 1.35;
      total += w;
      e._w = w;
    }
    let r = rand() * total;
    let pick = pool[0];
    for (const e of pool) {
      r -= e._w || e.weight || 1;
      if (r <= 0) { pick = e; break; }
    }
    state.pendingEvent = pick;
    state.eventCd[pick.id] = state.month;
    log(`【事件】${pick.title}`);
    sfx("event");
    showEvent(pick);
    tutAdvance("event");
  }

  function showEvent(e) {
    const box = document.getElementById("event-box");
    box.classList.remove("hidden");
    document.getElementById("event-title").textContent = "事件：" + e.title;
    document.getElementById("event-text").textContent = e.text;
    const ch = document.getElementById("event-choices");
    ch.innerHTML = "";
    for (const c of e.choices || []) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.text;
      b.onclick = () => chooseEvent(c);
      ch.appendChild(b);
    }
  }
  function hideEvent() {
    document.getElementById("event-box").classList.add("hidden");
  }

  function chooseEvent(c) {
    for (const eff of c.effects || []) applyEffect(eff);
    state.pendingEvent = null;
    hideEvent();
    tutAdvance("event");
    render();
  }

  function worstEnemy() {
    const pf = playerFac();
    let best = null, br = 999;
    for (const id of Object.keys(state.factions)) {
      if (isPlayerFac(id)) continue;
      const r = pf.rel[id] || 0;
      if (r < br) { br = r; best = id; }
    }
    return best;
  }
  function neutralFac() {
    const pf = playerFac();
    let best = null, br = 999;
    for (const id of Object.keys(state.factions)) {
      if (isPlayerFac(id)) continue;
      const r = Math.abs(pf.rel[id] || 0);
      if (r < br) { br = r; best = id; }
    }
    return best;
  }

  function applyEffect(eff) {
    const f = playerFac();
    switch (eff.type) {
      case "credits": f.credits = Math.max(0, f.credits + eff.v); break;
      case "manpower": f.manpower = Math.max(5, f.manpower + eff.v); break;
      case "randCredits": {
        const g = randi(eff.min, eff.max);
        f.credits = Math.max(0, f.credits + g);
        log(`随机收益 ${g}`);
        break;
      }
      case "influence": state.player.influence = (state.player.influence || 0) + eff.v; break;
      case "intel": state.player.intel = (state.player.intel || 0) + eff.v; break;
      case "legitimacy": state.player.legitimacy = (state.player.legitimacy || 0) + eff.v; break;
      case "merit": state.player.merit = (state.player.merit || 0) + eff.v; break;
      case "factionPower": state.player.factionPower = (state.player.factionPower || 0) + eff.v; break;
      case "xp": state.player.xp = (state.player.xp || 0) + eff.v; break;
      case "debt": state.debt = (state.debt || 0) + eff.v; break;
      case "incomeBoost": state.incomeBoost = (state.incomeBoost || 0) + eff.v; break;
      case "techProgress": {
        if (state.player.techQueue) state.player.techQueue.left = Math.max(0, state.player.techQueue.left - (eff.v || 1));
        else log("无研究队列，进度闲置。");
        break;
      }
      case "jointResearch": state.jointResearchWith = state.jointResearchWith || dipTarget() || (playerFac().allies || [])[0]; break;
      case "relWorst": {
        const w = worstEnemy();
        if (w) addRel(state.player.factionId, w, eff.v);
        break;
      }
      case "relNeutral": {
        const n = neutralFac();
        if (n) addRel(state.player.factionId, n, eff.v);
        break;
      }
      case "relAlly": {
        const a = (playerFac().allies || [])[0];
        if (a) addRel(state.player.factionId, a, eff.v);
        break;
      }
      case "escapePrison":
        if (state.player.prison > 0) { state.player.prison = 0; log("你逃出监禁。"); }
        break;
      case "tryFound": foundNation(true); break;
      case "intimacy":
        state.globalIntimacy = clamp((state.globalIntimacy || 0) + (eff.v || 0), 0, 10);
        if (state.player.spouseFac) {
          const ch = CHARACTERS.find((c) => c.faction === state.player.spouseFac);
          if (ch) addBond(ch.id, eff.v || 0);
        }
        break;
      case "intimacyChar":
        addBond(eff.char, eff.v || 0);
        state.globalIntimacy = Math.max(state.globalIntimacy || 0, bondOf(eff.char));
        {
          const ch = CHARACTERS.find((c) => c.id === eff.char);
          if (ch) codexChar(ch.id);
        }
        break;
      case "relSpouse":
        if (state.player.spouseFac) addRel(state.player.factionId, state.player.spouseFac, eff.v || 0);
        break;
      case "rel":
        if (eff.f) addRel(state.player.factionId, eff.f, eff.v || 0);
        break;
      case "arcProgress":
        bumpArc(eff.arc, eff.v || 1);
        break;
      case "setFlag":
        state.storyFlags[eff.flag] = eff.v;
        if (String(eff.flag).indexOf("he_") === 0) {
          unlockAchieve("he_ending");
          toast("HE：" + eff.flag);
        }
        break;
      case "unlockCg":
        unlockCg(eff.slot);
        break;
      case "log": log(eff.t); break;
      default: break;
    }
  }

  /* ---------- End turn ---------- */
  function endTurn() {
    if (state.pendingEvent) { log("请先处理事件。"); return; }
    if (state.hex) { log("请先结束战棋。"); return; }

    const tb = techBonus();
    for (const f of Object.values(state.factions)) {
      let inc = 0;
      for (const n of Object.values(state.nodes)) if (n.owner === f.id) inc += n.income;
      if (f.id === state.player.factionId) {
        inc = Math.floor(inc * tb.incomeMult * (1 + (state.incomeBoost || 0) * 0.05));
        if (state.debt) inc = Math.floor(inc * 0.92);
      }
      f.credits += inc;
      // vassal tax to overlord
      if (f.overlord && fac(f.overlord)) {
        const tax = Math.floor(inc * 0.15);
        f.credits -= tax;
        fac(f.overlord).credits += tax;
      }
    }

    aiTurn();
    tickResearch();
    tickCoup();
    if (state.player.prison > 0) {
      state.player.prison--;
      log(`监禁剩余 ${state.player.prison} 月`);
    }

    state.month += 1;
    state.ap = state.maxAp + (state.player.identity === "执政官" ? 0 : state.player.identity === "航官" ? -1 : -1);
    if (state.player.identity === "执政官") state.ap = 3;
    else if (state.player.identity === "航官") state.ap = 2;
    else if (state.player.identity === "掠航者") state.ap = 3;
    else state.ap = 2;

    log(`结束回合 → 星月 ${state.month}`);
    if (state.month >= 12) unlockAchieve("month_12");
    tutAdvance("end");
    checkHegemonyWin();
    checkWeakMilestone();
    checkGenericGoals();
    rollEvent();
    sfx("turn");
    renderTech();
    renderMeta();
    renderGoalCompass();
    renderIntimacyPanel();
    render();
  }

  function ownedNodeCount() {
    return Object.values(state.nodes).filter((n) => n.owner === state.player.factionId).length;
  }

  function nodeControlRatio() {
    const total = Math.max(1, Object.keys(state.nodes).length);
    return ownedNodeCount() / total;
  }

  function checkHegemonyWin() {
    if (!state.scenarioFlags.winHegemony) return;
    const ratio = nodeControlRatio();
    if (ratio >= 0.8) {
      state.hegemonyStreak = (state.hegemonyStreak || 0) + 1;
      log(`制霸进度：控制 ${(100 * ratio).toFixed(0)}% · 连续 ${state.hegemonyStreak}/3 月`);
      if (state.hegemonyStreak >= 3) {
        unlockAchieve("hegemony");
        tryVictory("hegemony", "你控制了主航道环并稳住局势。制霸胜利！");
      }
    } else {
      state.hegemonyStreak = 0;
    }
  }

  function checkGenericGoals() {
    // 沙盒/中兴：控制过半也可提示接近胜利（不自动胜）
    renderGoalCompass();
  }

  function tryVictory(type, text) {
    if (state.victoryClaimed) return;
    state.victoryClaimed = true;
    showVictory(text, type);
  }

  function showVictory(text, type) {
    const box = document.getElementById("victory-box");
    if (!box) return;
    const en = window.EmberI18n && EmberI18n.getLang() === "en";
    const titles = {
      hegemony: en ? "Hegemony" : "制霸胜利",
      coup: en ? "Coup Success" : "政变胜利",
      found: en ? "Nation Founded" : "建国胜利",
      tutorial: en ? "Tutorial Complete" : "教程完成",
      default: en ? "Victory" : "胜利",
    };
    const badge = document.getElementById("victory-badge");
    if (badge) badge.textContent = (type || "default").toUpperCase();
    document.getElementById("victory-title").textContent = titles[type] || titles.default;
    document.getElementById("victory-text").textContent = text;
    const stats = document.getElementById("victory-stats");
    if (stats) {
      const f = playerFac();
      const owned = ownedNodeCount();
      const total = Object.keys(state.nodes).length;
      stats.innerHTML = [
        `${en ? "Month" : "星月"}: ${state.month}`,
        `${en ? "Identity" : "身份"}: ${state.player.identity}`,
        `${en ? "Faction" : "势力"}: ${f ? f.name : "-"}`,
        `${en ? "Nodes" : "控制节点"}: ${owned} / ${total} (${(100 * owned / Math.max(1, total)).toFixed(0)}%)`,
        `${en ? "Credits / Manpower" : "信用 / 兵力"}: ${f ? f.credits : 0} / ${f ? f.manpower.toFixed(0) : 0}`,
        `${en ? "Scenario" : "剧本"}: ${state.scenarioId}`,
      ].join("<br/>");
    }
    box.classList.remove("hidden");
    sfx("win");
    renderGoalCompass();
  }

  /** 目标罗盘：当前剧本主目标 + 进度条 + 步骤 */
  function getGoalModel() {
    const en = window.EmberI18n && EmberI18n.getLang() === "en";
    const id = state.scenarioId || "sandbox";
    const flags = state.scenarioFlags || {};
    const owned = ownedNodeCount();
    const total = Math.max(1, Object.keys(state.nodes).length);
    const ratio = owned / total;
    const steps = [];
    let primary = "";
    let progress = 0;
    let progressLabel = "";
    let hint = "";

    if (state.tutorial) {
      const st = TUTORIAL_STEPS[state.tutorial.step];
      primary = en ? "Complete the tutorial checklist" : "完成教程清单";
      progress = state.tutorial.step / TUTORIAL_STEPS.length;
      progressLabel = `${state.tutorial.step} / ${TUTORIAL_STEPS.length}`;
      TUTORIAL_STEPS.forEach((s, i) => {
        steps.push({
          text: s.text.replace(/^教程[①-⑩]\s*：/, "").slice(0, 40),
          done: i < state.tutorial.step,
          current: i === state.tutorial.step,
        });
      });
      hint = st ? st.text : "";
    } else if (id === "hegemony" || flags.winHegemony) {
      primary = en ? "Control ≥80% nodes for 3 months" : "控制 ≥80% 节点并维持 3 星月";
      const controlPart = Math.min(1, ratio / 0.8) * 0.7;
      const streakPart = Math.min(3, state.hegemonyStreak || 0) / 3 * 0.3;
      progress = controlPart + (ratio >= 0.8 ? streakPart : 0);
      progressLabel = en
        ? `${(100 * ratio).toFixed(0)}% nodes · streak ${state.hegemonyStreak || 0}/3`
        : `控制 ${(100 * ratio).toFixed(0)}% · 连续 ${state.hegemonyStreak || 0}/3 月`;
      steps.push(
        { text: en ? "Reach 80% control" : "达到 80% 控制", done: ratio >= 0.8, current: ratio < 0.8 },
        { text: en ? "Hold 3 months" : "维持 3 星月", done: (state.hegemonyStreak || 0) >= 3, current: ratio >= 0.8 && (state.hegemonyStreak || 0) < 3 },
      );
      hint = en ? "End turns while holding the ring." : "达标后持续结束回合以累计连续月。";
    } else if (id === "coup" || flags.boostCoup) {
      primary = en ? "Stage a successful coup as officer" : "以航官完成政变并登基";
      const merit = state.player.merit || 0;
      const pow = state.player.factionPower || 0;
      const timer = state.player.coupTimer || 0;
      const isMag = state.player.identity === "执政官";
      progress = isMag ? 1 : Math.min(0.95, (Math.min(merit, 30) / 30) * 0.35 + (Math.min(pow, 40) / 40) * 0.35 + (timer > 0 ? 0.2 : 0) + (timer === 0 && pow >= 40 && merit >= 30 ? 0.1 : 0));
      progressLabel = en
        ? `Merit ${merit}/30 · Faction ${pow}/40 · Timer ${timer || "-"}`
        : `功勋 ${merit}/30 · 派系 ${pow}/40 · 倒计时 ${timer || "—"}`;
      steps.push(
        { text: en ? "Merit ≥30" : "功勋 ≥30", done: merit >= 30, current: merit < 30 },
        { text: en ? "Faction power ≥40" : "派系力 ≥40", done: pow >= 40, current: merit >= 30 && pow < 40 },
        { text: en ? "Start coup timer" : "发动政变倒计时", done: timer > 0 || isMag, current: merit >= 30 && pow >= 40 && timer === 0 && !isMag },
        { text: en ? "Become magistrate" : "成为执政官", done: isMag, current: timer > 0 },
      );
      hint = en ? "Identity tab: prepare & launch coup." : "身份页：政变筹备 → 发动政变。";
    } else if (id === "raider") {
      primary = en ? "Seize a star and found a nation" : "占星并完成掠航建国";
      const isMag = state.player.identity === "执政官";
      const hasLand = owned >= 1;
      progress = isMag ? 1 : (hasLand ? 0.55 : 0.15) + (state.player.identity === "掠航者" ? 0.1 : 0);
      progressLabel = en ? `Nodes ${owned} · Identity ${state.player.identity}` : `节点 ${owned} · 身份 ${state.player.identity}`;
      steps.push(
        { text: en ? "Remain / become raider" : "保持掠航者身份", done: state.player.identity === "掠航者" || isMag, current: state.player.identity !== "掠航者" && !isMag },
        { text: en ? "Control ≥1 node" : "控制 ≥1 节点", done: hasLand || isMag, current: state.player.identity === "掠航者" && !hasLand },
        { text: en ? "Found nation" : "掠航建国", done: isMag, current: hasLand && !isMag },
      );
      hint = en ? "Claim empty stars, then Identity → Found." : "登记无主 → 身份页「掠航建国」。";
    } else if (id === "civilian") {
      primary = en ? "Join service or turn raider, then rise" : "入仕或叛逃，再谋上位";
      const risen = state.player.identity === "执政官" || state.player.identity === "航官" || state.player.identity === "掠航者";
      progress = state.player.identity === "执政官" ? 1 : risen ? 0.5 : 0.1;
      progressLabel = en ? `Identity: ${state.player.identity}` : `身份：${state.player.identity}`;
      steps.push(
        { text: en ? "Leave pure civilian" : "脱离纯流民", done: risen, current: !risen },
        { text: en ? "Optional: coup or found" : "可选：政变或建国", done: state.player.identity === "执政官", current: risen && state.player.identity !== "执政官" },
      );
      hint = en ? "Identity tab: join officer / go raider." : "身份页：申请入仕或叛逃掠航。";
    } else if (id === "weak" || flags.weakStart) {
      primary = en ? "Rebuild: hold ≥25% of the sector" : "中兴：控制星域 ≥25% 节点";
      progress = Math.min(1, ratio / 0.25);
      progressLabel = en ? `${owned}/${total} (${(100 * ratio).toFixed(0)}%)` : `${owned}/${total}（${(100 * ratio).toFixed(0)}%）`;
      steps.push(
        { text: en ? "Survive & grow economy" : "存活并发展经济", done: (playerFac().credits || 0) >= 8000, current: (playerFac().credits || 0) < 8000 },
        { text: en ? "Control 25% nodes" : "控制 25% 节点", done: ratio >= 0.25, current: ratio < 0.25 },
      );
      hint = en ? "Ally Free Port, expand carefully." : "可联姻/结盟自由港，稳健扩张。";
      if (ratio >= 0.25 && !state.victoryClaimed) {
        // soft victory optional - only once when crossing
      }
    } else {
      // sandbox / default
      primary = en ? "Sandbox: set your own goal (suggested: 50% control)" : "沙盒：自定目标（建议控制 50% 节点）";
      progress = Math.min(1, ratio / 0.5);
      progressLabel = en ? `${owned}/${total} (${(100 * ratio).toFixed(0)}%)` : `${owned}/${total}（${(100 * ratio).toFixed(0)}%）`;
      steps.push(
        { text: en ? "Explore & fight" : "探索与交战", done: owned >= 3, current: owned < 3 },
        { text: en ? "Suggested 50% control" : "建议控制 50%", done: ratio >= 0.5, current: owned >= 3 && ratio < 0.5 },
      );
      hint = en ? "No forced win. Use scenarios for clear victories." : "无强制胜利；制霸/政变等剧本有明确胜负。";
    }

    if (state.victoryClaimed) {
      primary = en ? "Victory achieved — continue or return to menu" : "已达成胜利 — 可继续游玩或返回选单";
      progress = 1;
      progressLabel = en ? "Complete" : "已完成";
    }

    return { primary, progress: clamp(progress, 0, 1), progressLabel, steps, hint };
  }

  function renderGoalCompass() {
    const box = document.getElementById("goal-compass");
    if (!box || !state.player) return;
    const en = window.EmberI18n && EmberI18n.getLang() === "en";
    const model = getGoalModel();
    const title = document.getElementById("goal-title");
    if (title) title.textContent = en ? "Goal Compass" : "目标罗盘";
    const primary = document.getElementById("goal-primary");
    if (primary) primary.textContent = model.primary;
    const bar = document.getElementById("goal-bar");
    if (bar) bar.style.width = `${(model.progress * 100).toFixed(1)}%`;
    const prog = document.getElementById("goal-progress");
    if (prog) prog.textContent = (en ? "Progress: " : "进度：") + model.progressLabel;
    const ul = document.getElementById("goal-steps");
    if (ul) {
      ul.innerHTML = model.steps.map((s) => {
        const cls = s.done ? "done" : s.current ? "current" : "";
        const mark = s.done ? "✓ " : s.current ? "→ " : "○ ";
        return `<li class="${cls}">${mark}${s.text}</li>`;
      }).join("");
    }
    const hint = document.getElementById("goal-hint");
    if (hint) hint.textContent = model.hint || "";
  }

  function checkWeakMilestone() {
    if (state.victoryClaimed) return;
    if (!(state.scenarioId === "weak" || state.scenarioFlags.weakStart)) return;
    if (nodeControlRatio() < 0.25) return;
    const en = window.EmberI18n && EmberI18n.getLang() === "en";
    tryVictory("default", en ? "Weak Revival milestone: 25% sector held." : "中兴里程碑：已控制 25% 星域。");
  }

  /* ---------- Save / Load ---------- */
  function serialize() {
    return {
      version: VERSION,
      month: state.month,
      ap: state.ap,
      seed: state.seed,
      rngState: state.rngState,
      factions: state.factions,
      nodes: state.nodes,
      edges: state.edges,
      player: state.player,
      eventCd: state.eventCd,
      jointResearchWith: state.jointResearchWith,
      incomeBoost: state.incomeBoost,
      debt: state.debt,
      log: state.log.slice(-80),
      selected: state.selected,
      tutorial: state.tutorial,
      scenarioId: state.scenarioId,
      scenarioFlags: state.scenarioFlags,
      hegemonyStreak: state.hegemonyStreak,
      metChars: state.metChars,
      hexWins: state.hexWins,
      bonds: state.bonds,
      globalIntimacy: state.globalIntimacy,
      harem: state.harem,
      matureEnabled: state.matureEnabled,
      maturePackLoaded: state.maturePackLoaded,
      arcProgress: state.arcProgress,
      storyFlags: state.storyFlags,
      unlockedCgs: state.unlockedCgs,
      haremFav: state.haremFav,
      haremSchedule: state.haremSchedule,
      harem: state.harem,
    };
  }

  function applySave(data) {
    if (!data || !data.player) { log("存档无效。"); return; }
    Object.assign(state, {
      month: data.month,
      ap: data.ap,
      seed: data.seed,
      rngState: data.rngState,
      factions: data.factions,
      nodes: data.nodes,
      edges: data.edges,
      player: data.player,
      eventCd: data.eventCd || {},
      jointResearchWith: data.jointResearchWith,
      incomeBoost: data.incomeBoost || 0,
      debt: data.debt || 0,
      log: data.log || [],
      selected: data.selected,
      tutorial: data.tutorial,
      scenarioId: data.scenarioId || "sandbox",
      scenarioFlags: data.scenarioFlags || {},
      hegemonyStreak: data.hegemonyStreak || 0,
      metChars: data.metChars || {},
      hexWins: data.hexWins || 0,
      bonds: data.bonds || {},
      globalIntimacy: data.globalIntimacy || 0,
      harem: data.harem || [],
      matureEnabled: !!data.matureEnabled || state.matureEnabled,
      maturePackLoaded: !!data.maturePackLoaded,
      arcProgress: data.arcProgress || {},
      storyFlags: data.storyFlags || {},
      unlockedCgs: data.unlockedCgs || { generic_night: true },
      haremFav: data.haremFav || "",
      haremSchedule: data.haremSchedule || {},
      harem: data.harem || [],
      pendingEvent: null,
      hex: null,
      pendingBattle: null,
    });
    hideEvent();
    hideHex();
    cancelBattle();
    showApp(true);
    if (state.matureEnabled && !state.maturePackLoaded) loadMatureSkeletonPack();
    renderArcPanel();
    renderHaremPanel();
    renderCgPanel();
    if (state.tutorial) showTutorial(); else hideTutorial();
    const ban = document.getElementById("scenario-banner");
    if (ban) {
      const sc = SCENARIOS.find((s) => s.id === state.scenarioId);
      ban.classList.remove("hidden");
      ban.textContent = sc ? (window.EmberI18n ? EmberI18n.nameOf(sc) : sc.name_zh) : state.scenarioId;
    }
    refreshDipSelect();
    renderTech();
    renderMeta();
    const el = document.getElementById("log");
    el.textContent = state.log.join("\n");
    log("读档完成。");
    render();
  }

  function saveSlot(i) {
    try {
      localStorage.setItem(SAVE_PREFIX + i, JSON.stringify(serialize()));
      log(`已写入存档槽 ${i}`);
      updateSaveMeta();
    } catch (e) {
      log("存档失败：" + e.message);
    }
  }
  function loadSlot(i) {
    try {
      const raw = localStorage.getItem(SAVE_PREFIX + i);
      if (!raw) { log(`槽 ${i} 空。`); return; }
      applySave(JSON.parse(raw));
    } catch (e) {
      log("读档失败：" + e.message);
    }
  }
  function updateSaveMeta() {
    const el = document.getElementById("save-meta");
    if (!el) return;
    const bits = [1, 2, 3].map((i) => {
      const raw = localStorage.getItem(SAVE_PREFIX + i);
      if (!raw) return `槽${i}:空`;
      try {
        const d = JSON.parse(raw);
        return `槽${i}:月${d.month}/${d.player && d.player.identity}`;
      } catch { return `槽${i}:损`; }
    });
    el.textContent = bits.join(" · ");
  }

  /* ---------- Map draw / pan zoom ---------- */
  let _mapRaf = 0;
  function drawMap() {
    if (_mapRaf) return;
    _mapRaf = requestAnimationFrame(() => {
      _mapRaf = 0;
      drawMapNow();
    });
  }
  function drawMapNow() {
    const canvas = document.getElementById("map");
    const wrap = document.getElementById("map-wrap");
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth || 900;
    const h = wrap.clientHeight || 520;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0d131c";
    ctx.fillRect(0, 0, w, h);

    const { scale, ox, oy } = state.mapView;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    for (const [a, b] of state.edges) {
      const na = node(a), nb = node(b);
      if (!na || !nb) continue;
      ctx.strokeStyle = "rgba(80,100,120,0.75)";
      ctx.lineWidth = 1.5 / scale;
      ctx.beginPath();
      ctx.moveTo(na.x, na.y);
      ctx.lineTo(nb.x, nb.y);
      ctx.stroke();
    }
    for (const n of Object.values(state.nodes)) {
      let col = "#555";
      if (n.owner && fac(n.owner)) col = fac(n.owner).color;
      if (n.id === state.selected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 22, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      if (n.terrain === "nebula") {
        ctx.strokeStyle = "#a6f"; ctx.lineWidth = 2; ctx.stroke();
      } else if (n.terrain === "fort") {
        ctx.strokeStyle = "#c44"; ctx.lineWidth = 2; ctx.stroke();
      } else {
        ctx.strokeStyle = "#aaa"; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.fillStyle = "#e8eef5";
      ctx.font = `${12 / Math.sqrt(scale)}px sans-serif`;
      ctx.fillText(n.name, n.x - 20, n.y - 18);
      if (state.player && state.player.loc === n.id) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffe066";
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function mapEventToWorld(clientX, clientY) {
    const canvas = document.getElementById("map");
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { scale, ox, oy } = state.mapView;
    return { x: (x - ox) / scale, y: (y - oy) / scale };
  }

  function selectAt(wx, wy) {
    let best = null, bd = 22 * 22;
    for (const n of Object.values(state.nodes)) {
      const d = (n.x - wx) ** 2 + (n.y - wy) ** 2;
      if (d < bd) { bd = d; best = n.id; }
    }
    if (best) {
      state.selected = best;
      render();
    }
  }

  /* ---------- Render ---------- */
  function refreshDipSelect() {
    const sel = document.getElementById("dip-target");
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = "";
    for (const f of Object.values(state.factions)) {
      if (f.id === state.player.factionId) continue;
      const o = document.createElement("option");
      o.value = f.id;
      o.textContent = `${f.name} (关系${playerFac().rel[f.id] || 0})`;
      sel.appendChild(o);
    }
    if (cur && fac(cur)) sel.value = cur;
  }

  function render() {
    const f = playerFac();
    const n = node(state.selected);
    const q = state.player.techQueue;
    document.getElementById("status").textContent = [
      `星月 ${state.month}  AP ${state.ap}  v${VERSION}`,
      `${state.player.identity} · ${f.name}`,
      `信用 ${f.credits}  兵力 ${f.manpower.toFixed(0)}`,
      `位置 ${node(state.player.loc) ? node(state.player.loc).name : "?"}`,
      `功勋${state.player.merit || 0} 派系${state.player.factionPower || 0} 正统${state.player.legitimacy || 0}`,
      `联姻:${state.player.spouse || "无"} 研究:${q ? q.name + "/" + q.left : "无"}`,
      state.player.prison > 0 ? `监禁${state.player.prison}月` : `同盟${(f.allies || []).length} 从属${(f.vassals || []).length}`,
    ].join("\n");

    if (n) {
      const on = n.owner ? (fac(n.owner) ? fac(n.owner).name : n.owner) : "无主";
      document.getElementById("selected").textContent =
        `${n.name} (${n.id})\n所属:${on}\n驻军${n.garrison.toFixed(0)} 收入${n.income}\n地形:${terrainName(n.terrain)} 防御×${n.defense.toFixed(2)}`;
    }

    document.getElementById("identity-hint").textContent =
      `当前身份：${state.player.identity}。流民可入仕；航官可政变；掠航者可建国。`;
    const raidBtn = document.getElementById("btn-raid");
    if (raidBtn) raidBtn.classList.toggle("hidden", state.player.identity !== "掠航者");

    refreshDipSelect();
    updateSaveMeta();
    renderGoalCompass();
    updateMatureUi();
    renderIntimacyPanel();
    renderArcPanel();
    renderHaremPanel();
    renderCgPanel();
    drawMap();
    if (state.hex) drawHex();
  }

  /* ---------- UI bind ---------- */
  function bind() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
        if (tab.dataset.tab === "tech") renderTech();
        if (tab.dataset.tab === "meta") renderMeta();
        if (tab.dataset.tab === "harem") renderHaremPanel();
        if (tab.dataset.tab === "cg") renderCgPanel();
        if (tab.dataset.tab === "id") { renderIntimacyPanel(); renderArcPanel(); }
        sfx("click");
      };
    });

    document.querySelectorAll(".meta-tab").forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll(".meta-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        ["ach", "char", "codex"].forEach((id) => {
          const el = document.getElementById("meta-" + id);
          if (el) el.classList.toggle("hidden", tab.dataset.meta !== id);
        });
        renderMeta();
      };
    });

    on("btn-move", () => moveTo(state.selected));
    on("btn-attack", requestAttack);
    on("btn-claim", claim);
    on("btn-raid", raid);
    on("btn-end", endTurn);
    on("btn-ally", ally);
    on("btn-break", breakAlly);
    on("btn-vassal", vassal);
    on("btn-tribute", tribute);
    on("btn-marry", marry);
    on("btn-joint", jointResearch);
    on("btn-join-officer", joinOfficer);
    on("btn-go-raider", goRaider);
    on("btn-found", () => foundNation(false));
    on("btn-coup-prep", coupPrep);
    on("btn-coup-start", coupStart);
    on("btn-escape", escapePrison);
    on("btn-tut", () => startScenarioById("tutorial"));
    on("btn-sandbox", () => {
      const pick = window.prompt("1执政官 2航官 3流民 4掠航者", "1");
      const map = { 1: "magistrate", 2: "officer", 3: "civilian", 4: "raider" };
      newGame({ mode: map[pick] || "magistrate", scenarioId: "sandbox" });
    });
    // 静态 HTML 备用卡片（JS 重绘前也可点）
    document.querySelectorAll("[data-static-sc]").forEach((btn) => {
      btn.addEventListener("click", () => startScenarioById(btn.getAttribute("data-static-sc")));
    });
    on("boot-retry", async () => {
      try {
        await loadData();
        renderScenarioList();
        applyI18nUi();
      } catch (e) {
        showBootError("加载失败：" + (e && e.message ? e.message : e));
      }
    });
    const btnMenu = document.getElementById("btn-menu");
    if (btnMenu) btnMenu.onclick = () => {
      hideHex(); hideEvent(); cancelBattle();
      showApp(false);
      renderScenarioList();
      sfx("click");
    };
    const btnHexSand = document.getElementById("btn-hex-sandbox");
    if (btnHexSand) btnHexSand.onclick = openHexSandbox;
    const btnLang = document.getElementById("btn-lang");
    if (btnLang) btnLang.onclick = () => {
      if (!window.EmberI18n) return;
      EmberI18n.setLang(EmberI18n.getLang() === "en" ? "zh" : "en");
      applyI18nUi();
      renderMeta();
      render();
      sfx("click");
    };
    const btnSfx = document.getElementById("btn-sfx");
    if (btnSfx) btnSfx.onclick = () => {
      if (!window.EmberAudio) return;
      EmberAudio.setEnabled(!EmberAudio.isEnabled());
      updateAudioButtons();
    };
    const btnBgm = document.getElementById("btn-bgm");
    if (btnBgm) btnBgm.onclick = () => {
      if (!window.EmberAudio) return;
      EmberAudio.ensure();
      EmberAudio.setBgm(!EmberAudio.isBgm());
      if (EmberAudio.isBgm()) EmberAudio.startBgm();
      updateAudioButtons();
    };
    const bootLang = document.getElementById("boot-lang");
    if (bootLang) bootLang.onclick = () => {
      if (!window.EmberI18n) return;
      EmberI18n.setLang(EmberI18n.getLang() === "en" ? "zh" : "en");
      applyI18nUi();
    };
    const bootAudio = document.getElementById("boot-audio");
    if (bootAudio) bootAudio.onclick = () => {
      if (!window.EmberAudio) return;
      EmberAudio.setEnabled(!EmberAudio.isEnabled());
      updateAudioButtons();
    };
    const bootBgm = document.getElementById("boot-bgm");
    if (bootBgm) bootBgm.onclick = () => {
      if (!window.EmberAudio) return;
      EmberAudio.ensure();
      EmberAudio.setBgm(!EmberAudio.isBgm());
      if (EmberAudio.isBgm()) EmberAudio.startBgm();
      updateAudioButtons();
    };
    const btnVic = document.getElementById("btn-victory-ok");
    if (btnVic) btnVic.onclick = () => {
      document.getElementById("victory-box").classList.add("hidden");
      showApp(false);
      renderScenarioList();
    };
    on("btn-victory-continue", () => {
      const box = document.getElementById("victory-box");
      if (box) box.classList.add("hidden");
      // 允许继续游玩，不再重复弹同一胜利直到新条件
      log("继续本周目。目标罗盘仍显示已完成。");
      renderGoalCompass();
    });
    on("btn-goal-toggle", () => {
      const g = document.getElementById("goal-compass");
      if (g) g.classList.toggle("collapsed");
    });
    on("btn-mature", () => {
      if (isMatureEnabled()) {
        enableMature(false);
      } else {
        openAgeGate(() => {});
      }
    });
    on("btn-mod-r18-skel", () => {
      if (!isMatureEnabled()) {
        openAgeGate(() => loadMatureSkeletonPack());
      } else {
        loadMatureSkeletonPack();
      }
    });
    for (let i = 1; i <= 3; i++) {
      on("btn-save" + i, () => saveSlot(i));
      on("btn-load" + i, () => loadSlot(i));
    }
    on("btn-export", exportSave);
    on("btn-import", () => {
      const inp = document.getElementById("import-file");
      if (inp) inp.click();
    });
    const importFile = document.getElementById("import-file");
    if (importFile) {
      importFile.onchange = (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (f) importSaveFile(f);
        importFile.value = "";
      };
    }
    on("btn-battle-report", () => confirmBattle("report"));
    on("btn-battle-hex", () => confirmBattle("hex"));
    on("btn-battle-cancel", cancelBattle);
    on("btn-hex-end", hexEndTurn);
    on("btn-hex-flee", hexFlee);

    on("btn-toggle-left", () => {
      const p = document.getElementById("left-panel");
      if (p) { p.classList.toggle("mobile-hide"); p.classList.toggle("collapsed"); }
    });
    on("btn-toggle-right", () => {
      const p = document.getElementById("right-panel");
      if (p) { p.classList.toggle("mobile-hide"); p.classList.toggle("collapsed"); }
    });

    const modFile = document.getElementById("mod-file");
    if (modFile) {
      modFile.onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          loadMod(JSON.parse(text));
        } catch (e) { log("模组解析失败：" + e.message); }
      };
    }
    on("btn-mod-example", async () => {
      try {
        const r = await fetch("data/mods/example-mod.json");
        loadMod(await r.json());
      } catch (e) {
        loadMod({
          id: "inline", name: "内置示例",
          events: [{
            id: "mod_coffee", title: "【模组】咖啡因危机", weight: 5, cooldown: 8,
            text: "咖啡机协议崩溃。",
            choices: [
              { id: "a", text: "拨款-200", effects: [{ type: "credits", v: -200 }, { type: "manpower", v: 2 }] },
              { id: "b", text: "喝茶", effects: [{ type: "manpower", v: -1 }] },
            ],
          }],
        });
      }
    });

    // map pan zoom
    const canvas = document.getElementById("map");
    let dragging = false, lx = 0, ly = 0;
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("dragging");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      state.mapView.ox += e.clientX - lx;
      state.mapView.oy += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      drawMap();
    });
    canvas.addEventListener("pointerup", (e) => {
      const dx = e.clientX - lx, dy = e.clientY - ly;
      dragging = false;
      canvas.classList.remove("dragging");
      // if minimal move, treat as click
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
        // need last down - simplify: always select on up if not panned much stored
      }
    });
    let downPos = null;
    canvas.addEventListener("pointerdown", (e) => { downPos = { x: e.clientX, y: e.clientY }; }, true);
    canvas.addEventListener("pointerup", (e) => {
      if (!downPos) return;
      if (Math.abs(e.clientX - downPos.x) < 5 && Math.abs(e.clientY - downPos.y) < 5) {
        const w = mapEventToWorld(e.clientX, e.clientY);
        selectAt(w.x, w.y);
      }
      downPos = null;
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      state.mapView.scale = clamp(state.mapView.scale * factor, 0.4, 2.5);
      drawMap();
    }, { passive: false });

    // pinch
    let pinch = null;
    canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        pinch = { d, scale: state.mapView.scale };
      }
    }, { passive: true });
    canvas.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        state.mapView.scale = clamp(pinch.scale * (d / pinch.d), 0.4, 2.5);
        drawMap();
      }
    }, { passive: true });

    document.getElementById("hex").onclick = (ev) => {
      const c = document.getElementById("hex");
      const r = c.getBoundingClientRect();
      hexClick((ev.clientX - r.left) * (c.width / r.width), (ev.clientY - r.top) * (c.height / r.height));
    };

    window.addEventListener("resize", () => drawMap());
  }

  function loadMod(mod, opts) {
    if (!mod) return false;
    opts = opts || {};
    const requiresAge = mod.requiresAge || (mod.rating === "r18" ? 18 : 0);
    if (requiresAge >= 18 && !isMatureEnabled() && !opts.skipAgeCheck) {
      openAgeGate(() => loadMod(mod, { skipAgeCheck: true }));
      return false;
    }
    const evs = (mod.events || []).filter((e) => {
      // always register; roll filter uses eventAllowed
      return true;
    });
    // replace same id events from previous load of this mod
    if (mod.id) {
      MOD_EVENTS = MOD_EVENTS.filter((e) => e._modId !== mod.id);
    }
    for (const e of evs) {
      e._modId = mod.id || "mod";
      MOD_EVENTS.push(e);
    }
    if (mod.relationships) state.relationshipHooks = mod.relationships;
    if (mod.rating === "r18" || requiresAge >= 18) {
      state.maturePackLoaded = true;
      updateMatureUi();
    }
    log(`已加载模组：${mod.name || mod.id || "未命名"}（+${evs.length} 事件${mod.rating ? " · " + mod.rating : ""}）`);
    unlockAchieve("mod_loaded");
    return true;
  }

  function openAgeGate(onYes) {
    const gate = document.getElementById("age-gate");
    if (!gate) {
      if (window.confirm("确认已满 18 岁并启用 R18 接口？")) {
        enableMature(true);
        if (onYes) onYes();
      }
      return;
    }
    gate.classList.remove("hidden");
    const yes = document.getElementById("btn-age-yes");
    const no = document.getElementById("btn-age-no");
    const cleanup = () => {
      gate.classList.add("hidden");
      if (yes) yes.onclick = null;
      if (no) no.onclick = null;
    };
    if (yes) {
      yes.onclick = () => {
        enableMature(true);
        cleanup();
        // enableMature 会自动 load 包；仍执行回调
        if (onYes) onYes();
      };
    }
    if (no) no.onclick = () => cleanup();
  }

  function enableMature(on) {
    state.matureEnabled = !!on;
    try { localStorage.setItem(MATURE_KEY, on ? "1" : "0"); } catch (_) {}
    updateMatureUi();
    log(on ? "已启用成人内容（18+）。结束回合可能触发情欲事件；身份页可召见。" : "已关闭成人内容。");
    if (on && !state.maturePackLoaded) {
      loadMatureSkeletonPack();
    }
    renderIntimacyPanel();
  }

  function updateMatureUi() {
    const btn = document.getElementById("btn-mature");
    const st = document.getElementById("mature-status");
    const on = isMatureEnabled();
    if (btn) btn.textContent = on ? "成人内容：开" : "成人内容：关";
    if (st) {
      st.textContent = on
        ? (state.maturePackLoaded
          ? "内容分级：18+ 已加载（联姻之夜/召见/后舱等）。仅限成年角色。"
          : "内容分级：已确认 18+，正在/可加载成人包。")
        : "内容分级：全年龄主包。可在系统页开启成人内容。";
    }
  }

  async function loadMatureSkeletonPack() {
    try {
      const r = await fetch("mods/mature-r18/mod.json");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const mod = await r.json();
      loadMod(mod, { skipAgeCheck: isMatureEnabled() });
    } catch (e) {
      console.warn("mature pack fetch", e);
      // 极简内置回退（保证离线也能有成人事件）
      loadMod({
        id: "mature-r18",
        name: "余烬·夜航（内置）",
        requiresAge: 18,
        rating: "r18",
        events: [
          {
            id: "r18_inline_night",
            title: "【成人】旗舰深夜",
            weight: 12,
            cooldown: 3,
            rating: "r18",
            text: "值班结束后有人敲你的舱门。成年船员站在门口，制服只扣了一半：「指令是……自愿的。」",
            choices: [
              { id: "yes", text: "拉进门", effects: [{ type: "intimacy", v: 2 }, { type: "log", t: "一整夜。通讯官学会装瞎。" }] },
              { id: "no", text: "拒绝", effects: [{ type: "legitimacy", v: 2 }, { type: "log", t: "门关上了。" }] },
            ],
          },
        ],
        relationships: { enabled: true, levels: ["stranger", "acquaintance", "trusted", "bonded", "intimate", "lover"] },
      }, { skipAgeCheck: true });
    }
  }

  function drawPortrait(canvas, ch) {
    if (!canvas || !ch) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = 56;
    const h = canvas.height = 56;
    const seed = ch.seed || 1;
    const hue = ch.hue == null ? 200 : ch.hue;
    ctx.fillStyle = `hsl(${hue}, 25%, 12%)`;
    ctx.fillRect(0, 0, w, h);
    // stars
    for (let i = 0; i < 12; i++) {
      const x = (seed * 17 + i * 13) % w;
      const y = (seed * 31 + i * 19) % h;
      ctx.fillStyle = `hsla(${hue}, 40%, 70%, 0.35)`;
      ctx.fillRect(x, y, 1, 1);
    }
    // head
    ctx.beginPath();
    ctx.arc(28, 24, 12, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 35%, ${38 + (seed % 10)}%)`;
    ctx.fill();
    // shoulders
    ctx.beginPath();
    ctx.ellipse(28, 48, 18, 12, 0, Math.PI, 0);
    ctx.fillStyle = `hsl(${(hue + 40) % 360}, 40%, 28%)`;
    ctx.fill();
    // visor line
    ctx.strokeStyle = `hsl(${hue}, 70%, 60%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 24);
    ctx.lineTo(38, 24);
    ctx.stroke();
  }

  function renderMeta() {
    const achEl = document.getElementById("meta-ach");
    const charEl = document.getElementById("meta-char");
    const codexEl = document.getElementById("meta-codex");
    if (!achEl) return;
    const en = window.EmberI18n && EmberI18n.getLang() === "en";
    achEl.innerHTML = ACH_DEFS.map((a) => {
      const ok = !!unlockedAch[a.id];
      const name = en ? (a.name_en || a.name_zh) : (a.name_zh || a.name_en);
      const desc = en ? (a.desc_en || a.desc_zh) : (a.desc_zh || a.desc_en);
      return `<div class="ach-item ${ok ? "unlocked" : "locked"}"><strong>${ok ? "✓ " : "○ "}${name}</strong><br/><span class="muted">${desc}</span></div>`;
    }).join("") || "<p class='hint'>…</p>";

    if (charEl) {
      charEl.innerHTML = "";
      for (const ch of CHARACTERS) {
        const known = codex.chars[ch.id] || ch.faction === "player";
        const card = document.createElement("div");
        card.className = "char-card";
        const cv = document.createElement("canvas");
        cv.width = 56; cv.height = 56;
        if (known) drawPortrait(cv, ch);
        else {
          const c = cv.getContext("2d");
          c.fillStyle = "#1a1a1a"; c.fillRect(0, 0, 56, 56);
          c.fillStyle = "#666"; c.font = "20px sans-serif"; c.fillText("?", 22, 34);
        }
        const info = document.createElement("div");
        const name = known ? (en ? ch.name_en : ch.name_zh) : (en ? "Unknown" : "未知");
        const role = known ? (en ? ch.role_en : ch.role_zh) : "???";
        const bio = known ? (en ? ch.bio_en : ch.bio_zh) : (en ? "Meet them in play." : "在游玩中遭遇后解锁。");
        info.innerHTML = `<h4>${name}</h4><div class="muted">${role}</div><div>${bio}</div>`;
        card.appendChild(cv);
        card.appendChild(info);
        charEl.appendChild(card);
      }
    }

    if (codexEl) {
      const nc = Object.keys(codex.nodes || {}).length;
      const fc = Object.keys(codex.factions || {}).length;
      const tc = Object.keys(codex.techs || {}).length;
      const ac = Object.keys(unlockedAch).length;
      codexEl.innerHTML = `
        <div class="codex-item">${en ? "Nodes visited" : "造访节点"}: ${nc} / 36</div>
        <div class="codex-item">${en ? "Factions" : "势力"}: ${fc}</div>
        <div class="codex-item">${en ? "Techs logged" : "科技记录"}: ${tc}</div>
        <div class="codex-item">${en ? "Achievements" : "成就"}: ${ac} / ${ACH_DEFS.length}</div>
        <div class="codex-item">${en ? "Hex wins (run)" : "本局战棋胜"}: ${state.hexWins || 0}</div>
        <div class="codex-item muted">${en ? "Codex persists across runs." : "图鉴跨周目保留。"}</div>`;
    }
  }

  function applyI18nUi() {
    if (!window.EmberI18n) return;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (k) el.textContent = EmberI18n.t(k);
    });
    const title = document.getElementById("ui-title");
    const bootTitle = document.getElementById("boot-title");
    if (title) title.textContent = EmberI18n.t("title");
    if (bootTitle) bootTitle.textContent = EmberI18n.t("title");
    const sub = document.getElementById("boot-sub");
    if (sub) sub.textContent = EmberI18n.getLang() === "en" ? "P2 · Choose a scenario" : "P2 · 选择剧本开始";
    const uiSub = document.getElementById("ui-sub");
    if (uiSub) uiSub.innerHTML = EmberI18n.t("subtitle") + ' · <a href="https://github.com/itoulee/ember-hegemony" target="_blank" rel="noopener">GitHub</a>';
    renderScenarioList();
    updateAudioButtons();
  }

  function renderScenarioList() {
    const list = document.getElementById("scenario-list");
    if (!list) return;
    const pack = SCENARIOS && SCENARIOS.length ? SCENARIOS : BUILTIN_SCENARIOS;
    list.innerHTML = "";
    if (!pack.length) {
      list.innerHTML = "<p class='hint'>无可用剧本。请点「重新加载列表」。</p>";
      return;
    }
    for (const sc of pack) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "scenario-card";
      card.setAttribute("data-sc-id", sc.id);
      const name = window.EmberI18n ? EmberI18n.nameOf(sc) : sc.name_zh;
      const desc = window.EmberI18n ? EmberI18n.descOf(sc) : sc.desc_zh;
      card.innerHTML = `<h3>${name}</h3><p>${desc}</p>`;
      card.onclick = () => startScenarioById(sc.id);
      list.appendChild(card);
    }
    const err = document.getElementById("boot-error");
    if (err) err.classList.add("hidden");
  }

  function showBootError(msg) {
    const err = document.getElementById("boot-error");
    if (!err) return;
    err.textContent = msg;
    err.classList.remove("hidden");
  }

  function on(id, fn) {
    const el = document.getElementById(id);
    if (el) el.onclick = fn;
    return el;
  }

  function updateAudioButtons() {
    const a = window.EmberAudio;
    if (!a) return;
    const sfxBtn = document.getElementById("btn-sfx");
    const bgmBtn = document.getElementById("btn-bgm");
    const bootA = document.getElementById("boot-audio");
    const bootB = document.getElementById("boot-bgm");
    const on = a.isEnabled();
    const bgm = a.isBgm();
    if (sfxBtn) sfxBtn.textContent = (window.EmberI18n && EmberI18n.getLang() === "en" ? "SFX:" : "音效:") + (on ? "ON" : "OFF");
    if (bgmBtn) bgmBtn.textContent = "BGM:" + (bgm ? "ON" : "OFF");
    if (bootA) bootA.textContent = (window.EmberI18n && EmberI18n.getLang() === "en" ? "SFX:" : "音效:") + (on ? "ON" : "OFF");
    if (bootB) bootB.textContent = "BGM:" + (bgm ? "ON" : "OFF");
  }

  function openHexSandbox() {
    if (!state.rngState) seedRng(Date.now() & 0xffffffff);
    if (!state.player || !Object.keys(state.nodes).length) {
      buildWorld("magistrate");
    }
    const fake = {
      id: "sandbox", name: "沙盘", terrain: chance(0.5) ? "nebula" : "fort",
      owner: "fac_cold", garrison: 50, defense: 1,
    };
    // ensure cold exists
    if (!fac("fac_cold")) {
      state.factions.fac_cold = {
        id: "fac_cold", name: "冷环", color: "#3d8bfd", ai: true,
        credits: 1, manpower: 1, rel: {}, allies: [], vassals: [], overlord: null, capital: null,
      };
    }
    startHex(fake, 100, 90);
    if (state.hex) {
      state.hex.sandbox = true;
      state.hex.log.push("沙盘模式：胜负不写回星图。练地形与射程。");
      document.getElementById("hex-hint").textContent = "沙盘 · 不改战略层";
    }
    showApp(true);
    sfx("click");
  }

  async function loadData() {
    loadMeta();
    try {
      const er = await fetch("data/events.json");
      const ej = await er.json();
      EVENT_DEFS = ej.events || ej;
    } catch {
      EVENT_DEFS = [
        { id: "fallback", title: "中继残响", weight: 10, cooldown: 3, text: "信标闪烁。", choices: [
          { id: "a", text: "+600", effects: [{ type: "credits", v: 600 }] },
          { id: "b", text: "忽略", effects: [] },
        ] },
      ];
    }
    try {
      const tr = await fetch("data/tech.json");
      TECH_DEFS = await tr.json();
    } catch {
      TECH_DEFS = { branches: [] };
    }
    try {
      const sr = await fetch("data/scenarios.json");
      if (!sr.ok) throw new Error("scenarios HTTP " + sr.status);
      const list = (await sr.json()).scenarios || [];
      if (list.length) SCENARIOS = list;
      else SCENARIOS = BUILTIN_SCENARIOS.slice();
    } catch (e) {
      SCENARIOS = BUILTIN_SCENARIOS.slice();
      console.warn("scenarios fetch fallback", e);
    }
    try {
      const cr = await fetch("data/characters.json");
      CHARACTERS = (await cr.json()).characters || [];
    } catch { CHARACTERS = []; }
    try {
      const ar = await fetch("data/achievements.json");
      ACH_DEFS = (await ar.json()).achievements || [];
    } catch { ACH_DEFS = []; }
    try {
      const sr = await fetch("data/story-arcs.json");
      STORY_ARCS = (await sr.json()).arcs || {};
    } catch { STORY_ARCS = {}; }
    try {
      const cr = await fetch("data/cg-slots.json");
      CG_SLOTS = (await cr.json()).slots || [];
    } catch { CG_SLOTS = []; }
    // 内置成就：HE
    if (!ACH_DEFS.find((a) => a.id === "he_ending")) {
      ACH_DEFS.push({
        id: "he_ending",
        name_zh: "终约",
        name_en: "True End Bond",
        desc_zh: "完成任意角色 HE",
        desc_en: "Complete any character HE",
      });
    }
  }

  async function main() {
    try {
      showApp(false);
      renderScenarioList();
      bind();
      await loadData();
      applyI18nUi();
      showApp(false);
      renderScenarioList();
      updateAudioButtons();
      updateMatureUi();
      // 若用户曾确认 18+，自动挂载成人包
      if (state.matureEnabled) {
        loadMatureSkeletonPack();
      }
    } catch (e) {
      console.error(e);
      showBootError("初始化异常：" + (e && e.message ? e.message : String(e)) + " — 仍可点上方备用剧本。");
      showApp(false);
      try { renderScenarioList(); } catch (_) {}
      try { bind(); } catch (_) {}
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
