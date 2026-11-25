# DocAss（DocumentAssistant）设计文档

> **历史设计**：实施方案已由 [v1 实施设计](design-v1.md) 替代；后续开发按 [a1–a62 任务清单](tasks.md) 执行。本文保留原始设计和评审回写，供追溯，不再作为实施基线。

- 版本：0.2（历史草案）
- 日期：2026-11-15
- 配套文档：[requirements.md](requirements.md)
- 变更：0.2 按原型 `image1.png`–`image5.png` 新增第 10 章“界面架构与交互”，并相应更新仓库结构、桥方法、测试、风险和待验证清单。
- 评审补记（2026-11-25）：见 [设计评审与验证结论](design-review-2026-11-25.md)。本次回写已验证的 API、通道和几何结论；保存、文本索引、任务与会话等契约仍需按评审修订，不能将本文视为全部通过。

> **关于 [待验证]**：本文档写于任何代码之前。pi 和 SimdPaddleOCR 的信息来自各自的 GitHub README；PDF.js 和 WebView2 的细节来自已有知识，没有对照当前版本的文档核实。标 **[待验证]** 的内容要在 Spike 中确认，结论写入 `docs/spikes/`，并回写到本文档。第 13 节有完整清单。界面布局以 `docs/image1.png`–`image5.png` 原型为准，见第 10 章。

> **历史验证范围**：隔离工程在原工作区的 `spikes/review-2026-11-25/`，结果在其 `results/summary.json`，按源码仓库要求不纳入 Git。原文引用的 `spikes/S0.md` 缺失；本段描述评审当时的原型状态，不作为下列能力已经实现的证据。当前正式进度见 [第一阶段记录](validation/phase1.md)。

## 1. 总体架构

```
┌──────────────────────── WPF 宿主（DocAss.Host）────────────────────────┐
│  MainWindow：只有一个 WebView2                                          │
│  BridgeRouter（web message）  HostResourceHandler + loopback LLM      │
│  DocumentService  OcrService  LlmProxyService  SecretStore  DocStore    │
└───────────────▲──────────────────────────────▲──────────────────────────┘
                │ 控制面：小 JSON 消息          │ 数据面：fetch（LLM 为 loopback）
┌───────────────▼──────────────────────────────▼──────────────────────────┐
│  WebView2 内的前端（React + TypeScript + Vite）                          │
│  bridge → doc（PDF.js）→ text（统一文本模型）→ viewer（Canvas）          │
│  annot（标注）   llm（pi-ai + pi-agent-core）   state（zustand）         │
└──────────────────────────────────────────────────────────────────────────┘
```

职责划分：

| 位置 | 负责 |
|---|---|
| 前端 | 渲染、文字几何、选择、复制、查找、标注、对话界面、Agent 循环和工具 |
| 宿主 | 文件访问、OCR 推理、API Key 保管、LLM 请求代理、本地存储的原子读写 |

## 2. 仓库结构与构建

```
DocAss/
  DocAss.sln
  src/host/DocAss.Host/
    App.xaml(.cs)  MainWindow.xaml(.cs)
    Bridge/    BridgeRouter.cs  BridgeMessage.cs  HostResourceHandler.cs
    Services/  DocumentService.cs  OcrService.cs  LlmProxyService.cs
               SecretStore.cs  DocStore.cs  SettingsService.cs
  src/host/DocAss.Host.Tests/
  src/web/
    public/pdfjs/{cmaps,standard_fonts,wasm}/
    src/bridge/   protocol.ts  hostBridge.ts  webview2Transport.ts  mockTransport.ts
    src/doc/      PagedDocument.ts  PdfJsDocument.ts  ImageDocument.ts
    src/text/     model.ts  pdfjsExtractor.ts  ocrExtractor.ts  lineBuilder.ts  hitTest.ts  search.ts
    src/viewer/   Viewer.tsx  PageView.tsx  renderQueue.ts  overlayPainter.ts  layout.ts
    src/annot/    schema.ts  store.ts  commands.ts  tools/*.ts  migrate.ts
    src/llm/      transport.ts  piProvider.ts  agentSession.ts  tools/*.ts  context.ts  citations.ts
    src/state/    appStore.ts  docStore.ts  DocSession.ts
    src/ui/
      App.tsx  TitleBar.tsx  TabStrip.tsx  WindowControls.tsx
      Toolbar.tsx  ToolRail.tsx  StatusBar.tsx  Splitter.tsx
      panels/     ThumbnailPanel.tsx  OutlinePanel.tsx  AnnotationPanel.tsx
      overlays/   FloatingBar.tsx  FindBar.tsx  NoteCard.tsx  FreetextEditor.tsx
      chat/       ChatPanel.tsx  ConversationMenu.tsx  MessageList.tsx  MessageItem.tsx
                  ToolRecord.tsx  CitationChip.tsx  AttachmentCard.tsx  Composer.tsx
      settings/   SettingsDialog.tsx  ProviderForm.tsx  AnnotationSettings.tsx
                  OcrSettings.tsx  AboutPage.tsx
      styles/     tokens.css  base.css
  docs/     requirements.md  design.md  spikes/
  samples/  测试 PDF 和扫描件
```

### 2.1 目标框架

- `net11.0-windows`，发布用自包含（`SelfContained`）加 `win-x64`。
- 选 net11 的原因：本机只装了 .NET SDK 11.0.100，选 net10 要额外下载 10.x 的引用包和运行时包。
- 本次隔离工程已确认 `net11.0-windows` 可引用 `Microsoft.Web.WebView2` 1.0.4314.35 并运行；Runtime 为 158.0.4370.33。这不代替标题栏与 Vite HMR 验收。
- SimdPaddleOCR 2.0.0 的 GPU 后端在 `net10.0` 资产里。本次 `obj/project.assets.json` 确认 net11 选中该资产，CPU 与强制 Vulkan 均完成推理；故障回退仍需验收。
- 本次验证固定：`@earendil-works/pi-ai` / `@earendil-works/pi-agent-core` 1.6.0、`pdfjs-dist` 6.5.438、`Sdcb.SimdPaddleOCR` 2.0.0、ChineseV6 模型包 1.0.0、PdfPig 0.1.16。旧 `@mariozechner/pi-ai` API 不得与新包混用；生产工程需锁定版本。
- 回退：`net10.0-windows` 加自包含。

### 2.2 开发与发布

- 开发：`pnpm dev` 启动 Vite（端口 5173），宿主用 `dotnet run -- --dev-url http://localhost:5173` 加载。
- 发布：`pnpm build` 产出 `src/web/dist`，csproj 把它复制到 `wwwroot/`，宿主导航到 `https://app.docass.example/`。
- 域名用 `.example`。本机虚拟映射实验中 `.example`、`.local` 都在约 1–2ms 返回，未复现约 2 秒延迟；不得据此推断其他 DNS/Runtime 环境。
- 文件与 OCR 端点保持同源 `/_host/*`；LLM 改走受限 loopback，前端 transport 从宿主取得临时端点和口令。开发与发布源均需精确配置允许的 origin。
- 静态资源由 `HostResourceHandler` 从 `wwwroot` 提供，不与同 host 的 `SetVirtualHostNameToFolderMapping` 混用。本次确认映射路径直接返回文件，未触发匹配的拦截处理。

