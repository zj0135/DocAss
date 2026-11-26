using System.Text.Json;

namespace DocAss.Host.Bridge;

/// <summary>
/// Defines the abstraction for dispatching and routing WebView2 bridge calls and events.
/// </summary>
public interface IBridgeRouter : IDisposable
{
    int PendingCount { get; }

    void Register(string method, Func<JsonElement, CancellationToken, Task<object?>> handler);

    object Event(string topic, object payload);

    bool TrustedPage(string source, bool mainFrame);

    Task<object?> DispatchAsync(string source, bool mainFrame, string raw);

    void Reset();
}
