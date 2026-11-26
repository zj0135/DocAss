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

# 4. 生产构建
pnpm build               # 构建前端生产资源至 src/web/dist
pnpm build:host          # 编译 WPF 桌面宿主 Release 版本

# 5. 打包发布
pnpm run publish         # 打包生成桌面单文件自包含应用
```

## 工程目录结构

```text
DocAss/
├── src/
│   ├── host/DocAss.Host/       # WPF 桌面宿主与核心服务源码 (C#)
│   ├── web/src/                # React 19 + TypeScript + Tailwind 前端界面源码
│   └── shared/                 # 前后端共享类型定义与 JSON Schema
├── docs/                       # 产品需求与核心系统设计文档
├── scripts/                    # 资源拷贝与发布打包脚本
├── third-party/                # 第三方开源合规协议
├── DocAss.sln                  # 桌面端主解决方案
└── package.json                # 前端与全局构建配置
```

## 数据与存储说明

- 本地工作区数据位于：`%LocalAppData%\DocAss\data\workspace.db`
- 关键凭据（模型提供方 API Key）由 Windows DPAPI 本地加密存储在受保护保险库中，不上传云端，不写入纯文本日志。
