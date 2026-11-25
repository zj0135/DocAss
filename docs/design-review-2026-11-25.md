# DocAss 设计评审与验证结论

评审日期：2026-11-25。对象：评审前的 `design.md` v0.2、`requirements.md` v0.2，以及当前前端原型。下列行号指评审前版本，回写后以章节号定位。验证工程、依赖缓存、样本、结果均在 `docs/` 下；未修改 `src/`。

## 结论

WPF + WebView2、PDF.js 内容画布、自研标注叠加层、宿主本地 OCR 的分工可以保留。但当前设计不能直接作为功能实现依据：**LLM 拦截式流通道和逐字几何两个前置假设已被实测否定**；代理边界、保存协议、统一文本与会话持久化也需要先补齐。

建议先修正文档与核心契约，再进入 M1/M2/M5。没有必要重做现有界面原型；可以保留布局、组件外观和交互稿，业务类型与状态应重新接入正式服务。

实测环境：Windows 10.0.26300，i5-11260H（6 核 / 12 线程），RTX 3050 Laptop，.NET SDK 11.0.100，Node 24.22.1，WebView2 Runtime 158.0.4370.33，WebView2 SDK 1.0.4314.35。精确版本与结果见 `spikes/review-2026-11-25/results/summary.json`。

## 必须优先解决的问题

### R1 · P1：`WebResourceRequested` 不能承担当前写法的 LLM 流式通道

位置：设计 §3.2、§4.1–4.2，原行 150、179、192；需求 S1。

实验每 350ms 生成一块 SSE，共四块。宿主确实逐块 `Read`，但 JS 在约 **1424ms** 后一次收到全部四块。`fetch.abort()` 后宿主仍将剩余流读完，也没有在取消时收到可用的流释放信号。初次实验紧接着发送上传请求，16MiB 上传被未结束的拦截流拖到约 3.76s；隔离测量后约 245ms。

因此 `ResponseHeadersRead` 只能改变 HttpClient 读取上游的方式，不能保证 WebView2 把该流增量交给 JS。此处不是“以后优化首字延迟”，而是 F6.3/S1 无法成立。

建议：LLM 首选 loopback Kestrel；保留拦截式接口给文件与有限长度 OCR JSON。实测 pi 经 loopback 在约 **60 / 311 / 563 / 817ms** 收到四次增量；取消后宿主在约 **1–2ms** 观察到断连并取消处理。仍应保留请求 ID、显式桥取消和空闲超时，实际代理必须把相同 token 传给上游 `SendAsync`、读写和工具执行。

loopback 的 CORS 不能只允许 `Authorization` 与 `Content-Type`：本次 OpenAI 适配器还发送 `x-stainless-*`，第一次预检被拒绝，加入限定头列表后成功。地址固定监听 `127.0.0.1`，严格 origin、短期随机口令、体积与并发限制，静态内容与文件接口不暴露给任意来源。

证据：`results/webview.json` 的 `browser.streaming`、`loopbackPi`、`host`；初次阻塞另见 `webview-intercept-initial.json`。这里验证了本机服务取消；真实提供方上游连接取消还没有进行付费网络实测。

### R2 · P1：按前缀测宽分配字符位置不满足 S2

位置：§5.3，原行 254–260；需求 S2“误差 < 0.15 字宽且覆盖 ≥98%”。

五类合成样本包含中文横排、中英混排、`TJ` 非均匀字距英文、90° 页面旋转、偏移 CropBox。45 个非空白字符中，按文档算法比较已知字符起点，只有 **39/45（86.67%）** 低于 0.15 字宽，最大误差约 **28.78%**。即使只测较弱的“起点正确”条件都失败，不能声称完整字符盒通过。

内嵌字体确实可通过 `fontName` 出现在 `document.fonts`，但 PDF 的 `TJ` 位移、字间距、词间距、字形映射和提取时插入的空白，不等同于浏览器对 Unicode 字符串测量的前缀宽度。实验原文 `ABCDEF` 的 PDF.js 文本是 `A BC DE F`；`disableNormalization: true` 没有消除这些合成空白。连字 `ﬁ` 在默认模式变为 `fi`，关闭规范化仅保留该连字，并不提供文字与字形一一对应保证。

