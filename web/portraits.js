/**
 * D1：程序化角色半身立绘（canvas → dataURL 缓存）
 */
window.EmberPortraits = (() => {
  const cache = {};

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  const REAL = {
    lia: "assets/portraits/lia.jpg",
    mira: "assets/portraits/mira.jpg",
    lira: "assets/portraits/lira.jpg",
    sarn: "assets/portraits/sarn.jpg",
    kess: "assets/portraits/kess.jpg",
    vorn: "assets/portraits/vorn.jpg",
  };

  function draw(charOrId, w, h) {
    const id = typeof charOrId === "string" ? charOrId : (charOrId && charOrId.id) || "x";
    const key = id + "_" + w + "x" + h;
    if (cache[key]) return cache[key];

    // 真立绘优先（同步返回 URL；调用方可直接用 img.src）
    if (REAL[id]) {
      cache[key] = REAL[id];
      return REAL[id];
    }

    const ch = typeof charOrId === "object" && charOrId ? charOrId : { id, hue: hash(id) % 360, seed: hash(id) % 100 };
    const hue = ch.hue != null ? ch.hue : hash(id) % 360;
    const seed = ch.seed != null ? ch.seed : hash(id) % 97;

    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");

    // background
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `hsl(${hue}, 28%, 16%)`);
    g.addColorStop(1, `hsl(${(hue + 30) % 360}, 22%, 8%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // stars
    for (let i = 0; i < 24; i++) {
      const x = (seed * 17 + i * 37) % w;
      const y = (seed * 13 + i * 29) % (h * 0.45);
      ctx.fillStyle = `hsla(${hue}, 40%, 80%, ${0.15 + (i % 5) * 0.05})`;
      ctx.fillRect(x, y, 1 + (i % 2), 1 + (i % 2));
    }

    const cx = w * 0.5;
    const headY = h * 0.32;
    const headR = Math.min(w, h) * 0.16;

    // shoulders / coat
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.78, w * 0.42, h * 0.28, 0, Math.PI, 0);
    ctx.fillStyle = `hsl(${(hue + 20) % 360}, 35%, 22%)`;
    ctx.fill();
    // collar
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.9, headY + headR * 0.9);
    ctx.lineTo(cx, headY + headR * 1.6);
    ctx.lineTo(cx + headR * 0.9, headY + headR * 0.9);
    ctx.closePath();
    ctx.fillStyle = `hsl(${hue}, 45%, 32%)`;
    ctx.fill();

    // head
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 30%, ${40 + (seed % 8)}%)`;
    ctx.fill();

    // hair
    ctx.beginPath();
    ctx.ellipse(cx, headY - headR * 0.35, headR * 1.15, headR * 0.85, 0, Math.PI, 0);
    ctx.fillStyle = `hsl(${(hue + 180) % 360}, 25%, ${18 + (seed % 10)}%)`;
    ctx.fill();

    // visor / eyes
    ctx.strokeStyle = `hsl(${hue}, 70%, 65%)`;
    ctx.lineWidth = Math.max(2, w / 64);
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.55, headY + headR * 0.05);
    ctx.lineTo(cx + headR * 0.55, headY + headR * 0.05);
    ctx.stroke();

    // accent pin
    ctx.beginPath();
    ctx.arc(cx + w * 0.12, h * 0.62, w * 0.03, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${(hue + 60) % 360}, 70%, 55%)`;
    ctx.fill();

    // name tag
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, h - 28, w, 28);
    ctx.fillStyle = "rgba(230,235,240,0.9)";
    ctx.font = `${Math.max(11, w / 18)}px system-ui,sans-serif`;
    const name = ch.name_zh || ch.name_en || id;
    ctx.fillText(String(name).slice(0, 12), 8, h - 10);

    cache[key] = c.toDataURL("image/png");
    return cache[key];
  }

  return { draw, cache };
})();
