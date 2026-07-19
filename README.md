# 星域制霸：余烬（Ember Hegemony）

开源硬科幻星域策略 SLG（类雷神核心循环）· **P2**

## 在线游玩

### https://itoulee.github.io/ember-hegemony/

打开即进入**剧本选单**。桌面/手机浏览器均可。

## 版本功能

| 阶段 | 内容 |
|------|------|
| **P0** | 存档、教程、事件表、战棋地形/远程、小屏 |
| **P1** | 四身份、科技、外交、政变、AI、36 星、模组 |
| **P2** | 多剧本、角色图鉴、音效 BGM、成就、中英、战棋沙盘 |

## 剧本一览

- 教程：余烬港一百天  
- 沙盒：无主星域  
- 小国中兴 / 北阙夜（政变）/ 黑旗十年 / 布衣卿相  
- **制霸主环**（控制 ≥80% 节点并维持 3 星月）  

## 本地运行

```bash
# 推荐静态服务（否则 data/*.json 可能 fetch 失败）
npx --yes serve web
```

或用浏览器打开 `web/index.html`（部分环境需 http）。

Godot 4 工程：`game/project.godot`（功能以网页为准）。

## 目录

```
web/
  index.html / game.js / style.css
  audio.js / i18n.js
  data/events.json tech.json scenarios.json
       characters.json achievements.json mods/
docs/ROADMAP.md
game/   # Godot 骨架
```

## 许可证

[MIT](LICENSE)

源码：https://github.com/itoulee/ember-hegemony
