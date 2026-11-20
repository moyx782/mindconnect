# 文件与 MCP / Files and MCP

| 文件 / File | 中文 | English |
| --- | --- | --- |
| [SKILL.md](../skills/mindflow-whiteboard/SKILL.md) | 内置 AI 技能指南（包含语义配色、防重叠空间坐标规范与读写示例） | Built-in AI skill guide with semantic colors, non-overlapping layout rules and examples |
| [mindflow-board.json](../examples/mindflow-board.json) | 可导入的完整白板，包含布局、笔迹和视口 | Importable board with layout, strokes and viewport |
| [mindflow-context.json](../examples/mindflow-context.json) | 供 AI 阅读的内容导出，支持选区或整张白板 | AI-readable export of a selection or the entire board |
| [board.schema.json](../src/board.schema.json) | 完整白板的 JSON Schema | JSON Schema for a full board |
| [mcp.config.example.json](../examples/mcp.config.example.json) | 用 Node.js 启动 MCP 的配置示例，需填写本机路径 | Example for running MCP with Node.js. Replace the paths with local ones. |

[早期单文件版 / Original standalone HTML (v1.0.0)](https://github.com/moyx782/mindconnect/blob/v1.0.0/mindflow.html)

## 工具 / Tools

| MCP | 中文 | English |
| --- | --- | --- |
| `mindflow_get_board` | 读取完整白板和版本号 | Read the board and its revision |
| `mindflow_get_context` | 默认读取选区。用 `scope: "all"` 读取全图 | Read the selection by default. Use `scope: "all"` for the whole board. |
| `mindflow_search` | 按词块文字搜索 | Search card text |
| `mindflow_apply_operations` | 批量增改或删除词块、连线、群组和图形 | Add, replace or delete cards, connections, groups and drawings in one transaction |
| `mindflow_set_selection` | 按 ID 设置选区 | Set the selection by ID |
| `mindflow_rename_board` | 更改标题 | Rename the board |

中文　选区为空时，导出内容也为空。单独选中一条线时，导出会包含两端的词块。后三个工具需要写入权限。先读取当前 `revision`，写入时带上 `expectedRevision`。发生冲突后重新读取白板，再决定如何合并修改。在网页或桌面版打开「JSON / MCP」还可一键「复制 AI 技能与上下文」或下载 `SKILL.md`。

English　An empty selection exports no items. Selecting a connection includes the cards at both ends. The last three tools require write access. Read the current `revision` and pass it as `expectedRevision` when writing. If it has changed, read the board again before merging edits. In **JSON / MCP**, you can also click **Copy AI skill + context** or **Download SKILL.md** for instant AI onboarding.

**资源与提示词 / Resources & Prompts**　`mindflow://board` · `mindflow://selection` · `mindflow://schema` · `mindflow://skill` · Prompt: `mindflow-whiteboard`

## 恢复白板 / Restore a board

中文　点击左上角「白板列表」可直接恢复历史修订快照。在桌面版的「MCP 接入 → 打开数据目录」也可找到当前白板 `board.json` 和最近 20 个版本的 `backups/`。网页版的数据保存在浏览器里，清除网站数据前请先导出完整备份。

English　Click **Boards** in the top-left corner to restore a previous revision snapshot directly. On desktop, you can also choose **MCP setup → Open data folder** to find `board.json` and up to 20 previous revisions in `backups/`. The web edition stores its boards in the browser; export a full backup before clearing site data.

