# 第六阶段：A51–A58 集成与边界验收

日期：2026-11-26。环境沿用 [phase5](phase5.md)：Windows x64、125% 桌面 DPI、.NET 11、Edge/WebView2 158、Node 24.22.1、pnpm 12.15.0。此记录区分自动化完成与完整门禁；人工真值、真实提供方和未达到的性能阈值不能以合成测试代替。

参考机：Intel Core i5-11260H，6 核/12 线程，物理内存约 15.84 GiB；样本在本机 C: 工作区。性能测量与浏览器/其他 OCR 重负载串行。

逐项证据：[a51](a51.md)、[a52](a52.md)、[a53](a53.md)、[a54](a54.md)、[a55](a55.md)、[a56](a56.md)、[a57](a57.md)、[a58](a58.md)。

## 实现

安全 Markdown 保留 HTML/图片为文本，只允许明确的 http、https、mailto 链接。模型调用总时间 180 秒、工具 30 秒、每次生成最多 12 个工具；既有桥、URL、SQL、图像和权限边界继续生效。没有新增记录文档正文或密钥的日志。

工作区补齐打开/关闭/切换、缩放、翻页快捷键，编辑焦点和输入法组合期间不处理文档命令。聊天分隔条限制 340–640，双击恢复窗口 35%，宽度和侧栏写入真实设置；窄窗口自动收起面板。设置有滚动、未保存确认、版本、运行时、许可和日志入口。

开发浏览器 `?fixture=1` 动态安装固定 PDF、几何、OCR 和 SSE；经过正式 DocumentReader、ChatSession、pi 和 IndexedDB。普通文件仍如实提示精确文字/模型需要桌面服务。附件验证 PNG、尺寸、摘要和归属，刷新可恢复，损坏附件不会丢掉消息。合成 OCR/SSE 模块不进入 Release bundle。

阅读器共享 96 MiB 离屏预算和串行队列，原生文字与 OCR 缓存合计 112 MiB；页面和缩略图分别限制 256/32 MiB。空叠加层释放画布，内容不变时不重画；快速滚动时文字提取与可见页 OCR 延迟启动。只在验收模式暴露只读资源计数。

## 证据与限制

全量宿主 **139/139**（`artifacts/test-results/28594_ZHANG_2026-11-26_16_36_34_net11.0.trx`），前端 **105/105**（`artifacts/web-tests.json`），浏览器整轮 **26/26**。默认透明度与验收计数入口收尾后，相关 annotations/integration **12/12** 再通过；`artifacts/browser-tests.json` 为最后这轮相关测试，整轮 26 项结果记录在本次执行输出。Release 前端与宿主构建成功；宿主零警告/错误，Vite 保留已有 pi 环境探测 `node:fs` externalize 与大 chunk 提示。四协议密钥替换/重定向、恶意回复出站请求、断流写幂等、OCR 关闭迟到结果均有本轮证据。

500 页样本约 0.97 MiB，包含原生段落、扫描图片和图形；SHA-256 `c8d44b5c83f8dc448758dc6d359e168f9c3033decaa4c091089c297275e35663`。正式 WebView2 持续往返滚动 10 分钟，每 30 秒切换缩放/侧栏；第三轮起包含三次搜索。内存按宿主加 WebView2 所有进程的私有字节求和，不能用资源计数代替。前两轮失败保留：P95 69.4/62.5 ms；第二轮峰值 1,318,518,784 字节。

最终性能报告 `artifacts/desktop/2026-11-26T08-18-00-406Z/performance.json`：首屏 973.8 ms，P95 **7.1 ms**；三个 200 秒区间峰值为 740,589,568 / 914,800,640 / 874,262,528 字节，总峰值 **872.4 MiB**，暖态两段差 **4.43%**。连续 600 秒、三次搜索、三次关闭重开、资源预算和无未处理异常全部通过。搜索分别观测到 82/500、127/500、149/500 页覆盖，不宣称全文已搜完。页面画布最大 16,684,476 字节、缩略图 731,520、文本 100,641,962；本阅读负载不启动离屏 OCR，离屏计数为 0，其实际使用另由 OCR/区域测试覆盖。

