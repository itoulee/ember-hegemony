# itch.io / 镜像发布说明

## GitHub Pages（主站）

https://itoulee.github.io/ember-hegemony/

镜像入口页：https://itoulee.github.io/ember-hegemony/mirror.html

## itch.io HTML5

1. 打包 `web/` 目录为 zip（需包含 `index.html`、`game.js`、`data/`、`mods/` 等）
2. itch.io → Upload new project → Kind: **HTML**
3. 上传 zip，This file will be played in the browser
4. Embed options: 建议 1280×720 或默认
5. 分类：Simulation / Strategy；若含成人内容勾选 **Not listed / Restricted** 或平台成人选项
6. 描述中写明：主包可玩；成人内容需游戏内确认 18+

### 一键打包（本机）

```bash
cd ember-hegemony
# PowerShell
Compress-Archive -Path web\* -DestinationPath ember-hegemony-web.zip -Force
```

## 其它镜像

可将同一 `web/` 部署到 Cloudflare Pages / Netlify / Vercel，构建命令留空，发布目录 `web`。
