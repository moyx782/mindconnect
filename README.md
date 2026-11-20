# MindConnect · MindFlow Desktop 1.0

由你提供的 `mindflow.html` 扩展而来：保留空间白板、词块、手动连线与关系文字、群组、自由画笔、矩形/椭圆/直线、颜色、撤销重做、缩放和 Markdown 导出；增加真正的桌面窗口、本地文件保存、规范化 JSON 和可实际连接的 MCP 服务。

## 在线白板与下载

- 网页版：https://moyx782.github.io/mindconnect/
- 桌面下载：https://github.com/moyx782/mindconnect/releases/tag/v1.0.0
- 原始文件保留在仓库根目录 `mindflow.html`。

GitHub Pages 首页运行增强版白板，数据仅保存在当前浏览器 localStorage，不发送到 GitHub。请定期导出 JSON；清除网站数据会删除本地白板。网页保留一个旧版本于 `mindconnect-document-v1-backup`，受浏览器空间配额限制，不能替代独立备份。网页和桌面不自动同步，使用完整 JSON 迁移。Pages 静态托管不运行 MCP 进程。

## 直接使用

### Windows x64

解压 `MindFlow-1.0.0-win.zip` 到固定目录，双击 `MindFlow.exe`。请保留整个解压目录，不要只移动 EXE。无需安装 Node.js，也无需联网加载界面资源。此包未签名；Windows 包已构建，但本次未在 Windows 真机运行。

### Linux x64

解压 `MindFlow-1.0.0-linux-x64.tar.gz`，执行 `./mindflow-desktop`。桌面依赖系统 GTK/NSS/图形环境。保留 Chromium sandbox，不要用 `--no-sandbox` 作为常规启动方式。本次在 Linux 桌面实测了打包版。

macOS 可从源码在 Mac 上构建，本次没有提供或验证 macOS 安装包。

## 白板操作

- 双击空白创建词块；双击词块编辑文字，Enter 提交、Shift+Enter 换行。
- 拖动词块位置；Ctrl/Cmd/Shift 加选；从词块边缘锚点拖到另一个词块手动连线。
- 双击连线修改关系文字；选中词块后可使用“发散”和“归类群组”。
- 底部切换选择、画笔、矩形、圆形、直线；空格拖动平移，使用底部缩放和居中。
- Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 重做；撤销历史不跨重启，并在接收外部修改后重置，防止撤销覆盖 Agent 内容。
- 顶部“打开”或 Ctrl/Cmd+O 导入旧版/新版完整 JSON。导入会替换活动白板内容，当前版本留在自动备份；导入不是持续编辑外部文件，后续保存进入活动白板。
- Ctrl/Cmd+S 保存，Ctrl/Cmd+Shift+S 导出完整 JSON；“导出大纲”提供 Markdown 和完整 JSON 预览。

软件当前有一张活动白板。可通过导入/导出管理多个文件，或使用 `--data-dir` 隔离多个工作区；没有额外加入多标签白板管理。

## JSON：两种用途

| 文件 | 用途 | 可导回白板 |
| --- | --- | --- |
| `examples/mindflow-board.json` | 完整备份：原文、位置、颜色、连线、分组、笔迹、视口、选区、版本 | 是 |
| `examples/mindflow-context.json` | 供 Agent 阅读的语义与几何数据，含 scope 与内容说明 | 否 |
| `src/board.schema.json` | Draft-07 JSON Schema | 校验用 |
| `examples/original-board.json` | 从原 HTML 内置模板提取的旧版 JSON | 是 |

上传的 HTML 包含内置示例（7 个词块、6 条关系、2 个群组），不包含原浏览器 localStorage 中的个人编辑。迁移个人白板时，请先在旧 HTML 中导出 JSON，再在桌面版打开。

完整格式包含 `format: "mindflow"`、`schemaVersion: 1`、`boardId`、`revision`、`updatedAt`、`title`、`tokens`、`edges`、`clusters`、`drawings`、`viewport`、`selection`。使用字段校验、引用校验、ID 唯一校验；拒绝未来版本、未知字段、无效坐标和悬空关系。单文件上限 16 MiB。

“**MCP 接入 → 提取供 Agent 阅读的 JSON**”支持仅选区或整张白板。空选区返回空数据。选中连线时包含其两端词块；选中群组不会自动扩大到群组内所有词块。群组的 `spatialMemberIds` 只是基于位置的提示，不是用户创建的语义依赖。手写和图形保留几何坐标，不含 OCR 或图像理解结果。

## 连接 MCP

1. 启动软件，点击右上角 **MCP 接入**。
2. 默认勾选“只读访问”。需要 Agent 写入时取消勾选，再复制新配置。
3. 将配置加入支持**本地 stdio MCP** 的客户端。界面生成的路径与你的实际解压位置、数据目录匹配。
4. 重启/重新加载客户端的 MCP 服务；应看到 3 个只读工具，或 6 个读写工具，以及 3 个资源。
5. 在白板中选择词块，让 Agent 调用 `mindflow_get_context`。只有需要全图时，明确传入 `scope: "all"`。

