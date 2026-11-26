using DocAss.Host.Contracts;

namespace DocAss.Host.Ocr;

/// <summary>
/// Abstraction for scheduling, executing, and caching background OCR recognition tasks.
/// </summary>
public interface IOcrScheduler : IAsyncDisposable
{
    event Action<OcrStatus>? Changed;

    int InferenceCount { get; }

    Task<OcrTicket> StartAsync(OcrStart request, CancellationToken token = default);

    void Upload(string docId, string jobId, byte[] bytes);

    OcrStatus Status(string docId, string jobId, string subscriptionId);

    OcrResult Result(string docId, string jobId, string subscriptionId);

    void Unsubscribe(string docId, string subscriptionId);

    void Forget(string docId);

    Task<string> GetOverrideAsync(string docId, int page);

    Task SetOverrideAsync(string docId, int page, string mode);

    long ClearCache();
}