### 2.3 PDF.js 接入要点

- worker：`import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`，只设置一次 `workerSrc`。
- 把 `cmaps/` 和 `standard_fonts/` 拷到 `public/pdfjs/`，并传 `cMapUrl`、`cMapPacked`、`standardFontDataUrl`。缺少时中文会乱码或缺字。
- 本次 6.5.438 包中确认 JBIG2、JPX 和 ICC 相关 wasm 资源；部署 `wasm/` 并设置 `wasmUrl`，不要只拷 cmaps/fonts。真实格式样本解码验收仍待完成。

## 3. 宿主与 JS 的桥

### 3.1 控制面

小 JSON 消息走 `chrome.webview.postMessage` 和 `WebMessageReceived`。契约集中在 `src/web/src/bridge/protocol.ts`，C# 侧和浏览器 mock 都对照它实现。

```ts
type Req    = { v: 1; kind: 'req'; id: string; method: string; params: unknown };
type Res    = { v: 1; kind: 'res'; id: string; ok: true; result: unknown }
            | { v: 1; kind: 'res'; id: string; ok: false; error: { code: string; message: string } };
type Evt    = { v: 1; kind: 'evt'; topic: string; payload: unknown };   // 双向
type Cancel = { v: 1; kind: 'cancel'; id: string };

type DocHandle = {
  docId: string;        // 会话内随机 token
  docHash: string;      // 文件内容 sha256
  fileName: string;
  byteLength: number;
  kind: 'pdf' | 'image';
};
```

方法表：

| 方法 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `app.getInfo` | 无 | `{ version, devMode, gpu }` | |
| `doc.pickAndOpen` | 无 | `DocHandle \| null` | 宿主弹出文件对话框 |
| `doc.openRecent` | `{ docHash }` | `DocHandle` | |
| `doc.close` | `{ docId }` | 无 | |
| `store.read` | `{ docHash, key }` | `string \| null` | `key` 为 `annotations`、`meta` 或 `conv/{id}` |
| `store.write` | `{ docHash, key, json }` | 无 | 原子写 |
| `store.list` | `{ docHash, prefix }` | `string[]` | |
| `ocr.getCached` | `{ docHash, page, profile }` | `OcrPageResult \| null` | |
| `ocr.cancel` | `{ jobId }` | 无 | |
| `secrets.set` | `{ providerId, apiKey }` | 无 | 只写 |
| `secrets.has` | `{ providerId }` | `boolean` | 没有读取接口 |
| `settings.get`、`settings.set` | | | |
| `clipboard.setText` | `{ text }` | 无 | 剪贴板 API 失败时的回退 |
| `shell.openExternal` | `{ url }` | 无 | |
| `window.minimize` | 无 | 无 | |
| `window.maximize` | 无 | 无 | 切换最大化 / 还原 |
| `window.close` | 无 | 无 | 走 `app.beforeClose` 流程 |

事件：`doc.fileDropped`、`ocr.progress`、`app.beforeClose`（JS 处理完后回 `app.readyToClose`）、`window.stateChanged`（最大化状态变化，用于切换按钮图标）。

约束：

- JS 只拿到 `docId`，永远不传也不接收文件路径。
- 宿主校验消息来源的 origin，并禁止导航到应用源之外。
- C# 侧 `BridgeRouter` 按方法名分发到服务，序列化用 `System.Text.Json` 源生成。

### 3.2 数据面

大二进制不走 web message。方案对比：

| 方案 | 结论 |
|---|---|
| base64 放进 web message | 否决。体积增加 33%，还有 JSON 解析和 UI 线程拷贝的开销 |
| `SetVirtualHostNameToFolderMapping` | 只适合静态目录，不能映射任意用户文件，也不能处理 POST |
| `PostSharedBufferToScript` | 宿主分配 ReadWrite 缓冲区后，JS 可填充并通知宿主；本次写 42 / 读 42 成功。暂留作 OCR 优化，需定义所有权和释放 |
| `WebResourceRequested` 拦截 `/_host/*` | 用于文件和有限长度 OCR 响应。本次自定义 Stream 直到 EOF 才交给 JS，不用于 LLM 增量流 |

端点：

| 端点 | 说明 |
|---|---|
| `GET /_host/ping` | 健康检查 |
| `GET /_host/doc/{docId}/bytes` | 返回文件流，交给 PDF.js `getDocument({ url })`。Range 支持后置 |
| `POST /_host/ocr/{docId}/{page}?dpi=200&model=small` | 请求体是页面位图（PNG，或原始 RGBA 加 `X-Width`、`X-Height`、`X-Stride` 头）；响应是 `OcrPageResult` JSON；宿主顺带写缓存 [待验证：大请求体的读取吞吐] |
| loopback `/llm/{providerId}/...` | LLM 反向代理，限定方法和路径，精确 CORS 与临时口令，见第 4 节 |

### 3.3 浏览器 mock

`hostBridge.ts` 探测 `window.chrome?.webview`，不存在时使用 `mockTransport.ts`：

- `doc.pickAndOpen` 用 `<input type="file">`，哈希用 `crypto.subtle`。
- `store.*` 落到 IndexedDB。
- OCR 返回固定的样例 JSON。
- Vite 插件 `viteHostMock.ts` 把 `/_host/llm/*` 反代到真实上游，Key 取自 `.env.local`。仅用于开发，`.env.local` 不进仓库。

## 4. LLM 代理

### 4.1 接入方式

- pi-ai 1.6.0 已在真实 WebView2 中运行。`createProvider` 接受结构化占位 auth 与 baseUrl，但实际请求按 `model.baseUrl` 发送；必须重写模型地址或请求适配器，不能仅设置 provider 地址。`api` 传适配器实现；OpenAI completions 已确认支持自定义 `fetch`。
- 不采用 pi 的 `streamProxy`：已确认其向 `/api/stream` POST `{ model, context, options }` 并处理 pi 事件协议，不能接透明上游 SSE。
- 宿主只做透明字节反向代理：
  1. 按 `providerId` 查出已保存的上游地址和解密后的 Key。
  2. 去掉 JS 发来的 `Authorization` 和 `x-api-key` 头，注入真实值。
  3. 用 `HttpClient.SendAsync(..., HttpCompletionOption.ResponseHeadersRead)` 转发，经 loopback 响应增量复制并 Flush；请求断连和桥 cancel 关联同一取消 token。该选项不能使 WebView2 拦截流自动增量下发。
- pi 包在自有接口后面，其余代码不直接依赖它：

```ts
interface LlmTransport {
  stream(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmEvent>;
}
```

### 4.2 通道选择

