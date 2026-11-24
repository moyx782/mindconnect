# MindFlow

[打开白板 · Open whiteboard](https://moyx782.github.io/mindconnect/) · [下载桌面版 · Download for Windows or Linux](https://github.com/moyx782/mindconnect/releases/latest)

## 中文

MindFlow 是一张可以自由摆放词块的白板。双击空白处写下想法，从词块边缘拖到另一块建立连线。双击连线或选中后点击「编辑标签」可以写下两个想法之间的关系。

- **多白板与历史快照**　点击左上角「白板列表」（`Ctrl/Cmd + B`）可新建空白或示例白板、在多张本地白板间切换，或一键恢复当前白板的历史修订版本。
- **画笔、笔触粗细与橡皮擦**　底部工具坞支持选择（`V`）、平滑曲线画笔（`P`）、橡皮擦（`E`）、矩形（`R`）、圆形（`O`）和直线（`L`），并提供三档笔触粗细与语义配色；使用橡皮擦划过或点击笔迹与图形即可擦除。
- **图片与文件粘贴（Markdown 链接格式）**　支持直接 `Ctrl/Cmd + V` 粘贴截图、图片、本地文件或 URL，或将文件直接拖入画布，或点击悬浮工具栏的「图片/文件」按钮。图片会自动存为 `![文件名](data:image/...)` 并在卡片内实时预览，文件存为 `[文件名](data:...)` 并渲染为可点击下载的附件胶囊标签，导出 Markdown 大纲时原样保留标准 Markdown 链接语法。
- **高效交互与整理**　支持复制/粘贴/复制副本（`Ctrl/Cmd + C/V/D`）、全选（`Ctrl/Cmd + A`）、快速搜索定位（`Ctrl/Cmd + F`）、群组与词块换色、选中多词块水平/垂直等距排列，以及顶栏「整理布局」一键分层自动排版。支持空格+拖拽、中键/右键拖拽和触屏双指缩放平移。
- **多格式导出与备份**　支持导出结构化 Markdown 大纲、JSON 完整备份、SVG 矢量图与高清 PNG 图片。
- **把选区交给 AI / 内置 AI Skill 与 MCP**　选中相关词块，打开「JSON / MCP」或桌面版的「MCP 接入」，可一键**「复制 AI 技能与上下文」**（自动附带语义配色、防重叠空间排版规范与当前 JSON 上下文）或下载 [`SKILL.md`](skills/mindflow-whiteboard/SKILL.md) 供任何 AI 客户端即刻上手；桌面版 MCP 服务同时内置 `mindflow://skill` 资源与 `mindflow-whiteboard` 提示词模板。
- **从源码运行**　安装 Node.js 24，在仓库根目录依次运行 `npm ci` 和 `npm start`。运行测试用 `npm test`，构建网页用 `npm run build`。

## English

MindFlow is a whiteboard for arranging and connecting ideas. Double-click the canvas to add a card. Drag from its edge to another card to connect them. Double-click a connection or click **Edit label** to describe the relationship.

- **Multiple boards and revision history.** Click **Boards** (`Ctrl/Cmd + B`) in the top-left corner to create blank or sample boards, switch between local boards, or restore a previous revision snapshot.
- **Smooth pen, stroke widths, and eraser.** The bottom dock includes Select (`V`), smooth quadratic-curve Pen (`P`), Eraser (`E`), Rectangle (`R`), Ellipse (`O`), and Line (`L`) tools with three stroke widths and semantic colors. Drag across or click strokes and shapes with the eraser to remove them.
- **Paste or drop images and files as Markdown links.** Paste (`Ctrl/Cmd + V`) or drag-and-drop images, files, or URLs onto the canvas—or click **Media/File** on the selection toolbar. Images are stored as `![name](data:image/...)` with inline preview, and files/URLs are stored as `[name](...)` with clickable download/open pills, preserving standard Markdown links in both JSON and Markdown outline exports.
- **Fast editing and auto-layout.** Copy, paste, and duplicate selections (`Ctrl/Cmd + C/V/D`), select all (`Ctrl/Cmd + A`), search and jump to cards/groups/connections (`Ctrl/Cmd + F`), recolor groups, align selected cards in a row or column, or click **Auto layout** to organize the board hierarchically. Pan with Space+drag, middle/right-drag, or two-finger touch pinch/pan.
- **Export and backup.** Export as a Markdown outline, full JSON backup, standalone SVG vector diagram, or high-resolution PNG image.
- **Built-in AI Skill & MCP.** Open **JSON / MCP** on the web or **MCP setup** on desktop to click **Copy AI skill + context** (bundles semantic color rules, non-overlapping coordinate rules, and your board JSON) or download [`SKILL.md`](skills/mindflow-whiteboard/SKILL.md). The local stdio MCP server also exposes the `mindflow://skill` resource and `mindflow-whiteboard` prompt.
- **Run from source.** Install Node.js 24 and run `npm ci`, then `npm start` from the repository root. Use `npm test` to run the tests and `npm run build` to build the web edition.

[文件与 MCP 参考 · Files and MCP reference](docs/reference.md) · [内置 AI 技能 · Built-in AI Skill](skills/mindflow-whiteboard/SKILL.md) · [示例 · Examples](examples/) · [版本记录 · Releases](https://github.com/moyx782/mindconnect/releases)


