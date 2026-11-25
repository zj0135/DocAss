# DocAss v1 实施设计

- 版本：1.0，实施基线；2026-11-25。
- 产品需求：[requirements.md](requirements.md)；旧设计和评审：[design.md](design.md)、[design-review-2026-11-25.md](design-review-2026-11-25.md)。
- 执行清单：[tasks.md](tasks.md)，a1–a62；实施与验收状态见任务勾选和 [第一阶段记录](validation/phase1.md)，原型和 Spike 不等于正式实现。
- 本文替代旧设计中的技术选择。需求冲突按 §2 的明确调整执行；未调整的功能需求继续有效。
- 本文“确定”指实施方案已选定；测试通过情况单独记录，不把方案决定当作产品验收。

## 1. 已确定的方案

| 编号 | 决定 | 理由、代价及验收边界 |
|---|---|---|
| D1 | WPF + WebView2，业务界面保留 React/TypeScript/Vite | 复用原型组件外观；宿主负责文件、几何提取、OCR、密钥、代理及事务存储 |
| D2 | PDF.js 仅负责 PDF 视觉渲染、页信息和大纲；PdfPig 提供正式原生文本及字形几何 | 不再使用 measureText 分配 PDF 字符位置，也不按索引拼接 PDF.js/PdfPig 两路文本 |
| D3 | 全部文档交互统一在页面空间；内容与叠加层各一个 Canvas | 不引入隐藏 DOM 文本层；允许临时 textarea 支持输入法 |
| D4 | 小命令用 WebView bridge；文件/OCR/几何用有限长度同源 HTTP；LLM 用 loopback Kestrel | 拦截流不能满足增量要求；loopback 已完成本机流式及取消验证 |
| D5 | 宿主 SQLite 事务保存业务状态，图像附件单独存文件 | 用数据库统一提交标注、消息、工具幂等结果和 revision；不自研多 JSON 文件提交日志 |
| D6 | 提交后的编辑命令立即请求保存；只有数据库提交确认后显示“已保存” | 未提交的拖动预览和未收到 ack 的内容不承诺强杀恢复；禁止关闭超时静默丢弃 |
| D7 | SimdPaddleOCR 2.0.0，默认 Small / Auto，推理页并发 1 | 同步推理不可中断；取消排队、解绑订阅、忽略无需求结果。暂不引入 OCR 子进程 |
| D8 | pi Agent 在前端；宿主只提供受限网络代理 | 模型地址强制改写为本机地址，自有 transcript DTO 隔离依赖版本 |
| D9 | 每文档绑定固定 docHash/docId；任务不读取全局 activeTab | 标签切换不串文档；关闭或休眠与在途任务有明确生命周期 |
| D10 | 浏览器独立开发使用同一接口的 mock 服务 | IndexedDB + 文件输入 +固定几何/OCR/LLM fixture；桌面精度、DPAPI、窗口行为以宿主验收 |
| D11 | v1 支持 OpenAI-compatible completions、OpenAI responses、Anthropic messages、Google Gemini API-key 适配 | 四类协议都要通过合成流测试；真实提供方冒烟需用户已配置密钥。OAuth、Bedrock、任意 pi provider 不承诺 |
| D12 | 正式 UI 沿用 image1–image5 与现有组件 | mock 页面和场景切换器仅在显式 demo 模式存在；发布默认打开真实空工作区 |

依赖基线：.NET SDK 11.0.100 / `net11.0-windows` / `win-x64`；WebView2 SDK 1.0.4314.35；PDF.js 6.5.438；PdfPig 0.1.16；`@earendil-works/pi-ai`、`@earendil-works/pi-agent-core` 1.6.0；SimdPaddleOCR 2.0.0、ChineseV6 Tiny/Small/Medium 1.0.0；Microsoft.Data.Sqlite 11.0.0。前端现有 React/Vite 等按当前根锁文件保留；新增 zustand、schema 校验与测试工具在 a1/a2 固定精确版本。升级必须重新执行相关验收，不用浮动版本发布。

证据：`spikes/review-2026-11-25/results/summary.json`。新增 SQLite 基础验证见 `spikes/storage-decision-2026-11-25/results/storage.json`，8 项检查通过，包括提交/未提交状态的进程强杀、事务回滚、幂等、revision、备份和排他锁；这不是生产存储完整验收。

## 2. 范围与需求澄清

保留：PDF（含密码、扫描页）、单帧 PNG/JPEG/BMP、多标签、选择/复制/查找、七类标注、OCR、每文档多会话、框选提问、引用跳转、AI 创建高亮/便签、浅色中文界面。

暂不包含：Word、PDF 写回、XFDF、跨文档检索、表格/多栏结构重建、读屏读取页面全文、标签拖出窗口、深色、文件关联、自动更新、任意协议提供方。多帧 TIFF/动画图片明确拒绝，不悄悄只打开第一帧。

| 原要求 | 本版落实方式 |
|---|---|
| N1 前端无法读取 Key | 禁止读回宿主保存的 Key；用户首次输入短暂经过设置表单内存，保存/关闭立即清空，不进入 store、日志、DevTools 网络请求或 IndexedDB。若采用宿主原生输入，可进一步减少该暴露，但 v1 不要求 |
| N2 仅访问已保存地址；F7.5 不保存测试 | 普通推理只用宿主配置地址；单独 `providers.testDraft` 接收用户明确提交的草稿，用临时凭据发最小无文档请求，结束即销毁，不改变正式配置 |
| F4.3 所有标注移动/缩放 | 几何类可任意移动/缩放；文字高亮/下划线通过重新选择文本修改锚点，不允许自由拖动后仍伪称引用原文 |
| F4.5、M3 强杀恢复 | 以提交 ack 为边界保证已保存命令恢复；拖动预览、尚未 ack 的编辑/流式尾部可能丢失。验收在 ack 后强杀；未 ack 时不得显示“已保存” |
| N4 原子写、备份、JSON schema | SQLite 短事务 + WAL + FULL 同步，保留一致性备份；业务 JSON payload 仍做 schema 校验，不要求 annotations.json 文件 |
| F5.5 OCR 可取消 | UI 100ms 内标记“已取消等待”；排队任务移除；无其他订阅者的在途结果不发布，当前同步推理自然结束后才能启动下一个。禁止声称已经立即释放 CPU |
| F6.1 pi 其他提供方 | 按 D11 明确四类可交付 API；其他 provider 不在本版完成标准内 |
| F6.14 图像开关 | 保留提供方“允许图像输入”总开关；实际发送还必须满足所选模型支持 image，任一关闭均只发文字。每模型的能力设置不能绕过提供方总开关 |
| N8 独立浏览器开发 | 不要求 .NET 的 UI/状态/交互与 fixture 工作流可用；任意 PDF 的 PdfPig 几何和真实 OCR 只在桌面模式验收；浏览器不伪报此能力已可用 |
| N11/N12 窗口和 DPI | 1100×700 是期望最小 DIP；工作区不足时以实际可用 DIP 为上限，折叠侧栏、工具栏溢出、设置可滚动，保证 1366×768 及 100%–200% 缩放可操作 |
| F3.2 英文断行连接 | 只按明确版面连接规则去除软断行连字符；日期/负号/词内硬连字符不删除；复制按预期文本样本测试，不泛称“拉丁字之间加空格” |