| 顺序 | 通道 | 优点 | 缺点和未知 |
|---|---|---|---|
| 首选 | 本机 loopback：`http://127.0.0.1:{随机端口}`，每会话一个 bearer token | 本次 pi 四段增量约 60 / 311 / 563 / 817ms；宿主约 1–2ms 感知取消 | 必须精确 CORS；包含适配器的 `x-stainless-*` 头。本次无本地网络权限事件，其他 Runtime/策略需复核；不要只按旧 PNA 设计 |
| 不采用作流通道 | 拦截 `/_host/llm/*` | 同源，仍可用于有限长度数据 | 本次四段在约 1424ms 一次返回；取消 fetch 后宿主继续读取，不满足 S1 |
| 回退候选 | web message 隧道 | OpenAI completions 已验证可注入 `fetch` | 仍需流重组、背压、取消和大小上限，完整通道尚未验证 |

中止的补救：如果宿主感知不到 `fetch` 中止，前端在请求里带 `X-DocAss-Request-Id` 头，中止时通过桥发 `cancel` 消息；宿主另设空闲超时。

### 4.3 安全边界

- Key 用 `ProtectedData.Protect(..., DataProtectionScope.CurrentUser)` 加密，写到 `%AppData%\DocAss\secrets.bin`。
- JS 只有 `secrets.set` 和 `secrets.has`。
- 上游地址由用户在设置页填写，保存在宿主配置里。代理只转发到已保存的地址，JS 不能在请求中指定上游。否则 Key 可以被带到任意地址。
- 禁止自动跨 origin 重定向；本次默认 HttpClient 在 302 后仍转发 `x-api-key`，只校验初始地址不足。限制 scheme、origin、相对路径和 provider 认证形式；使用假密钥回归测试。完整边界见评审 R3、R8。

### 4.4 失败处理

- 上游的 4xx、429、超时：原样回传状态码和错误体。
- 宿主自身的错误（未配置 Key、上游不可达）：返回 502 加 JSON 错误体 `{ code, message }`。
- 对话面板显示错误原因，并提供重试。

### 4.5 pi 不可用时的兜底

保留 `LlmTransport` 接口，自己实现 OpenAI 兼容的 SSE 适配。Agent 循环仍先尝试 `pi-agent-core`，不行再自写一个最小的工具调用循环。

## 5. 统一文本模型

选择、查找、标注和 LLM 工具都依赖这一层，定义在 `src/web/src/text/model.ts`。

### 5.1 页面空间

- PDF 原始用户空间，原点与 CropBox 按 PDF 数据保留，y 向上；单位是 user space unit，仅 `/UserUnit=1` 时等同 pt。每页记录 `userUnit`，统一用 PDF.js viewport 正逆变换。
- **不应用页面的 `/Rotate`**。
- 保留 CropBox 偏移，即直接使用 PDF.js `transform` 的原始坐标。
- 每页记录 `pageBox: [x0, y0, x1, y1]`（即 `page.view`）和 `rotate`。
- 图片文档：`pageBox = [0, 0, w * 72 / dpi, h * 72 / dpi]`，像素到页面坐标要做 y 翻转。

所有文字几何和标注都持久化在页面空间，绘制时再乘当前的 viewport 变换。**任何地方都不持久化画布像素坐标。**

### 5.2 数据结构

```ts
type Box  = [x0: number, y0: number, x1: number, y1: number];
// 阅读方向下的 左上、右上、右下、左下，页面空间
type Quad = [x1: number, y1: number, x2: number, y2: number,
             x3: number, y3: number, x4: number, y4: number];

interface PageText {
  page: number;
  pageBox: Box;
  rotate: 0 | 90 | 180 | 270;
  source: 'native' | 'ocr' | 'hybrid';
  lines: Line[];            // 已按阅读顺序排序
  text: string;             // 页内线性文本
  ocrProfile?: { dpi: number; model: 'tiny' | 'small' | 'medium'; engineVer: string };
}
interface Line { quad: Quad; dir: number; runs: Run[]; charStart: number; charEnd: number; }
interface Run  { quad: Quad; text: string; fontName?: string; chars: Char[]; src: 'native' | 'ocr'; }
interface Char { quad: Quad; ch: string; index: number; conf?: number; }
```

### 5.3 来源 A：PDF.js 原生文字

`pdfjsExtractor.ts`：

- `getTextContent` 的每个 item 提供 `str`、`transform`、`width`、`height`、`fontName`、`hasEOL`。只有片段级盒子，没有逐字位置。
- 内嵌字体以 `fontName` 注册到 `document.fonts` 在合成样本上已确认。但“累计 `measureText` 再按 item.width 比例分配”的逐字推导不通过 S2：五类样本 45 个非空白字符仅 39 个起点误差 <0.15 字宽。不得以此算法直接承诺精确选择/高亮。
- 字体不可用时，按 East Asian Width 加权分配：全角 1，半角 0.5。
- 可传 `disableNormalization: true` 保留连字等规范化前字符串；它不能保证字符与字形一一对应，也不会消除提取时合成的空白。统一文本需使用范围和 glyph 多对多映射，见评审 R5。
- 竖排文字用 `styles[fontName].vertical` 判断，沿 y 方向分配。

S2 决策：本次近似算法不达标，进入 `TextGeometryService` 的 PdfPig 验证分支，端点候选 `GET /_host/doc/{docId}/text/{page}`。PdfPig 对本次 `TJ` 六字起点准确，合成中文可提取；真实 CID 精度与 PDF.js 文本对齐尚未通过。`PageText` 在固定接口前还需补 text span、userUnit、revision，不能承诺现有草案接口完全不变。

### 5.4 行合并

`lineBuilder.ts`：

- item 是内容流顺序，不是阅读顺序。
- 按基线方向聚类成行，行内按投影位置排序，行之间按 y 降序、x 升序排列。
- v1 不做分栏和表格检测。

### 5.5 来源 B：宿主 OCR

`ocrExtractor.ts` 和 `OcrService.cs`：

1. JS 用 PDF.js 以 200 DPI、应用了 `/Rotate` 的正向 viewport 渲染到 `OffscreenCanvas`，POST 给宿主。
2. 宿主用 WPF 自带的 WIC（`BitmapDecoder`）解码为 BGRA32。
3. 调用 `ocr.Run(pixels, width, height, stride, format, returnCtcAlignment: true)`，对每行调用 `EstimateCharacterBoxes()`，得到逐字符的像素四边形。
4. JS 用渲染时的同一个 viewport 调 `convertToPdfPoint`，换算到页面空间。

补充：

- 图片文档由宿主直接解码原文件，不经过 JS。
- `PaddleOcrAll` 懒加载，调度并发由资源预算限制。本次 2.0.0 发布源码与双调用 smoke 支持同实例并发；`Run` 不接受 CancellationToken。取消只能撤销队列/忽略结果，若要求立即停止计算需独立进程或其他实现。任务 ID、订阅与取消协议待按评审 R6 补齐。

```ts
interface OcrPageResult {
  width: number; height: number;          // 位图像素
  lines: { quad: number[]; text: string; conf: number;
           chars: { quad: number[]; ch: string }[] }[];
  profile: { dpi: number; model: string; engineVer: string };
}
```

