# 第一阶段实施与验收

日期：2026-11-25。Windows 10.0.26300 x64；.NET SDK 11.0.100 / Runtime 11.0.0；Node 24.22.1；pnpm 12.15.0；WebView2 SDK 1.0.4314.35 / Runtime 158.0.4370.33。

A1–A15 实现与本机自动化验收完成，逐项证据、命令和覆盖边界见 [a1](a1.md) 至 [a15](a15.md)。后续真实文件阅读、OCR、模型调用和完整产品门禁仍按 a16–a62 推进。

最终自动化：79 项宿主测试、48 项前端测试、2 项浏览器集成测试通过；7 个真实 WPF/WebView2 场景通过；锁定依赖空目录安装、可复现样本和自包含发布验证通过。

仓库独立性复验：只导出 Git 暂存的文档和源码后，冻结安装与 Release solution build 均通过，文档链接检查无缺失；前端构建与原工作区产物文件名、CSS 摘要一致。发布目录 channel 复验同样通过。

真实宿主结果包括：100 并发桥请求结束 pending=0；JS module/worker/wasm 正常；16 MiB 长度正确，UI timer 49 次；13 个资源 deferral 开始与完成数相同。每 250 ms 四段 SSE，在结束前有 3 次非最终 React 可见帧；取消 UI 反馈 12.2 ms，真实 HTTP 合成上游取消后 1 s 内断连。未触发本机网络权限事件，未使用安全绕过参数。性能数字仅表示本机本次结果。

窗口拖动、双击、最小化/最大化/还原、关闭按钮、Alt+F4、系统最大化图标、窗口位置保存均通过；HMR 保留 JS 上下文。Runtime 缺失通过进程级空浏览器路径触发真实加载失败，并验证原生引导页。

存储涵盖 100 次幂等、CAS/篡改拒绝、标注/消息/工具效果多步骤回滚、丢 ack、安全重试、300 条确认后强杀恢复、跨进程锁、单事务快照、其他连接并发写与在线备份、真实 60 s 备份定时器、迁移失败/损坏/未来 schema、附件 pending/引用/备份保护、DPAPI 密文与身份隔离。

样本有 1032 个有效原生几何 glyph，保留 132 个缺字负例；RTL/Arabic/emoji 字体正例、密码 PDF、扫描/混合/空白/坏文件与 300/500 页样本齐全。OCR 人工来源为 Chars74K 的 120 个原始四边形标注，导入不依赖 OCR/PDF 提取结果。来源、许可和局限见 [样本文档](../fixtures/README.md)。从空资源目录重新下载生成与现有清单一致。

需要明确区分的受控验收：显示器移除采用越界窗口加真实 WM_DISPLAYCHANGE 消息，并验证多显示器工作区算法，没有声称物理拔线；不同用户凭据隔离采用真实 Windows 匿名安全令牌，不声称另一账户交互登录；人工 OCR 标注由原数据集作者/志愿者提供，没有声称本次由人逐字审查。这些自动化验证对应的程序行为通过，物理热拔插、不同 DPI 和另一账户整机安装操作在 a60 继续回归。

复现顺序：

1. 根目录 pnpm install --frozen-lockfile、dotnet restore DocAss.sln --locked-mode。
2. pnpm fixtures:setup、pnpm fixtures、pnpm test:fixtures。
3. pnpm build、pnpm test、pnpm test:browser。
4. 关闭开发服务器后 pnpm verify:desktop；需要 Windows 可交互桌面，短暂操作本应用窗口。
5. pnpm verify:install、pnpm run publish；发布程序使用 --verify <报告绝对路径> 可重跑 channel。

本轮完整桌面报告在 artifacts/desktop/2026-11-25T15-38-57-115Z/，截图、JSON、TRX、下载字体和生成 PDF 均在 Git 外；正式仓库只保留文档、源码、测试源码、构建脚本与依赖锁文件。历史 docs/spikes 仅作为原工作区归档，不是生产依赖，也不是本次正式验收入口。