## 3. 当前前端资产与完成边界

核查依据为当前 `src/web/src/`，只评估代码可见行为，未将截图或 mock 数据当作真实能力。

| 资产 | 已有内容 | 正式开发剩余工作 |
|---|---|---|
| TitleBar、Toolbar、ToolRail、StatusBar | 外观、按钮及部分局部状态切换 | 真实窗口命令、文档会话、工具命令、保存/识别状态与快捷键 |
| Splitter、App 布局 | 拖动调整、收起、场景切换 | 宽度下限当前为 320，统一为 340；持久化、DPI、小窗口降级、拖动取消 |
| Thumbnail/Outline/AnnotationPanel | 列表外观与 mock 点击 | 真实分页/目录/标注、懒加载、联动、空态与虚拟列表 |
| DocumentViewer、三个 Page* | 固定 HTML 页面和 CSS zoom/rotate | 接入真实文件、PDF.js Canvas、页面矩阵、虚拟化、输入命中 |
| FloatingBar、FindBar、StickyNoteCard | 样式和局部交互 | 真选区/真实搜索/编辑事务；“问 AI”当前直接发送，改为仅填入草稿 |
| ChatPanel、Composer、MessageItem、ToolRecord | 会话外观、局部改名/删除、定时模拟回复、简易格式化 | 真流、取消、持久化、安全 Markdown、模型/工具/附件/引用；固定图表缩略图必须替换 |
| SettingsDialog | 各页布局、局部表单、模拟测试 | CRUD/默认 provider、真实 Key 和测试、未保存确认、持久化、缓存操作和环境信息 |
| types、mockData、PrototypeSceneSelector | 演示数据与类型 | 演示类型隔离；采用正式契约，demo 仅显式入口 |

现在不能认定 M1–M7 任一完整里程碑已完成。保留上述可复用组件，不重画界面；任务清单中的“接入/替换”优先修改已有组件。

## 4. 模块与目录

```text
src/host/DocAss.Host/
  Bridge/              协议、来源校验、命令分发、事件
  Http/                有限长度资源、loopback、认证、代理
  Documents/           快照、密码、图片归一化、PdfPig 几何
  Ocr/                 模型、调度、缓存、GPU 回退
  Storage/             SQLite、schema 版本、附件、备份、写锁
  Settings/            provider、DPAPI、用户偏好
src/host/DocAss.Host.Tests/
src/web/src/
  contracts/ services/ bridge/ state/ doc/ text/ viewer/ annot/ llm/
  ui/                  复用现有组件，移除 mock 硬编码耦合
  mock/                BrowserServices、fixture、demo
docs/
  design-v1.md tasks.md requirements.md
  fixtures/            小型可分发金样本、生成器、真值与许可
  validation/          每任务验收记录 aN.md、性能与发布报告
  spikes/              隔离探索和反例，不能从生产代码反向 import
```

`AppServices` 提供 Documents、Text、Ocr、Persistence、Providers、Attachments、Window 七类端口；`DesktopServices` 与 `BrowserServices` 遵守相同成功/错误/取消类型，并通过 capabilities 声明差异。

`appStore` 保存标签元数据和应用偏好；每文档一个 `DocSession` 拥有 store、命令栈、页面资源、查找结果和会话集合。PDF/worker/Agent/Canvas/AbortController 不进入 JSON 状态。每个会话最多一个生成 run，全应用最多两个生成 run；超过时显示排队并允许取消。

## 5. 宿主、通道与安全契约

### 5.1 应用源

发布导航到 `https://app.docass.example/`，静态资源和有限长度 `/_host/*` 由同一个处理器提供，不与同 host 虚拟目录映射混用。静态资源严格在 wwwroot 下解析。开发只允许当前指定的 `http://localhost:5173`，不把任意 localhost 地址当可信来源。

禁止外源导航、新窗口、下载和远程 iframe；外链交给经过 scheme 校验的宿主 `shell.openExternal`。发布 CSP：脚本/worker 同源，图片只允许同源/blob/data 的受控内容，connect 只允许应用源与实际 loopback origin；开发版本单独加入 Vite HMR。Markdown 禁止 raw HTML、脚本、外链图片、自动网络资源获取。

### 5.2 bridge

请求格式固定为 `{v:1,kind:'req',id,method,params}`，响应含同 id 和 `{ok,result}` 或 `{ok:false,error:{code,message,retryable}}`。事件含 `topic,seq,docId?,jobId?,runId?,payload`；序号用于发现丢失并重读状态，不承诺 exactly-once 推送。

来源、版本、schema、能力、docId 生命周期均在宿主校验。单消息上限 256KiB、普通超时 10s；大文本/快照走 HTTP。超时不等于写操作失败：通过 `operationId` 查询结果或同 ID 重试。每条消息取消只对可取消操作生效。

