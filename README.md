# DocAss

WPF/WebView2 桌面文档助手。A1–A27 已完成实现和本机自动化验收：可打开 PDF/PNG/JPEG/BMP，支持密码、最近打开、多标签、连续阅读、缩略图、大纲、缩放和旋转。桌面版支持可靠原生文字的选择、跨页复制与全文搜索；扫描或不可靠文字页明确提示需要 OCR。OCR、标注编辑和真实模型调用按后续阶段推进。

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
pnpm test:fixtures      # 重复生成对比 SHA-256；PDF.js 验证密码与样本内容
pnpm test               # 先 xUnit 导出原生几何，再 Vitest；artifacts/ 下的 JSON/TRX
pnpm test:browser       # 已安装 Edge，Playwright 启动 Vite；artifacts/browser-tests.json
pnpm verify:desktop     # 真实 WPF/WebView2 验收；会短暂操作本应用窗口，结束恢复鼠标位置
pnpm verify:install     # 空目录安装和锁定 NuGet restore
pnpm run publish        # artifacts/publish/win-x64，自包含应用；manifest.json 校验清单
```

`pnpm run publish` 使用当前 PowerShell 进程的脚本执行策略，不修改系统执行策略。发布目录复制 `src/web/dist` 为 `wwwroot`；不从 `docs/spikes` 加载任何业务代码。Release 忽略 `--dev` 和外部 URL 参数，固定应用源 `https://app.docass.example/`。普通浏览器保留显式 `?demo=1` 的五个原型场景；页面底部按钮可以打开独立持久化的示例文档。

桌面数据位于 `%LocalAppData%\DocAss\data\workspace.db`；最新一致性备份为 `workspace.db.backup`，附件在 `attachments`，文档写锁在 `locks`，不可变文档快照在 `snapshots`；WebView2 profile 在相邻的 `webview2`。不要直接复制正在写入的 SQLite 主文件作为备份。损坏数据库通过原生错误页提供明确恢复入口，恢复前显示备份时间和文档版本。绝对路径不进入前端文档对象；PDF 密码仅在已打开文档的内存生命周期内使用，不写入数据库和日志。

普通浏览器可真实打开文件并将最近文件保存在 IndexedDB，精确原生文字服务需要桌面版。PDF.js 的 worker、cMaps、标准字体、wasm 与 ICC 资源随构建部署，不依赖在线 CDN。桌面文件上限为 1 GiB，图片解码限制为 64M 像素 / 单边 32768，动画和多帧图片明确拒绝。

协议源为 `src/shared/contracts.schema.json`，运行 `pnpm generate:contracts` 重建 TS/C# 类型、静态校验器与样例。浏览器运行时不动态编译 schema；CSP 只为 wasm 编译开放 `wasm-unsafe-eval`，不开放 JavaScript `unsafe-eval`。业务写入必须收到事务 ack 才能视为已保存；超时后用 operationId 查询或同 ID 重试。

仓库保留源码、测试源码、脚本、文档和依赖锁文件。`node_modules`、`bin`、`obj`、`dist`、`artifacts`、历史 `docs/spikes`、截图、下载资源及生成样本均不纳入 Git。测试源码属于复现入口，不是生成的验证目录。首次检出需按上述顺序生成样本；原始证据可重新运行获得。

`verify:desktop` 需要可交互的 Windows 桌面和空闲的 5173 端口，八个场景串行执行，测试数据隔离在 `artifacts/desktop/<时间>/`。不要与浏览器测试同时运行，桌面 HMR 场景会修改构建标识并操作原生输入；reading 场景会测试 Windows 剪贴板。显示器移除使用真实 `WM_DISPLAYCHANGE` 消息与越界窗口位置模拟；DPAPI 使用真实 Windows 匿名安全令牌验证身份隔离，覆盖范围见逐项记录。硬件热拔插和另一账户交互登录的整机检查保留到最终部署回归。

实际验收与尚未覆盖项见 [第一阶段记录](docs/validation/phase1.md)、[第二阶段记录](docs/validation/phase2.md) 和 [任务清单](docs/tasks.md)。
