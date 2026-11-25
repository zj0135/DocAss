# DocAss（桌面文档助手）前端界面原型与 Mock 数据文档

> **原型范围说明（2026-11-25）**：本文描述 mock 界面与交互，不代表真实文档、OCR、持久化或 LLM 已接通。正式开发采用 [v1 实施设计](design-v1.md)，可复用组件与缺口见其 §3，剩余工作见 [a1–a62 任务清单](tasks.md)。

- **版本**：v0.2.0-prototype
- **基于规范**：[requirements.md](requirements.md) 与 [design.md](design.md)
- **原型对照来源**：`docs/image1.png` ～ `docs/image5.png`

---

## 1. 原型概述

本前端原型严格按照需求文档 `requirements.md`、系统设计文档 `design.md` 以及 5 份高保真界面原型图设计构建。采用 **React 19 + TypeScript + Vite 8 + Tailwind CSS** 技术栈开发，实现了极轻量的桌面级视觉布局，涵盖自定义标题栏、工具栏、左侧图标栏与可折叠面板、中央文档渲染视口、可拖动分隔条、右侧 AI 对话面板、底部状态栏以及模态设置窗口。

为方便评审与功能走查，原型内置了**原型场景快速切换器**（位于界面左下角），可一键精准切换至 5 份原型图对应的视觉与交互状态。

---

## 2. 原型图对照与实现细节

| 原型编号 | 原型对应图 | 界面核心内容与状态 | 前端原型对应实现 |
|---|---|---|---|
| **场景 1** | `image1.png` | **主界面概览**：顶部无边框标题栏与多标签页、绘图工具栏、文档区文本选中及悬浮条（浮出“问AI/高亮/下划线/便签/复制”）、右侧 AI 对话（展示工具调用记录、引用标签跳转 `[第 12 页]`、模型选择器）及底部状态栏（显示“原生文字”）。 | 标签页定位至《2025年度报告.pdf》，第 12 页，选中第三季度营收下行文本段落，显示浮动操作条，右侧为“营收情况分析”会话。 |
| **场景 2** | `image2.png` | **标注模式与便签卡片**：左侧展开“标注 (7)”面板（按页分组展示高亮、下划线、便签、矩形、图注、箭头）；工具栏展开颜色与线宽弹窗（2px滑杆）；文档内展示便签卡片（作者张三、时间、评论及指向锚点引线）、图表 8 控制点矩形选框、红圈标注与箭头；对话面板展示系统动作行“已为你创建 2 处高亮 [撤销]”；状态栏显示“已自动保存”。 | 左侧标注面板高亮选中项，画布上对应图元与便签卡片完整呈现，支持撤销高亮交互。 |
| **场景 3** | `image3.png` | **框选提问（Region Ask）**：工具栏选中“框选提问”工具；文档区在柱状图上方覆盖半透明虚线框与 8 控制点，右下角浮动“✨ 问 AI / 取消”按钮；右侧对话框展示已发送的截图附件卡片（“第 23 页 · 框选区域”），助手进行流式输出，输入区显示待发送缩略图托盘，发送按钮变为红色“■ 停止”。 | 虚线框与操作浮条精准对齐，对话流式动画与停止按钮、附件卡片一并呈现。 |
| **场景 4** | `image4.png` | **扫描件与 OCR 识别**：标签页切换至《采购合同-扫描件.pdf》；右上角展开查找条（输入“违约责任”，匹配“3 / 11”，下层显示“还有 24 页尚未识别”警告与“全部识别”按钮）；扫描合同正文高亮显示命中词，印有公章红印与法定代表人签名；页底覆盖“正在识别文字…”动画；状态栏显示“文字识别中 12 / 36 页”及进度条；对话区展示 OCR 工具读取进度条。 | 仿真扫描质感纸张，矢量官方印章，查找条与多级 OCR 进度联动演示。 |
| **场景 5** | `image5.png` | **设置模态对话框**：居中 900×620 模态窗口，左侧导航（模型提供方、标注、文字识别、关于）。当前选中“模型提供方”，列表展示 DeepSeek、OpenAI、阿里通义（带“已配置密钥”绿色徽章）；表单配置名称、接口地址、API Key 掩码及安全提示、模型选择、支持图像输入开关；底部“测试连接”并显示“✓ 连接成功”。 | 模态设置框完全按原型图 5 像素级复刻，支持四个配置 Tab 切换、表单字段编辑与连接测试。 |

