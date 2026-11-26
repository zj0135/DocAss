# 样本许可与真值来源

| 资源 | 来源与条款 | 使用方式 |
|---|---|---|
| Noto CJK、Noto Hebrew/Arabic、Noto Emoji | Google / Noto 项目，SIL OFL 1.1；提交与摘要见 resources.json | 下载到本地，生成 PDF 时嵌入；OFL 随下载保存 |
| qpdf 12.3.2 | [qpdf 官方发布](https://github.com/qpdf/qpdf/releases/tag/v12.3.2)，Apache-2.0 | 只在生成密码测试文件时使用 |
| Chars74K 图像和人工标注 | [作者发布页](https://teodecampos.github.io/chars74k/)、[Surrey 原始发布页](https://info-ee.surrey.ac.uk/CVSSP/demos/chars74k/) | 发布页要求注明来源，并在相关出版物引用论文；原始数据不加入本仓库 |
| pdf-lib / fontkit | MIT；精确版本见根 pnpm-lock.yaml | 生成测试 PDF 和字体轮廓真值 |
| PDF.js JBIG2 / JPEG2000 Talos 样本 | [Mozilla PDF.js 测试资源](https://github.com/mozilla/pdf.js/tree/0b093fb11270c29c1894902810cd9aef2e9a9f3c/test/pdfs)，Apache-2.0；提交与 SHA-256 见 resources.json | 下载到本地，测试真实 wasm 解码；不随源码仓库分发 |

Chars74K 引用：T. E. de Campos, B. R. Babu, M. Varma. *Character recognition in natural images*. VISAPP, Lisbon, 2009。作者页说明数据由志愿者标注，完整图像归档含字符坐标、边界多边形及标签。这里导入已有人工四边形，未声称用户或本次自动化重新进行了人工审查。采用的图像是 Kannada 字符表，不能替代后续 G5 所需中文/英文质量与倾斜/竖排覆盖。

资源 URL、不可变提交和 SHA-256 统一见 [resources.json](resources.json)。下载字体和外部样本沿用上游许可，不归入以下原创内容许可。

本项目原创生成器、样本文本、位图网格、排版坐标与生成 PDF 按 CC0-1.0 提供；嵌入字体仍遵守 OFL。原生真值来自字体设计轮廓和显式位置，人工 OCR 真值来自外部标注，均不以待测提取库自身输出作为真值。
