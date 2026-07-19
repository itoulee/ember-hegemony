/**
 * 星域制霸：余烬 — 浏览器试玩核心（与 Godot Phase 0.5 同设计）
 */
(() => {
  "use strict";

  const PLAYER_FAC = "fac_ember";
  const EVENTS = [
    {
      id: "relay_ping",
      title: "中继残响",
      weight: 12,
      text: "传感器捕获到断裂中继的无主信标。技术官建议立刻解码，也可能是诱饵。",
      choices: [
        { id: "decode", text: "解码信标（+信用）", effects: [{ type: "credits", v: 600 }, { type: "log", t: "解码成功，售出残缺星历。" }] },
        { id: "ignore", text: "忽略", effects: [{ type: "log", t: "你关闭了信道。" }] },
      ],
    },
    {
      id: "ortholite_vein",
      title: "正交石细脉",
      weight: 8,
      minMonth: 2,
      text: "无主岩方向传回高纯度光谱。开采需垫资。",
      choices: [
        { id: "invest", text: "垫资开采（-1500，随机回报）", effects: [{ type: "credits", v: -1500 }, { type: "randCredits", min: 0, max: 4500 }] },
        { id: "pass", text: "放弃", effects: [{ type: "log", t: "矿权旁落。" }] },
      ],
    },
    {
      id: "deserter_cell",
      title: "逃兵通讯",
      weight: 7,
      text: "冷环逃兵请求庇护。收留会激怒冷环合议。",
      choices: [
        { id: "accept", text: "收编（+兵力，冷环敌意）", effects: [{ type: "manpower", v: 18 }, { type: "rel", f: "fac_cold", v: -12 }] },
        { id: "reject", text: "驱逐", effects: [{ type: "rel", f: "fac_cold", v: 4 }, { type: "log", t: "冷环记下这一笔。" }] },
      ],
    },
    {
      id: "marriage_dividend",
      title: "联署红利",
      weight: 10,
      needSpouse: true,
      text: "联姻联署使次级走廊带宽提升，账房呈上红利。",
      choices: [{ id: "take", text: "收取红利", effects: [{ type: "credits", v: 1200 }] }],
    },
    {
      id: "supply_glitch",
      title: "补给协议抖动",
      weight: 9,
      text: "后勤 AI 报告配额抖动。",
      choices: [
        { id: "fix", text: "校准（-800）", effects: [{ type: "credits", v: -800 }] },
        { id: "absorb", text: "吞损耗（-8 兵力）", effects: [{ type: "manpower", v: -8 }] },
      ],
    },
    {
      id: "claim_rumor",
      title: "无主岩流言",
      weight: 5,
      minMonth: 2,
      text: "无主岩仍未被登记。",
      choices: [
        { id: "beacon", text: "尝试投下信标", effects: [{ type: "tryClaim", node: "n8" }] },
        { id: "wait", text: "观望", effects: [{ type: "log", t: "继续等待窗口。" }] },
      ],
    },
  ];

  const state = {
    month: 1,
    ap: 3,
    seed: 20260718,
    rng: null,
    hexMode: false,
    pendingEvent: null,
    log: [],
    selected: "n0",
    factions: {},
    nodes: {},
    edges: [],
    player: null,
    marriages: [],
    hex: null,
  };

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rand() { return state.rng(); }
  function randi(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
  function chance(p) { return rand() < p; }

  function log(msg) {
    const line = `[星月${state.month}] ${msg}`;
    state.log.push(line);
    if (state.log.length > 220) state.log.splice(0, state.log.length - 220);
    const el = document.getElementById("log");
    el.textContent = state.log.join("\n");
    el.scrollTop = el.scrollHeight;
  }

  function fac(id) { return state.factions[id]; }
  function node(id) { return state.nodes[id]; }
  function playerFac() { return fac(state.player.factionId); }

  function neighbors(id) {
    const out = [];
    for (const [a, b] of state.edges) {
      if (a === id) out.push(b);
      else if (b === id) out.push(a);
    }
    return out;
  }
  function adjacent(a, b) { return neighbors(a).includes(b); }

  function newGame(seed) {
    state.seed = seed || (Date.now() & 0xffffffff);
    state.rng = mulberry32(state.seed);
    state.month = 1;
    state.ap = 3;
    state.pendingEvent = null;
    state.marriages = [];
    state.hex = null;
    state.log = [];
    state.factions = {
      fac_ember: { id: "fac_ember", name: "余烬航阀", color: "#f08a30", credits: 12000, manpower: 120, rel: {}, allies: [] },
      fac_cold: { id: "fac_cold", name: "冷环合议", color: "#3d8bfd", credits: 10000, manpower: 110, rel: {}, allies: [] },
      fac_free: { id: "fac_free", name: "自由港盟", color: "#4caf7a", credits: 8000, manpower: 90, rel: {}, allies: [] },
    };
    setRel("fac_ember", "fac_cold", -20);
    setRel("fac_ember", "fac_free", 10);
    setRel("fac_cold", "fac_free", 0);

    const layout = [
      ["n0", "余烬港", 360, 260, "fac_ember", 20, 80],
      ["n1", "灰轨一号", 220, 180, "fac_ember", 12, 40],
      ["n2", "正交矿带", 500, 180, "fac_ember", 15, 45],
      ["n3", "冷环主星", 160, 320, "fac_cold", 18, 90],
      ["n4", "窃听站", 100, 200, "fac_cold", 10, 55],
      ["n5", "裂隙门", 560, 320, "fac_cold", 11, 50],
      ["n6", "自由港", 360, 400, "fac_free", 16, 60],
      ["n7", "中继残骸", 250, 380, "fac_free", 8, 30],
      ["n8", "无主岩", 470, 380, "", 5, 20],
      ["n9", "密钥库", 360, 100, "fac_cold", 14, 70],
    ];
    state.nodes = {};
    for (const r of layout) {
      state.nodes[r[0]] = {
        id: r[0], name: r[1], x: r[2], y: r[3],
        owner: r[4], income: r[5], garrison: r[6],
        defense: 1 + r[6] / 200,
      };
    }
    state.edges = [
      ["n0", "n1"], ["n0", "n2"], ["n0", "n6"], ["n0", "n9"],
      ["n1", "n4"], ["n1", "n3"], ["n2", "n5"], ["n2", "n9"],
      ["n3", "n4"], ["n3", "n7"], ["n5", "n8"], ["n6", "n7"],
      ["n6", "n8"], ["n7", "n3"], ["n9", "n4"],
    ];
    state.player = {
      name: "你", factionId: PLAYER_FAC, loc: "n0",
      command: 70, spouse: "", identity: "执政官",
    };
    state.selected = "n0";
    log(`新周目。种子=${state.seed}。网页试玩版。`);
    log("提示：结束回合触发 AI 与事件；可切换六角战棋模式后进攻。");
    hideEvent();
    hideHex();
    render();
  }

  function setRel(a, b, v) {
    fac(a).rel[b] = clamp(v, -100, 100);
    fac(b).rel[a] = clamp(v, -100, 100);
  }
  function addRel(a, b, d) {
    setRel(a, b, (fac(a).rel[b] || 0) + d);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function spendAp(n = 1) {
    if (state.pendingEvent) { log("请先处理当前事件。"); return false; }
    if (state.ap < n) { log("行动点不足。"); return false; }
    state.ap -= n;
    return true;
  }

  function moveTo(id) {
    if (!spendAp(1)) return;
    if (!adjacent(state.player.loc, id)) { log("目标不在相邻航道。"); state.ap += 1; return; }
    state.player.loc = id;
    state.selected = id;
    log(`航行至 ${node(id).name}。`);
    render();
  }

  function claim() {
    const n = node(state.selected);
    if (!n) return;
    if (n.owner) { log("节点非无主。"); return; }
    if (!adjacent(state.player.loc, n.id) && state.player.loc !== n.id) {
      log("需位于目标或邻接节点。"); return;
    }
    if (!spendAp(1)) return;
    n.owner = PLAYER_FAC;
    n.garrison = Math.max(15, playerFac().manpower * 0.15);
    log(`登记无主节点：${n.name}`);
    render();
  }

  function marry() {
    if (state.player.spouse) { log("已有联姻。"); return; }
    if (playerFac().credits < 5000) { log("信用点不足 5000。"); return; }
    if (!spendAp(1)) return;
    playerFac().credits -= 5000;
    state.player.spouse = "米拉港主";
    addRel(PLAYER_FAC, "fac_free", 30);
    fac(PLAYER_FAC).allies.push("fac_free");
    fac("fac_free").allies.push(PLAYER_FAC);
    state.marriages.push("fac_free");
    log("政治联姻成立：余烬 × 自由港（关系+30）。");
    render();
  }

  function attack() {
    const n = node(state.selected);
    if (!n || !n.owner || n.owner === PLAYER_FAC) {
      log("无法进攻无主或己方节点。"); return;
    }
    if (!adjacent(state.player.loc, n.id) && state.player.loc !== n.id) {
      log("必须位于目标或其邻接节点。"); return;
    }
    if (!spendAp(1)) return;
    const atk = playerFac().manpower * (1 + state.player.command / 100);
    const def = n.garrison * n.defense;
    if (state.hexMode) {
      startHex(n, atk, def);
      return;
    }
    const result = resolveReport(atk, def, n.id);
    applyBattle(result, n, PLAYER_FAC, n.owner);
    render();
  }

  function resolveReport(atkP, defP, loc) {
    let atk = Math.max(1, atkP), def = Math.max(1, defP);
    const lines = [`【战报】${loc}`, `攻方战力 ${atk.toFixed(0)} / 守方 ${def.toFixed(0)}`];
    const atk0 = atk, def0 = def;
    const waves = 3 + randi(0, 2);
    for (let w = 0; w < waves && atk > 0 && def > 0; w++) {
      const ah = atk * (0.12 + rand() * 0.16);
      const dh = def * (0.1 + rand() * 0.16);
      def = Math.max(0, def - ah);
      atk = Math.max(0, atk - dh);
      lines.push(`第${w + 1}波：攻打击 ${ah.toFixed(0)}，守还击 ${dh.toFixed(0)}`);
    }
    const won = def <= 0 || atk / atk0 > def / def0;
    lines.push(won ? "结论：进攻方控制战场。" : "结论：防守方守住节点。");
    return {
      won,
      atkLoss: atk0 - atk,
      defLoss: def0 - def,
      lines,
    };
  }

  function applyBattle(result, n, atkId, defId) {
    result.lines.forEach((l) => log(l));
    const af = fac(atkId), df = fac(defId);
    af.manpower = Math.max(10, af.manpower - result.atkLoss * 0.15);
    n.garrison = Math.max(0, n.garrison - result.defLoss);
    if (result.won) {
      n.owner = atkId;
      n.garrison = Math.max(20, af.manpower * 0.25);
      addRel(atkId, defId, -15);
      log(`占领节点 ${n.name}。`);
    } else {
      log(`进攻失败。`);
    }
  }

  function endTurn() {
    if (state.pendingEvent) { log("请先处理当前事件。"); return; }
    // income
    for (const f of Object.values(state.factions)) {
      let inc = 0;
      for (const n of Object.values(state.nodes)) if (n.owner === f.id) inc += n.income;
      f.credits += inc;
    }
    aiTurn();
    state.month += 1;
    state.ap = 3;
    log(`结束回合。进入星月 ${state.month}。收入与 AI 已结算。`);
    rollEvent();
    render();
  }

  function aiTurn() {
    for (const f of Object.values(state.factions)) {
      if (f.id === PLAYER_FAC) continue;
      if (f.credits >= 2000 && f.manpower < 160 && chance(0.65)) {
        const spend = Math.min(1500, Math.floor(f.credits / 3));
        if (spend >= 500) {
          f.credits -= spend;
          const gain = spend / 80;
          f.manpower += gain;
          log(`【AI】${f.name} 征召，兵力+${gain.toFixed(0)}。`);
        }
      }
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
          t.garrison = Math.max(12, f.manpower * 0.12);
          log(`【AI】${f.name} 控制 ${t.name}。`);
        }
      }
      if (f.manpower >= 40 && chance(0.45)) {
        const targets = [];
        for (const n of Object.values(state.nodes).filter((x) => x.owner === f.id)) {
          for (const nid of neighbors(n.id)) {
            const m = node(nid);
            if (!m || !m.owner || m.owner === f.id) continue;
            if (f.allies.includes(m.owner)) continue;
            const power = f.manpower * 0.4;
            const rel = f.rel[m.owner] || 0;
            if (power < m.garrison * m.defense * 0.85 && rel > -10) continue;
            targets.push(m);
          }
        }
        targets.sort((a, b) => {
          const sa = a.owner === PLAYER_FAC ? 0 : 1;
          const sb = b.owner === PLAYER_FAC ? 0 : 1;
          if (sa !== sb) return sa - sb;
          return a.garrison - b.garrison;
        });
        if (targets.length) {
          const t = targets[0];
          const res = resolveReport(f.manpower * 0.4, t.garrison * t.defense, t.id);
          log(`【AI】${f.name} 进攻 ${t.name}。`);
          applyBattle(res, t, f.id, t.owner);
        }
      }
    }
  }

  function rollEvent() {
    if (chance(0.45)) return;
    const pool = EVENTS.filter((e) => {
      if (e.minMonth && state.month < e.minMonth) return false;
      if (e.needSpouse && !state.player.spouse) return false;
      return true;
    });
    if (!pool.length) return;
    let total = pool.reduce((s, e) => s + e.weight, 0);
    let r = rand() * total;
    let pick = pool[0];
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) { pick = e; break; }
    }
    state.pendingEvent = pick;
    log(`【事件】${pick.title}`);
    showEvent(pick);
  }

  function showEvent(e) {
    const box = document.getElementById("event-box");
    box.classList.remove("hidden");
    document.getElementById("event-title").textContent = "事件：" + e.title;
    document.getElementById("event-text").textContent = e.text;
    const ch = document.getElementById("event-choices");
    ch.innerHTML = "";
    for (const c of e.choices) {
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
    for (const eff of c.effects) applyEffect(eff);
    state.pendingEvent = null;
    hideEvent();
    render();
  }

  function applyEffect(eff) {
    const f = playerFac();
    switch (eff.type) {
      case "credits":
        f.credits = Math.max(0, f.credits + eff.v);
        break;
      case "manpower":
        f.manpower = Math.max(5, f.manpower + eff.v);
        break;
      case "randCredits": {
        const g = randi(eff.min, eff.max);
        f.credits = Math.max(0, f.credits + g);
        log(`随机收益：${g} 信用点`);
        break;
      }
      case "rel":
        addRel(PLAYER_FAC, eff.f, eff.v);
        break;
      case "log":
        log(eff.t);
        break;
      case "tryClaim": {
        const n = node(eff.node);
        if (!n) break;
        if (n.owner) { log("节点已被占据。"); break; }
        if (!adjacent(state.player.loc, n.id) && state.player.loc !== n.id) {
          log("未邻接，信标无效。"); break;
        }
        n.owner = PLAYER_FAC;
        n.garrison = Math.max(15, f.manpower * 0.15);
        log(`成功登记：${n.name}`);
        break;
      }
      default:
        break;
    }
  }

  /* —— 六角战棋 —— */
  function startHex(n, atkP, defP) {
    const atkHp = Math.max(40, atkP / 3);
    const defHp = Math.max(35, defP / 3);
    const atkD = 22 + atkP * 0.04;
    const defD = 20 + defP * 0.035;
    state.hex = {
      nodeId: n.id,
      defOwner: n.owner,
      w: 7, h: 5,
      turnPlayer: true,
      selected: null,
      finished: false,
      log: ["六角战棋开始：" + n.name],
      units: [
        u("a0", 0, "突击1", 1, 1, atkHp, atkD),
        u("a1", 0, "突击2", 1, 3, atkHp, atkD),
        u("a2", 0, "火力", 0, 2, atkHp * 1.1, atkD * 1.15),
        u("d0", 1, "哨1", 5, 1, defHp, defD),
        u("d1", 1, "哨2", 5, 3, defHp, defD),
        u("d2", 1, "炮台", 6, 2, defHp * 1.2, defD * 1.1),
      ],
    };
    document.getElementById("hex-box").classList.remove("hidden");
    drawHex();
    render();
  }
  function u(id, team, name, c, r, hp, atk) {
    return { id, team, name, c, r, hp, max: hp, atk, moved: false, attacked: false };
  }
  function hideHex() {
    document.getElementById("hex-box").classList.add("hidden");
    state.hex = null;
  }

  const HEX_SIZE = 28;
  function hexPix(c, r) {
    const x = 50 + HEX_SIZE * Math.sqrt(3) * (c + 0.5 * (r % 2));
    const y = 40 + HEX_SIZE * 1.5 * r;
    return { x, y };
  }
  function hexNeighbors(c, r) {
    const odd = r % 2 === 1;
    const dirs = odd
      ? [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]
      : [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
    return dirs.map(([dc, dr]) => [c + dc, r + dr]);
  }
  function unitAt(c, r) {
    return state.hex.units.find((x) => x.hp > 0 && x.c === c && x.r === r);
  }
  function isNeigh(c1, r1, c2, r2) {
    return hexNeighbors(c1, r1).some(([c, r]) => c === c2 && r === r2);
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
        drawHexCell(ctx, p.x, p.y, HEX_SIZE * 0.95, "#1a2433");
      }
    }
    for (const un of h.units) {
      if (un.hp <= 0) continue;
      const p = hexPix(un.c, un.r);
      if (h.selected === un.id) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, HEX_SIZE * 0.75, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, HEX_SIZE * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = un.team === 0 ? "#f08a30" : "#3d8bfd";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "11px sans-serif";
      ctx.fillText(un.name, p.x - 14, p.y - 18);
      ctx.strokeStyle = "#3c9";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x - 14, p.y + 18);
      ctx.lineTo(p.x - 14 + 28 * (un.hp / un.max), p.y + 18);
      ctx.stroke();
    }
    document.getElementById("hex-log").textContent = h.log.slice(-12).join("\n");
  }
  function drawHexCell(ctx, x, y, size, color) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = ((60 * i - 30) * Math.PI) / 180;
      const px = x + size * Math.cos(ang);
      const py = y + size * Math.sin(ang);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#3a4a5c";
    ctx.stroke();
  }

  function hexClick(mx, my) {
    const h = state.hex;
    if (!h || h.finished || !h.turnPlayer) return;
    let best = null, bestD = 1e9;
    for (let r = 0; r < h.h; r++) {
      for (let c = 0; c < h.w; c++) {
        const p = hexPix(c, r);
        const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
        if (d < bestD) { bestD = d; best = { c, r }; }
      }
    }
    if (!best || bestD > HEX_SIZE * HEX_SIZE) return;
    const occ = unitAt(best.c, best.r);
    if (!h.selected) {
      if (occ && occ.team === 0) h.selected = occ.id;
      drawHex();
      return;
    }
    const sel = h.units.find((x) => x.id === h.selected);
    if (!sel || sel.hp <= 0) { h.selected = null; drawHex(); return; }
    if (occ && occ.team === 1) {
      if (sel.attacked) { h.log.push(sel.name + " 已攻击过"); }
      else if (!isNeigh(sel.c, sel.r, occ.c, occ.r)) { h.log.push("需相邻攻击"); }
      else {
        occ.hp = Math.max(0, occ.hp - sel.atk);
        sel.attacked = true; sel.moved = true;
        h.log.push(`${sel.name} 攻击 ${occ.name}，伤 ${sel.atk.toFixed(0)}`);
        checkHexEnd();
      }
    } else if (!occ) {
      if (sel.moved || sel.attacked) h.log.push("无法再移动");
      else if (!isNeigh(sel.c, sel.r, best.c, best.r)) h.log.push("只能移到相邻格");
      else {
        sel.c = best.c; sel.r = best.r; sel.moved = true;
        h.log.push(`${sel.name} → (${best.c},${best.r})`);
      }
    }
    drawHex();
  }

  function hexEndTurn() {
    const h = state.hex;
    if (!h || h.finished) return;
    h.selected = null;
    h.turnPlayer = false;
    // enemy AI
    for (const e of h.units.filter((x) => x.team === 1 && x.hp > 0)) {
      e.moved = false; e.attacked = false;
      const foes = h.units.filter((x) => x.team === 0 && x.hp > 0);
      if (!foes.length) break;
      foes.sort((a, b) => Math.abs(a.c - e.c) + Math.abs(a.r - e.r) - (Math.abs(b.c - e.c) + Math.abs(b.r - e.r)));
      const t = foes[0];
      if (isNeigh(e.c, e.r, t.c, t.r)) {
        t.hp = Math.max(0, t.hp - e.atk);
        h.log.push(`敌 ${e.name} 攻击 ${t.name}`);
      } else {
        let best = null, bd = 1e9;
        for (const [c, r] of hexNeighbors(e.c, e.r)) {
          if (c < 0 || r < 0 || c >= h.w || r >= h.h) continue;
          if (unitAt(c, r)) continue;
          const d = Math.abs(c - t.c) + Math.abs(r - t.r);
          if (d < bd) { bd = d; best = { c, r }; }
        }
        if (best) {
          e.c = best.c; e.r = best.r;
          h.log.push(`敌 ${e.name} 机动`);
          if (isNeigh(e.c, e.r, t.c, t.r)) {
            t.hp = Math.max(0, t.hp - e.atk);
            h.log.push(`敌 ${e.name} 接敌攻击`);
          }
        }
      }
      if (checkHexEnd()) break;
    }
    if (!h.finished) {
      h.turnPlayer = true;
      for (const u of h.units) if (u.team === 0) { u.moved = false; u.attacked = false; }
    }
    drawHex();
  }

  function checkHexEnd() {
    const h = state.hex;
    const atkA = h.units.filter((x) => x.team === 0 && x.hp > 0);
    const defA = h.units.filter((x) => x.team === 1 && x.hp > 0);
    if (defA.length && atkA.length) return false;
    h.finished = true;
    const won = defA.length === 0 && atkA.length > 0;
    const atkLoss = h.units.filter((x) => x.team === 0).reduce((s, x) => s + (x.max - Math.max(0, x.hp)), 0);
    const defLoss = h.units.filter((x) => x.team === 1).reduce((s, x) => s + (x.max - Math.max(0, x.hp)), 0);
    const n = node(h.nodeId);
    applyBattle({ won, atkLoss, defLoss, lines: h.log.concat([won ? "战棋：进攻胜利" : "战棋：进攻失败"]) }, n, PLAYER_FAC, h.defOwner);
    setTimeout(() => { hideHex(); render(); }, 600);
    return true;
  }

  function hexFlee() {
    const h = state.hex;
    if (!h) return;
    const n = node(h.nodeId);
    applyBattle({ won: false, atkLoss: 30, defLoss: 5, lines: ["进攻方撤退。"] }, n, PLAYER_FAC, h.defOwner);
    hideHex();
    render();
  }

  /* —— 星图绘制 —— */
  function drawMap() {
    const canvas = document.getElementById("map");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 720;
    const h = 520;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0d131c";
    ctx.fillRect(0, 0, w, h);
    // scale layout from design 720x520
    const sx = w / 720, sy = h / 520;
    ctx.save();
    ctx.scale(sx, sy);
    for (const [a, b] of state.edges) {
      const na = node(a), nb = node(b);
      ctx.strokeStyle = "rgba(80,100,120,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(na.x, na.y);
      ctx.lineTo(nb.x, nb.y);
      ctx.stroke();
    }
    for (const n of Object.values(state.nodes)) {
      let col = "#666";
      if (n.owner && fac(n.owner)) col = fac(n.owner).color;
      if (n.id === state.selected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 24, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, 16, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = "#ccc";
      ctx.stroke();
      ctx.fillStyle = "#e8eef5";
      ctx.font = "12px sans-serif";
      ctx.fillText(n.name, n.x - 24, n.y - 22);
      if (state.player.loc === n.id) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffe066";
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function mapClick(ev) {
    const canvas = document.getElementById("map");
    const rect = canvas.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * 720;
    const my = ((ev.clientY - rect.top) / rect.height) * 520;
    let best = null, bd = 28 * 28;
    for (const n of Object.values(state.nodes)) {
      const d = (n.x - mx) ** 2 + (n.y - my) ** 2;
      if (d < bd) { bd = d; best = n.id; }
    }
    if (best) {
      state.selected = best;
      render();
    }
  }

  function render() {
    const f = playerFac();
    const n = node(state.selected);
    document.getElementById("status").textContent = [
      `星月 ${state.month}　AP ${state.ap}　模式：${state.hexMode ? "六角战棋" : "战报"}`,
      `身份：${state.player.identity}`,
      `势力：${f.name}`,
      `信用点：${f.credits}　兵力：${f.manpower.toFixed(0)}`,
      `位置：${node(state.player.loc).name}`,
      `联姻：${state.player.spouse || "无"}`,
      `事件：${state.pendingEvent ? state.pendingEvent.title : "无"}`,
    ].join("\n");
    if (n) {
      const on = n.owner ? (fac(n.owner) ? fac(n.owner).name : n.owner) : "无主";
      document.getElementById("selected").textContent =
        `选中：${n.name}（${n.id}）\n所属：${on}\n驻军：${n.garrison.toFixed(0)}　收入：${n.income}　防御×${n.defense.toFixed(2)}`;
    }
    document.getElementById("btn-hex-toggle").textContent = state.hexMode ? "战斗：六角战棋" : "战斗：战报";
    drawMap();
    if (state.hex) drawHex();
  }

  function bind() {
    document.getElementById("btn-move").onclick = () => moveTo(state.selected);
    document.getElementById("btn-attack").onclick = attack;
    document.getElementById("btn-claim").onclick = claim;
    document.getElementById("btn-marry").onclick = marry;
    document.getElementById("btn-end").onclick = endTurn;
    document.getElementById("btn-new").onclick = () => newGame();
    document.getElementById("btn-hex-toggle").onclick = () => {
      state.hexMode = !state.hexMode;
      log(state.hexMode ? "战斗解析：六角战棋" : "战斗解析：战报");
      render();
    };
    document.getElementById("btn-hex-end").onclick = hexEndTurn;
    document.getElementById("btn-hex-flee").onclick = hexFlee;
    document.getElementById("map").onclick = mapClick;
    document.getElementById("hex").onclick = (ev) => {
      const c = document.getElementById("hex");
      const r = c.getBoundingClientRect();
      const scaleX = c.width / r.width;
      const scaleY = c.height / r.height;
      hexClick((ev.clientX - r.left) * scaleX, (ev.clientY - r.top) * scaleY);
    };
    window.addEventListener("resize", () => drawMap());
  }

  bind();
  newGame(20260718);
})();
