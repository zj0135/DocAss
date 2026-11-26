using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using DocAss.Host.Contracts;

namespace DocAss.Host.Bridge;

public sealed class BridgeRouter(string trustedOrigin) : IDisposable
{
    private readonly Dictionary<string, Func<JsonElement, CancellationToken, Task<object?>>> methods = new();
    private readonly ConcurrentDictionary<string, CancellationTokenSource> pending = new();
    private CancellationTokenSource session = new();
    private long generation;
    private long sequence;
    public int PendingCount => pending.Count;
    public void Register(string method, Func<JsonElement, CancellationToken, Task<object?>> handler) => methods.Add(method, handler);
    public object Event(string topic, object payload) => new { v = 1, kind = "event", topic, seq = Interlocked.Increment(ref sequence), payload };
    public bool TrustedPage(string source, bool mainFrame) => mainFrame && Uri.TryCreate(source, UriKind.Absolute, out var uri) && uri.GetLeftPart(UriPartial.Authority) == trustedOrigin && (uri.AbsolutePath is "/" or "/index.html");
    public async Task<object?> DispatchAsync(string source, bool mainFrame, string raw)
    {
        string? id = null; var current = Interlocked.Read(ref generation);
        try
        {
            if (!TrustedPage(source, mainFrame)) throw new AppException("FORBIDDEN", "仅可信主框架可调用宿主");
            if (Encoding.UTF8.GetByteCount(raw) > 256 * 1024) throw new AppException("INVALID_PAYLOAD", "桥消息超过 256 KiB");
            using var document = JsonDocument.Parse(raw); var message = document.RootElement;
            if (message.TryGetProperty("id", out var idValue)) { Contract.Check("Id", idValue); id = idValue.GetString(); }
            if (!message.TryGetProperty("v", out var v) || v.ValueKind != JsonValueKind.Number || !v.TryGetInt32(out var version) || version != 1) throw new AppException("UNSUPPORTED_VERSION", "不支持的协议版本");
            Contract.Check("Request", message);
            var method = message.GetProperty("method").GetString()!; var parameters = message.GetProperty("params").Clone();
            if (method == "app.cancel")
            {
                Contract.Fields(parameters, "requestId"); Contract.Check("Id", parameters.GetProperty("requestId"));
                if (pending.TryGetValue(parameters.GetProperty("requestId").GetString()!, out var target)) target.Cancel();
                return new { v = 1, kind = "res", id, ok = true, result = new { cancelled = true } };
            }
            if (!methods.TryGetValue(method, out var handler)) throw new AppException("UNKNOWN_METHOD", "未知宿主方法");
            using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(session.Token); cancellation.CancelAfter(TimeSpan.FromSeconds(method is "doc.open" or "doc.openRecent" or "doc.unlock" or "doc.checkSource" or "doc.openVersion" or "doc.migrationInfo" or "ocr.start" ? 120 : 10));
            if (pending.Count >= 256 || !pending.TryAdd(id!, cancellation)) throw new AppException("BUSY", "请求重复或并发过多", true);
            try
            {
                var result = await handler(parameters, cancellation.Token).WaitAsync(cancellation.Token);
                return current != Interlocked.Read(ref generation) ? null : new { v = 1, kind = "res", id, ok = true, result };
            }
            finally { pending.TryRemove(id!, out _); }
        }
        catch (Exception ex)
        {
            if (current != Interlocked.Read(ref generation)) return null;
            var error = ex switch { AppException known => known, OperationCanceledException => new AppException("CANCELLED", "请求已取消或超时", true), JsonException or InvalidOperationException or KeyNotFoundException or FormatException => new AppException("INVALID_PAYLOAD", "请求字段或 JSON 无效"), _ => new AppException("INTERNAL", "宿主操作失败") };
            return new { v = 1, kind = "res", id, ok = false, error = error.ToDto() };
        }
    }
    public void Reset()
    {
        Interlocked.Increment(ref generation); session.Cancel(); session.Dispose(); session = new(); sequence = 0;
    }
    public void Dispose() { Reset(); session.Dispose(); }
}