### 5.6 逐页判定

| 结果 | 条件 |
|---|---|
| `native` | 原生字符数达到阈值，且乱码率低（U+FFFD 和私用区字符的占比） |
| `ocr` | 原生字符数约等于 0 |
| `hybrid` | 有少量原生文字，同时页面含大幅图像。两路都跑，丢弃与原生行重叠（IoU 大于 0.5）的 OCR 行后合并 |

- `hybrid` 的判据：用 operator list 中图像面积的占比 [待验证可行性]；简化判据是“字符数少于 N 且页面含图像”。
- 用户可以对单页覆盖判定结果。
- 调度：可见页前后 2 页优先；查找或 LLM 需要全文时启动后台全量任务，通过 `ocr.progress` 事件报告进度。

### 5.7 OCR 缓存

- 路径：`%LocalAppData%\DocAss\cache\ocr\{sha256}\p{page}.d{dpi}.{model}.v{schema}.json`。
- 键里包含模型档位，因为不同档位给出的盒子不同。
- 评审要求：上述路径只是草案，正式 key 还需引擎/模型版本、预处理和方向等指纹，结果保存 raster→page 矩阵；否则重识别和升级会错误复用，见评审 R5。

## 6. 阅读器

### 6.1 文档抽象

```ts
interface PagedDocument {
  pageCount: number;
  getPageInfo(i: number): { pageBox: Box; rotate: number };
  render(i: number, canvas: HTMLCanvasElement, viewport: Viewport, signal: AbortSignal): Promise<void>;
  getNativeText(i: number): Promise<PageText | null>;
}
```

实现：`PdfJsDocument` 和 `ImageDocument`。v2 的 Word 先转成 PDF，再复用 `PdfJsDocument`。

### 6.2 布局与虚拟化

- `layout.ts` 根据所有页的 `pageBox`、`rotate` 和缩放比例，算出每页的 top 和 height，用作占位高度。
- 只挂载可视区前后 2 页的 `PageView`。

### 6.3 画布

- 每页两个 canvas：内容层和叠加层。叠加层每页一个，坐标系简单，随页滚动，虚拟化时一起销毁。
- 两个 canvas 都设 `pointer-events: none`。
- 指针事件由滚动容器统一接收（`setPointerCapture`），用 layout 映射成 `{ page, 页面空间坐标 }`。跨页拖选因此不受分页影响。

### 6.4 分辨率与缩放

- 画布后备尺寸 = CSS 尺寸 × `devicePixelRatio`。
- 单页像素上限约 1600 万。超出时降低后备分辨率，用 CSS 放大。
- 监听 `devicePixelRatio` 变化（窗口跨屏移动）。
- 缩放时先用 CSS 拉伸旧位图，150 毫秒防抖后重新渲染。

### 6.5 渲染队列

`renderQueue.ts`：

- 可见页优先，并发 1 到 2。
- 页面离屏、缩放变化或切换标签页时调用 `renderTask.cancel()`，并忽略 `RenderingCancelledException`。

### 6.6 旋转

- 视图旋转 = 页面自身的 `rotate` + 用户旋转，只影响 viewport。
- 文本模型和标注始终在未旋转的页面空间。

### 6.7 命中测试

`hitTest.ts`：

- 每页的行按 y 排序后二分查找，把点投影到行的基线方向，再二分找字符。
- 点落在行间空白时取最近的行。

### 6.8 选择、复制、查找

- 选择状态：`{ anchor: { page, charIndex }, focus: { page, charIndex } }`，基于页内线性序号，天然支持跨行和跨页。
- 绘制选区时，把字符四边形按行合并成行四边形。
- 复制：中文之间不加空格，拉丁文本加空格，行尾连字符合并。用 `navigator.clipboard.writeText`，失败时回退到桥的 `clipboard.setText`。自己监听 Ctrl+C。
- 查找（`search.ts`）：每页生成规范化串（NFKC、大小写折叠、去掉行连接处的空白）和“规范化位置到 `charIndex`”的映射表。后台空闲时逐页提取文字。命中结果换算成四边形后高亮。

## 7. 标注系统

### 7.1 存储布局

`%AppData%\DocAss\docs\{sha256}\`：

| 文件 | 内容 |
|---|---|
| `annotations.json` | 标注 |
| `meta.json` | 最近路径、标题、页数、上次的视图状态 |
| `conversations\{id}.json` | 对话 |
| `attachments\` | 对话里的图像附件 |

- 宿主负责可靠读写：同目录临时文件，目标存在时 `File.Replace` 保留 `.bak`，首次创建需 `Move` 分支（本次实测 Replace 首写失败）。正式协议还需每文件串行、revision/ack、多进程冲突与恢复，见评审 R4；原子替换不保证未提交编辑在崩溃后保留。
- schema 和迁移逻辑都在 JS 的 `annot/migrate.ts`。

### 7.2 数据结构

```ts
interface AnnotationFile {
  schemaVersion: 1;
  docHash: string;
  fileName: string;
  pageCount: number;
  updatedAt: string;
  annotations: Annotation[];
}

interface AnnotBase {
  id: string;
  page: number;
  rect: Box;                 // 包围盒，页面空间
  color: string;
  opacity: number;
  author: string;
  createdAt: string;
  modifiedAt: string;
  contents?: string;         // 评论文字
  llmRef?: { conversationId: string; messageId: string };
}

type Annotation =
  | AnnotBase & { type: 'highlight' | 'underline'; quads: Quad[]; quotedText: string; textSource: 'native' | 'ocr' }
  | AnnotBase & { type: 'note'; anchor: [number, number]; icon: 'comment' | 'key' | 'help' }
  | AnnotBase & { type: 'freetext'; fontSize: number }
  | AnnotBase & { type: 'ink'; paths: number[][]; width: number }
  | AnnotBase & { type: 'rect'; strokeWidth: number; fill?: string }
  | AnnotBase & { type: 'arrow'; from: [number, number]; to: [number, number]; strokeWidth: number };
