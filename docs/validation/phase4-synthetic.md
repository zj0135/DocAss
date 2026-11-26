# A35–A40：合成扫描 PDF 补充验收

日期：2026-11-26。用户明确要求“我现在本机没有PDF文档，你自己合成一份进行验收即可”。据此，本阶段以独立合成坐标替代原 G5 的人工字框来源要求；仍采用至少 100 字、总体中心命中率≥95%、Small CPU、200 DPI 的标准。**这是合成样本验收，不是人工标注或真实扫描件验收**。该调整仅用于 A35–A40，本项目 A56 的真实扫描质量扩展仍待完成。

## 样本和评分

样本为 `docs/fixtures/generated/ocr-acceptance.pdf`：三页纯图像、无隐藏文字层，分别是英文倾斜 7°（121 字）、中文倾斜 −9°（66 字）、中文直立竖排（127 字）。全部 314 个非空白字符在运行 OCR 前固定，没有根据失败结果删字符、更换样本或扩大字框。

OcrSyntheticSamples.cs 使用 Windows 本机 Arial／Microsoft YaHei 的字形轮廓绘图。四角真值来自每个字形的紧致轮廓边界和绘制变换；不使用 OCR、PDF.js 或 PdfPig 产生真值。像素坐标为左上原点，PDF 每点对应 200/72 像素。字体文件摘要、源图片摘要及来源说明写入 `ocr-synthetic-truth.json`；源码保存生成方法，不分发 Windows 字体文件。

PDF 的 SHA-256：`1b424ab63fa2e3002f1b8a1f0d7faaf1fc47dc76d1a188641a891612d9b29cf2`。连续两次生成 PDF、真值和三张图片的 SHA-256 全部一致。

正式引擎输出映射回源图坐标后，计算每个 OCR 四边形四顶点的平均值。只有字符文本相同、中心落在对应真值凸四边形内才算命中；二分匹配确保一个预测框只能命中一个真值字符。漏字、错字和无有效框保留在分母；测试把全部预测框平移 300 页面单位后必须失败，验证评分器能发现系统偏移。此规则比只测几何而不核对字符更严格。

| 样本 | 字符数 | PDF 全路径命中 | 比例 |
|---|---:|---:|---:|
| 英文倾斜 7° | 121 | 111 | 91.74% |
| 中文倾斜 −9° | 66 | 66 | 100% |
| 中文竖排 | 127 | 126 | 99.21% |
| **总体** | **314** | **303** | **96.50%** |

原 G5 规定总体≥95%，没有 G1 那样的逐类门槛，因此总体通过。**英文分类未达到 95%**，不标作各类全通过；偏差集中在字体墨迹极窄的 `i`／`l`，竖排有一个细横画“一”未命中。完整失配 ID 保存在 JSON。没有改宽真值或调低总体阈值。直接读取源 PNG 的引擎专项为 304/314（96.82%），PDF.js 重栅格化后为上述 303/314，以 PDF 全路径结果作为正式报告值。

另外，前端读取真实引擎 JSON 构建统一 PageText，与独立源字符序列对比：三页全部 314 字一致；修复前竖排各列受最高点差异影响会乱序，现按从右到左排列，列内从上到下。清晰水平语料的既有 CER 仍是英文 0.216%、中文 0%；字框命中和字符识别率分别记录。

## 应用验收

真实 WPF/WebView2 通过 PDF.js 200 DPI 离屏栅格、PNG 上传、WIC、Small CPU、缓存写和前端 PageText 完成三页识别；检查宿主原生提取每页均为零字形。原生鼠标拖选倾斜英文 `Document` 和竖排中文 `本地文字`，Windows 剪贴板逐字相等；两项高亮的 source 均为 ocr。搜索“本地文字”覆盖 3/3 页、命中 2 次。旋转后高亮贴合，重开 quads 逐值不变、推理次数不增加。截图保留倾斜／竖排高亮及旋转竖排页面。

补充验收同时发现并修复重开后立即退出的资源竞争：宿主现在取消并等待正在处理的资源 deferral 完成，再释放文档和 WebView2。验收模式下未处理异常写入失败报告，不弹窗遮蔽失败；运行器还检查真实进程退出码。曾出现“检查已通过但清理异常”的运行不计入最终通过证据。

| 命令／范围 | 结果 |
|---|---|
| `pnpm test` | 宿主 116/116、前端 80/80，无跳过 |
| 合成 PDF 桌面专项 | 全部检查通过，进程正常退出 |
| `pnpm verify:desktop` | 关闭修复后完整 10/10，通过 reading／annotations／OCR／关闭按钮／Alt+F4 等回归 |
| 浏览器 OCR 专项 | 2/2（7.8 秒），搜索增量与取消迟到结果通过 |
| `pnpm build` / 宿主 Release、Debug | 通过；.NET 零警告／错误，Vite 保留主 chunk 大小提示 |
| 自包含发布 `ocrSynthetic` | 314 字评分、真实拖选／复制／高亮／搜索、旋转和缓存重开全部通过，正常退出 |
| 自包含发布 `ocrBenchmark` | 30 次 Small CPU 暖态全路径，P95 **749.5 ms**，最大 1335.5 ms，阈值≤1500 ms，通过 |

单元整轮证据：`artifacts/test-results/28594_ZHANG_2026-11-26_13_29_43_net11.0.trx`、`artifacts/web-tests.json`；直接引擎评分和字序：`artifacts/ocr-samples/synthetic-geometry.json`、`synthetic-text.json`。关闭修复后桌面专项：`artifacts/desktop/2026-11-26T05-37-48-484Z/summary.json`。

最终完整桌面：`artifacts/desktop/2026-11-26T05-38-17-747Z/summary.json`；最终发布合成专项：`artifacts/desktop/2026-11-26T05-40-37-205Z/summary.json`；最终发布暖态基准：`artifacts/desktop/2026-11-26T05-42-49-307Z/summary.json`。发布专项的新进程、无结果缓存、模型尚未加载时，从文档打开到首屏 OCR 就绪观测 **6429.3 ms**；这是单次首次文档全路径冷调用，排除进程／WebView 初始化时间，单独记录且不混入暖态 P95。

每次桌面专项输出三份 `*-result.json`、三份 `*-overlay.svg`（蓝色为独立真值框，绿／红点为命中／失配中心）以及高亮截图。它们可以逐字审查；生成报告和 PDF 位于 Git 忽略目录，复现代码、判定逻辑和本报告提交 Git。

## 复现命令

```powershell
pnpm build
pnpm build:host
pnpm fixtures:ocr
pnpm test
pnpm verify:ocr:synthetic
pnpm run publish
node scripts/verify-desktop.mjs --skip-build --published --case=ocrSynthetic
node scripts/verify-desktop.mjs --skip-build --published --case=ocrBenchmark
```

桌面、浏览器、基准按顺序运行。基准固定 Small CPU、A4 200 DPI，30 次强制新代次，时间包括栅格、上传、推理、缓存和 UI 刷新。冷调用另列，不能拿缓存命中冒充暖态推理。平台仍为 i5-11260H、Windows 10.0.26300 x64、125% DPI、WebView2 158.0.4370.33。

范围限制：本轮按用户指示采用合成样本关闭 A35–A40 的本机验收；真实低清／噪声／透视扫描、人工字框和跨设备质量保留 A56／A60。Auto 的最终硬件设备名称未被上游公开接口暴露，报告只确认 Auto 可运行和故障回退机制，不宣称物理 GPU 路径已验证。
