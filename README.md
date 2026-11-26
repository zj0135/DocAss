# DocAss

WPF/WebView2 桌面文档助手。A1–A50 已完成实现和本机自动化验收：可打开 PDF/PNG/JPEG/BMP，支持密码、最近打开、多标签、连续阅读、缩略图、大纲、缩放和旋转。桌面版支持原生文字与本机 OCR 的选择、跨页复制、搜索和高亮；七类标注、撤销重做、保存失败恢复与关闭协调、文件新版本及标注迁移已接入。LLM 已接入四类协议、流式对话、文档工具、AI 标注、选区问答、图片附件和引用跳转。OCR 本阶段按用户指示采用[独立合成 PDF 验收](docs/validation/phase4-synthetic.md)，总体字框中心命中率 96.50%；英文细笔画局限和真实扫描验收边界已记录。

需要 Windows x64、.NET SDK **11.0.100**、Node **24.22.1**、pnpm **12.15.0**。运行桌面程序需要 Microsoft Edge WebView2 Evergreen Runtime。根目录是唯一 pnpm 安装入口。

```powershell
pnpm install --frozen-lockfile
dotnet restore DocAss.sln --locked-mode
pnpm dev                 # 浏览器模式，http://localhost:5173
pnpm dev:host            # 另一个终端；Debug 宿主连接同一个 Vite
pnpm build              # src/web/dist
pnpm build:host         # src/host/DocAss.Host/bin/Release/net11.0-windows/win-x64
pnpm fixtures:setup     # 下载并校验锁定字体、qpdf 和人工标注样本；仅首次需要网络
pnpm fixtures           # docs/fixtures/generated，测试前生成
pnpm fixtures:ocr       # 先 build:host；生成清晰中英文栅格、扫描／混合／空页和 OCR 几何样本
pnpm test:fixtures      # 重复生成对比 SHA-256；PDF.js 验证密码与样本内容
pnpm test               # 先 xUnit 导出原生几何，再 Vitest；artifacts/ 下的 JSON/TRX
pnpm test:browser       # 已安装 Edge，Playwright 启动 Vite；artifacts/browser-tests.json
pnpm verify:desktop     # 真实 WPF/WebView2 验收；会短暂操作本应用窗口，结束恢复鼠标位置
pnpm verify:llm         # 四协议合成上游、流式工具、选区附件、引用标注与恢复；无需真实 Key
pnpm verify:ocr:synthetic # 三页合成扫描 PDF：314 字几何、倾斜／竖排复制高亮、搜索与重开
pnpm verify:install     # 空目录安装和锁定 NuGet restore
pnpm run publish        # artifacts/publish/win-x64，自包含应用；manifest.json 校验清单
```

`pnpm run publish` 使用当前 PowerShell 进程的脚本执行策略，不修改系统执行策略。发布目录复制 `src/web/dist` 为 `wwwroot`；不从 `docs/spikes` 加载任何业务代码。Release 忽略 `--dev` 和外部 URL 参数，固定应用源 `https://app.docass.example/`。普通浏览器保留显式 `?demo=1` 的五个原型场景；页面底部按钮可以打开独立持久化的示例文档。

桌面数据位于 `%LocalAppData%\DocAss\data\workspace.db`；最新一致性备份为 `workspace.db.backup`，附件在 `attachments`，文档写锁在 `locks`，不可变文档快照在 `snapshots`，OCR 结果在 `ocr-cache`；WebView2 profile 在相邻的 `webview2`。不要直接复制正在写入的 SQLite 主文件作为备份。损坏数据库通过原生错误页提供明确恢复入口，恢复前显示备份时间和文档版本。绝对路径不进入前端文档对象；PDF 密码仅在已打开文档的内存生命周期内使用，不写入数据库和日志。

普通浏览器可真实打开文件并将最近文件保存在 IndexedDB，精确原生文字服务需要桌面版。PDF.js 的 worker、cMaps、标准字体、wasm 与 ICC 资源随构建部署，不依赖在线 CDN。桌面文件上限为 1 GiB，图片解码限制为 64M 像素 / 单边 32768，动画和多帧图片明确拒绝。