```

与 PDF 注释类型的对应关系（为 v2 导出预留）：

| DocAss 类型 | PDF 注释 |
|---|---|
| `highlight`、`underline` | Highlight、Underline |
| `note` | Text |
| `freetext` | FreeText |
| `ink` | Ink |
| `rect` | Square |
| `arrow` | Line（带线端样式） |

`quotedText` 是冗余存储：OCR 模型更换导致几何变化，或文件内容变化后迁移标注时，用它重新定位。

### 7.3 工具状态机

`annot/tools/`：

```ts
interface Tool {
  id: string;
  cursor: string;
  onDown(e: PagePointer): void;
  onMove(e: PagePointer): void;
  onUp(e: PagePointer): void;
  onKey(e: KeyboardEvent): void;
  drawPreview(ctx: CanvasRenderingContext2D, page: number, viewport: Viewport): void;
  cancel(): void;
}
```

- 工具：`select`、`highlight`、`underline`、`note`、`freetext`、`ink`、`rect`、`arrow`、`regionAsk`、`eraser`。
- 状态：`idle → armed → dragging → commit`，按 Esc 取消。
- `select` 工具点中已有标注后进入 `selected(annotId)`，可以移动、缩放、删除、编辑评论。
- 手绘用 `getCoalescedEvents` 采样，提交时用 RDP 算法简化路径。
- `freetext` 编辑时临时叠加一个 `<textarea>`，提交后画回 Canvas。这是输入法支持所必需的。

### 7.4 撤销与重做

- 每个标签页一个命令栈，命令形如 `{ do, undo }`，分 add、remove、update 三类，上限 200 条。
- 连续拖动合并成一条命令。

### 7.5 自动保存

- 脏标记加 1 秒防抖。
- 关闭标签页时立即刷盘。
- 应用关闭时宿主发 `app.beforeClose`，停止新命令并 flush 最新 revision，等待持久化确认再关闭。原“2 秒后强制关闭”与 F4.5 冲突，取消该默认行为；超时/失败需重试或明确放弃，不能静默丢失。具体状态机待补齐。

### 7.6 文件内容变化

- `meta.json` 记录最近路径。
- 打开文件时，如果该路径上次对应的是另一个哈希，且那个哈希下有标注，提示一次是否迁移。
- 迁移时文本类标注用 `quotedText` 重新定位；定位不到的标注保留原坐标并标记为“位置待确认”。

## 8. LLM 功能

### 8.1 会话

`agentSession.ts`：

- 每个文档可以有多个会话，每个会话一个 pi `Agent`。
- 把 `message_update` 和 `tool_execution_*` 事件映射到 docStore 的对话状态。
- 切换标签页不中断生成；关闭标签页时调用 `abort()`。

### 8.2 Agent 工具

全部只作用于当前文档：

| 名称 | 参数 | 返回 |
|---|---|---|
| `get_document_info` | 无 | 页数、标题、大纲、每页的文字来源和字符数 |
| `get_page_text` | `{ from, to, maxChars? }` | 带 `[p.N]` 标记的文字。遇到未识别的页会触发 OCR，并用 `onUpdate` 报告进度 |
| `search_document` | `{ query, maxHits? }` | `{ page, snippet, charRange }[]` |
| `get_page_image` | `{ page, maxEdge? }` | pi 工具结果支持 image 内容块，OpenAI completions 序列化已确认；真实模型视觉质量待验收 |
| `get_region_image` | `{ page, rect }` | 同上 |
| `list_annotations` | `{ page? }` | 标注摘要 |
| `create_annotation` | `{ page, quote, type, comment? }` | `type` 为 `highlight` 或 `note`。用 `quote` 在页内查找定位，带 `llmRef`，走命令栈，可以撤销 |

不提供文件或网络类工具，但这不能把提示注入影响限制为“创建标注”。仍需约束文档读取范围、工具次数、额度与图像预算，隔离不可信文档内容，禁止 Markdown 自动加载外链图片及原始 HTML，并限制导航/CSP，详见评审 R8。

### 8.3 上下文策略

`context.ts`，不做 RAG：

- 系统提示固定包含：文档元信息、大纲、当前页码、当前选区的文字。
- 全文的 token 估算不超过预算（模型窗口的约 40%，可配置）时，全文内联，带 `[p.N]` 标记。
- 超过预算时只给每页的首行概要，由模型用 `search_document` 和 `get_page_text` 按需读取。
- 扫描件未完成 OCR 时，告诉模型哪些页还不可用。
- 历史过长时截断旧的工具结果。

### 8.4 框选提问

1. `regionAsk` 工具拖出矩形（页面空间）。
2. 以 200 DPI 离屏重新渲染该页并裁剪成 PNG。不截屏幕上的 canvas。
3. 取矩形内的字符文字。
4. 在输入框上方生成附件卡片。
5. 调用 `agent.prompt(text, [image])`。能力字段为 `model.input.includes('image')`，不支持时只发文字；能力应按模型存储。
6. 可选：同时生成带 `llmRef` 的 `rect` 标注。点标注跳到消息，点消息跳到区域。

### 8.5 引用

- 提示词约定引用格式：`[[p12|"原文片段"]]`。
- `citations.ts` 把它解析成可点击的标签；点击后在该页用查找定位四边形，跳转并闪烁高亮。
- 定位失败时只跳到该页。

### 8.6 持久化

`conversations\{id}.json`：

```ts
interface ConversationFile {
  schemaVersion: 1;
  id: string;
  title: string;
  model: string;
  createdAt: string;
  messages: unknown[];      // 待替换为版本化应用 DTO，不能直接持久化全部 pi 原始图像消息
  ui: { attachments: { page: number; rect: Box; file: string }[] };
}
```

图像附件存到 `attachments\`，不把 base64 嵌进 JSON。

本次 Agent 消息 JSON 往返、恢复并继续 prompt 成功，但 pi 图像内容的 base64 就在 messages 中。需显式外置附件、恢复时 hydrate，并补稳定 messageId、工具配对和中断状态；附件/会话删除桥接口也需补齐，见评审 R7。

## 9. 多标签页状态

- 状态库：zustand。
- `appStore`：`tabs[]`、`activeTabId`、设置、provider 列表。
- 每个标签页用 `createDocStore(tabId)` 建一个独立 store，包含视图状态、选区、标注、撤销栈、对话、各页的 OCR 状态。所有 store 放在 `Map<tabId, store>` 里，通过 React context 注入。
- 重对象不进 store，放在 `DocSession` 类里：`PDFDocumentProxy`、`PageText` 的 LRU 缓存、渲染队列、Agent 实例。
- 界面状态分两级：应用级偏好放 `appStore.ui`（当前工具、颜色和线宽、侧面板、对话面板宽度与收起状态、主题），随设置持久化；文档相关状态放各标签页的 docStore（查找词、面板滚动位置、当前会话）。

内存约束：

- 非活动标签页释放全部 canvas。
- `PageText` 每个文档用 LRU 保留约 200 页。OCR 结果有磁盘缓存，可以重新读取。
- 超过 8 个标签页时，最久未用的进入休眠：调用 `pdf.destroy()`，保留 store，激活时重新加载。
- 用同一显式 `PDFWorker` 传入多个 `getDocument({ worker, ... })`；本次销毁一个 document 后另一个仍可提取。应用最终单独销毁 worker；休眠前还需处理在途 Agent/OCR 任务。

## 10. 界面架构与交互

> 本章按 `docs/image1.png`–`image5.png` 原型撰写。原型由生图模型绘制，图标细节、个别文案（如“图注”）和页码不一致不代表实现要求，以本章的组件与交互定义为准。

### 10.1 窗口与标题栏

- 无边框窗口：WPF 用 `WindowChrome`，`CaptionHeight=0`，`ResizeBorderThickness=6`，`GlassFrameThickness=0`，WebView2 铺满客户区；标题栏、标签条和窗口按钮全部由前端绘制。
- 默认窗口 1440×900，最小 1100×700；窗口位置和大小写入设置，下次启动恢复。
- 标题栏高 48px：左侧为应用图标和“DocAss 文档助手”，中间是标签条和“+”，右侧是设置齿轮与最小化 / 最大化 / 关闭。
- 标签项高 36px，最小宽 120px、最大 220px，超出时横向滚动；图标区分 PDF 和图片；关闭按钮悬停出现；当前标签高亮。
- 拖动：标题栏空白和标签条空白使用 `-webkit-app-region: drag`，按钮和标签使用 `no-drag`；宿主开启 `CoreWebView2Settings.IsNonClientRegionSupportEnabled`。窗口按钮通过桥调用 `window.minimize`、`window.maximize`、`window.close`，宿主在最大化状态变化时发 `window.stateChanged`。旧文档记载 2026-11-15 人工拖动/双击验证，但所引 `docs/spikes/S0.md` 在当前工作区缺失，本次未复核；需补可复现记录。不可行时退化为系统标题栏 + 标题栏下方独立标签条。
- Windows 11 贴靠布局的悬停浮出 v1 不实现，属已知限制。

### 10.2 主布局

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 标题栏 48：应用名 | 标签条 … + | ⚙ – □ ×                                │
├─────────────────────────────────────────────────────────────────────────┤
│ 工具栏 44：工具组 | 颜色 / 线宽 | 撤销 重做 | 缩放 旋转 查找            │
├─────────────────────────────────────────────────────────────────────────┤
│ 主体                                                                    │
│   图标栏 48 │ 侧面板 280px（可收起） │ 文档区 │ 对话面板 35%（可收起）  │
├─────────────────────────────────────────────────────────────────────────┤
│ 状态栏 28：页码 | 缩放 | OCR 进度 / 已保存 / 文字来源                   │
└─────────────────────────────────────────────────────────────────────────┘
```

