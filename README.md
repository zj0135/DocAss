# DocAss（桌面文档助手）

现代化 WPF / WebView2 桌面智能文档助理，专为高保真文档阅读、离线 OCR 识别、多类型富标注及 AI 深度协同打造。

## 核心特性

- **多格式文档阅读**：支持 PDF、PNG、JPEG、BMP。支持密码解密、最近文档、多标签页、连续滚动阅读、缩略图、目录大纲、无级缩放与任意旋转。
- **精确文字与原生几何**：支持原生 PDF 文字层与本地离线 OCR 识别的自适应切换、跨页选词复制、全文精准检索及高亮匹配。
- **丰富标注体系**：高亮、下划线、便签卡片、文字批注、自由手绘、矩形框和箭头；支持撤销/重做、自动保存协调与防静默丢弃机制。
- **本地高精度 OCR**：内置 PaddleOCR 离线推理模型，支持轻量级/平衡型切换，保障无外网环境下的扫描件文字精准提取。
- **多模型 AI 协同对话**：支持流式对话、文档总结、选中文字快速问答、框选图像提问、文档工具自动调用、引用标签精准跳转原文对应页。
- **可靠数据架构**：本地 SQLite + 事务快照存储，支持损坏自动备份还原与平滑升级，敏感配置（如 API 密钥）均采用 Windows DPAPI 本地机密存储。

## 环境要求

- **操作系统**：Windows 10 / 11 (x64)
- **运行时**：Microsoft Edge WebView2 Evergreen Runtime
- **开发工具**：
  - .NET SDK **11.0.100** 或更高版本
  - Node.js **24.22.1** 或更高版本
  - pnpm **12.15.0** 或更高版本

## 常用开发与构建命令

```powershell
# 1. 安装前端依赖
pnpm install

# 2. 还原后端 .NET 依赖
dotnet restore DocAss.sln

# 3. 本地开发调试
pnpm dev                 # 启动前端开发服务器 (http://localhost:5173)
pnpm dev:host            # 启动 WPF 桌面宿主（连接本地前端 Vite 服务）

# 4. 代码格式化与质量检查
pnpm format              # 同时格式化前后端全部代码 (Prettier + dotnet format)
pnpm format:web          # 使用 Prettier 格式化前端代码 (TS, TSX, CSS, JSON)
pnpm format:host         # 使用 dotnet format 格式化后端 C# 代码
pnpm lint:web            # 使用 Oxlint 检查前端代码规范

# 5. 契约生成
pnpm run generate:contracts # 由 JSON Schema 重新生成前后端 DTO 模型与校验器

# 6. 生产构建
pnpm build               # 构建前端生产资源至 src/web/dist
pnpm build:host          # 编译 WPF 桌面宿主 Release 版本

# 7. 打包发布
pnpm run publish         # 打包生成桌面单文件自包含应用
```

## 工程目录结构与代码架构

本仓库采用“**抽象与实现分离、按领域功能归类**”的架构设计，统一配置代码风格规范：

```text
DocAss/
├── .editorconfig               # 全局编辑器代码格式化规范 (C#, TS, CSS, JSON)
├── .prettierrc.json            # 前端 Prettier 格式化配置
├── src/
│   ├── host/DocAss.Host/       # WPF 桌面宿主与核心服务源码 (C#)
│   │   ├── Bridge/             # 通信桥（IBridgeRouter 接口与 WebMessage 路由）
│   │   ├── Storage/            # 本地持久化（IStorageService, IAttachmentService, SQLite, 备份）
│   │   ├── Documents/          # 文档解析（IDocumentRegistry, IDocumentService, ITextGeometryService）
│   │   ├── Ocr/                # 本地 OCR（IOcrScheduler, SimdPaddleOCR 引擎, 缓存）
│   │   ├── Settings/           # 偏好配置（ISettingsService, DPAPI CredentialVault）
│   │   ├── Http/               # 回环代理（ILoopbackServer, IProviderProxy, 资源加载器）
│   │   ├── Windowing/          # 窗口生命周期（ICloseCoordinator, 多屏 DPI 适配）
│   │   └── Verification/       # 自动化与验收验证套件
│   ├── web/src/                # React 19 + TypeScript + Tailwind 前端源码
│   │   ├── services/           # 领域服务抽象（AppServices 接口契约，Desktop/Browser 实现）
│   │   ├── contracts/          # 前后端共享协议类型与自动校验器
│   │   ├── documents/          # 文档视口渲染（PDF.js, 图片文档, 滚动虚拟化）
│   │   ├── annotations/        # 富标注绘制、撤销重做与版本迁移
│   │   ├── llm/                # AI 会话管理、流式响应适配与 Agent 工具执行
│   │   ├── ocr/                # 文字层管理与 OCR 异步状态协调
│   │   ├── state/              # Zustand 全局与文档会话状态管理
│   │   └── ui/                 # 界面视图组件
│   │       ├── settings/tabs/  # 设置对话框模块化子面板 (Providers, Annotation, Ocr, About)
│   │       ├── chat/           # 智能助手聊天面板与 LiveMessage 消息渲染
│   │       ├── document/       # 悬浮便签卡片与文档搜索条
│   │       ├── panels/         # 缩略图、目录大纲与标注面板
│   │       └── primitives/     # 自定义通用 UI 控件 (Select, Switch, Toast, Dialog)
│   └── shared/                 # 前后端共享类型定义、JSON Schema 与测试用例
├── docs/                       # 产品需求与核心系统设计文档
├── scripts/                    # 契约生成、资源拷贝与发布打包脚本
├── DocAss.sln                  # 桌面端主解决方案
└── package.json                # 前端与全局构建配置
```

## 数据与存储说明

- 本地工作区数据位于：`%LocalAppData%\DocAss\data\workspace.db`
- 关键凭据（模型提供方 API Key）由 Windows DPAPI 本地加密存储在受保护保险库中，不上传云端，不写入纯文本日志。
