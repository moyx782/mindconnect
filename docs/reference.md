# 文件与 MCP / Files and MCP

| 文件 / File | 中文 | English |
| --- | --- | --- |
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

中文　选区为空时，导出内容也为空。单独选中一条线时，导出会包含两端的词块。后三个工具需要写入权限。先读取当前 `revision`，写入时带上 `expectedRevision`。发生冲突后重新读取白板，再决定如何合并修改。

English　An empty selection exports no items. Selecting a connection includes the cards at both ends. The last three tools require write access. Read the current `revision` and pass it as `expectedRevision` when writing. If it has changed, read the board again before merging edits.

**资源 / Resources**　`mindflow://board` · `mindflow://selection` · `mindflow://schema`

## 恢复白板 / Restore a board

中文　在桌面版的「MCP 接入 → 打开数据目录」可找到当前白板 `board.json` 和最近 20 个版本的 `backups/`。要恢复旧版，可用「打开」导入其中一份备份。网页版的数据保存在浏览器里，清除网站数据前请先导出完整备份。

English　On desktop, choose **MCP setup → Open data folder** to find the current `board.json` and up to 20 previous revisions in `backups/`. To restore one, import it with **Open**. The web edition stores its board in the browser. Export a full backup before clearing site data.
