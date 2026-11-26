# DocAss 前端

基于 React 19 + TypeScript + Tailwind CSS 打造的现代化文档助理前端界面。

## 开发与构建

请从仓库根目录安装和运行开发命令：

```powershell
pnpm install            # 安装依赖并自动同步 pdf.js 静态资产
pnpm dev                # 启动 Vite 前端开发服务器 (http://localhost:5173)
pnpm build              # 校验 TypeScript 并打包生产资源至 dist
pnpm format:web         # 使用 Prettier 格式化前端代码
pnpm lint:web           # 使用 Oxlint 执行代码检查
```

## 架构与目录说明

前端业务遵循“**能力抽象定义与环境实现解耦**”的设计原则：

- `src/services/`：核心抽象接口 `AppServices`（定义了文档、文字层、OCR、持久化、模型代理、附件、窗口等领域能力接口），并在 `DesktopServices.ts`（桌面 WebView2 通信）与 `BrowserServices.ts`（浏览器环境模拟）中提供具体实现。
- `src/contracts/`：由 `contracts.schema.json` 自动生成的 TypeScript 类型定义与运行时 Ajv 校验器。
- `src/documents/`：基于 PDF.js Canvas 渲染的大文档虚拟滚动与页面视口控制。
- `src/annotations/`：文档富标注模型、画布绘制图层、撤销重做堆栈与版本自适应迁移。
- `src/llm/`：基于 `@earendil-works/pi-ai` 与 `@earendil-works/pi-agent-core` 的会话流式驱动与 Agent 工具执行。
- `src/ocr/`：原生文字图层与异步 OCR 识别文字的混合排版与几何映射。
- `src/ui/`：按交互职能划分的界面组件库：
  - `ui/settings/tabs/`：设置弹窗已按功能拆解为模型提供方、标注偏好、OCR 引擎和关于四个独立子模块。
  - `ui/chat/`：包含主对话面板及独立渲染的 `LiveMessage` 消息/工具卡片。
  - `ui/primitives/`：包含自定义 Select、Switch、Toast、ConfirmDialog 等无第三方重度依赖的原生控件。
