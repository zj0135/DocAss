# 第四阶段：OCR 实现与验收记录

日期：2026-11-26。A35–A40 已完成实现与本机验收。首次验收因缺人工字框真值暂未勾选；随后用户明确要求自行合成 PDF 验收，本阶段采用独立字体轮廓／排版真值替代人工来源，PDF 全路径 303/314 字中心命中（96.50%）达到总体≥95%，六项据此勾选。详见 [合成样本补充验收](phase4-synthetic.md)；合成结果不称作人工标注或真实扫描件验收，A56 仍待完成。逐项记录：[a35](a35.md)、[a36](a36.md)、[a37](a37.md)、[a38](a38.md)、[a39](a39.md)、[a40](a40.md)。

环境：Windows 10.0.26300 x64、125% DPI，i5-11260H（6 核／12 线程）、RTX 3050 Laptop；.NET SDK 11.0.100 / Runtime 11.0.0，Node 24.22.1、pnpm 12.15.0；WebView2 SDK 1.0.4314.35 / Runtime 158.0.4370.33。

## 实际交付

正式依赖锁定 Sdcb.SimdPaddleOCR 2.0.0，ChineseV6 Tiny／Small／Medium 和方向分类模型包 1.0.0。默认 Small + Auto，可选 CPU；单工作线程持有单模型，切档释放旧实例，Auto 初始化或运行失败最多回退 CPU 一次。同档后续任务保持 CPU 回退，CPU 再失败明确报错。三档资源及许可证随发布目录部署，模型字节和方向分类模型一起参与缓存指纹。依赖说明见 [OCR-NOTICES](../../third-party/OCR-NOTICES.md)，库接口与能力以[上游源码](https://github.com/sdcb/SimdPaddleOCR)为依据。

PDF 使用独立于屏幕缩放的 200 DPI 离屏渲染、受限 PNG 上传及 WIC BGRA32 解码；超过 12M 像素降低实际 DPI。宿主核对 PageInfo、旋转、CropBox、UserUnit、尺寸和 rasterToPage，不信任客户端声明。图片读取已经应用 EXIF 的规范快照，不再应用方向。字符几何来自 CTC 对齐估计，统一输出 approximate PageText；不以字体测宽、均分整行或置信度阈值伪造可靠字框。

任务先返回 jobId／subscriptionId，再上传栅格与查询结果。页并发为 1，同页订阅共享任务；可见／用户／后台优先级队列每五次给最老任务一次机会。取消立即解除订阅；同步 native 推理可能继续，只有仍有效的订阅、内容版本、profile 和 pageGeneration 才能取得结果。同 profile 重新识别也递增代次，防止旧结果回填。

自动判定保留可靠原生页；不足 40 个非空白字且含图像进入混合，失败或不可靠原生提取进入 OCR。混合按字符文本、基线方向和 quad 重叠去重；另外匹配最多 32 个 UTF-16 单元的完整短词，要求文本一致、方向相近，并在沿基线及垂直基线两个方向的区间重叠都≥80%（分母为各方向较短区间）。这覆盖 CTC 框比原生墨迹框更窄但更高的真实 `42` 页眉，保留同一 OCR 行的其他正文和异处相同数字，不整行删除。空白页识别一次，重新识别混合页继续合并原生文字。页面模式 override 按 docHash／page 存 SQLite；schema 1／2→3 都有升级前备份并保留标注。

结果缓存包含版本、模型资源 hash、引擎、栅格／矩阵、预处理及几何版本，原子写入并校验摘要。OCR 与文档快照共享配额，清理保护打开／正在打开的快照、在途任务和待消费结果。前端每文档控制器保留后台任务、增量搜索和文字来源状态；关闭取消订阅。保存错误优先显示。已有标注 quads 不随重识别自动修改。

## 自动化结果

下表保留首次实现阶段的结果。合成补充后的最新结果为宿主 116／前端 80、完整桌面 10/10、浏览器 OCR 专项 2/2，以及发布包合成专项和 30 次暖态 P95 749.5 ms；最终证据见 [补充报告](phase4-synthetic.md)。自动化均无跳过，桌面原生输入与浏览器测试串行执行。

| 验证范围 | 证据与结果 |
|---|---|
| 单元回归 | 宿主 **115/115**、前端 **78/78**；快照回收互斥修正后宿主 OCR 专项 **9/9** |
| 浏览器回归 | **16/16**，40.5 秒；真实页面渲染，OCR 的异步时序使用显式服务边界样本 |
| 桌面回归 | **10/10**：channel、native、reading、annotations、ocr、closeButton、altF4、runtimeMissing、devUnavailable、hmr |
| 构建与发布 | 前端、Release／Debug 宿主及自包含发布通过；.NET 零警告／错误，Vite 保留主 chunk>500 kB 提示 |
| 发布 OCR 专项 | 实际发布 exe 的扫描选择／精确复制／高亮／缓存重开／四页几何全部通过；8 个模型／依赖／许可文件的 manifest SHA-256 匹配 |
| 契约与文档 | 重新生成 TS／C#／验证器无差异，计划检查、第四阶段文档链接和 git diff --check 通过 |
| 三档真实 CPU | 三档均识别 `Document assistant`，字符契约有效；切档释放旧实例 |
| Auto 与回退 | 真实 Auto 成功；注入 Auto 运行失败后只重试 CPU 一次；CPU／缺模型失败无循环 |
| 质量 | 英文 924 非空白字符、2 个编辑，CER **0.216%**；中文 336 字、0 个编辑，CER **0%** |
| G5 暖态延迟 | Small CPU，A4 200 DPI，30 次完整 UI→栅格→上传→推理→缓存→UI；P95 **1017.7 ms**，阈值 1500 ms |
| 实际几何流程 | 90°、偏移 CropBox、UserUnit=2、大页四种 PDF 成功；最后两页实际 DPI 176.026／89.925，所有栅格≤12M 像素 |
| 订阅与取消 | 三订阅一次推理、独立取消、排队取消不启动、同 profile 代次、旧结果拒绝 |
| 缓存和迁移 | 重开零推理、损坏失效、模型切档失效、override 重开恢复、活跃快照保留、schema 1／2 升级 |
| 阅读闭环 | 真实 OCR 选择／复制／高亮／重开；搜索覆盖逐页更新，空白页只检查一次；取消后迟到结果不回填 |

延迟原始报告：`artifacts/desktop/2026-11-26T04-25-19-933Z/summary.json`。其中 `g5LatencyPassed` **仅表示延迟项**，不是完整 G5。每次计时包含缓存写入和 UI 轮询，并强制新代次以避免缓存命中。模型首次调用观测曾为 Tiny 2105.9 ms、Small 891 ms、Medium 2770 ms，包含加载但不是三个独立冷进程的端到端冷启动对比，不作正式冷启动门禁。

质量与模型原始报告：`artifacts/ocr-samples/quality.json`、`models.json`、`auto-device.json`。语料由 OcrSamples.cs 的独立源文本在本机 Windows 字体上栅格化；它检验清晰合成印刷文本，不替代真实扫描件质量。四页几何专项报告：`artifacts/desktop/2026-11-26T04-32-24-672Z/summary.json`。矩阵／预算检查不能替代人工字框命中率。

最终整轮桌面：`artifacts/desktop/2026-11-26T04-48-15-998Z/summary.json`。最终发布包：`artifacts/desktop/2026-11-26T05-01-57-093Z/summary.json`。两次 OCR 场景的 Windows 剪贴板均精确为 `Document`，七次真实推理覆盖三页阅读和四页几何。最终发布专项额外确认混合页来源、`42` 只命中一次、两页扫描正文 `assistant` 合计命中 12 次。测试辅助函数修正为从四个顶点求边界，避免倾斜 quad 首顶点位于右侧导致漏选首字母。

单元整轮：`artifacts/test-results/28594_ZHANG_2026-11-26_12_43_30_net11.0.trx`；回收互斥修正后的 OCR 专项：`artifacts/test-results/28594_ZHANG_2026-11-26_12_47_04_net11.0.trx`。前端最终 78 项位于 `artifacts/web-tests.json`，包含取消后迟到状态响应不能恢复运行提示、真实 CTC 页眉偏移的新增回归；浏览器整轮位于 `artifacts/browser-tests.json`。取消与短词去重修复发生于桌面整轮构建后，最终发布包包含并专项复验这些修复。

取消修复后的浏览器 OCR 专项也通过 2/2（7.5 秒）：`pnpm exec playwright test tests/browser/ocr.spec.ts --reporter=line`。使用 line reporter 保留此前完整 16 项的 JSON 报告。

## 复现

1. 按根 README 安装依赖、恢复 NuGet、生成基础样本。
2. `pnpm build`、`pnpm build:host`、`pnpm fixtures:ocr`；OCR 栅格由 Release 宿主生成。
3. `pnpm test`、`pnpm test:browser`。
4. 浏览器结束后 `pnpm verify:desktop`；原生输入与浏览器／HMR 测试必须串行。
5. `node scripts/verify-desktop.mjs --skip-build --case=ocrBenchmark` 单独执行 30 次暖态基准，避免其他推理／构建并发。
6. `pnpm run publish`；`node scripts/verify-desktop.mjs --skip-build --published --case=ocr` 检查实际自包含产物。

## 验收调整和限制

- **本阶段采用授权合成替代验收**：现有 Kannada 人工样本没有用于中英文 G5。新增三页 314 字独立合成真值，PDF 路径总体 96.50%，任务按用户调整后的来源要求完成；英文分类为 91.74%，明确保留细笔画限制。真实人工语料扩展属于 A56，见 [补充报告](phase4-synthetic.md)。
- 真实 Auto 已运行，但库公开接口没有返回最终选择的 GPU／CPU 设备名；UI 如实显示 Auto，不能据此宣称 RTX GPU 推理已验收。GPU 故障通过可注入 session 验证回退；无 GPU 物理机器仍由 A60 复验。
- 当前引擎在极低分辨率小字上可能给退化字符 quad；宿主返回明确 `OCR_GEOMETRY` 失败，未跳过字符或编造框。合成倾斜／竖排已验收，真实低清扫描质量仍需独立语料。EXIF 八方向已有图像规范化像素回归，尚未用八方向带字照片逐一人工叠加检查 OCR 框。
- 配额是可回收缓存目标：在用快照和结果优先保留，可能暂时超过限额。没有把字节预算计数当作进程私有内存实测；完整内存／长期滚动门禁属于 A57。
- 当前推理不可强制立即中断，UI 取消的是等待和结果订阅；关闭停止接收结果并等待宿主正在进行的推理退出。

源码、锁文件、测试入口及本记录入 Git；生成字体栅格、报告、截图、隔离数据库和发布包位于忽略目录，不分发 Windows 字体。
