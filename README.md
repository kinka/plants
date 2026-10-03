# 植物观察笔记

拍照 → AI 做一次规范的形态观察 → 术语沉淀成卡片间隔复习。纯前端，无构建步骤，双击 `index.html` 即可使用。数据存在浏览器 IndexedDB / localStorage。

## 文件结构

脚本都是普通 `<script>`，共享全局作用域，**按 `index.html` 里的顺序加载**，后面的文件可以用前面定义的东西。

| 文件 | 内容 |
|---|---|
| `js/util.js` | `$`、`esc` 等通用小工具 |
| `js/db.js` | IndexedDB 封装：`entries`（观察记录）、`cards`（术语卡） |
| `js/schema.js` | 观察大纲（JSON Schema）、系统提示词、模型输出归一化 |
| `js/api.js` | `cfg` 配置默认值；`analyze()` 调用 CPA / Ollama / Anthropic |
| `js/figures.js` | `FIG`：术语 → SVG 示意图 |
| `js/seed.js` | `SEED`：基础术语库 |
| `js/render.js` | 观察结果渲染 |
| `js/deck.js` | 术语卡、SM-2 复习、术语库载入 |
| `js/quiz.js` | 自测：看图题、解锁规则、与 AI 对照 |
| `js/practice.js` | 随机练习：从 iNaturalist 取本地区研究级照片、地区搜索、揭晓社区鉴定 |
| `js/observe.js` | 观察页流程 |
| `js/notebook.js` | 笔记本页 |
| `js/settings.js` | 导航与设置页 |
| `js/main.js` | 启动 |

## 常见改动

- **加一道自测题**：在 `js/quiz.js` 的 `QUESTIONS` 末尾加一项。`ai` 指向观察结果里的字段，`options[].term` 要在 `FIG` 和 `SEED` 里都存在，`words` 是用来识别 AI 文本的关键词。题目按顺序解锁（上一题连续答对 `UNLOCK_STREAK` 次）。
- **加术语**：`js/seed.js` 加一行；需要示意图就在 `js/figures.js` 里给同名 key 画一个。
- **改模型默认值**：`js/api.js` 的 `cfg`。API Key 只在设置页填写，不要写进代码。
- **改随机练习的范围**：`js/practice.js` 的 `PRACTICE_TAXON`（iNaturalist 分类 id，现为被子植物 47125）；地区在设置页搜索，默认中国（place 6903）。