---

## 3. Mock 数据架构设计与文档记录

所有数据结构与 TypeScript 类型均定义在 `src/web/src/types/index.ts`，初始数据定义在 `src/web/src/mock/mockData.ts`。

### 3.1 文档与标签页数据（`DocTab`）

```typescript
export interface DocTab {
  id: string;             // 标签唯一标识（如 'doc-1'）
  docHash: string;        // 文档内容 sha256 模拟哈希
  title: string;          // 显示文件名（如 '2025年度报告.pdf'）
  kind: 'pdf' | 'scanned-pdf' | 'image'; // 文档类型
  pageCount: number;      // 总页数（如 86 页）
  currentPage: number;    // 当前浏览页码（如 12）
  scale: number;          // 缩放比例（如 1.25 代表 125%）
  rotation: number;       // 旋转角度（0, 90, 180, 270）
  textSource: 'native' | 'ocr' | 'hybrid'; // 文字来源
  ocrStatus?: {           // OCR 运行状态（扫描件使用）
    isRecognizing: boolean;
    currentPage: number;
    totalPage: number;
    unrecognizedPages: number;
  };
}
```

**初始 Mock 数据集：**
1. **`doc-1`（2025年度报告.pdf）**：86 页，当前第 12 页，原生文字模式，用于演示主体经营报告、季度柱状图、文本选择与标注。
2. **`doc-2`（采购合同-扫描件.pdf）**：36 页，当前第 2 页，OCR 文字识别中（12/36），包含公章与合同法条，用于演示文档内查找与 OCR 识别。
3. **`doc-3`（会议纪要.png）**：单页图片，混合文字模式，包含决议表格与待办事项。

---

### 3.2 标注数据模型（`AnyAnnotation`）

涵盖系统设计的全部标注类型，与 PDF 规范映射一致：

| 标注类型 (`type`) | 关键字段 | 说明 | 对应原型展示 |
|---|---|---|---|
| `highlight` | `rects`, `quotedText`, `color` | 基于文本选区的高亮背景块 | P1、P2、P12 文字黄色与绿色高亮 |
| `underline` | `rects`, `quotedText`, `color` | 下划线标注 | P1、P12 红色下划线 |
| `note` | `x`, `y`, `contents`, `author`, `createdAt` | 便签图标与弹出评论卡片 | P2、P12 便签卡片（张三 2025-11-14） |
| `rect` | `x`, `y`, `width`, `height`, `strokeWidth` | 矩形包围线框（带 8 个控制点） | P2、P12 图表外框 |
| `arrow` | `from: {x,y}`, `to: {x,y}` | 矢量引导箭头 | P3、P12 指向 128.6 数据的箭头 |
| `freetext` | `x`, `y`, `text`, `color` | 页面直接文字批注/图注 | P3、P12 “图注 128.6”、“此处数据需核对” |

---

### 3.3 AI 对话与工具调用数据模型（`ChatSession`）

```typescript
export interface ChatSession {
  id: string;
  docId: string;          // 关联文档 ID
  title: string;          // 会话标题（如 '营收情况分析'）
  model: string;          // 选用模型（如 'DeepSeek-R1'）
  updatedAt: string;
  messages: ChatMessage[];// 对话消息列表
}
```

每条 `ChatMessage` 包含：
- **`toolCalls`（工具调用记录）**：如搜索文档 `已搜索文档：第三季度 营收`、读取页面 `已读取第 12-15 页`、OCR 读取进度 `正在读取第 5-8 页 (识别中 2/4)`。
- **`citations`（原文引用跳转）**：如 `[[p12|第 12 页]]`，点击直接驱动主文档区视口定位到第 12 页。
- **`attachments`（框选截图卡片）**：框选图表后生成的区域截图卡片（标明“第 23 页 · 框选区域”）。
- **`systemAction`（智能标注回执）**：如“✓ 已为你创建 2 处高亮”，附带可交互的“[撤销]”按钮。

---

### 3.4 系统设置数据模型（`AppSettings`）