建议：启动原文已预留的 PdfPig 几何分支，或采用可获得文字定位操作/字形位置的实现。必须统一“文本和几何的来源”或建立 glyph↔text span 多对多映射；不能把 PdfPig 的第 N 个 letter 直接套到 PDF.js 第 N 个字符。PdfPig 在同一 `TJ` 样本六个字符起点误差为 0，也能读取该合成中文字体；这只证明该反例可修复，不证明真实 CID/CJK/竖排文档全面通过。

证据：`results/browser.json` 的 `pdf.characterAccuracy`；`results/host-inspect.json` 的 `letters`、`pageTexts`。下阶段需要真实中文嵌入/未嵌入字体、连字、RTL、竖排、缺失 ToUnicode 等样本和完整四边形误差基准。

### R3 · P1：代理只校验初始上游仍会漏出密钥；provider 地址也未真正固定

位置：§4.1、§4.3，原行 174、177–179、202。

本机两个不同端口模拟“已保存上游 → 未配置目的地”的 302。默认 .NET HttpClient 重定向移除了 `Authorization`，却保留了 **`x-api-key`**，目标收到了假密钥。这直接反驳“只从配置读初始地址就能保证 Key 不去其他地址”。

此外，`@earendil-works/pi-ai@1.6.0` 接受 `createProvider.baseUrl`，但请求实际采用 **`model.baseUrl`**；本次故意给两者不同地址，实际访问模型地址。仅照设计设置 provider 地址，可能绕过宿主、把文档发往模型目录原始地址，并使用占位 Key 导致失败。

建议：宿主禁用自动重定向，或每跳验证 scheme/host/port/path 后重新决定认证；按 API 适配认证头和 query 参数，删除全部客户端认证输入。对代理 URL 后缀限制相对路径，拒绝绝对 URL、`//host` 和路径逃逸。前端统一重写每个模型的 baseUrl 或在请求适配器中强制替换，CSP 的 `connect-src` 限定本机通道。为两种认证头和跨 origin 重定向加入回归样本。

pi 版本也必须写完整包名：旧 `@mariozechner/pi-ai@0.73.1` 被 npm 标记迁移，`createProvider` 属于本次验证的新 `@earendil-works` API，不能把新 README 和旧包混用。

证据：`results/redirect.json`、`results/browser.json` 的 `pi.requests` 与 `providerBaseUrlOverridesModel`。全程使用固定假密钥。

### R4 · P1：原子替换不等于可靠保存，关闭和崩溃承诺互相冲突

位置：§7.1、§7.5，原行 382、462–464；需求 F4.5、M3。

- 实测 `File.Replace(temp, target, backup)` 在首次目标文件不存在时抛出 `FileNotFoundException`，需要首写 `Move` 分支和同目录临时文件。
- 1 秒防抖留下尚未落盘的窗口，“标注后杀进程全部还原”并不能由该方案保证；原子写只保证不会出现半个替换文件。
- 关闭时 2 秒超时强退，会在慢盘、磁盘满、写入失败、未完成对话持久化时丢数据，违反“关闭确保落盘”。
- 写入是异步请求时，需要按文件串行和 revision/ack；否则旧快照晚完成可能覆盖新快照。需求排除单实例运行，多个进程仍可能同时覆盖同一 hash 的文件，需锁定或检测冲突。

建议：明确“已保存”的 durable ack，首写/替换/错误/备份恢复四条路径；关闭进入停止新命令、取消生成、flush 最新 revision、确认落盘的状态机。超时不能静默强退，可允许用户明确放弃。若坚持任意时刻杀进程零丢失，需持久化操作日志或同步提交；否则修改验收为确认“已保存”之后再杀进程。

### R5 · P1：统一文本模型缺少可稳定索引的语义

位置：§5.1–5.7、§6.7–6.8、§7.2，原行 220–247、299、307、359–367、411。