标注工具包括高亮、下划线、便签、文字批注、手绘、矩形和箭头；选择几何标注后可移动或拖动蓝色控制点缩放，文字标注需重新选择原文。每标签保留 200 步撤销历史；标注立即排队保存，失败保留修改并阻止静默关闭。文字批注支持 Ctrl+Enter 确认、Esc 取消，输入法组合期间不提交。数据库 schema 1／2→3 自动备份后升级；源文件变化不会替换已打开快照，迁移待复核项只进入列表。

本机 OCR 默认 Small + Auto，设置可切 Tiny／Small／Medium、仅 CPU 和共享文档／OCR 缓存配额。当前扫描页自动识别，全文识别需点击“识别全文”；未就绪页面不计入完整搜索覆盖。每页可覆盖为原生、OCR 或混合，重新识别不会移动已有标注。取消立即停止等待，当前同步推理可能继续，迟到结果被丢弃。三档模型嵌入发布 DLL，可离线加载；依赖许可见 [OCR-NOTICES](third-party/OCR-NOTICES.md)。真实 OCR 只在桌面版提供。

使用模型时，在桌面“应用设置”添加提供方，填写 API 类型、接口地址、模型 ID、上下文窗口和输出预留，按需输入自己的 API Key，再测试草稿连接并保存。支持 OpenAI Completions／Responses、Anthropic Messages 和 Gemini；本机 HTTP 服务可不设 Key，远程接口使用 HTTPS。密钥仅由宿主加密保存和注入请求；图像需要同时开启提供方图像开关和模型视觉能力。每份文档有独立会话，全局最多两个生成任务，其他任务排队且可取消。文字“问 AI”和框选仅加入草稿，点击发送才请求模型；重新生成保留旧分支，停止／关闭保存已生成内容，中断恢复不自动重发。四协议验收使用可控合成上游，真实云服务额度和回答质量需按实际配置确认，见 [第五阶段记录](docs/validation/phase5.md)。

协议源为 `src/shared/contracts.schema.json`，运行 `pnpm generate:contracts` 重建 TS/C# 类型、静态校验器与样例。浏览器运行时不动态编译 schema；CSP 只为 wasm 编译开放 `wasm-unsafe-eval`，不开放 JavaScript `unsafe-eval`。业务写入必须收到事务 ack 才能视为已保存；超时后用 operationId 查询或同 ID 重试。

仓库保留源码、测试源码、脚本、文档和依赖锁文件。`node_modules`、`bin`、`obj`、`dist`、`artifacts`、历史 `docs/spikes`、截图、下载资源及生成样本均不纳入 Git。测试源码属于复现入口，不是生成的验证目录。首次检出需按上述顺序生成样本；原始证据可重新运行获得。

`verify:desktop` 需要可交互的 Windows 桌面和空闲的 5173 端口，十一个场景串行执行，测试数据隔离在 `artifacts/desktop/<时间>/`。不要与浏览器测试同时运行，桌面 HMR 场景会修改构建标识并操作原生输入；reading／ocr 场景会测试 Windows 剪贴板，annotations 场景在隔离数据目录注入慢写和失败。LLM 场景运行本机合成上游和隔离的假密钥配置。`node scripts/verify-desktop.mjs --skip-build --case=ocrBenchmark` 单独执行 30 次 OCR 暖态全路径基准。显示器移除使用真实 `WM_DISPLAYCHANGE` 消息与越界窗口位置模拟；DPAPI 使用真实 Windows 匿名安全令牌验证身份隔离，覆盖范围见逐项记录。硬件热拔插和另一账户交互登录的整机检查保留到最终部署回归。

实际验收与尚未覆盖项见 [第一阶段记录](docs/validation/phase1.md)、[第二阶段记录](docs/validation/phase2.md)、[第三阶段记录](docs/validation/phase3.md)、[第四阶段记录](docs/validation/phase4.md)、[第五阶段记录](docs/validation/phase5.md) 和 [任务清单](docs/tasks.md)。