| 方法组 | 必须提供的方法及约束 |
|---|---|
| 启动/窗口 | app.bootstrap（capabilities、版本、本机通道）、window.minimize/maximize/requestClose、app.closeDecision、window.stateChanged |
| 文档 | doc.pickAndOpen/openRecent/close/listRecent/unlock；拖放由宿主发已验证的打开事件；JS 不收绝对路径 |
| 文本与 OCR | text.requestPage（异步任务）、text.getStatus、ocr.start/subscribe/unsubscribe/setOverride/getStatus；返回 jobId，不等待识别完成才发 ID |
| 持久化 | store.commit/getOperation/readRevision、doc.flush、conversation.list/create/rename/delete；大 payload 使用对应 HTTP 命令端点 |
| 设置/密钥 | settings.get/update、providers.list/save/delete/setDefault/testDraft/cancelTest；secrets.has/replace/delete，无读取密钥方法 |
| 附件/缓存 | attachment.begin/commit/resolve/deleteUnused、cache.getInfo/clear；删除必须检查引用 |
| 系统 | clipboard.setText、shell.openExternal、shell.openLogs、app.getInfo |

普通 `store` API 不接收任意路径/key SQL，只接收白名单命令 DTO。读取文档状态使用活跃 docId 的能力，不允许凭猜测 hash 读取别的文档。完整路径只存在宿主 recent/source 表，前端仅拿文件名和不含路径的展示信息。

### 5.3 同源有限长度端点

| 端点 | 规则 |
|---|---|
| GET /_host/ping | 状态与协议版本 |
| GET /_host/doc/{docId}/bytes | 活跃不可变快照；支持单段 Range/206/416，ETag=hash；PDF.js 负责读取，不主动一次拷入 JS |
| GET /_host/doc/{docId}/page/{page}/geometry | 读取已就绪几何；未就绪返回 202 + jobId；单页 ≤8MiB，超限返回明确错误/页降级 |
| POST /_host/doc/{docId}/ocr/{jobId}/raster | 200 DPI PNG 为默认；≤12M 像素、编码 ≤24MiB；尺寸和解码后大小再次校验 |
| GET /_host/doc/{docId}/ocr/{jobId}/result | 正规 JSON + rasterToPage + profile；取消或旧 revision 的结果不发布 |
| PUT/GET /_host/doc/{docId}/attachments/{uploadOrAttachmentId} | 写已申请 uploadId，读已提交 attachmentId，单附件≤8MiB，检查 MIME 与归属 |
| POST /_host/doc/{docId}/commands | 与 store.commit 相同的验证/幂等语义，≤16MiB，禁止 SQL/任意文件路径 |

宿主及时取得 deferral，在后台执行解析/推理；不在 UI 线程读取长流或执行 OCR。响应关闭与任务完成分开处理，不以 `fetch.abort` 作为同源 OCR 取消通知。

### 5.4 loopback 与 LLM 上游

只绑定 `127.0.0.1:0`，启动成功后将实际 origin 和每进程 256-bit 随机口令经 bridge 给可信主框架。浏览器只持有本地口令，provider Key 永不进入 LLM 请求。关闭宿主即废止口令。

只开放白名单 POST 路由及其 OPTIONS 预检，POST 携带 `X-DocAss-Session`；CORS 限定应用 origin，允许头显式包含 `X-DocAss-Session`、`X-Request-Id`、Content-Type、Authorization 和四个适配器实际使用的 SDK header 集合（包括锁定版本的 x-stainless-* 各具体名称）。OPTIONS 不要求口令值，但须校验 Origin、请求方法和头名；未知头拒绝，不用 `*` 反射任意 origin。代理去掉本地口令、浏览器认证、Cookie、Host、hop-by-hop 和不允许的头后，按 provider 协议注入真凭据。

上游由宿主 provider 配置固定：HTTPS 为默认；用户明确添加 localhost/127.0.0.1 本地模型可用 HTTP。规范化 URL 并验证 origin、base path 和路由，拒绝绝对后缀、`..`、userinfo 和携带凭据的 query。禁用 HttpClient 自动重定向，3xx 返回 `UPSTREAM_REDIRECT_BLOCKED`。Gemini 等 query-key 适配由宿主组装并保证日志脱敏。

真实流使用 ResponseHeadersRead + 分块复制/Flush。请求 ID 映射到同一个 CancellationTokenSource，浏览器断连、桥取消、run 取消、应用关闭都取消上游读写；空闲 60s、总时长默认 180s、请求≤32MiB、全局并发 2。错误统一为 AUTH_FAILED/RATE_LIMITED/TIMEOUT/NETWORK/PROTOCOL/UNCONFIGURED；界面可读，日志有脱敏关联 ID。

LNA/PNA 行为以当前 Runtime 验证为准；如权限阻止，明确提示宿主本地连接被阻止并记录错误，禁止自动放开全局浏览器安全策略。

## 6. 文档打开、身份与生命周期

1. 文件选择/拖放先校验格式、文件大小（v1 默认≤1GiB）与可读性；不修改原文件。
2. 宿主以不允许写入/替换的共享模式读取源，复制到临时快照并同时算 SHA-256；共享冲突提示重试。完成后同目录改名为 hash 命名的不可变快照。hash、PDF.js、PdfPig、OCR 始终对应同一字节版本。
3. docHash 作为持久化身份，docId 为进程内随机能力；相同 hash 在同窗口聚焦现有标签，移动/改名仅更新宿主 recent 记录。
4. 返回 `DocHandle {docId,docHash,fileName,kind,byteLength,access:'edit'|'readOnly',contentRevision}`。分页从 1 开始；pageIndex 仅用于库内部，并在适配器中显式换算。
5. 密码 PDF 使用独立 password 状态机；密码只存宿主/该文档内存，经按需桥传给 PDF.js 和 PdfPig；不写数据库、快照或日志。输错可重试，取消销毁加载任务。关闭后清除；重开需再次输入。
6. PDF 原有可见注释以 PDF.js 默认静态外观渲染；不执行 PDF JavaScript，不提供原有注释编辑或交互表单。填写表单与新 DocAss 标注不能混为一类。
7. 图片由宿主 WIC 应用 EXIF 方向一次，输出统一像素方向和尺寸；有效 DPI 在 36–1200 内采用，缺失/异常用 96。该有效 DPI 和方向存入元数据，不随显示器 DPI 改变。

版本字段分工固定：`contentRevision=docHash` 表示不可变源字节；`documentRevision` 是每文档业务事务的递增整数，供保存 CAS 使用；`textRevision` 是规范化页文本、几何、来源选择及 profile 的稳定摘要，供文本锚点和搜索失效判断使用。每页另有内存 `pageGeneration`，重识别/切换来源时递增；任务捕获该 generation，完成时不匹配则丢弃，即使源文件和 OCR profile 没变也不能覆盖新请求。业务标注修改不使整本文字缓存失效。

