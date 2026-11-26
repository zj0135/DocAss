# 第三阶段：标注与保存验收

日期：2026-11-26。A28–A34 实现和本机自动化验收完成。逐项记录：[a28](a28.md)、[a29](a29.md)、[a30](a30.md)、[a31](a31.md)、[a32](a32.md)、[a33](a33.md)、[a34](a34.md)。

环境：Windows 10.0.26300 x64 / 125% DPI，.NET SDK 11.0.100 / Runtime 11.0.0，Node 24.22.1、pnpm 12.15.0，WebView2 SDK 1.0.4314.35 / Runtime 158.0.4370.33，PDF.js 6.5.438、官方 PdfPig 0.1.16。

## 实际交付

真实 PDF/图片页面可创建七类标注：文字高亮、下划线、便签、文字批注、手绘、矩形、箭头。工具、颜色/线宽偏好、两层 Canvas、虚拟标注列表、选择/属性编辑、移动/控制点缩放和整项橡皮擦贯通；跨页文字标注保存同一 groupId，重新选词显式更新锚点。

DocSession 保留每标签 200 步纯数据命令历史和持久化队列，立即反馈标注预览，只有确认提交才显示已保存。失败保留完整队列，重试复用未确认 operationId；撤销/重做使用新 operationId，标注 revision 单调增加。临时编辑草稿属于会话，切标签不丢；关闭由前端冻结命令、停止任务、等待提交，再握手交给宿主备份与关闭，失败可以重试、取消或明确放弃。

源文件变更提示与新快照打开贯通。新 hash 上预览唯一引文和上下文匹配；重复引文、页面定义改变、缺页进入待复核/未定位列表，不在新页面画未经确认的几何。迁移的新标注及版本决定同事务保存，原 hash 数据保持。SQLite schema 从 1 升至 2，仅增加版本决定表；升级有原库备份和回滚保护。

## 自动化结果

| 入口 | 结果 |
|---|---|
| pnpm test | 宿主 105/105，前端 70/70，无跳过 |
| pnpm test:browser | 14/14（35.9 秒），包含此前两阶段 8 项回归及关闭竞争补充场景 |
| pnpm verify:desktop | 9/9：channel、native、reading、annotations、closeButton、altF4、runtimeMissing、devUnavailable、hmr |
| pnpm build / Release solution build | 通过；.NET 零警告/错误；Vite 仍提示主 chunk 大于 500 kB |
| pnpm run publish | 锁定依赖恢复、自包含构建与资源复制通过 |
| 发布目录 annotations 场景 | 通过；直接启动 artifacts/publish/win-x64 产物，覆盖跨页标注、重开、迁移、失败重试与慢写关闭 |
| 浏览器标注专项复验 | 6/6；pnpm exec playwright test tests/browser/annotations.spec.ts |

新增前端测试覆盖：非法类型/非有限坐标；真实字形 quads 与混合 source；跨页组原子提交、200 步上限及标签隔离；新 operationId 和递增 revision；失去确认后精确重试；5 秒慢写时关闭仍在等待；草稿阻止关闭和明确放弃；多比例 RDP 最大偏差≤0.5 CSS px；唯一 quote+context、重复引文、页尺寸变化和缺页迁移。

浏览器用真实鼠标创建矩形、箭头、手绘并重开恢复，验证移动、控制点缩放、透明度修改、撤销/重做和整项擦除。缩放后的矩形边界变化与页面单位相符。工具线宽按工具独立，刷新后恢复。composition 期间 Ctrl+Enter 不提交，Esc 不落盘，便签草稿切标签仍在；关闭草稿需明确处理。1000 项已落盘标注显示行数<25，点击最后一项定位第 3 页并同步选择。

关闭竞争补充场景在真实 IndexedDB 写入前设置可释放等待，并从窗口服务边界发出关闭通知：标签正在关闭时到达的应用关闭请求接续执行，保存确认之前不回复 ready；关闭期间的新版本事件和文件打开不会创建新标签，确认保存后的窗口关闭等待期仍禁止新打开，收到取消关闭后恢复操作。该测试没有修改生产代码中的测试分支。

宿主版本测试实际修改同一路径，确认旧 snapshot 摘要不变。迁移第 2 项写入时抛出 I/O 故障，事务内标注和决定均回滚；重试整组成功。版本对拒绝记忆跨重开有效，不允许读取无关联版本。旧 schema 库升级后标注保留且有备份。

桌面 annotations 场景使用原生鼠标跨两页选择真实中文/英文，创建高亮组，检查同 groupId/单次事务、撤销/重做、重开后 quads 逐值一致；90° 旋转截图检查实际字形与高亮贴合。原生下划线工具创建正式 underline。修改源文件后从真实提示进入迁移预览，歧义项标 needsReview。注入写入失败后关闭被阻止，取消保留修改，重试只写入一次；再注入 5 秒慢写，2.1 秒后仍等待，确认完成才关闭标签。应用关闭按钮及 Alt+F4 在整轮回归中通过新的前端握手流程。

整轮桌面证据：artifacts/desktop/2026-11-26T03-22-29-162Z/summary.json；同目录 annotations.json、annotations-rotated.png 和 reading.json。单元证据：artifacts/test-results/28594_ZHANG_2026-11-26_11_17_46_net11.0.trx、artifacts/web-tests.json；浏览器：artifacts/browser-tests.json、artifacts/screenshots/annotations-shapes.png。

最终发布目录复验：artifacts/desktop/2026-11-26T03-37-09-140Z/summary.json，annotations 场景全部检查通过；同目录保留旋转高亮截图。最终浏览器整轮 14/14，artifacts/browser-tests.json 当前记录该次完整结果。

最后的发布版关闭回归也通过：关闭按钮报告位于 artifacts/desktop/2026-11-26T03-38-18-994Z/summary.json，Alt+F4 报告位于 artifacts/desktop/2026-11-26T03-38-29-541Z/summary.json；均确认 saved、备份存在且进程退出后本地服务关闭。

## 复现与边界

1. 按根 README 安装锁定依赖并生成第二阶段样本；本阶段不新增下载依赖。
2. pnpm build、pnpm test、pnpm test:browser。
3. 浏览器测试结束后 pnpm verify:desktop；不要与原生输入/HMR 同时运行浏览器测试。
4. pnpm run publish；node scripts/verify-desktop.mjs --skip-build --published --case=annotations。

单次文字标注最多 200 页，迁移最多 999 项标注加一项版本决定；超过上限明确提示。迁移扫描可取消，不可靠文字页延续 A25 的降级；没有使用测量宽度伪造原生文字锚点。freetext 的 Canvas 字体排版属于用户输入文本布局。

磁盘满/权限失败通过实际写入入口抛出 IOException 验证，不改变用户磁盘配额或权限。IME 自动化使用实际 composition 事件，不等同于遍历第三方输入法候选窗。触笔、物理多显示器、长期性能在 a57/a60；OCR/Agent 关闭竞争与混合页面在 a38/a40/a54。撤销栈不跨应用重启恢复，标注本体和迁移决定必须恢复。源文件检测复用长度/mtime 缓存，保留二者的隐蔽修改需重开重新计算 hash。

正式源码、测试与本文随 Git 提交；原始报告、截图、数据库、生成样本和发布产物在被忽略的 artifacts/ 等目录中，可由以上命令复现。
