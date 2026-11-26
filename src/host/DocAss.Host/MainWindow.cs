using System.ComponentModel;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using DocAss.Host.Bridge;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using DocAss.Host.Http;
using DocAss.Host.Settings;
using DocAss.Host.Storage;
using DocAss.Host.Windowing;

namespace DocAss.Host;

public sealed partial class MainWindow : Window
{
    public const string PublishedOrigin = "https://app.docass.example";
    public const string DevelopmentOrigin = "http://localhost:5173";
    private readonly bool development;
    private readonly string? verificationOutput;
    private readonly Verification.AcceptanceOptions? acceptance;
    private readonly string dataDirectory;
    private readonly string origin;
    private readonly WebView2 web = new();
    private readonly StorageService storage;
    private readonly DocumentRegistry documents;
    private readonly DocumentService files;
    private readonly TextGeometryService geometry;
    private readonly SettingsService settings;
    private readonly AttachmentService attachments;
    private readonly LoopbackServer loopback;
    private readonly BridgeRouter bridge;
    private readonly HostResourceHandler resources;
    private readonly CloseCoordinator close;
    private readonly CancellationTokenSource lifetime = new();
    private FileStream? databaseLease;
    private bool mayClose;
    private bool closing;
    private bool initialized;
    private int resourceStarted, resourceCompleted;
    public MainWindow(bool development, Verification.AcceptanceOptions? acceptance = null)
    {
        this.development = development; this.acceptance=acceptance; verificationOutput=acceptance?.Output;
        origin = development ? DevelopmentOrigin : PublishedOrigin;
        dataDirectory = verificationOutput == null ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DocAss", "data") : Path.Combine(Path.GetDirectoryName(verificationOutput)!, Path.GetFileNameWithoutExtension(verificationOutput)+"-data");
        storage = new(Path.Combine(dataDirectory, "workspace.db")); documents = new(dataDirectory); settings = new(storage); attachments = new(storage, documents, dataDirectory);
        files = new(dataDirectory, documents, storage); geometry = new(files);
        loopback = new(origin); bridge = new(origin); resources = new(Path.Combine(AppContext.BaseDirectory, "wwwroot"), origin);
        close = new(async () => { await SavePlacementAsync(); await storage.DrainAsync(); if (!storage.IsReadOnly) await storage.BackupAsync(); });
        Title = "DocAss 文档助手"; Width = 1280; Height = 800; WindowStyle = WindowStyle.SingleBorderWindow; ResizeMode = ResizeMode.CanResize;
        Background = Brushes.White; Content = web;
        System.Windows.Shell.WindowChrome.SetWindowChrome(this, new() { CaptionHeight = 0, ResizeBorderThickness = new Thickness(6), GlassFrameThickness = new Thickness(0), CornerRadius = new CornerRadius(0) });
        Loaded += async (_, _) => await InitializeAsync(); Closing += OnClosing;
        StateChanged += (_, _) => Emit("window.stateChanged", new { maximized = WindowState == WindowState.Maximized });
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
        SourceInitialized += (_, _) => System.Windows.Interop.HwndSource.FromHwnd(new System.Windows.Interop.WindowInteropHelper(this).Handle)?.AddHook(DisplayMessage);
        RegisterMethods(); RegisterDocumentMethods();
    }
    private async Task InitializeAsync()
    {
        try
        {
            Directory.CreateDirectory(dataDirectory);
            databaseLease = new FileStream(storage.DatabasePath + ".lease", FileMode.OpenOrCreate, FileAccess.Read, FileShare.Read);
            await storage.InitializeAsync();
            initialized = true;
            var configuration = await settings.GetAsync(); ApplyPlacement(configuration.GetProperty("window"));
            await loopback.StartAsync(); resources.LoopbackOrigin = loopback.Origin;
            try { _ = CoreWebView2Environment.GetAvailableBrowserVersionString(); }
            catch (WebView2RuntimeNotFoundException) { ShowError("需要 Microsoft Edge WebView2 Runtime", "请安装 WebView2 Evergreen Runtime，然后重新启动 DocAss。", true); await VerifyStartupFailureAsync("runtimeMissing"); return; }
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(dataDirectory, "..", "webview2"));
            await web.EnsureCoreWebView2Async(environment);
            var core = web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = development; core.Settings.AreDefaultContextMenusEnabled = development;
            core.Settings.IsStatusBarEnabled = false; core.Settings.IsNonClientRegionSupportEnabled = true;
            core.NavigationStarting += (_, e) => { if (!bridge.TrustedPage(e.Uri, true)) e.Cancel = true; else bridge.Reset(); };
            core.FrameNavigationStarting += (_, e) => e.Cancel = true;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.DownloadStarting += (_, e) => e.Cancel = true;
            core.PermissionRequested += (_, e) => { permissionRequests.Add(e.PermissionKind.ToString()); e.State = CoreWebView2PermissionState.Deny; e.Handled = true; };
            core.ProcessFailed += (_, _) => ShowError("页面进程已退出", "已确认的数据保存在本机，请重新启动应用。");
            core.WebMessageReceived += async (_, e) =>
            {
                if (await HandleFileDropAsync(e)) return;
                var response = await bridge.DispatchAsync(e.Source, true, e.WebMessageAsJson);
                if (response != null && !mayClose) core.PostWebMessageAsJson(Json.String(response));
            };
            core.AddWebResourceRequestedFilter(origin + "/*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            core.WebResourceRequested += OnResourceRequested;
            core.NavigationCompleted += async (_, e) =>
            {
                if (!e.IsSuccess) { ShowError("页面加载失败", development ? "开发服务器不可用，请先运行 pnpm dev，地址必须为 http://localhost:5173。" : "发布资源加载失败，请检查 wwwroot/index.html。"); return; }
                if (acceptance != null) await RunAcceptanceAsync();
            };
            resources.BusinessEndpoint = BusinessResourceAsync;
            if (development)
            {
                using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
                try { using var response = await client.GetAsync(origin); response.EnsureSuccessStatusCode(); }
                catch { ShowError("开发服务器不可用", "请先运行 pnpm dev；仅允许 http://localhost:5173。关闭后重新启动宿主。"); await VerifyStartupFailureAsync("devUnavailable"); return; }
            }
            core.Navigate(origin + "/");
        }
        catch (Exception ex)
        {
            var error = StorageService.MapError(ex) as AppException;
            if (ex is WebView2RuntimeNotFoundException)
            { ShowError("需要 Microsoft Edge WebView2 Runtime", "请安装 WebView2 Evergreen Runtime，然后重新启动 DocAss。",true);await VerifyStartupFailureAsync("runtimeMissing");return; }
            ShowError("DocAss 启动失败", error?.Message ?? "无法初始化宿主或本机通道，请检查运行时和数据目录权限。", recovery: error?.Code == "DATABASE_CORRUPT");
            if (verificationOutput != null) { Directory.CreateDirectory(Path.GetDirectoryName(verificationOutput)!); await File.WriteAllTextAsync(verificationOutput, Json.String(new { ok = false, error = ex.GetType().Name, detail = ex.Message })); mayClose = true; await CleanupAsync(); Close(); }
        }
    }
    private async void OnResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        if (development && !new Uri(e.Request.Uri).AbsolutePath.StartsWith("/_host/")) return;
        var deferral = e.GetDeferral(); Interlocked.Increment(ref resourceStarted);
        try
        {
            var headers = e.Request.Headers;
            var request = new ResourceRequest(e.Request.Method, e.Request.Uri, headers.Contains("Range") ? headers.GetHeader("Range") : null, headers.Contains("Content-Type") ? headers.GetHeader("Content-Type") : null, e.Request.Content);
            var result = await Task.Run(() => resources.HandleAsync(request, lifetime.Token));
            var responseHeaders = $"Content-Type: {result.Mime}\r\n" + string.Join("\r\n", (result.Headers ?? new()).Select(h => h.Key + ": " + h.Value));
            e.Response = web.CoreWebView2.Environment.CreateWebResourceResponse(result.BodyStream ?? new MemoryStream(result.Body), result.Status, "DocAss", responseHeaders);
        }
        catch { if (web.CoreWebView2 != null) e.Response = web.CoreWebView2.Environment.CreateWebResourceResponse(new MemoryStream(), 500, "Resource failed", "Content-Type: text/plain"); }
        finally { deferral.Dispose(); Interlocked.Increment(ref resourceCompleted); }
        // CoreWebView2Deferral.Dispose completes the deferral once, including on exceptions.
    }
    private async Task<ResourceResponse> BusinessResourceAsync(ResourceRequest request, CancellationToken token)
    {
        var parts = HostResourceHandler.DecodePath(request.Url).Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 4 && parts[0] == "_host" && parts[1] == "doc")
        {
            documents.Resolve(parts[2]);
            var documentResponse = await DocumentResourceAsync(parts, request, token);
            if (documentResponse != null) return documentResponse;
            if (parts.Length == 4 && parts[3] == "commands" && request.Method == "POST")
            {
                using var json = JsonDocument.Parse(await BoundedRead.ReadAsync(request.Body ?? Stream.Null, 16 * 1024 * 1024, token));
                Contract.Require(json.RootElement.GetProperty("docId").GetString() == parts[2]);
                return ResourceResponse.Json(200, await storage.CommitAsync(json.RootElement.Clone(), documents));
            }
            if (parts.Length == 5 && parts[3] == "attachments")
            {
                if (request.Method == "PUT") { await attachments.UploadAsync(parts[2], parts[4], request.Body ?? Stream.Null, request.Mime ?? "", token); return ResourceResponse.Json(200, new { uploaded = true }); }
                if (request.Method == "GET") { var data = await attachments.ReadAsync(parts[2], parts[4]); return data == null ? ResourceResponse.Json(404, new { error = "ATTACHMENT_MISSING" }) : HostResourceHandler.Bytes(data, "image/png", request.Range); }
            }
        }
        return ResourceResponse.Json(404, new { error = "NOT_FOUND" });
    }
    private void RegisterMethods()
    {
        void Register(string name, Func<JsonElement, Task<object?>> action) => bridge.Register(name, (p, _) => action(p));
        Register("app.bootstrap", async p => { Contract.Fields(p); return new { version = "0.3.0", fixturesEnabled = acceptance != null, capabilities = new { desktop = true, window = true, persistentStorage = true, credentials = true, nativeText = true, ocr = false, llm = false }, loopback = new { origin = loopback.Origin, token = loopback.SessionToken }, settings = await settings.GetAsync(), window = new { maximized = WindowState == WindowState.Maximized }, readOnly = storage.IsReadOnly }; });
        Register("window.minimize", p => { Contract.Fields(p); WindowState = WindowState.Minimized; return Task.FromResult<object?>(null); });
        Register("window.maximize", p => { Contract.Fields(p); WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized; return Task.FromResult<object?>(null); });
        Register("window.requestClose", p => { Contract.Fields(p); Dispatcher.BeginInvoke(Close); return Task.FromResult<object?>(null); });
        Register("settings.get", async p => { Contract.Fields(p); return await settings.GetAsync(); });
        Register("settings.update", async p => await settings.UpdateAsync(p));
        Register("providers.list", async p => { Contract.Fields(p); return await settings.ListProvidersAsync(); });
        Register("providers.save", async p => { Contract.Fields(p, "provider", "replacementKey", "deleteKey"); await settings.SaveProviderAsync(p.GetProperty("provider"), p.GetProperty("replacementKey").ValueKind == JsonValueKind.Null ? null : p.GetProperty("replacementKey").GetString(), p.GetProperty("deleteKey").GetBoolean()); return null; });
        Register("providers.delete", async p => { Contract.Fields(p, "id"); await settings.DeleteProviderAsync(p.GetProperty("id").GetString()!); return null; });
        Register("secrets.has", async p => { Contract.Fields(p, "id"); return new { hasKey = await settings.HasSecretAsync(p.GetProperty("id").GetString()!) }; });
        Register("secrets.replace", async p => { Contract.Fields(p, "id", "key"); var providers = await settings.ListProvidersAsync(); var provider = providers.SingleOrDefault(v => v.GetProperty("id").GetString() == p.GetProperty("id").GetString()); Contract.Require(provider.ValueKind != JsonValueKind.Undefined); await settings.SaveProviderAsync(provider, p.GetProperty("key").GetString()); return null; });
        Register("secrets.delete", async p => { Contract.Fields(p, "id"); var providers = await settings.ListProvidersAsync(); var provider = providers.SingleOrDefault(v => v.GetProperty("id").GetString() == p.GetProperty("id").GetString()); Contract.Require(provider.ValueKind != JsonValueKind.Undefined); await settings.SaveProviderAsync(provider, deleteKey: true); return null; });
        Register("store.commit", async p => { if (close.State != "open") throw new AppException("BUSY", "正在关闭，暂停接收新命令"); return await storage.CommitAsync(p, documents); });
        Register("store.readRevision", async p => { Contract.Fields(p, "docId"); return new { documentRevision = await storage.ReadRevisionAsync(documents.Resolve(p.GetProperty("docId").GetString()!).DocHash) }; });
        Register("store.getOperation", async p => { Contract.Fields(p, "docId", "operationId"); return await storage.GetOperationAsync(documents.Resolve(p.GetProperty("docId").GetString()!).DocHash, p.GetProperty("operationId").GetString()!); });
        Register("store.read", async p => { Contract.Fields(p, "docId", "entity"); return await storage.ReadEntitiesAsync(documents.Resolve(p.GetProperty("docId").GetString()!).DocHash, p.GetProperty("entity").GetString()!); });
        Register("store.snapshot", async p => { Contract.Fields(p, "docId"); return await storage.ReadDocumentAsync(documents.Resolve(p.GetProperty("docId").GetString()!).DocHash); });
        Register("doc.reacquire", async p => { Contract.Fields(p, "docId"); var handle = documents.Reacquire(p.GetProperty("docId").GetString()!); return new { handle, documentRevision = await storage.ReadRevisionAsync(handle.DocHash) }; });
        Register("doc.close", async p => { Contract.Fields(p, "docId"); var id = p.GetProperty("docId").GetString()!; documents.Resolve(id); await storage.DrainAsync(); geometry.Forget(id); files.Close(id); return null; });
        Register("doc.flush", async p => { Contract.Fields(p, "docId"); documents.Resolve(p.GetProperty("docId").GetString()!); await storage.DrainAsync(); return null; });
        Register("attachment.begin", p => { Contract.Fields(p, "docId"); return Task.FromResult<object?>(new { uploadId = attachments.Begin(p.GetProperty("docId").GetString()!) }); });
        Register("attachment.commit", async p => { Contract.Fields(p, "docId", "uploadId"); return new { attachmentId = await attachments.CommitAsync(p.GetProperty("docId").GetString()!, p.GetProperty("uploadId").GetString()!) }; });
        Register("attachment.resolve", async p => { Contract.Fields(p, "docId", "attachmentId"); var docId=p.GetProperty("docId").GetString()!; var id=p.GetProperty("attachmentId").GetString()!; var data=await attachments.ReadAsync(docId,id); return data==null ? (object)new {available=false} : new {available=true,url=$"/_host/doc/{docId}/attachments/{id}"}; });
        Register("attachment.deleteUnused", async p => { Contract.Fields(p); return new { removed = await attachments.CollectAsync() }; });
        Register("stream.cancel", p => { Contract.Fields(p, "requestId"); Contract.Check("Id", p.GetProperty("requestId")); loopback.Cancel(p.GetProperty("requestId").GetString()!); return Task.FromResult<object?>(null); });
        if (verificationOutput != null)
        {
            RegisterAcceptanceMethods();
            resources.Register("POST", "/_host/verify/upload", async (r, t) => ResourceResponse.Json(200, new { length = (await BoundedRead.ReadAsync(r.Body!, 16 * 1024 * 1024, t)).Length }));
            resources.Register("GET", "/_host/verify/bytes", (r, _) => Task.FromResult(HostResourceHandler.Bytes(Enumerable.Range(0, 256).Select(i => (byte)i).ToArray(), "application/octet-stream", r.Range)));
        }
    }
    private void Emit(string topic, object payload) { if (web.CoreWebView2 != null && !mayClose) web.CoreWebView2.PostWebMessageAsJson(Json.String(bridge.Event(topic, payload))); }
    private void ApplyPlacement(JsonElement saved)
    {
        var proposed = new Bounds(saved.GetProperty("left").GetDouble(), saved.GetProperty("top").GetDouble(), saved.GetProperty("width").GetDouble(), saved.GetProperty("height").GetDouble());
        var area = WindowPlacement.SelectWorkArea(proposed, MonitorWorkAreas.Get(this));
        var bounds = WindowPlacement.Clamp(proposed, area);
        Left = bounds.Left; Top = bounds.Top; Width = bounds.Width; Height = bounds.Height;
        MinWidth = Math.Min(1100, area.Width); MinHeight = Math.Min(700, area.Height);
        if (saved.GetProperty("maximized").GetBoolean()) WindowState = WindowState.Maximized;
    }
    private async Task SavePlacementAsync()
    {
        if (storage.IsReadOnly) return;
        var value = await settings.GetAsync(); var fields = value.EnumerateObject().ToDictionary(p => p.Name, p => p.Value);
        var bounds = WindowState == WindowState.Normal ? new Rect(Left, Top, Width, Height) : RestoreBounds;
        fields["window"] = Json.Element(new { left = bounds.Left, top = bounds.Top, width = bounds.Width, height = bounds.Height, maximized = WindowState == WindowState.Maximized });
        await settings.UpdateAsync(Json.Element(fields));
    }
    private async void OnClosing(object? sender, CancelEventArgs e)
    {
        if (mayClose) return; e.Cancel = true;
        if (closing) return; closing = true;
        if (!initialized || await close.RequestAsync()) { if(acceptance?.Scenario is "closeButton" or "altF4")await RecordClosingAcceptanceAsync(); mayClose = true; await CleanupAsync(); Close(); }
        else { MessageBox.Show("保存或备份失败，窗口保持打开。请检查磁盘与权限后重试。", "未关闭"); close.CancelClose(); closing = false; }
    }
    private async Task CleanupAsync()
    {
        Microsoft.Win32.SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
        lifetime.Cancel(); acceptanceWriter?.Dispose(); bridge.Dispose(); await loopback.DisposeAsync(); files.Dispose(); await storage.DisposeAsync(); documents.Dispose(); databaseLease?.Dispose(); web.Dispose(); lifetime.Dispose();
    }
    private void OnDisplaySettingsChanged(object? sender, EventArgs e)
    {
        Dispatcher.BeginInvoke(() =>
        {
            if (mayClose) return;
            var proposed = new Bounds(Left, Top, ActualWidth, ActualHeight);
            var area = WindowPlacement.SelectWorkArea(proposed, MonitorWorkAreas.Get(this));
            var bounds = WindowPlacement.Clamp(proposed, area);
            MinWidth = Math.Min(1100, area.Width); MinHeight = Math.Min(700, area.Height);
            if (WindowState == WindowState.Normal) { Left = bounds.Left; Top = bounds.Top; Width = bounds.Width; Height = bounds.Height; }
        });
    }
    private nint DisplayMessage(nint hwnd, int message, nint wParam, nint lParam, ref bool handled)
    {
        if (acceptance!=null && message is 0xa1 or 0xa2 or 0xa3 or 0x112) windowMessages.Add($"{message:X}:{wParam:X}");
        if (message is 0x007e or 0x02e0) OnDisplaySettingsChanged(this, EventArgs.Empty);
        return 0;
    }
    private void ShowError(string title, string detail, bool runtime = false, bool recovery = false)
    {
        WindowStyle = WindowStyle.SingleBorderWindow;
        var panel = new StackPanel { Margin = new Thickness(40) };
        panel.Children.Add(new TextBlock { Text = title, FontSize = 24, Margin = new Thickness(0, 0, 0, 20) });
        panel.Children.Add(new TextBlock { Text = detail, TextWrapping = TextWrapping.Wrap });
        if (runtime)
        {
            var button = new Button { Content = "安装 WebView2 Runtime", Margin = new Thickness(0, 20, 0, 0) };
            button.Click += (_, _) => System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("https://developer.microsoft.com/microsoft-edge/webview2/") { UseShellExecute = true }); panel.Children.Add(button);
        }
        if (recovery && File.Exists(storage.BackupPath))
        {
            var info = RecoveryService.Inspect(storage.BackupPath);
            var button = new Button { Content = $"恢复备份：{info.ModifiedUtc.ToLocalTime():g}，文档版本 {string.Join(", ", info.DocumentRevisions.Values)}", Margin = new Thickness(0, 20, 0, 0) };
            button.Click += async (_, _) =>
            {
                if (MessageBox.Show("恢复会丢失备份后的修改。原文件将保留。确认恢复？", "恢复备份", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
                await storage.DisposeAsync(); databaseLease?.Dispose(); databaseLease = null;
                try { RecoveryService.Restore(storage.DatabasePath, true); MessageBox.Show("恢复完成，请重启 DocAss。"); mayClose = true; await loopback.DisposeAsync(); documents.Dispose(); web.Dispose(); Close(); }
                catch (Exception ex) { MessageBox.Show((StorageService.MapError(ex) as AppException)?.Message ?? "恢复失败，原文件保留。"); }
            }; panel.Children.Add(button);
        }
        Content = panel;
    }
}