`PagedDocument` 的 `getPageInfo(page)`、`render`、`getOutline` 都是异步接口；首屏不等全书元信息。文档初始使用估算占位，页信息到达后修正布局并保持可视锚点。PageInfo 含 `pageBox,rotate,userUnit,width,height`。

每 docHash 使用宿主排他写锁；另一个进程可以只读打开，显示只读原因，不提供持久化编辑/新会话或 AI 写工具。读工具和已有记录可浏览。进程退出由 OS 释放锁，锁文件残留不代表仍有拥有者；恢复编辑必须重新取得锁并重读 revision。

源文件外部变化时显示“存在新版本”，不在已打开快照上替换字节。用户重开形成新 hash，再走 §10 的迁移。快照与 OCR 缓存共用可配置磁盘预算，活跃文档/在途任务引用中的文件不得淘汰。

## 7. 页面空间与统一文本

### 7.1 坐标

持久化使用 PDF 未应用 `/Rotate` 的原始 user space，保留 CropBox 偏移和 `userUnit`。页面坐标不等同物理 pt；物理 pt = user coordinate × userUnit。图片等价 pageBox 从规范化像素和有效 DPI 得到，userUnit=1。

同一个 viewport 矩阵负责 page↔CSS 坐标；backing 像素使用独立 outputScale。指针先减容器/页面偏移，再逆 viewport；不重复乘 DPR。旋转为页面 intrinsic rotate + 用户旋转。每次栅格/OCR 请求保存六参数 rasterToPage 仿射矩阵、实际宽高和页面 revision，结果用提交时矩阵还原，不读“当前 zoom”。

`Box=[xMin,yMin,xMax,yMax]`；`Quad` 按页面空间四边形边界顺序给出四个顶点，统一逆时针、禁止交叉，第一点取 y 最小、同 y 时 x 最小的顶点。文字阅读方向由 baseline/direction 表达，不借顶点顺序编码；退化框不能标为可靠几何。仿射数组 `[a,b,c,d,e,f]` 固定表示 `x'=a*x+c*y+e`、`y'=b*x+d*y+f`，矩阵复合次序随接口示例与真值测试一并固定。

### 7.2 数据契约

```ts
type Box = [number, number, number, number];
type Quad = [number, number, number, number, number, number, number, number];
type TextRange = { start: number; end: number };
type Glyph = { id: string; text: string; quad: Quad; baseline: [number, number, number, number]; source: 'native' | 'ocr'; confidence?: number };
type TextSpan = { range: TextRange; glyphIds: string[]; kind: 'glyph' | 'space' | 'lineBreak'; lineId: string };
type TextLine = { id: string; range: TextRange; quad: Quad; direction: 'ltr' | 'rtl' | 'ttb'; glyphIds: string[] };
type PageText = { page: number; pageBox: Box; userUnit: number; textRevision: string; source: 'native' | 'ocr' | 'hybrid'; text: string; glyphs: Glyph[]; spans: TextSpan[]; lines: TextLine[]; quality: 'verified' | 'approximate' | 'unavailable'; profileFingerprint: string };
```

所有文本范围是半开 UTF-16 `[start,end)`；光标/拖选边界按 grapheme 取整。一字形可对应多字符，一个 grapheme 可对应多个字形；不凭平均字宽虚构不存在的 glyph。空格/换行可无几何；整个连字选择其共享四边形。`quality=verified` 表示该提取路径通过样本门禁，不代表每个用户文件经人工确认。

PdfPig 是正式原生文字和字形的唯一来源：宿主输出文字、基线、原始 glyph quad 与坐标元信息；前端规范化成 PageText。PdfPig 的旋转/裁剪/单位必须由适配器验证并转换，不能假设与 PDF.js 天然一致。出现不可逆映射、异常几何或明显乱码时，该页标为 unreliable 并进入 OCR 路径，禁止悄悄套用 PDF.js 索引。

这里的 `unreliable` 是原生提取结果 `status:'ready'|'unreliable'|'failed'`，不是 PageText.quality 的第四个取值；原生结果不可用时，统一文本返回 unavailable 或等待 OCR，OCR 推算字框使用 approximate，不冒充经原生几何门禁验证的路径。

行构建按基线方向聚类、行内投影排序并处理 RTL/竖排；v1 不重建多栏/表格。跨栏/表格读取提示可能顺序不准，LLM 可用页面图像。查找使用 NFKC + 大小写/空白规则生成规范化串，映射到原文范围列表；不能用单个规范化索引直接充当字形索引。

### 7.3 选择、复制与搜索

跨页选区为 `{anchor:{page,offset},focus:{page,offset},revisions}`。支持拖选、滚动边缘自动滚动、双击词、三击行；pointercancel/失焦/按 Esc 结束预览。命中先查行/quad 空间候选，再投影到基线，不能只按 y 二分处理所有方向。

复制有单独连接策略，输出来自文本范围，不从 Canvas OCR；软断行去连字符需要左右词片段和断行标记，未知时保留原样。Ctrl+C 不抢输入框/聊天文本的原生复制。

搜索结果含 page、ranges、quads、textRevision；已识别页立即返回，逐页补齐，显示“已搜索 X/Y 页、待识别 N 页”。一次用户查询生成 queryId，旧结果丢弃；200ms 防抖。重识别后重新搜索并尝试保持当前命中位置，旧字符 offset 不继续使用。

## 8. Canvas 阅读器与资源预算

每页内容/叠加各一个 Canvas，无交互的 Canvas 设 pointer-events:none，外层统一捕获指针。DOM 只用于工具条、输入框和卡片。内容、选区、查找、已有标注、当前预览按固定顺序画。

可视页及前后 2 页进入虚拟列表；前后页可保留占位而不分配画布，服从内存预算。渲染并发 2，可见页优先；缩放用旧图临时 CSS 变换，150ms 后重绘；renderTask.cancel 后旧 generation 禁止覆盖新 canvas。

