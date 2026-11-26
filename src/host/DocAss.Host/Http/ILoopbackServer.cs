namespace DocAss.Host.Http;

/// <summary>
/// Abstraction for the secure loopback HTTP server used for streaming LLM requests and fixtures.
/// </summary>
public interface ILoopbackServer : IAsyncDisposable
{
    string SessionToken { get; }

    string Origin { get; }

    int ActiveRequests { get; }

    int CancelledRequests { get; }

    Task StartAsync();

    void Cancel(string requestId);
}
