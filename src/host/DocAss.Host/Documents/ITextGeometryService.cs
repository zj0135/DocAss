namespace DocAss.Host.Documents;

/// <summary>
/// Abstraction for extracting native text geometry and word boundaries from document pages.
/// </summary>
public interface ITextGeometryService
{
    int CacheBytes { get; }

    void Cancel(string docId, string jobId);

    void Forget(string docId);

    Task<NativePageResult> ExtractAsync(string docId, int page, string jobId, CancellationToken token = default);
}
