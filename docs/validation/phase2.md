# 第二阶段实施与验收

日期：2026-11-26。A16–A27 已完成实现和本机自动化验收，逐项范围见 [a16](a16.md)、[a17](a17.md)、[a18](a18.md)、[a19](a19.md)、[a20](a20.md)、[a21](a21.md)、[a22](a22.md)、[a23](a23.md)、[a24](a24.md)、[a25](a25.md)、[a26](a26.md)、[a27](a27.md)。

环境：Windows 10.0.26300 x64，当前桌面 125% DPI；.NET SDK 11.0.100 / Runtime 11.0.0；Node 24.22.1；pnpm 12.15.0；WebView2 SDK 1.0.4314.35 / Runtime 158.0.4370.33；PDF.js 6.5.438；官方 NuGet PdfPig 0.1.16。

## 实现范围

桌面文件对话框/拖放、不可变快照和 SHA-256、最近打开、密码 PDF、WIC 图片规范化；真实 PDF.js/图片 Canvas、连续虚拟页、缩略图、大纲、页码、缩放旋转与标签休眠。可靠原生文字通过宿主提取、统一文本模型、投影命中、跨页复制和全文搜索连接到实际界面。普通浏览器支持真实文件及 IndexedDB 最近文件，明确提示精确文字功能需要桌面服务。

生产依赖不读取 docs/spikes 或 artifacts；测试从宿主导出原始几何后交给前端模型。PDF.js worker、cMaps、标准字体、wasm、ICC 和许可证复制至构建输出，文档和密码不发送到外部服务。

## 验证结果

| 命令 / 门禁 | 实际结果 |
|---|---|
| pnpm test | 宿主 102/102，前端 62/62；无跳过 |
| pnpm test:browser | 8/8，包含两个第一阶段回归；最终运行 21.7 秒 |
| pnpm verify:desktop | channel、native、reading、closeButton、altF4、runtimeMissing、devUnavailable、hmr 共 8/8 |
| pnpm test:fixtures | 22 个文件重复生成摘要一致；1616 个有轮廓真值字形、132 个缺字负例、120 个外部人工 OCR 四边形 |
| pnpm build / dotnet build DocAss.sln -c Release | 通过；.NET 零警告/错误；Vite 有主 chunk 超过 500 kB 的体积提示 |
| pnpm run publish / 发布目录 reading | 自包含构建、锁定依赖恢复和发布版实际阅读验收通过 |
| G1 | 1460 字形，六类逐类 100%，超过每类 98% 门槛 |
| G2 | 页面/视图旋转、DPR 1/1.25/1.5/2、CropBox、UserUnit、图片与 raster 往返小于 1e-6；与实际 PDF.js viewport 一致 |

G1 独立真值来自锁定字体的设计轮廓和明确排版坐标，不来自 PdfPig/PDF.js 提取输出：

| 类别 | 字形数 | 投影通过率 | 八坐标最大绝对误差（页面单位） |
|---|---:|---:|---:|
| 中文 | 320 | 100% | 0 |
| 混排 | 380 | 100% | 0 |
| TJ | 120 | 100% | 0 |
| Rotate | 180 | 100% | 4.27e-14 |
| CropBox | 220 | 100% | 0 |
| UserUnit | 240 | 100% | 0 |

非均匀真实 TJ 操作符另检查逐字 baseline；连字、组合字符、emoji 不切开 grapheme。Hebrew/Arabic 文本与独立真值一致。旧 fontkit CFF 子集生成缺陷保留为 native-legacy-cff 负例，正式矩阵完整嵌入同一字体；没有修改生产 PdfPig 或反向校准真值。emoji 字体中一字的异常大轮廓盒导致该页明确 unreliable，禁用精确定位；详细原因见 [样本文档](../fixtures/README.md)。

实际桌面输入验证了横排/90°/竖排选区及 Windows 剪贴板文字，双击词、三击行、pointercancel/Esc 清理、第 1→6 页跨虚拟页复制。跨页时按住原生指针并滚动使锚点 canvas 卸载，复制仍保留中间页。FindBar 的 40 命中、正反导航和 coverage 通过。旋转截图经过检查，选区覆盖对应字形。

浏览器验证了 500 页 canvas 数量、导航与侧栏、10 个真实标签、最多 3 个被 pin 文档及第 4 个等待/取消、共享 worker 销毁重建、密码重试/取消、图片去重、命名大纲、静态注释、禁止 PDF 脚本、JBIG2/JPX 实际 wasm 解码。

完整桌面报告：artifacts/desktop/2026-11-26T00-34-11-463Z/summary.json。原生选择截图在同目录 reading-rotated-selection.png、reading-native.png。其他证据：artifacts/reading/geometry-gate.json、native-pages.json、unicode-pages.json；artifacts/test-results/28594_ZHANG_2026-11-26_08_25_40_net11.0.trx；artifacts/web-tests.json、browser-tests.json、fixture-verification.json。

最终自包含产物位于 artifacts/publish/win-x64，SHA-256 清单为 artifacts/publish/manifest.json；发布版阅读复验报告为 artifacts/desktop/2026-11-26T00-38-02-382Z/reading.json。此产物也包含最终的极大页面 backing scale 限制，避免最小缩放下限突破 Canvas 单边/像素预算；随后浏览器八项复验通过。

桌面验收曾暴露测试窗口被遮挡及旧流回复被误认为新流首段的问题。验收窗口在原生输入阶段置顶；流测试等待新流恰为“第一段”再取消，并等待宿主释放请求。上述修改只在 --verify 验收入口生效，最终八场景整轮通过，不用重试循环掩盖失败。

## 复现及覆盖边界

1. pnpm install --frozen-lockfile、dotnet restore DocAss.sln --locked-mode。
2. pnpm fixtures:setup、pnpm fixtures、pnpm test:fixtures。
3. pnpm build、pnpm test（宿主先输出供前端消费的原生几何）。
4. pnpm test:browser；结束后 pnpm verify:desktop，二者不要同时运行。桌面验收需可交互 Windows 桌面，会短暂操作窗口、鼠标和剪贴板，HMR 场景使用 5173 端口。
5. pnpm run publish；node scripts/verify-desktop.mjs --skip-build --published --case=reading 验证自包含产物。

页面预算 256MiB、缩略图 32MiB、前端文字 LRU 96MiB、宿主提取 LRU 64MiB 是各层估计，不是进程总驻留内存上限。物理双屏不同 DPI 的迁移、长期边缘拖选、整机大文档性能和更多第三方复杂排版在 a57/a60 继续回归。worker 恢复使用实际销毁/重建接口，未注入操作系统进程崩溃。OCR、生产标注和 Agent 任务仍按后续任务接入，未把其相关验收提前标为完成。

源码、测试、验收记录和锁文件纳入 Git；二进制、截图、下载字体、生成样本、报告与临时分析目录保持忽略，可重新生成。