`Char.index` / `charStart` / `charEnd` 未说明是 UTF-16、code point、grapheme 还是 glyph；JS 查找返回 UTF-16 offset，emoji、组合字、连字展开以及人为插入的空格/换行都不能用“一个字一个 index”表达。`NFKC` 映射也可能一对多、多对一，需要映射成范围而非单个字符索引。

建议：`PageText.text` 的范围统一为半开 UTF-16 `[start,end)`，显示单位使用 grapheme，`TextSpan` 持有文本范围和零至多个 glyph quad；空格/换行允许没有几何。保存 `textRevision`、文本源和抽取配置指纹；OCR 重识别后旧选区和查找结果失效并重算，已保存高亮先保留历史 quads，重定位必须显式确认或记录状态。

坐标体系保留未旋转原始页面空间是正确方向，但单位不能无条件写 pt：实测 `/UserUnit=2` 时 `page.view` 仍为 595×842，viewport 在 scale=1 时为 1190×1684。需要记录 `userUnit` 并直接复用 viewport 正逆矩阵。图片需约定 DPI 缺失/为零的默认值、EXIF 方向和像素尺寸；OCR 缓存需保存实际 raster→page 仿射矩阵和页面尺寸。

当前 OCR 缓存 key 只有 DPI、model 档位、schema，遗漏引擎版本、模型版本/哈希、预处理/方向和判定覆盖设置。`ocrProfile.engineVer` 在内容里但未参与 key，升级后仍会错误命中。三类判定还遗漏“原生字数多但乱码率高”等情况；`hybrid` 以整行 IoU 丢弃可能误删与页眉局部交叠的有效正文，需要明确去重规则。

### R6 · P1：OCR 的取消、任务标识和识别质量验收不完整

位置：§3.1–3.2、§5.5，原行 122–123、158、282；需求 F5.5、S3。

NuGet 2.0.0 的 `Run` 是同步方法，没有 `CancellationToken`；仅 `LoadAsync` 有取消参数。本次发布源码确认支持并发 `Run`，同实例双任务结果也相同，所以单队列可以作为资源预算选择，但不能据此宣称正在运行的推理可中断。

`ocr.cancel({jobId})` 没有对应任务创建返回值，当前 POST 到完成才返回。需在提交时由客户端生成 request/job ID 或立即返回 job handle，关联进度、订阅者、缓存和取消；查找/LLM/可见页共用任务时取消一个订阅者不能误杀其他需求。

明确语义：取消队列任务并忽略进行中结果、推理结束后释放，或把推理放入可终止的独立进程。UI 的“已停止”不能暗示 CPU 已即时停止。

性能有积极证据：Small CPU 完整样本路径约 **1485 / 850 / 735ms**。不过首次接近 1.5 秒上限，而且不含缓存落盘和等待队列；只能说本机合成清晰页面可行。竖排 Tiny 拆成两行、Small/Medium 识别完整；尚无逐字符盒人工标真，不能宣布“贴合”验收通过。

### R7 · P1：对话存储、附件与 Agent 运行态的契约无法闭合

位置：§3.1、§8.1、§8.3、§8.6、§10.7，原行 119–121、478、506、528–539、631。

实测 pi 的消息数组可 JSON 序列化，并可恢复后继续生成；但工具图像和用户图像的 base64 **就在消息 content 内**。直接保存 `messages: unknown[]` 与“不在 JSON 放 base64、附件存 attachments/”冲突；当前桥也没有附件上传/读取/删除、会话删除的端点。

建议定义自己的版本化 transcript DTO：稳定 `messageId`、provider/model/api 组合、工具调用 ID 与状态、`attachmentId` 引用；落盘时外置所有图像，送模型前按需 hydrate。稳定 ID 还要服务 `llmRef`；pi 原始消息没有本设计要求的应用级消息 ID 保证。

历史裁剪应保留合法的 tool call/result 配对，并替换为截断说明；还要计算图片、工具 schema、系统提示、输出预算。重新生成需定义分支和上下文选择，创建标注工具用 `toolCallId` 幂等，不能重试就重复创建。关闭、重启和中途停止后的不完整工具调用要转为明确 interrupted 状态。