配置使用软件内置的 Electron/Node 运行时，通过 `ELECTRON_RUN_AS_NODE=1` 在无窗口模式启动 MCP。客户端启动一个独立进程，桌面关闭时也能读取数据；MCP 不开启网络端口。**这不等于在 ChatGPT 网页直接注册一个公网 Connector**，也没有替你修改现有客户端配置。

只读开关影响复制出来的配置，需重新加载 MCP 服务才生效。它是此服务的工具权限控制，不阻止其他同用户本机程序直接访问数据文件。移动软件目录后请重新复制配置。

### 工具

| 名称 | 功能 |
| --- | --- |
| `mindflow_get_board` | 完整活动白板与 revision |
| `mindflow_get_context` | 选区/整图的内容 JSON；默认 selected |
| `mindflow_search` | 按词块原文做字面检索 |
| `mindflow_apply_operations` | 原子批量增改删词块、连线、群组、图形 |
| `mindflow_set_selection` | 设置精确选区 |
| `mindflow_rename_board` | 修改白板标题 |

资源为 `mindflow://board`、`mindflow://selection`、`mindflow://schema`。

写入必须先读当前 `revision`，再把它作为 `expectedRevision`。例如在读取版本 8 后：

```json
{
  "expectedRevision": 8,
  "operations": [
    {
      "action": "upsert",
      "collection": "tokens",
      "item": {"id": "idea_001", "text": "新的思路", "x": 120, "y": 80, "color": "blue"}
    },
    {
      "action": "upsert",
      "collection": "edges",
      "item": {"id": "relation_001", "source": "tk_root", "target": "idea_001", "label": "补充"}
    }
  ]
}
```

`upsert` 是替换完整对象，非合并部分字段。批量操作最多 500 项，任一失败则整体不写入。删除词块同时删除其关联边。ID 仅允许字母、数字、下划线、连字符；颜色为 neutral/yellow/blue/green/red/purple。对象精确定义见 Schema。词块文字只作为数据，不自动执行其中的命令，也不自动推断、添加关系。

## 保存、同步与恢复

默认活动文件：

- Windows：`%APPDATA%\MindFlow\board.json`
- Linux：`$XDG_DATA_HOME/MindFlow/board.json`，未配置时为 `~/.local/share/MindFlow/board.json`
- macOS：`~/Library/Application Support/MindFlow/board.json`

可在 MCP 接入窗口打开数据目录。启动参数 `--data-dir <绝对目录>` 或环境变量 `MINDFLOW_DATA_DIR` 可以覆盖；桌面与 MCP 必须指向相同目录。

修改自动保存，窗口关闭前刷新最后编辑。跨进程目录锁 + 版本检查 + 临时文件原子替换，保留最近 20 个旧版本于 `backups/`（包括选区和视口变化产生的版本）。空闲时约 1.4 秒检查外部更新；正在编辑时不强行替换画面。如果发生竞争，显示未保存提示并保留本地编辑，可以导出副本后读取最新版本；不会自动合并或静默覆盖。

遇到文件损坏时应用停止读取，不会用示例覆盖旧文件。关闭桌面和 MCP 客户端，保留损坏文件副本，再用 `backups/revision-*.json` 替换 `board.json` 后重启。备份仅保留 20 个版本，长期内容请主动导出。

## 从源码运行

需要 Node.js 22 或更新版本。所有依赖已在 `package-lock.json` 锁定。

```bash
npm ci
npm start
npm test
```

若包管理器禁用了安装脚本而 Electron 提示未正确安装：

```bash
node node_modules/electron/install.js
```

单独运行 MCP（无需桌面）：

```bash
node src/mcp.mjs --data-dir /absolute/path/to/mindflow-data --read-only
```

移除 `--read-only` 开启 3 个写入工具。客户端配置示例见 `examples/mcp.config.example.json`，替换其中的绝对路径；本机桌面生成的配置通常更省事。

构建：

```bash
npm run build
npm run pack:win
npm run pack:linux
# 在 macOS 上：npm run pack:mac
```

`npm run build:css` 只在修改 Tailwind 类后需要运行，已包含编译后的离线样式。构建工作流 `.github/workflows/build.yml` 在推送 main 后测试并构建 Windows/Linux；首次成功后发布 v1.0.0 下载包，后续不会覆盖该版本。升级时应同步更新版本号、发布工作流和网页下载链接。

网页版修改后运行 `npm run build`，将生成的根目录 `index.html`、`ui/browser.js`、`ui/validator.generated.mjs` 和样式一同提交；Pages 使用 main 根目录。`npm run test:web` 需要先运行 `npx playwright install chromium`，或设置 `CHROMIUM_PATH` 使用本机 Chromium。

## 验证与实现范围

详见 `VALIDATION.md`。没有预装 AI 模型、模型 API Key 或内置对话机器人；MCP 把现有白板开放给你选择的 Agent。没有远程 HTTP MCP、云同步、多用户协作、自动更新或代码签名。界面运行时禁用 Node 集成、启用隔离与 sandbox，限制导航和权限，使用本地资源与 CSP。

参考：
- Electron security: https://www.electronjs.org/docs/latest/tutorial/security
- MCP SDK v1（本项目锁定 1.32.2）: https://ts.sdk.modelcontextprotocol.io/server