| 资源 | v1 默认限制与处理 |
|---|---|
| 页面单 Canvas | ≤16M 像素且单边≤16384；超限同比例降低后备分辨率 |
| 所有可见内容/叠加画布 | 256MiB 估算 RGBA 预算；不足时先释放预取，再降低非当前页分辨率 |
| 缩略图 | 独立 32MiB、最长边 180 CSS px，懒加载，后台并发 1 |
| 离屏/OCR/裁剪 | 96MiB 预算、单工作项≤12M 像素；OCR/截图并发 1，超限降低 DPI 并记录实际矩阵 |
| 文本/搜索 | 合计 128MiB LRU，以估算字节计；全文搜索索引可落缓存，不要求每页对象常驻 |
| 文档与标签 | 标签可超过 8；最多 3 个活跃 PDFDocumentProxy，其他释放；运行中工具临时 pin，完成释放 |
| worker | 一个外部 PDFWorker，文档销毁不销毁 worker；worker 异常整体重建并逐个恢复文档 |

非活动标签释放全部 Canvas；正在运行的工具通过 DocSession 获取/唤醒资源。超过预算先排队，不用“有任务所以可以无限 pin”绕开限制。DPR/viewport 变化时保持阅读位置而不是原滚动像素。

## 9. 持久化、事务与恢复

