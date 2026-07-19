/**
 * 简中 / English 轻量 i18n
 */
window.EmberI18n = (() => {
  let lang = localStorage.getItem("ember_lang") || "zh";

  const STR = {
    zh: {
      title: "星域制霸：余烬",
      subtitle: "P2 网页试玩",
      tab_act: "行动",
      tab_dip: "外交",
      tab_tech: "科技",
      tab_id: "身份",
      tab_meta: "图鉴",
      tab_sys: "系统",
      move: "航行 (1AP)",
      attack: "进攻 (1AP)",
      claim: "登记无主 (1AP)",
      raid: "劫掠邻星 (1AP)",
      end: "结束回合",
      ally: "缔结同盟 (1AP)",
      break: "废除同盟 (1AP)",
      vassal: "从属 (1AP)",
      tribute: "索贡 (1AP)",
      marry: "政治联姻 (1AP)",
      joint: "合研条约 (1AP)",
      scenarios: "选择剧本",
      achievements: "成就",
      codex: "图鉴",
      characters: "人物",
      audio: "音效",
      bgm: "BGM",
      lang: "语言",
      hex_sandbox: "战棋沙盘",
      victory: "胜利！",
      new_run: "新周目",
    },
    en: {
      title: "Ember Hegemony",
      subtitle: "P2 Web Build",
      tab_act: "Act",
      tab_dip: "Diplo",
      tab_tech: "Tech",
      tab_id: "ID",
      tab_meta: "Codex",
      tab_sys: "System",
      move: "Move (1AP)",
      attack: "Attack (1AP)",
      claim: "Claim (1AP)",
      raid: "Raid (1AP)",
      end: "End Turn",
      ally: "Ally (1AP)",
      break: "Break Ally (1AP)",
      vassal: "Vassal (1AP)",
      tribute: "Tribute (1AP)",
      marry: "Marriage (1AP)",
      joint: "Joint R&D (1AP)",
      scenarios: "Scenarios",
      achievements: "Achievements",
      codex: "Codex",
      characters: "Characters",
      audio: "SFX",
      bgm: "BGM",
      lang: "Lang",
      hex_sandbox: "Hex Sandbox",
      victory: "Victory!",
      new_run: "New Run",
    },
  };

  function t(key) {
    const pack = STR[lang] || STR.zh;
    return pack[key] || STR.zh[key] || key;
  }

  function setLang(l) {
    lang = l === "en" ? "en" : "zh";
    localStorage.setItem("ember_lang", lang);
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  }

  function getLang() { return lang; }

  function nameOf(obj) {
    if (!obj) return "";
    if (lang === "en") return obj.name_en || obj.name_zh || obj.name || obj.id;
    return obj.name_zh || obj.name_en || obj.name || obj.id;
  }

  function descOf(obj) {
    if (!obj) return "";
    if (lang === "en") return obj.desc_en || obj.desc_zh || obj.bio_en || obj.bio_zh || "";
    return obj.desc_zh || obj.desc_en || obj.bio_zh || obj.bio_en || "";
  }

  return { t, setLang, getLang, nameOf, descOf, STR };
})();
