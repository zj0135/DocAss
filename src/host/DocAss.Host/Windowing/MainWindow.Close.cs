using DocAss.Host.Contracts;
namespace DocAss.Host;

public sealed partial class MainWindow
{
    private TaskCompletionSource<bool>? frontendClose;
    private string? frontendCloseId;
    private void RegisterCloseMethods() => bridge.Register("window.closeReady", (p, _) =>
    {
        Contract.Fields(p, "requestId", "ready"); Contract.Check("Id", p.GetProperty("requestId")); Contract.Require(p.GetProperty("ready").ValueKind is System.Text.Json.JsonValueKind.True or System.Text.Json.JsonValueKind.False);
        Contract.Require(frontendCloseId == p.GetProperty("requestId").GetString(), "关闭请求已失效"); frontendClose?.TrySetResult(p.GetProperty("ready").GetBoolean()); return Task.FromResult<object?>(null);
    });
}