数据目录 `%LocalAppData%\DocAss\data\`，数据库 `workspace.db`；附件 `attachments/{docHash}/{attachmentId}.png`；可重建缓存/快照在独立 `cache/`，只允许宿主拼接经过验证的 ID。数据库不放网络共享目录。

### 9.1 表与事务边界

| 表 | 关键字段/用途 |
|---|---|
| documents | docHash、documentRevision、pageCount、displayName、schemaVersion |
| source_paths、recent_items | 宿主专有路径、文件版本/时间、最近顺序；不直接传 JS |
| annotations | docHash、annotationId、groupId、revision、JSON payload |
| conversations、messages | docHash、conversationId、messageId、parentId、branch、sequence、state、JSON payload |
| attachments、attachment_refs | 大小/MIME/hash/归属与引用关系，禁止路径字段进入对话 DTO |
| operations | docHash、operationId 唯一，payloadHash、result、committedRevision |
| tool_effects | conversationId、runId、toolCallId 唯一，result、annotation group/command ID |
| settings、providers、secrets | revision、非敏感配置；secrets 仅含 CurrentUser DPAPI 密文，读取接口不暴露 |

启用 WAL、`synchronous=FULL`、foreign_keys；写事务短小，在宿主专用队列执行，busy timeout 2s 后返回可重试错误。数据库中存的是经版本化 JSON schema 校验的 DTO，执行 SQL 一律参数化。并发读不触碰活动解析对象。

`CommitCommand {operationId,docId,expectedRevision,payloadHash,command}`：校验写锁→查询 operationId→一致重试直接返回原结果、同 ID 不同 payload 拒绝→revision CAS→在同一事务更新业务行、工具效果与操作结果→commit→返回 committedRevision。AI 标注及工具效果必须同事务落盘，不能先创建标注再另外记录“调用完成”。

宿主重新计算并核对 payloadHash，不信任客户端声明。哈希输入是 schemaVersion、宿主解析出的 docHash 和通过 schema 校验的业务 command 的规范 JSON：递归按键排序、UTF-8、拒绝非有限数；不含临时 docId、expectedRevision 或请求时间。因此重开文档后以新 docId 重试同一命令仍可识别；只改变业务内容而沿用旧 hash 必须拒绝。标注和会话写入共享每文档串行提交协调器，避免独立队列互相覆盖 revision。

已完成的画笔/编辑命令马上 enqueue，不做 1 秒丢失窗口式防抖。内存可乐观展示，状态为 saving；只在 ack 到达后改 saved。拖动过程不提交几百次中间点，pointerup 提交一个命令。保存失败保留脏命令和界面内容，提供重试，不回滚成“看似保存成功”。

### 9.2 附件提交与回收

先申请 uploadId，在同目录写临时文件、校验 MIME/像素/hash、flush 后原子改名，才允许数据库提交引用。文件写成功而 DB 回滚产生孤儿，后台回收；DB 绝不先指向未完成的文件。附件在 UI 和会话里只用 attachmentId，通过受限 endpoint 读取。

每 24h 或手动清理无引用孤儿；需同时保留当前 DB、最新备份与 pending upload 的引用集合。删除消息/会话在事务中移除引用，附件延迟清理。读到丢失文件显示“附件不可用”，保留文字记录，禁止导致整段会话打不开。

### 9.3 备份、迁移与关闭

保留一份最近成功的一致性备份：有修改时每 60s、正常退出前、schema 迁移前使用 SQLite backup API 写候选，再替换备份；不能直接拷正在写的主 DB 文件。失败保留旧备份并报告。数据库损坏检测后禁止继续写，提示从备份恢复及其时间/revision；恢复可能丢失备份后的记录，必须让用户明确选择。

schema 向前迁移需事务与迁移前备份；未知更新版本只读，不自动降级覆盖。当前没有真实旧 JSON 用户数据，无需凭空开发导入器；仅为今后 SQLite schema 升级准备框架和 fixture。

关闭流程：`open → closingRequested → stopAcceptingCommands → cancelRuns/unsubscribeOcr → drainCommits → saved → closed`。失败进入 closeBlocked，允许重试、取消关闭或明确放弃未保存修改。已进入 native OCR 的线程不阻塞窗口 UI；退出前不允许新结果写入已关闭会话。连续关闭请求合并，关闭标签与退出应用使用同一流程。

流式消息每 500ms 或累计 32KiB checkpoint；结束、错误、取消立即持久化。重启时 running 消息转 interrupted；可能丢最后一个未确认 checkpoint，不伪造完整回答。已确认的工具写效果不会重放。

## 10. 标注与撤销

通用字段：`id,docHash,page,groupId?,type,rect,color,opacity,author,createdAt,modifiedAt,revision,contents?,llmRef?,migrationState`。原始坐标和 quads 为页面空间。颜色线宽工具偏好在应用设置，尺寸值转换为页面单位，不存显示像素。

| 类型 | 必需几何与语义 |
|---|---|
| highlight/underline | quads、TextAnchor{quote,prefix,suffix,ranges,textRevision,source}；跨页拆成同 groupId 的多项 |
| note | anchor、图标、评论；可选 TextAnchor，纯位置便签不强制引文 |
| freetext | rect、text、fontSize、fontFamily 标识、alignment；textarea 输入法组合结束后才提交 |
| ink | paths、width；getCoalescedEvents 采样，RDP 简化必须保持≤0.5 CSS px 的显示误差目标 |
| rect | rect、strokeWidth、fill? |
| arrow | from、to、strokeWidth、endStyle |

命令为 add/update/remove/group，保留 do/undo 的纯数据逆操作，栈上限 200；一个跨页高亮、一笔手绘、一次 AI 批量创建都是一个事务/撤销单元。撤销/重做也产生新持久化 operationId，不删除已提交日志。撤销栈每标签独立，v1 不要求重启恢复撤销栈；标注状态必须恢复。

选择和列表同步；几何标注支持命中、拖动、缩放、颜色与评论编辑。删除键仅在文档焦点下作用。橡皮擦删除命中的完整 ink/几何标注，v1 不做擦除笔划片段；文字类通过选择/列表删除，避免误擦引用。

文件变化迁移：源 hash 数据保持不动，新 hash 下创建拷贝事务。TextAnchor 用 quote+prefix+suffix 在新文档唯一匹配；多个候选不自动取第一个。几何标注仅在相同页尺寸/坐标定义时保留坐标，其他标为 needsReview；缺页标注进入“未定位”列表。用户拒绝迁移记录该版本对，不反复弹窗。OCR 重识别仅重建查询/选区，旧高亮 quads 默认保留，重锚后显式生成更新命令。

## 11. OCR、质量判定与缓存

### 11.1 调度与模型

宿主一个 OcrScheduler、页推理并发 1；引擎按 profile 懒加载，同一时间只保留一个大模型实例，切换等当前页结束。默认 Small + Auto；禁 GPU 用 Cpu。初始化/执行 GPU 异常时释放故障实例，CPU 重试该页一次，UI 显示回退；CPU 仍失败则标页 error，不无限重试。

任务键为 docHash/page/profileFingerprint/contentRevision，每个请求先分配 jobId 和 subscriptionId。优先级：明确用户单页/框选需求→可见页→用户等待的搜索/LLM页→后台全文；每完成一页重新调度，不能让后台请求永久饿死。

状态：queued → rasterizing → running → completed/failed；subscription 可独立 cancelled。最后一个订阅取消时移除 queued 工作；running 不可硬停，完成结果不回填旧页面状态，且不新建可见副作用。新订阅只有在仍匹配文档/profile 时才可复用；旧 profile 结果永不覆盖新 profile。

事件含 jobId、docId、page、completedPages、totalPages、phase、profileFingerprint；当前页运行中显示无虚假百分比的进度；全文百分比基于完成页数。短时间切页不反复重做同一页。

### 11.2 栅格和变换

PDF.js OffscreenCanvas 200 DPI、应用页面旋转、白背景，输出 PNG；带实际尺寸和 rasterToPage，不带屏幕 DPR。宿主 WIC 解码 BGRA32；Run(returnCtcAlignment:true) 后 EstimateCharacterBoxes。char 的 confidence 原始值不直接当 0–1 概率；仅在明确定义归一化后使用质量阈值。

图片使用宿主已经归一化的像素，避免 EXIF 二次旋转。大页面按 12M 像素预算降低实际 DPI，UI 能看到该页 OCR 参数。选择/引用都用同一文本模型，不再另建一套 OCR 字符索引。

### 11.3 自动判定与混合

第一版不用完整 operator list 图像覆盖率解释器。明确选择可解释的启发式：字符为 0 的页进入 OCR；原生文本少于 40 个非空白 grapheme 且存在嵌入图像的页作为 hybrid 候选；异常 Unicode/无效几何比例>5% 或提取失败标为 unreliable 并 OCR；其余 native。这是可配置经验阈值，不代表图像面积检测。

hybrid 只在文本规范化一致、方向相近且基于短 span/字形重叠≥80% 时移除重复 OCR span；不得整行 IoU>0.5 就丢弃整段正文。无文字的空白页 OCR 一次后记 empty，不循环识别。合法 PUA 字体不能仅凭 PUA 判为乱码；结合文本映射/几何质量，并始终允许手动 native/ocr/hybrid 覆盖与重新识别。

缓存指纹包含 docHash、page、engineVersion、模型资源 hash、modelTier、有效 DPI、raster 尺寸、方向/预处理版本、几何/schema 版本；保存结果和 rasterToPage。用户选另一模型不删除历史缓存，但不复用为新 profile 的结果。缓存损坏视为 miss，不能使文档无法打开。

默认不为了首次显示而 OCR 全书；可见页预取，用户查找全文/工具全文需求时显式创建完整任务；显示未识别页数与一键识别。

## 12. Provider、会话与 Agent

### 12.1 配置与模型

Provider 存 id、名称、API 类型、上游 base URL、默认标识、凭据引用。Model 存 providerId/modelId/api、input 模态、contextWindow、maxOutputTokens、compat 设置；视觉能力逐模型定义。未知模型默认 text-only，用户可覆盖能力与窗口；不从模型名字猜测。

Provider 另存 `imageAllowed` 总开关，对应原型“支持图像输入”；出站图像条件为 `provider.imageAllowed && model.input.includes('image')`。关闭总开关立即影响后续发送；已经捕获配置的在途 run 维持原快照，界面说明更改从下一次发送生效。

表单保存经宿主一次事务替换配置与 DPAPI 密文；非敏感 DTO 只返回 hasKey。测试草稿只在用户点击时执行，无文档内容，限 15s/最多 8 输出 token；若提供方不支持小上限则采用适配器合法最小值并展示错误，不偷偷保存。删除 provider 保留历史会话但标配置缺失，禁止继续请求旧地址。

每种适配器规范化消息、认证和结束/错误事件；不支持的 API 返回 UNSUPPORTED_API。pi 通过自有 LlmTransport/AgentAdapter 包装，所有 model.baseUrl 强制指向宿主 loopback；自定义 fetch 加本地口令并限制目标 origin。禁止原始 SDK 在失败后直连公网。

### 12.2 transcript DTO 与恢复

Message 包含稳定 id、conversationId、parentId、branchId、role、createdAt、state、typed content、modelRef、usage；文本、引用、attachmentId、toolCall/toolResult、error 为明确类型。工具参数必须 JSON schema 校验，输出禁止函数/执行对象。只在出站时临时把附件 hydrate 为 pi image block，持久化消息中不出现 base64。

会话每次 send 生成 runId，捕获 docId/docHash、conversationId、modelRef 与选区快照；设置或标签变化不改变在途 run。模型修改用于下一次 send。历史会话每次加载只取可视消息，全文记录可分页读取。

重新生成从目标 user message 创建兄弟 branch，旧回答保留供切换，送模型只选当前 branch 的祖先链。重试同一未确认写工具使用原 toolCall effect key；重新生成属于新的 run，不自动撤销旧标注，碰到同页同类型同引文的已有 AI 标注返回 alreadyExists，需用户明确另建才能重复。

### 12.3 上下文与预算

系统提示只包含应用规则与已验证元信息；文档正文/选区/检索结果放低信任的数据消息或工具结果，不直接拼接进系统指令。

预算以 model.contextWindow 为上限，预留输出、工具 schema、图片估算和至少 10% 安全余量。全文纯文本估算≤窗口 40% 且剩余预算允许时可内联；否则只发大纲、已就绪页面摘要和当前选区，不为摘要强制 OCR 全书。摘要同样限长，全文读取由工具分批执行。

保留最近完整回合；旧工具大结果替换为带 toolCallId 的截断说明，不能只删 result 留孤立 call。无可靠 tokenizer 时保守估算并把截断/超窗错误变为可恢复提示。默认每 run 最多 12 个工具调用、单次文字 20000 字符、搜索最多 50 命中、图像最长边 2048/最多4附件；超预算返回明确原因而不是继续自旋。

### 12.4 工具

| 工具 | 参数与输出 | 强制限制 |
|---|---|---|
| get_document_info | 标题、页数、大纲摘要、页识别状态 | 无本地路径；只访问 run 文档 |
| get_page_text | from/to、cursor/maxChars；返回带 page、textRevision、ranges 的分块文本 | 每次最多5页/20000字，附 nextCursor 与 coverage；允许订阅 OCR |
| search_document | query、cursor/maxHits；返回 snippet、page、ranges、revision | 最多50命中，报告未搜索页，不把部分结果说成全文 |
| get_page_image | page、maxEdge | longestEdge≤2048，200 DPI 起算且服从内存/体积预算 |
| get_region_image | page、页面空间 rect | 校验矩形在页内；返回裁剪图和坐标 |
| list_annotations | page/type/cursor | 分页、排除宿主私有信息 |
| create_annotation | page、quote、type=highlight/note、comment、可选可信 anchorToken | 可信锚点验证成功或引文唯一匹配才创建；歧义返回候选，失败不创建随机标注；note 的位置来自匹配引文 |

anchorToken 由工具服务随机签发，在当前 run 的注册表中映射到 docHash/page/textRevision/ranges；模型传入的 token 必须命中注册表且与当前页文本和 quote 一致。经验证的 token 可以消除重复引文歧义；无 token 时必须唯一匹配。token 不作持久化身份，重启/重识别后改用已保存 TextAnchor 重新定位。

只读工具默认可执行；写工具必须在持有该文档编辑权限时走 AnnotCommandService，并以 runId/toolCallId 幂等落库。结果同时关联 assistantMessageId、annotation group 和 undo command。注入最多不能只描述为“创建可撤销标注”；还要防无限读取/调用、伪造引用和远程内容加载。

### 12.5 停止和后台运行

点击停止立即停止 UI 新请求并取消 run；取消上游、工具等待和 OCR 订阅；同步 OCR 自然结束但不再向该 run 发送结果。停止状态在 100ms 内显示，测试上游连接须在 1s 内关闭。已提交标注保留并提供撤销，未提交写命令不得在取消后新提交；竞争情况由事务返回已提交/已取消二者之一。

切换标签不停止；关闭标签先 abort 并完成持久化。超过资源限制的后台 run 排队，不能唤醒无限 PDF 实例。重启仅恢复记录和 interrupted 状态，不自动重新发送问题或重跑写工具。

## 13. 框选、引用与消息互链

文字“问 AI”只把 TextAnchor 快照加入 composer 引用，不直接发请求。框选操作以页面空间矩形为准，确认后离屏渲染并裁剪，不能截当前显示 Canvas；应用颜色标注默认不进入发给模型的原图。读取区域文字、提交图像附件和保存坐标后生成附件卡，最多4个，用户发送前可移除。

text-only 模型只发送文字并在附件托盘说明；区域没有可读文字时提示换视觉模型/识别，不发送空问题。附件卡记录 docHash/page/rect/raster scale/attachmentId，可跳回原位置。

引用输出兼容 `[[p12|原文片段]]`，解析为受限 token，不作为 HTML。优先用已有工具返回的 anchorToken 或唯一 quote 匹配确认；结果带 textRevision。引文不存在/歧义时仅跳页并显示“原文位置未确认”，不能把模型生成文本假装为已验证高亮。

`llmRef {conversationId,messageId,runId?}` 与消息中的 annotationIds/attachmentIds 持久化；删除一端另一端显示来源已删除，不崩溃。跨页 AI 创建用一个 group undo；会话删除不自动删用户已保存标注。

## 14. UI、交互和设置

沿用原型的标题栏48、工具栏44、状态栏28、左图标栏48、侧面板280、对话默认35%/340–640、收起40。主窗口期望1440×900，按可用工作区限制；狭窄窗口优先收对话、折叠左面板、工具放溢出菜单，文档区至少可见，设置对话框宽高不超过工作区并允许滚动。

工具包括 select/highlight/underline/note/freetext/ink/rect/arrow/regionAsk/eraser；每工具记住颜色线宽。左缩略图/大纲/标注面板互斥；分隔条双击恢复35%，偏好持久化。对话首条消息自动取前20字标题，用户改名后不再覆盖；删最后一个会话回到可创建空态。

状态优先级：保存错误/文件不可用 > OCR活动 > 保存中/已保存 > 文字来源；错误不被 OCR 覆盖。任务可在详细状态区查看，页底仍显示本页识别活动。不要用固定计时器伪报“测试成功”“已保存”“OCR完成”。

快捷键遵循 requirements F8.7；在 input/textarea/contenteditable/IME composition 中不抢文档键。Esc 先处理最顶浮层再取消工具；设置未保存时确认。Ctrl+Enter 发送、Enter 换行；对话可复制、安全 Markdown、错误重试、工具进度、分支重生成、页引用跳转。

标题栏由真实 window bridge 控制，app-region 与非客户区支持一起验收。Windows 贴靠悬浮 v1 不做。窗口关闭按钮、Alt+F4 和系统关闭必须进入同一保存流程。设置四页包含 provider、标注作者/颜色/透明度、OCR档位/GPU/缓存、关于版本/运行时/许可证/日志目录；作者默认宿主 Windows 用户名。

## 15. 浏览器开发与生产隔离

`pnpm dev` 无 .NET 即可启动。默认真实空工作区；文件输入读取 PDF/图片，PDF.js 真渲染；IndexedDB 实现同语义的 revision/operationId/附件提交，不能只把数据留在 useState。

BrowserServices 提供固定 fixture 的规范几何、OCR 和 SSE（含失败/取消/重试场景）；任意非 fixture PDF 的精确文本功能显示“需桌面服务”，不偷偷恢复已被否定的 measureText 实现。可选开发代理由明确的服务启动命令开启，凭据放宿主/本地服务端配置，不读入 Vite 客户端变量。

demo 模式显式 `?demo=1` 并显示演示标签，保留五个原型场景用于视觉对比；发布启动参数默认关闭 demo，生产代码不得因 doc-1/doc-2 等固定 ID 决定功能。mock 延迟必须服从 AbortSignal，取消后不得追加假回复。

## 16. 验收标准和测试分层

验收证据全部落在 `docs/validation/aN.md`：记录代码版本/日期、平台与依赖、命令、fixture、预期/实际、未覆盖项。单测本身放对应模块正常测试目录；隔离 Spike、验证输出和生成样本只放 docs 下。新增测试只针对关键语义，不为纯样式逐行镜像实现。

| 门禁 | 可判定目标 |
|---|---|
| G1 原生文字几何 | 至少5类 PDF、总计≥1000个非空白标真 glyph，包含 CJK、混排、TJ、Rotate、CropBox，并扩展 UserUnit/连字/竖排/RTL；按阅读方向字符起止投影误差均<0.15字宽的比例每类≥98%，其余必须识别为降级；全 quad 人工叠加审查，无系统位移 |
| G2 坐标 | page↔viewport 在0/90/180/270、DPR1/1.25/1.5/2、CropBox/UserUnit 下数值往返误差≤1e-6页面单位；可见叠加边界误差≤1 CSS px |
| G3 存储 | 100次 ack 后随机强杀重开无丢失；提交前强杀无半条业务数据；同 operationId 重试100次只一次副作用；旧 revision 被拒绝；磁盘满/无权限/备份恢复有明确结果 |
| G4 流与取消 | 可控本机上游每250ms输出4段，UI在结束前至少2次更新；无人工延迟时首段附加开销<250ms；点击停止≤100ms反馈、上游≤1s收到断连；四 API 类型均覆盖碎片、工具、错误 |
| G5 OCR | 参考本机 i5-11260H、Small CPU、A4 200DPI、至少30次暖态全路径（含缓存写）P95≤1.5s；冷启单独报告；清晰英文CER≤1%、中文≤2%，倾斜/竖排人工100字的中心落真值quad比例≥95%；达不到则该配置不通过，不悄悄换Tiny冒充Small |
| G6 大文档 | 固定500页混合样本，参考机首屏≤3s（本地SSD≤100MiB），滚动帧耗时P95≤33ms；10分钟滚动后整体宿主+子进程私有内存稳定，暖态第2/3轮峰值差≤10%，峰值≤1.5GiB；内部画布预算始终满足 |
| G7 多标签/长对话 | 10个标签轮换无串数据，最多3个活跃PDF对象；300页文档问答显示覆盖范围与正确页码；两个生成run有界，关闭/重启不重放AI写操作 |
| G8 界面与部署 | 1366×768/1440×900，100%/125%/150%/200% DPI，核心按钮可达、输入法可用、无关键内容裁切；无.NET SDK的干净Windows x64机器可运行，WebView2缺失有明确引导 |

几何真值区分 glyph 与字符，不把字体不支持的空缺纳入正常字框统计；OCR真值必须留人工标注，不以自身输出当真值。大样本生成器和可分发小文件放 docs/fixtures，真实样本必须标许可/来源且不包含用户敏感文档。

未通过门禁时阻止对应模块“完成”。G1 个别不支持文档走明确 OCR 降级仍可验收降级体验，但不能掩盖受支持原生样本的系统性几何失败；G5 的模型质量与延迟不足必须在任务记录中保留并修正，不能把“库可运行”视为完成。

## 17. 打包、诊断与发布

发布自包含 win-x64（含SQLite原生依赖），拷贝前端dist、PDF.js worker/cmaps/fonts/wasm、三档OCR模型与许可证。启动检测 WebView2，已有则使用受支持 Runtime，无则显示安装/离线部署说明；不声称 .NET self-contained 会包含 WebView2。

开发/发布入口分开，发布禁用远程dev-url、开放代理和调试后门。日志在本机轮转，默认不记录文档正文、图片、Key、密码或完整请求体；最多记录操作ID、脱敏provider、错误码、耗时和页号。关于页提供日志目录和依赖许可证。

发布验证包括坏PDF、密码、缺字体、缺资源、损坏附件/缓存、断网、429、磁盘满、DB冲突、GPU不可用、运行时缺失与跨DPI。自动更新和安装包签名不是v1必需；交付zip、校验值、版本说明、备份/恢复操作说明和已知限制。

## 18. 执行与完成定义

按 `tasks.md` 的 a1–a62 执行，依赖是实际门禁。每项只在代码集成、指定验收达到、证据落盘后打勾。原型组件存在不能替代真实服务验收；Spike 通过不能替代生产接口测试。

当前不承诺日期/工期，也不凭 UI 完成度推算百分比。先完成契约、宿主通道和存储，再接真实文档、几何和标注；OCR/LLM 在相应稳定接口上接入，最后完成整体性能与干净环境交付。