- 布局用 CSS Grid：行固定为标题栏 48、工具栏 44、主体 `1fr`、状态栏 28；主体再按列分为图标栏、面板、文档区、分隔条、对话面板。
- 分隔条宽 6px，命中区 10px；拖动时只改 CSS 宽度并节流文档区重排，拖动结束后统一重渲染一次。
- 对话面板宽度默认窗口的 35%，最小 340px、最大 640px；双击分隔条复位；收起后右侧保留 40px 图标条。
- `appStore.ui` 保存 `sidePanel`（`none | thumbs | outline | annotations`）、`chatWidthRatio`、`chatCollapsed`、`tool`、`toolStyle`（每个工具的颜色和线宽）、`theme`；查找词、侧面板滚动位置和当前会话属于各标签页的 docStore。
- 侧面板开合时：百分比缩放下保持缩放，只重排水平位置；“适合宽度”模式下重新计算缩放。

### 10.3 左侧图标栏与侧面板

- 图标栏宽 48px，按钮 32×32、圆角 8px；选中底色 `--accent-weak`，线性图标 20px。自上而下：选择工具、页面缩略图、目录大纲、标注列表。
- 三个面板互斥展开，再次点击同一图标收起；宽 280px，标题行 44px（标题 + 关闭 ×）；展开 / 收起有 120ms 宽度过渡。
- 缩略图：每页按宽度 ≤ 180px 渲染，懒加载，只渲染可视区附近；当前页描边高亮，点击跳转；滚动位置双向同步。
- 大纲：来自 PDF.js `getOutline()`，缩进树，可折叠；没有大纲时显示空态。
- 标注列表：按页分组，标题“第 N 页 (k)”；行内为颜色与类型图标、类型名、摘要（单行省略）、页码 chip；选中行浅蓝底；点击滚动到标注并选中；超过 100 条时使用虚拟列表。

### 10.4 工具栏

- 高 44px；按钮 32×32、圆角 8px；分隔符 1px `--border`；分组间距 12px；悬停 400ms 显示名称和快捷键。
- 工具顺序：选择、高亮、下划线、便签、文字批注、画笔、矩形、箭头、框选提问、橡皮擦。单选，默认选择工具。
- 颜色 / 线宽弹出：宽 260px，5 个颜色圆点（黄、绿、蓝、红、紫）和线宽滑杆（1–8px，显示当前值）；仅绘制工具可用，选择工具下隐藏；颜色和线宽按工具分别记忆。
- 撤销 / 重做：作用于当前标签页的命令栈，没有历史时置灰。
- 缩放组：− / 百分比下拉（50、75、100、125、150、200、适合宽度、适合页面）/ +；旋转每次 90°；查找打开查找条。状态栏的缩放控件与工具栏同源。
- 快捷键见需求 F8.7，实现在 `ui/shortcuts.ts`；焦点在输入框、textarea 或设置表单内时不拦截文档快捷键（Esc 除外）。
- 图标的分组顺序固定，后续替换图标库不改变布局。

### 10.5 文档区浮层

- 选区操作条：选中非空文本后 150ms 出现，位于选区包围盒上方 8px 居中；上方空间不足时翻到下方。动作为高亮、下划线、便签、复制、问 AI；“问 AI”把选中文字作为引用块加入输入框，不直接发送。
- 框选提问：拖拽时选区外覆盖 12% 黑色遮罩；选框为 2px 蓝色虚线，带 8 个控制点；右下浮条“问 AI / 取消”；Enter 等同“问 AI”，Esc 取消。
- 便签：页面上显示 20px 圆角图标，颜色随标注；点击弹出卡片（最大宽 320px，作者、时间、正文，底部编辑 / 删除），卡片有描边和指向锚点的引线；编辑时正文变为 `<textarea>`，Ctrl+Enter 保存，Esc 取消。
- 文字批注：选中时显示虚线框和右下缩放手柄；双击编辑，临时叠加样式贴合的 `<textarea>`，提交后画回 Canvas。
- 选中图形的控制点为 8 个 8×8 白色方块加 1px 主色描边；v1 不支持旋转图形。
- 浮层层级在画布之上、对话面板之下；随页面滚动移动，页面移出可视区时关闭。

### 10.6 查找条

- 位于文档区右上角，距工具栏 12px，宽 360px。第一行为输入框、计数“3 / 11”、上一个 / 下一个、关闭；第二行在存在未识别页时显示浅黄提示“还有 24 页尚未识别”和“全部识别”按钮。
- Ctrl+F 打开并聚焦，预填当前选中文字（如果有）；输入 200ms 防抖后全文档搜索；Enter / Shift+Enter 与 F3 / Shift+F3 跳转；Esc 关闭并清除高亮。
- 全部命中显示浅橙半透明，当前命中加深并描边；跳转时滚动到页并居中。
- 尚未识别的页先显示“待识别”，可见页优先后台识别，完成后更新命中数（F3.5）。

### 10.7 对话面板

