/**
 * 星域制霸：余烬 — P0 + P1 网页核心
 * 存档/教程/事件/战棋地形远程/小屏 / 身份/科技/外交/政变/AI v2/36星图/模组
 */
(() => {
  "use strict";

  const SAVE_PREFIX = "ember_hegemony_slot_";
  const VERSION = "1.1.0-p0p1";

  let EVENT_DEFS = [];
  let TECH_DEFS = { branches: [] };
  let MOD_EVENTS = [];

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
  };

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

  function log(msg) {
    const line = `[星月${state.month}] ${msg}`;
    state.log.push(line);
    if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
    const el = document.getElementById("log");
    if (el) {
      el.textContent = state.log.join("\n");
      el.scrollTop = el.scrollHeight;
    }
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
    buildWorld(opts.mode || "magistrate");
    if (opts.tutorial) {
      state.tutorial = { step: 0, done: {} };
      showTutorial();
      log("教程模式开始。请按顶部提示操作。");
    } else {
      state.tutorial = null;
      hideTutorial();
    }
    log(`新周目 v${VERSION} 种子=${seed}`);
    refreshDipSelect();
    renderTech();
    render();
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
    } else showTutorial();
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
      } else log(`${af.name} 占领 ${n.name}`);
    } else if (isPlayerFac(atkId)) {
      log("进攻失败。");
      if (state.player.identity === "航官" && chance(0.15)) {
        state.player.prison = 2;
        log("你因战败被扣查（监禁 2 月）。");
      }
    }
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
    const atkA = h.units.filter((x) => x.team === 0 && x.hp > 0);
    const defA = h.units.filter((x) => x.team === 1 && x.hp > 0);
    if (defA.length && atkA.length) return false;
    h.finished = true;
    const won = !defA.length && atkA.length;
    const atkLoss = h.units.filter((x) => x.team === 0).reduce((s, x) => s + (x.max - Math.max(0, x.hp)), 0);
    const defLoss = h.units.filter((x) => x.team === 1).reduce((s, x) => s + (x.max - Math.max(0, x.hp)), 0);
    const n = node(h.nodeId);
    applyBattle({
      won, atkLoss, defLoss,
      lines: h.log.concat([won ? "战棋胜利" : "战棋失败"]),
    }, n, state.player.factionId, h.defOwner);
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
    render();
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
      if (q.id === "a4") state.player.legitimacy += 5;
      state.player.techQueue = null;
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
      if (chance(0.3)) {
        state.player.identity = "流民";
        log("越狱成功，但失去官身成为流民。");
      } else log("越狱成功。");
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
    if (chance(0.4)) return;
    if (state.player.prison > 0 && chance(0.5)) {
      // force prison event chance
    }
    const pool = allEvents().filter((e) => {
      if (e.minMonth && state.month < e.minMonth) return false;
      if (e.needSpouse && !state.player.spouse) return false;
      if (e.needAlly && !(playerFac().allies || []).length) return false;
      if (e.needIdentity && state.player.identity !== e.needIdentity) return false;
      if (e.needPrison && state.player.prison <= 0) return false;
      if (e.needTech && !Object.keys(state.player.techDone || {}).length) return false;
      const cd = e.cooldown || e.cooldown_months || 0;
      const last = state.eventCd[e.id] || -999;
      if (state.month - last < cd) return false;
      return true;
    });
    if (!pool.length) return;
    let total = pool.reduce((s, e) => s + (e.weight || 1), 0);
    let r = rand() * total, pick = pool[0];
    for (const e of pool) {
      r -= e.weight || 1;
      if (r <= 0) { pick = e; break; }
    }
    state.pendingEvent = pick;
    state.eventCd[pick.id] = state.month;
    log(`【事件】${pick.title}`);
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
    tutAdvance("end");
    rollEvent();
    renderTech();
    render();
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
      pendingEvent: null,
      hex: null,
      pendingBattle: null,
    });
    hideEvent();
    hideHex();
    cancelBattle();
    if (state.tutorial) showTutorial(); else hideTutorial();
    refreshDipSelect();
    renderTech();
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
  function drawMap() {
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
      if (state.player.loc === n.id) {
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
    document.getElementById("btn-raid").classList.toggle("hidden", state.player.identity !== "掠航者");

    refreshDipSelect();
    updateSaveMeta();
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
      };
    });

    document.getElementById("btn-move").onclick = () => moveTo(state.selected);
    document.getElementById("btn-attack").onclick = requestAttack;
    document.getElementById("btn-claim").onclick = claim;
    document.getElementById("btn-raid").onclick = raid;
    document.getElementById("btn-end").onclick = endTurn;
    document.getElementById("btn-ally").onclick = ally;
    document.getElementById("btn-break").onclick = breakAlly;
    document.getElementById("btn-vassal").onclick = vassal;
    document.getElementById("btn-tribute").onclick = tribute;
    document.getElementById("btn-marry").onclick = marry;
    document.getElementById("btn-joint").onclick = jointResearch;
    document.getElementById("btn-join-officer").onclick = joinOfficer;
    document.getElementById("btn-go-raider").onclick = goRaider;
    document.getElementById("btn-found").onclick = foundNation;
    document.getElementById("btn-coup-prep").onclick = coupPrep;
    document.getElementById("btn-coup-start").onclick = coupStart;
    document.getElementById("btn-escape").onclick = escapePrison;
    document.getElementById("btn-tut").onclick = () => newGame({ tutorial: true, mode: "magistrate", seed: 20260719 });
    document.getElementById("btn-sandbox").onclick = () => {
      const modes = ["magistrate", "officer", "civilian", "raider"];
      const m = modes[randi(0, 3)];
      // pick via prompt-like cycle: magistrate default, shift: hold identity buttons - use select
      const pick = window.prompt("开局身份：1执政官 2航官 3流民 4掠航者", "1");
      const map = { 1: "magistrate", 2: "officer", 3: "civilian", 4: "raider" };
      newGame({ mode: map[pick] || "magistrate" });
    };
    for (let i = 1; i <= 3; i++) {
      document.getElementById("btn-save" + i).onclick = () => saveSlot(i);
      document.getElementById("btn-load" + i).onclick = () => loadSlot(i);
    }
    document.getElementById("btn-battle-report").onclick = () => confirmBattle("report");
    document.getElementById("btn-battle-hex").onclick = () => confirmBattle("hex");
    document.getElementById("btn-battle-cancel").onclick = cancelBattle;
    document.getElementById("btn-hex-end").onclick = hexEndTurn;
    document.getElementById("btn-hex-flee").onclick = hexFlee;

    document.getElementById("btn-toggle-left").onclick = () => {
      document.getElementById("left-panel").classList.toggle("mobile-hide");
      document.getElementById("left-panel").classList.toggle("collapsed");
    };
    document.getElementById("btn-toggle-right").onclick = () => {
      document.getElementById("right-panel").classList.toggle("mobile-hide");
      document.getElementById("right-panel").classList.toggle("collapsed");
    };

    document.getElementById("mod-file").onchange = async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        loadMod(JSON.parse(text));
      } catch (e) { log("模组解析失败：" + e.message); }
    };
    document.getElementById("btn-mod-example").onclick = async () => {
      try {
        const r = await fetch("data/mods/example-mod.json");
        loadMod(await r.json());
      } catch (e) {
        // fallback inline
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
    };

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

  function loadMod(mod) {
    if (!mod) return;
    const evs = mod.events || [];
    MOD_EVENTS = MOD_EVENTS.concat(evs);
    log(`已加载模组：${mod.name || mod.id || "未命名"}（+${evs.length} 事件）`);
  }

  async function loadData() {
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
      log("事件表 fetch 失败，使用内置少量事件。");
    }
    try {
      const tr = await fetch("data/tech.json");
      TECH_DEFS = await tr.json();
    } catch {
      TECH_DEFS = { branches: [] };
    }
  }

  async function main() {
    bind();
    await loadData();
    newGame({ tutorial: true, mode: "magistrate", seed: 20260719 });
    // auto-fit map
    state.mapView.scale = 0.85;
    state.mapView.ox = 20;
    state.mapView.oy = 10;
    render();
  }

  main();
})();