工具应捕获发起会话的 `docId/docHash`，不能在执行时读取全局活动标签。否则“切换标签不中断生成”与“只操作当前文档”可能冲突。休眠 `pdf.destroy()` 前还需判断在途 Agent/OCR 引用，或让工具透明唤醒该文档。

### R8 · P1：提示注入和界面出站边界被低估

位置：§3.1、§4.3、§8.2、§10.7，原行 119、137–138、202、496、627。

“无文件/网络工具，因此提示注入最多创建可撤销标注”不成立：仍可能让模型读取整个当前文档、持续调用耗费额度、输出伪造引用，或通过渲染 Markdown 外部图片触发出站请求。文档正文不能提升为系统指令；应有工具次数/时间/输出大小/单页图像像素预算，Markdown 禁止原始 HTML、脚本和自动外链图片，外部链接只经受限 `http/https` 打开，导航/弹窗和 CSP 要一致。

桥也需结构校验和能力校验，不只看 origin：`store` 的 key/hash/id 不得直接拼路径；OCR 的位图尺寸、stride、长度必须有界。设计一面说 JS 永远不拿路径，一面把 `meta.json` 作为不透明 JSON 读取、其中又保存最近路径，需要分离 host-only 元数据和前端 DTO。

N1“前端无法读取 Key”应解释为**不能读回已保存 Key**；WebView 设置表单新输入的 Key 必然短暂经过 JS。若连首次输入也不可见，就必须用宿主原生密钥输入界面。测试连接“不保存”与“仅代理已保存地址”也冲突，应单设受限的临时连接测试命令，不能临时覆盖正式配置。

## 次优先级问题与遗漏

| 编号 | 位置 | 问题与建议 |
|---|---|---|
| R9 · P2 | §6.2、§6.4、§9 | 16M 像素 × RGBA 是约 64MB/画布；两层、至少五页可接近 640MB，尚未计 worker、图片解码、OCR、截图。需全局字节预算，不仅页数/LRU；OCR 和框选离屏也需尺寸上限。布局元信息可以渐进加载，避免首屏等待全书 `getPage()`。 |
| R10 · P2 | §7.2、§7.3 | 跨页选区不能落在一个 `Annotation.page`：按页拆分并用 groupId 组成一个撤销/删除事务。文字高亮移动/缩放后是否保留文字语义必须确定。混合页的 `textSource`、迁移状态“位置待确认”、迁移置信度在 schema 中均无位置。 |
| R11 · P2 | §5.4、§6.7 | 只按 y 二分不足以通用支持倾斜、竖排、重叠行和 RTL；需先空间候选再投影到基线/阅读方向。虽允许 v1 不做表格版面分析，财报原型和表格问答仍应明确降级到图像，不能承诺表格文字顺序可靠。 |
| R12 · P2 | §3、§6、§10 | 缺 PDF 密码的 `onPassword` 生命周期与取消、最近文件枚举、日志目录打开、会话/附件删除、连接测试的方法；`getPageInfo` 同步签名与 PDF.js 异步取页需预加载契约。PDF 原有可视注释/表单的呈现策略也应明确。 |
| R13 · P2 | §7.6 | 打开时检测内容改变还不够：需保证 hash 和读取字节来自同一快照，避免哈希后文件被替换；已有已打开文件变化也需策略。最近路径→hash 需独立宿主索引，不能靠扫描全部 meta 才查到。 |
| R14 · P2 | §2、§10、§12 | 原有 `docs/spikes/S0.md`、host 工程在评审开始时均不存在。不能把 11 月 15 日人工拖动记录当成本次可复现证据。本次验证了宿主与库、拦截和 loopback，但没有重跑标题栏拖动、双击、窗口按钮、Vite HMR。 |

## 全量待验证清单回执

“确认”只适用于本次版本和样本。“部分”表示有证据但不满足完整产品验收。

