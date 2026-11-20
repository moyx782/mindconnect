# MindFlow

[打开白板 · Open whiteboard](https://moyx782.github.io/mindconnect/) · [下载桌面版 · Download for Windows or Linux](https://github.com/moyx782/mindconnect/releases/latest)

## 中文

MindFlow 是一张可以自由摆放词块的白板。双击空白处写下想法，从词块边缘拖到另一块建立连线。双击连线可以写下两个想法之间的关系。

- **保存与迁移**　网页版自动保存到当前浏览器。要换设备或转到桌面版，选择「导出 → JSON 完整备份」，再在另一端导入。
- **把选区交给 AI**　选中相关词块，打开「JSON / MCP」或桌面版的「MCP 接入」，导出选区 JSON。文件包含所选词块的原文和它们之间的手动连线。
- **让 AI 操作白板**　在桌面版打开「MCP 接入」，复制配置到支持本地 stdio 的 MCP 客户端，重新加载连接。默认只读。需要写入时，取消「只读访问」后重新复制配置。
- **启动桌面版**　解压整个下载包。Windows 运行 `MindFlow.exe`，Linux 运行 `./mindflow-desktop`。
- **从源码运行**　安装 Node.js 24，在仓库根目录依次运行 `npm ci` 和 `npm start`。运行测试用 `npm test`，构建网页用 `npm run build`。

## English

MindFlow is a whiteboard for arranging and connecting ideas. Double-click the canvas to add a card. Drag from its edge to another card to connect them. Double-click the line to describe the relationship.

- **Save or move a board.** The web edition saves in the current browser. To move to another device or the desktop app, choose **Export → Full JSON backup** and import the file there.
- **Share a selection with AI.** Select the cards, open **JSON / MCP** on the web or **MCP setup** on desktop, and export the selection. The file includes the original text and the connections you drew between those cards.
- **Connect an AI client.** Open **MCP setup** in the desktop app, copy the configuration into a client that supports local stdio MCP, and reload the connection. Access is read-only by default. To allow edits, clear **Read-only access** and copy the updated configuration.
- **Launch the desktop app.** Extract the whole archive. Run `MindFlow.exe` on Windows or `./mindflow-desktop` on Linux.
- **Run from source.** Install Node.js 24 and run `npm ci`, then `npm start` from the repository root. Use `npm test` to run the tests and `npm run build` to build the web edition.

[文件与 MCP 参考 · Files and MCP reference](docs/reference.md) · [示例 · Examples](examples/) · [版本记录 · Releases](https://github.com/moyx782/mindconnect/releases)