```typescript
export interface AppSettings {
  providers: ModelProvider[];  // 模型提供方（DeepSeek、OpenAI、阿里通义等）
  annotation: {
    author: string;            // 标注默认作者名（张三）
    defaultColor: AnnotationColor; // 默认高亮色（#F6C445）
    defaultOpacity: number;    // 默认不透明度（60%）
    autoShowFloatingBar: boolean; // 选中文本自动显示浮条
  };
  ocr: {
    tier: 'tiny' | 'small' | 'medium'; // 模型档位
    enableGpu: boolean;        // GPU Vulkan 加速开关
    cachedPages: number;       // 缓存页数
    cacheSizeBytes: number;    // 缓存字节数
  };
}
```

---

## 4. 交互特性与组件清单

```
src/web/src/
├── App.tsx                     # 主窗口容器与状态总线
├── types/index.ts              # 核心 TypeScript 数据类型规范
├── mock/mockData.ts            # 完整的 Mock 数据集合
├── styles/tokens.css           # 设计 Token（色彩、阴影、圆角、字号、边框）
├── ui/
│   ├── TitleBar.tsx            # 48px 无边框标题栏、标签条与窗口控制
│   ├── Toolbar.tsx             # 44px 工具栏（工具单选、颜色板与粗细弹窗、历史、缩放、旋转、查找）
│   ├── ToolRail.tsx            # 48px 左侧图标栏（选择、缩略图、大纲、标注互斥开闭）
│   ├── Splitter.tsx            # 可拖动分隔条（双击复位为 35%）
│   ├── StatusBar.tsx           # 28px 底部状态栏（页码跳转、缩放步进、OCR/自动保存/来源优先级展示）
│   ├── panels/
│   │   ├── ThumbnailPanel.tsx  # 页面缩略图网格，当前页描边高亮，点击跳转
│   │   ├── OutlinePanel.tsx    # 树状目录大纲，可折叠，标有对应页码
│   │   └── AnnotationPanel.tsx # 标注列表，按页分组，彩色图标，摘要与页码，支持删除
│   ├── document/
│   │   ├── DocumentViewer.tsx  # 画布视口缩放与旋转容器、空白无文档状态
│   │   ├── PageReport2025.tsx  # 《2025年度报告》高保真渲染（图表、数据表格、选区浮条、便签、图形）
│   │   ├── PageContractScanned.tsx # 《采购合同-扫描件》仿真渲染（公章、签名、OCR进度、查找命中）
│   │   ├── PageMeetingMinutes.tsx # 《会议纪要》图文纪要文档
│   │   ├── FloatingBar.tsx     # 文本选中悬浮条（高亮/下划线/便签/复制/问AI）
│   │   ├── StickyNoteCard.tsx  # 便签弹出卡片（作者、时间、内容编辑、删除）
│   │   └── FindBar.tsx         # 文档查找条（输入框、序号总数、前后切换、未识别页警告及全部识别）
│   ├── chat/
│   │   ├── ChatPanel.tsx       # AI 对话面板（会话切换、重命名、新建、收起）
│   │   ├── MessageItem.tsx     # 气泡与卡片消息、Markdown 内容、引用高亮标签、复制与重新生成
│   │   ├── ToolRecord.tsx      # 工具调用简明记录与实时进度条
│   │   ├── CitationChip.tsx    # 可点击引用 Chip 标签（[第 12 页]）
│   │   └── Composer.tsx        # 多行输入框、附件托盘、模型切换下拉、发送/停止按钮
│   ├── settings/
│   │   └── SettingsDialog.tsx  # 900×620 模态设置框（提供方列表、API Key 掩码、测试连接、OCR配置）
│   └── demo/
│       └── PrototypeSceneSelector.tsx # 原型图 1～5 快速切换控制器
```

---

## 5. 本地运行与构建指令

本项目完全支持脱离宿主外壳在任意现代浏览器中独立运行：

```bash
# 1. 在根目录或 src/web 目录安装依赖
pnpm install

# 2. 启动开发调试热更新服务器（默认端口 5173）
pnpm dev

# 3. 生产构建打包
pnpm build

# 4. 本地预览生产构建产物
pnpm preview
```
