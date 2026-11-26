# 可复现测试样本

在根目录依次运行 `pnpm fixtures:setup`、`pnpm fixtures`、`pnpm test:fixtures`。Windows x64 的下载资源写入被 Git 忽略的 `fonts/`、`downloads/`；PDF、图片和真值写入 `generated/`。`resources.json` 锁定资源 URL、版本与 SHA-256；`manifest.json` 记录生成文件摘要，连续生成以及空资源目录重新下载生成均应一致。

原生矩阵含中文、混排、非均匀 TJ、Rotate、CropBox、UserUnit、组合字/连字、竖排，以及缺字负例。1748 个非空白 glyph 中，1616 个具有有效字体轮廓真值；G1 的六类基础样本计 1460 字形。独立的 `unicode-positive.pdf` 用 Hebrew、Arabic、Emoji 字体覆盖 RTL shaping 和 emoji 字符；其中 PdfPig 对一个 emoji 的轮廓返回异常大包围盒，正式服务将该页标为 unreliable，不能将字体有字形等同于提取库几何可靠。真值来自字体轮廓和明确排版参数，不来自 PDF.js/PdfPig 提取结果。

第二阶段发现旧生成器的 fontkit 1.1.1 CFF 子集 FDSelect 映射会将复用字形关联到错误的字体字典，PdfPig 解析警告后退回整字体包围盒。原样本保留为 `native-legacy-cff.pdf` 及独立真值，验证明确降级；正式 `native-matrix.pdf` 改为完整嵌入同一锁定字体，每基础类 20 行。没有修改生产 PdfPig，也没有用测得坐标重写真值。生成器版本为 3，当前清单有 22 个文件。

`navigation.pdf` 包含命名与显式 destination、不同页尺寸、静态红色注释和不应执行的 PDF JavaScript。`perf_codecs_jbig2.pdf`、`perf_codecs_jpx.pdf` 来自锁定提交的 PDF.js 编解码测试集，浏览器验收同时检查实际 wasm 请求及 Canvas 输出。

`password.pdf` 使用 qpdf 12.3.2 的固定 ID/IV 测试模式生成，阅读密码 `fixture-reader`、所有者密码 `fixture-owner`。这两个公开字符串仅用于固定测试文件。PDF.js 和 PdfPig 均检查错误密码拒绝与正确密码读取。还包括扫描/混合/无文字/坏文件和 300/500 页性能样本。

`ocr-manual-truth.json` 保留 Chars74K 志愿者原始标注中的 120 个四顶点多边形、文字和来源行号，图片为该数据集的 Kannada 印刷字符表。复合符号沿用数据集的字符实例定义；没有用 OCR 结果或自动网格替代人工标注。只选择原始四个不同顶点且两项源标志均为 True 的记录，共 592 条符合选择条件，固定取前 120 条。该样本满足基础框架的人工 quad 来源要求，不代表中文/英文 OCR 的 G5 质量门禁已经通过。

完整原始归档很大，但所需图片和标注成员都完整位于其前 4 MiB。因此下载器只获取锁定的字节前缀，导入器核对前缀 SHA-256、tar 成员完整长度及路径白名单；生成真值额外记录图片和标注各自的 SHA-256。原始文件不随源码仓库分发，使用须遵循 [来源与许可](LICENSES.md)。原有 `ocr-grid` 120 字仍是自动生成的设计坐标，不计入人工标注数量。

`node docs/fixtures/mock-upstream.mjs` 启动随机端口合成 HTTP 上游。正式宿主的合成源每 250 ms 输出一段，共四段；宿主测试还通过真实 TCP/HTTP 上游检查取消后的连接断开。

`src/shared/sdk-header-fixtures.json` 记录 OpenAI 7.59.0、Anthropic SDK 0.129.0、Google GenAI 2.32.0 的实际请求头和入口文件摘要，预检测试直接读取该固定样例。需要重录时，在临时目录安装这些精确版本，运行 `node docs/fixtures/capture-sdk-headers.mjs <临时目录/node_modules>`。录制器替换 fetch，不访问提供方，不记录密钥值；正式应用不依赖该临时目录。