| 原清单项目 | 结果 | 证据与边界 |
|---|---|---|
| pi 浏览器运行 | 确认 | Edge 与真实 WebView2 均可导入并完成请求；只测试 OpenAI completions 适配器，不泛化到所有 provider |
| createProvider / baseUrl / auth | 部分，需修正 | 接受 provider baseUrl、占位 auth；实际按 model.baseUrl 发请求，不能只改 provider |
| streamProxy 协议 | 确认 | 向 `/api/stream` POST `{model,context,options}`，使用 pi 事件流协议，非透明上游 SSE |
| 自定义 fetch | 确认 | OpenAI completions 适配器接受注入并输出两段增量；不代表每个 adapter 都支持 |
| 工具图像内容 | 确认 | image block 被适配为后续 user image_url；只验证序列化，未调用真实视觉模型 |
| Agent 消息恢复 | 确认/部分 | JSON 往返并继续 prompt 成功；附件外置、截断工具、应用消息 ID 尚需设计 |
| 视觉能力字段 | 确认 | `model.input.includes('image')`；应按模型配置，不能只做 provider 总开关 |
| 内嵌字体注册 | 确认/部分 | 合成字体以 `g_d*_f*` 注册；不保证每份文档、每字符均可测宽 |
| 关闭文本规范化 | 确认/否定假设 | 参数是 `disableNormalization`；不能保证字符/字形一一对应 |
| wasmUrl | 源码确认 | 当前包含 `jbig2.wasm`、`openjpeg.wasm`、`qcms_bg.wasm` 等资源，应部署并传入；尚未用真实 JBIG2/JPX/ICC 金样本验收 |
| 共享 PDFWorker | 确认 | 显式传同一个 `worker` 给两个 getDocument；销毁一个 document 后另一个仍能提取；最终单独销毁 worker |
| 图像覆盖面积 | 部分 | operator list 能读图像操作，但 args 的 1×1 是原始图像像素，实际画为 200×300 并旋转；需解释 CTM/save/restore/form/clip 后求并集，不能直接累加 args 面积 |
| WebView 拦截流 | 不通过 | 四段累计到 EOF 一次下发；不可作为当前 LLM 首选通道 |
| fetch 取消传宿主 | 拦截不通过；loopback 通过 | 拦截仍读完全流；loopback 本地请求约 1–2ms 收到取消；真实上游待集成 |
| POST 大请求 | 确认/部分 | 隔离后 16MiB 拦截往返约 245ms、宿主读约 12ms；非吞吐分位数和长时压力测试 |
| 虚拟映射与拦截优先级 | 确认 | 同 host 映射路径返回文件 `mapping`，拦截事件未出现；不同 host/无映射拦截可用 |
| .example / .local 延迟 | 未复现旧结论 | 本机映射下约 1–2ms，均无约 2 秒等待；无映射 DNS 环境、首次启动和其他 runtime 仍未覆盖 |
| 共享缓冲区可写 | 确认 | ReadWrite 缓冲区中 JS 写 42，宿主读到 42；可设计宿主分配→JS 填充→完成通知 |
| PNA / 本地网络权限 | 部分 | 本机只出现普通 CORS 预检，无 permission 事件；Chrome 的 LNA 已替代旧 PNA 路线，不能从本次推断所有 WebView/策略配置 |
| 标题栏拖动/双击 | 原证据缺失 | 本次未人工复核，不能把既有 S0 声明改写为本次通过 |
| window 桥/最大化同步 | 原证据缺失 | 当前原型未接宿主；本次验证工程未实现该交互 |
| net11 选择 net10 OCR 资产 | 确认 | `project.assets.json` 指向 `lib/net10.0/Sdcb.SimdPaddleOCR.dll`，构建/运行成功 |
| Vulkan / CPU 回退 | 部分 | 本机强制 Vulkan 完成，显式 CPU 完成；包提供 Auto/CPU；未覆盖驱动缺失或运行中 GPU 错误的自动恢复 |
| 倾斜/竖排字符盒 | 部分 | 12° 倾斜及竖排返回四边形；Small/Medium 本样本文字完整，Tiny 竖排拆行；盒子精度未建立人工真值 |
| OCR 线程安全/取消 | 部分确认/取消不支持 | 发布源码声明并发安全，双任务 smoke 相同；同步 Run 无 token；不能中断正在执行的计算 |
| 模型档位耗时 | 本机已测 | 纯推理 warm：Tiny 249–273ms、Small 611–658ms、Medium 2122–2204ms；单样本，非 P95 |
| 英文识别质量 | 本机已测 | 924 个非空白字符 CER：Tiny 0.649%、Small 0.108%、Medium 0%；清晰合成文本，不能替代真实扫描质量 |
| PdfPig CID/中文字框 | 部分 | 合成中文可读、六字 `TJ` 位置准确；真实字体和完整字框未验收 |
| PdfPig 与 PDF.js 对齐 | 已发现差异 | `ABCDEF` 对 `A BC DE F`，不能按数组下标硬对齐；多对多映射待实现 |

