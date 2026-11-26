using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Http;
using Microsoft.Web.WebView2.Core;

namespace DocAss.Host;

public sealed partial class MainWindow
{
    private void RegisterDocumentMethods()
    {
        bridge.Register("doc.checkSource", async (p, token) => { Contract.Fields(p, "docId"); return await files.CheckSourceAsync(p.GetProperty("docId").GetString()!, token); });
        bridge.Register("doc.openVersion", async (p, token) => { Contract.Fields(p, "docId"); Emit("doc.opened", await files.OpenVersionAsync(p.GetProperty("docId").GetString()!, token)); return null; });
        bridge.Register("doc.migrationInfo", async (p, token) => { Contract.Fields(p, "docId", "oldHash"); return await files.MigrationInfoAsync(p.GetProperty("docId").GetString()!, p.GetProperty("oldHash").GetString()!, token); });
        bridge.Register("doc.open", async (p, token) =>
        {
            Contract.Fields(p);
            var dialog = new Microsoft.Win32.OpenFileDialog { Filter = "文档|*.pdf;*.png;*.jpg;*.jpeg;*.bmp", Multiselect = false };
            if (dialog.ShowDialog(this) != true) return null;
            return await files.OpenAsync(dialog.FileName, token);
        });
        bridge.Register("doc.unlock", async (p, token) => { Contract.Fields(p, "openId", "password"); return await files.UnlockAsync(p.GetProperty("openId").GetString()!, p.GetProperty("password").GetString()!, token); });
        bridge.Register("doc.cancelOpen", (p, _) => { Contract.Fields(p, "openId"); files.Cancel(p.GetProperty("openId").GetString()!); return Task.FromResult<object?>(null); });
        bridge.Register("doc.info", (p, _) => { Contract.Fields(p, "docId"); return Task.FromResult<object?>(files.Info(p.GetProperty("docId").GetString()!)); });
        bridge.Register("doc.password", (p, _) => { Contract.Fields(p, "docId"); return Task.FromResult<object?>(new { password = files.Password(p.GetProperty("docId").GetString()!) }); });
        bridge.Register("doc.recent", async (p, _) => { Contract.Fields(p); return await files.RecentAsync(); });
        bridge.Register("doc.openRecent", async (p, token) => { Contract.Fields(p, "docHash"); return await files.OpenRecentAsync(p.GetProperty("docHash").GetString()!, token); });
        bridge.Register("text.cancel", (p, _) => { Contract.Fields(p, "docId", "jobId"); geometry.Cancel(p.GetProperty("docId").GetString()!, p.GetProperty("jobId").GetString()!); return Task.FromResult<object?>(null); });
    }
    private async Task<bool> HandleFileDropAsync(CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!bridge.TrustedPage(e.Source, true)) return false;
        using var json = JsonDocument.Parse(e.WebMessageAsJson);
        if (json.RootElement.ValueKind != JsonValueKind.Object || !json.RootElement.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String || type.GetString() != "docass.files") return false;
        try
        {
            foreach (var item in e.AdditionalObjects.Take(20))
                if (item is CoreWebView2File file) Emit("doc.opened", await files.OpenAsync(file.Path, lifetime.Token));
        }
        catch (AppException ex) { Emit("doc.openFailed", ex.ToDto()); }
        catch (OperationCanceledException) { }
        return true;
    }
    private async Task<ResourceResponse?> DocumentResourceAsync(string[] parts, ResourceRequest request, CancellationToken token)
    {
        if (parts.Length == 4 && parts[3] == "clipboard" && request.Method == "POST")
        {
            files.Resolve(parts[2]); var text = System.Text.Encoding.UTF8.GetString(await BoundedRead.ReadAsync(request.Body ?? Stream.Null, 1024 * 1024, token));
            try { await Dispatcher.InvokeAsync(() => System.Windows.Clipboard.SetText(text)); }
            catch (System.Runtime.InteropServices.COMException) { throw new AppException("CLIPBOARD_FAILED", "剪贴板被其他程序占用，请重试", true); }
            return ResourceResponse.Json(200, new { copied = true });
        }
        if (request.Method != "GET") return null;
        if (parts.Length == 4 && parts[3] is "bytes" or "image") return await files.ReadAsync(parts[2], parts[3] == "image", request.Range, token);
        if (parts.Length == 6 && parts[3] == "text")
        {
            Contract.Require(int.TryParse(parts[4], out var page)); Contract.Check("Id", Json.Element(parts[5]));
            return ResourceResponse.Json(200, await geometry.ExtractAsync(parts[2], page, parts[5], token));
        }
        return null;
    }
}