- 标题行 48px：会话标题下拉（列出当前文档的会话：标题、时间、消息数，可重命名 / 删除）、“+ 新建对话”、历史入口（时钟图标，打开同一会话列表）、收起按钮。
- 消息区：用户消息右对齐浅蓝气泡；助手消息左对齐白底描边卡片，首行显示头像；正文按 Markdown 渲染，流式时末尾显示光标。
- 工具调用记录：位于回答上方，浅灰底圆角条内 12px 灰色文字加图标；进行中的任务显示进度文字和细进度条；超过 3 条时折叠为“已调用 3 项工具”，点击展开。
- 系统动作行：如“✓ 已为你创建 2 处高亮 [撤销]”，撤销走命令栈。
- 错误行：红色图标、原因和“重试”按钮。
- 回答操作：复制、重新生成；重新生成保留上一条回答。
- 输入区：圆角卡片，textarea 自动增高 1–6 行；Ctrl+Enter 发送，Enter 换行；上方为待发送附件托盘（缩略图 + 关闭，最多 4 个）；底部左侧模型选择（列出已配置提供方的模型，切换写入当前会话），右侧发送按钮，生成中变为红色“停止”。
- 附件卡：区域提问的消息内显示缩略图（最大 200×120）和“第 N 页 · 框选区域”。
- 会话记录 `model`（providerId + modelId），切换会话时输入区同步。
- 新建会话标题为“新对话”，发送首条消息后取前 20 字作为标题；用户重命名后不再自动生成。
- 空态：显示文档名和输入提示；示例问题可后置。

### 10.8 状态栏

- 高 28px，白底，上边框 1px，字号 12px。
- 左：`第 12 / 86 页`，点击变为输入框，回车跳转，Esc 取消。
- 中：缩小、百分比、放大，与工具栏同步。
- 右：只显示一个状态，优先级如下：
  1. OCR 进行中：`文字识别中 12 / 36 页` + 进度条 + 取消 ×。
  2. 自动保存：保存中显示“正在保存…”，完成后显示“✓ 已自动保存”，3 秒后淡出。
  3. 文字来源：`原生文字` / `文字识别` / `混合文字`，附文档图标。
- 单页识别中，页面底部另显示“正在识别文字…”覆盖层。

### 10.9 设置对话框

- 模态，900×620，居中；遮罩 `rgba(0,0,0,.4)`，背景模糊 2px；标题“设置”和右上关闭；Esc 关闭；有未保存修改时先确认。
- 左导航 180px：模型提供方、标注、文字识别、关于。
- 模型提供方：
  - 列表：图标、名称、接口地址（12px 灰字）、右侧密钥状态标签（绿色“已配置密钥”/ 灰色“未配置”）；选中行蓝色描边。
  - 列表上方“+ 添加提供方”；行尾“⋯”菜单：重命名、设为默认、删除。删除时如果已有会话使用该提供方，提示影响。
  - 表单：名称、接口地址、API Key（掩码 + “更换”；更换时清空并要求重新输入）、模型下拉（内置列表 + 自定义模型 ID）、支持图像输入开关（新建时默认关闭，已知模型能力时预置 [待验证：pi 的模型能力字段]）、设为默认开关。
  - 底部：测试连接（用表单当前值发一次最小请求，不保存）、取消、保存；测试结果内联显示成功或失败原因。
  - Key 只通过 `secrets.set` 写入；回显只有“已配置 / 未配置”。
- 标注：作者名（默认 Windows 用户名）、默认颜色、默认不透明度。
- 文字识别：模型档位（Tiny / Small / Medium）、启用 GPU、当前设备信息；修改档位不清除已有缓存，只影响新的识别。
- 关于：版本、WebView2 版本、开源许可列表、打开日志目录。
- 原型没有画“添加提供方”和删除入口，按本节实现。

### 10.10 视觉规范

- 不引入重型 UI 组件库：自建轻量组件 + CSS 变量；图标用 lucide-react（线性，20px）；字体 Segoe UI Variable，中文回退微软雅黑。
- 颜色 token（取自原型，最终实现时可微调）：
  - `--accent #2563EB`、`--accent-weak #E8F1FE`
  - `--text #1F2329`、`--text-2 #5F6672`、`--text-3 #8A9099`
  - `--bg #F5F6F8`、`--surface #FFFFFF`、`--canvas #E6E8EC`、`--border #E3E6EA`
  - 标注色板：黄 `#F6C445`、绿 `#22C55E`、蓝 `#3B82F6`、红 `#EF4444`、紫 `#A855F7`；便签橙 `#F59E0B`
  - 语义色：成功 `#16A34A`、警告 `#F59E0B`、错误 `#DC2626`
- 字号：11 辅助、12 状态与记录、13 次要正文、14 正文、15 面板标题、20 对话框标题；行高 1.5。
- 间距 4 / 8 / 12 / 16 / 24；圆角 6（chip）/ 8（按钮、输入框）/ 12（卡片、对话框内卡片）。
- 阴影：浮层 `0 4px 16px rgba(0,0,0,.08)`，对话框 `0 16px 48px rgba(0,0,0,.16)`。
- 界面字号不随文档缩放变化。深色主题后置，组件内不写死色值。
- 界面控件使用原生 `button`、`input` 和 `aria-label`，键盘可达；文档内容本身在 Canvas 上，读屏不可达（已知限制 3）。

### 10.11 组件树

```
<App>
  <TitleBar>              appStore.tabs / appStore.ui
    <AppMenu/> <TabStrip/> <WindowControls/>
  <Toolbar>               appStore.ui.tool / toolStyle
  <MainArea>
    <ToolRail/>           appStore.ui.sidePanel
    <SidePanel>           docStore(active)
      <ThumbnailPanel/> <OutlinePanel/> <AnnotationPanel/>
    <DocumentViewport>    docStore(active).view / selection / annot
      <Viewer/> <FloatingBar/> <FindBar/> <NoteCard/> <FreetextEditor/>
    <Splitter/>           appStore.ui.chatWidthRatio
    <ChatPanel>           docStore(active).chat
      <ChatHeader/> <MessageList/> <ToolRecord/> <CitationChip/>
      <AttachmentCard/> <AttachmentTray/> <Composer/>
  <StatusBar>             docStore(active).view / ocr / saveState
  <SettingsDialog/>       appStore.settings
```

### 10.12 空态、加载与错误

- 无文档：文档区显示“拖放 PDF 或图片到此处”、打开按钮和最近打开列表（F1.6）。
- 文档加载：页面骨架占位；加密 PDF 弹密码框（F1.5）。
- 缩略图 / 大纲加载：骨架行。
- 未配置模型：输入区禁用并提示“先在设置中配置模型提供方”，点击打开设置。
- 流式错误：错误行加重试，保留已经输出的内容。
- 关闭窗口：宿主发 `app.beforeClose`，前端刷盘后回 `app.readyToClose`（7.5 节）。

### 10.13 原型对照