## 原型审查边界

`src/web/src/App.tsx` 使用 mockData 和计时器模拟；`DocumentViewer.tsx` 选择三套固定页面组件，通过 CSS zoom/rotate 演示；`types/index.ts` 的标注是页面演示坐标，没有正式页面空间契约。这与“目前只有原型”的定位一致，不记作产品实现缺陷。

不能将 prototype-guide 中“类型与设计一致”的说法用作数据层验收：正式开发仍需 `DocSession`、页面矩阵、统一文本、桥 transport、命令栈、存储协议、会话与附件 DTO。建议保留 UI 组件，替换 mock 边界，不在现有模拟状态上继续堆核心逻辑。

## 建议实施顺序

1. 固定依赖/API 与坐标、文字 span、jobId、messageId、store revision 的契约；对“取消”“保存成功”给出可测试语义。
2. 采用 loopback LLM 通道，完成上游认证、重定向拒绝、取消传播；把本次合成 SSE 换成受控真实提供方验证。
3. 优先完成文字几何分支与真实样本基准，再实现选择、高亮、查找和引用；否则这四个功能会一起返工。
4. 保存/恢复/附件/中断状态完成后，再接正式 Agent；OCR 可保留现有库，但补任务模型和全路径性能指标。
5. 最后扩展 500 页/多标签内存、异常文档、GPU 故障、Windows 新安装部署与窗口交互验收。

## 一手资料与证据来源

本次搜索接口未返回可用内容，因此用 HTTP 直接取得官方文档、注册表元数据、发布包源码/类型并结合本机执行验证。没有依据第三方教程推断 API。精确运行数据在 `spikes/review-2026-11-25/results/`；外部文档仅作为说明。

- pi 发布包：`https://registry.npmjs.org/@earendil-works/pi-ai/1.6.0` 与本目录 node_modules 中 `models.d.ts`、`api/openai-completions.js`、agent `proxy.js`。
- pi 官方仓库：`https://github.com/earendil-works/pi-mono`；旧地址 `https://github.com/badlogic/pi-mono` 的主分支文档已指向新包。
- PDF.js 发布包：`https://registry.npmjs.org/pdfjs-dist/6.5.438`；源码/类型 `build/pdf.worker.mjs`、`types/src/display/api.d.ts`。
- WebView2 本地内容官方文档：`https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/working-with-local-content`。
- WebView2 流接口：`https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2environment?view=webview2-1.0.4314.35`。
- Chrome 官方 LNA 说明：`https://developer.chrome.com/blog/local-network-access`，说明 Chrome 142 起的权限机制不能仅用旧 PNA 预检描述。
- OCR 2.0.0 发布 commit：`https://github.com/sdcb/SimdPaddleOCR/tree/697208399240f21ec8ff28218fc8cd2c4dbbe0ee`；NuGet 包 DLL 的方法反射优先于可能更新的 README。

尚不能回答的部分已在矩阵中标为“部分/未复核”：真实文档广覆盖精度、生产上游密钥链路、GPU 故障恢复、跨机器权限行为、标题栏人工交互和大文档长期性能。当前证据不足以将这些标记为通过。