10 个独立 PDF 两轮唤醒与原生/扫描 300 页问答通过，报告 `artifacts/desktop/2026-11-26T08-16-43-080Z/agentIntegration.json`。共 4 个合成上游请求，工具确实读取第 300 页；扫描页使用当前 run 的位置凭证区分重复引文，点击后显示真实 OCR 字框。两份文档均仅 2/300 页就绪，如实展示部分 coverage；活跃 PDF 不超过 3。

真实 OCR 补充报告为 `artifacts/integration-ocr/real-ocr.json`。Tesseract 官方英文 phototest 三档 CER 0；PaddleOCR 中文产品图 Tiny/Small/Medium CER 13.79%/14.78%/13.79%，户外照片均 2.78%。这两张中文照片不是清晰扫描页；独立视觉转录不是人类字符框。真实清晰中文扫描、倾斜/竖排 100 字人工真值尚缺，A56 保持未完成。

NIST 历史 PDF 75 页原生提取有报告 `artifacts/reading/nist-native.json`，没有独立人工字框，报告显式 `g1Measured=false`。扩展原生九类采用原独立轮廓真值和 G1 阅读方向投影误差；缺字负例保留为降级。全 quad 人工叠加审查仍待补齐，A55 保持未完成。

用户工作区仅检查提供方数量，当前为 0，未读取密钥。A58 的真实网络部分阻塞；合成上游通过不等于真实模型质量通过。

最终 OCR 30 次暖态全路径 P95 **733.8 ms**，冷启动可见就绪 **2476.7 ms**、引擎 **1417.9 ms**，报告 `artifacts/desktop/2026-11-26T08-46-34-213Z/ocrBenchmark.json`；速度门禁通过不代表完整 G5 质量门禁完成。真实提供方入口实际结果在 `artifacts/integration-provider-smoke.json`：`blocked`、配置数 0，没有网络请求。

正式桌面补充回归：channel `2026-11-26T08-38-42-007Z`、reading `08-38-45-858Z`、annotations `08-42-08-209Z`、llm `08-44-16-403Z`（均在 artifacts/desktop 下）通过。LLM 停止反馈 20.9 ms，四协议和附件/引用/标注全路径成功。标注旧脚本因恢复侧栏/视口而失败的报告 `08-39-06-510Z` 保留；脚本改为确认侧栏与第一页可见后，真实下划线落盘断言通过。产品标注路径未放宽校验。布局、标注旋转、区域附件和 OCR 截图已由代理视觉核对，这不计作 A55 要求的人工全 quad 审查。

## 复现

先按根 README 生成基础/OCR 样本，再运行 `pnpm fixtures:integration:setup`、`pnpm fixtures:integration`。外部资源由 Git blob 和 SHA-256 固定，来源条款见 [fixtures/LICENSES](../fixtures/LICENSES.md)。

`pnpm verify:integration` 串行构建并执行宿主、前端、浏览器、桌面通道/阅读/标注/LLM/多文档/OCR暖态/10分钟性能和外部 OCR，逐步保存退出码。某一步失败不会抹掉其他结果；完整门禁始终由逐项证据决定。

单独复验可用 `pnpm verify:agent`、`pnpm verify:performance`、`pnpm verify:ocr:benchmark`。桌面测试不要与浏览器或 OCR 重负载并行。性能耗时至少 10 分钟。原始 JSON/TRX/PNG 在忽略目录 `artifacts`；源码、参数和本文随 Git 保存。

配置提供方后，可执行 `src/host/DocAss.Host/bin/Release/net11.0-windows/win-x64/DocAss.Host.exe --verify-provider-smoke <workspace.db绝对路径> <报告绝对路径> [providerId]`。宿主只读已有设置，用 DPAPI 密钥发最小“Reply OK”请求；没有提供方则输出 blocked，不修改用户设置，也不写文档或消息。报告只保留状态/错误码、提供方 ID、API 类别和耗时。