| 原型 | 覆盖内容 |
|---|---|
| image1 主界面 | 标题栏与标签、工具栏、文档区、对话面板、状态栏、选区浮条 |
| image2 标注 | 标注列表、颜色 / 线宽、便签卡片、选中控制点、创建标注提示与撤销 |
| image3 框选提问 | 框选浮条、消息附件卡、待发送附件、流式输出与停止 |
| image4 扫描件 | 查找条、未识别提示、单页与状态栏 OCR 进度 |
| image5 设置 | 设置对话框与提供方表单 |

原型与本章不一致、以本章为准的点：

- 标注列表中的“图注”对应 `freetext`（文字批注）。
- 工具栏撤销组只保留撤销、重做两个按钮。
- 设置对话框补“添加提供方”和删除入口（原型未画）。
- image3 的“第 23 页”与状态栏页码不一致，是生成图误差，不构成需求。

## 11. 测试策略

| 层 | 内容 |
|---|---|
| 单元测试 | 坐标变换（页面空间与 viewport 互转、旋转、`devicePixelRatio`）写成纯函数并测试；行合并；复制的连接规则；查找的位置映射 |
| 金样本 | `samples/` 放 5 份 PDF（中文横排、中英混排、两端对齐英文、页面旋转 90 度、CropBox 有偏移），把 S2 的字符盒断言固化为自动化测试 |
| 迁移测试 | 标注 schema 的迁移，包含 v1 的空迁移用例 |
| 宿主测试 | `DocAss.Host.Tests`：原子写、DPAPI 往返、代理的认证头替换和上游地址限制 |
| 端到端 | 各里程碑的验收项，见需求文档第 7 节 |
| 界面 | 状态栏状态优先级、面板互斥、分隔条比例记忆写成纯逻辑测试；主要界面按原型做视觉走查 |

工具：前端用 Vitest，宿主用 xUnit。

## 12. 风险

| 序号 | 风险 | 应对 |
|---|---|---|
| 1 | pi 在浏览器环境不可用：依赖 Node API、不接受自定义 baseUrl，或底层 SDK 拒绝浏览器环境 | S1 验证；`LlmTransport` 接口隔离；自写 SSE 适配兜底 |
| 2 | WebView2 拦截流未逐块交给 JS，也未传递取消（本次复现） | LLM 首选 loopback；真实提供方上游取消仍待集成验收 |
| 3 | PDF.js 前缀测宽不满足逐字几何精度（本次复现） | 进入 PdfPig 几何验证分支，完成文本对齐和真实字体样本验收 |
| 4 | 多栏和表格下阅读顺序出错 | v1 接受并写入已知限制 |
| 5 | OCR 只有中文模型；大文档全量 OCR 耗时长、CPU 占用高 | S3 加测英文样本；后台队列、可取消、带进度 |
| 6 | 没有 DOM 文本层：无读屏支持，输入法需要临时输入框 | v1 接受；`freetext` 用临时 `<textarea>` |
| 7 | 超高缩放下 canvas 尺寸上限 | v1 降分辨率；分块渲染后置 |
| 8 | .NET 11 与 OCR 包的 net10 资产不兼容；Vulkan 在部分显卡和驱动上不稳定 | S3 验证；提供 CPU 回退开关；退到 net10 |
| 9 | 文件被其他工具修改后哈希变化，标注“丢失” | 7.6 节的迁移提示 |
| 10 | 自定义标题栏依赖 WebView2 的 `app-region` 拖动和双击最大化；Windows 11 贴靠布局浮出不可用 | 旧 S0 记录文件缺失，本次未复核，需补证据；贴靠浮出 v1 不做，不可行时退化为系统标题栏 + 标题栏下方标签条 |

## 13. 待验证清单

每一项在对应 Spike 得出结论后，回写到本文档的相关章节。

**2026-11-25 状态覆盖**：下面列表保留原验证范围，逐项状态以 [评审报告“全量待验证清单回执”](design-review-2026-11-25.md#全量待验证清单回执) 为准。当前 S1 拦截方案不通过、loopback 本机流式/取消通过；S2 近似几何不通过；S3 Small 本机合成页面往返可行，但盒子精度、真实扫描与跨机器性能未完成。S0 历史证据文件缺失，标题栏交互未复核。

### pi（S1）

- 已确认：浏览器与 WebView2 可运行 OpenAI completions 适配器；其他提供方未逐一验收。
- 已确认：接受 baseUrl 和占位 auth，但实际请求用 model.baseUrl，必须强制重写。
- 已确认：`streamProxy` 是 `/api/stream` 的 pi 协议，不是透明上游代理。
- 已确认：OpenAI completions 可注入 `fetch`。
- 已确认：工具结果 image 可序列化到请求；真实视觉模型回答未验证。
- 已确认：消息 JSON 往返后可恢复继续 prompt；附件外置和中断恢复仍待实现。
- 已确认：`model.input.includes('image')`。

### PDF.js（S2，部分在 M1）

- 部分确认：样本字体以 fontName 注册，但测宽不能还原 PDF 逐字几何，S2 不通过。
- 已确认：`disableNormalization` 存在，不能保证字符/字形一一对应。
- 源码确认：部署并配置 wasmUrl；真实 JBIG2/JPX/ICC 金样本待补。
- 已确认：显式共享 PDFWorker；销毁一个文档不销毁外部共享 worker。
- 部分确认：operator list 可见图像操作，但覆盖率需解释变换、裁剪和面积并集；简化启发式须明确误判。

### WebView2（S0、S1）

- 不通过：本次拦截式响应到 EOF 一次下发；LLM 改用 loopback。
- 拦截式取消不通过；loopback 本机取消已确认，真实上游传播待集成。
- 已测：16MiB 拦截上传约 245ms、宿主读约 12ms；长期压力未测。
- 已确认：映射路径未进入拦截，避免同 host 混用。
- 本机映射下两域名均约 1–2ms，未复现旧延迟说法；跨环境仍待测。
- 已确认：共享缓冲区 ReadWrite 双向可见。
- 部分：本机普通 CORS 可用、无权限事件；当前 LNA/策略差异仍需兼容验证。
- 待补证据：app-region 拖动和双击，旧 S0 文件缺失，本次未人工复核。
- 待补证据：window.* 桥与最大化状态同步，本次未复核。

### SimdPaddleOCR（S3）

- 已确认：net11 还原和运行 net10 资产。
- 部分：本机强制 Vulkan、显式 CPU 均成功；GPU 故障自动回退未实测。
- 部分：倾斜/竖排返回字符盒，尚无逐字人工真值，不能标为贴合验收通过。
- 同实例并发 smoke 与发布源码通过；同步 Run 不支持中途取消。
- 已测本机清晰样本各档耗时；Small 完整路径约 0.74–1.48s，不含缓存落盘/等待队列，不代表 P95。
- 已测合成英文 CER；真实扫描件与低清照片质量待补。

### PdfPig（S2 已发现反例，进入该分支验证）

- 部分：合成中文可读，TJ 六字起点准确；真实 CID/中文字体完整字框仍待验收。
- 已发现 PDF.js 合成空白差异，不得按下标硬对齐；统一来源或 glyph↔text span 映射仍待实现。
