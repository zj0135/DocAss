using DocAss.Host.Contracts;
using DocAss.Host.Http;

namespace DocAss.Host.Documents;

/// <summary>
/// Abstraction for opening, unlocking, caching, and querying document instances and versions.
/// </summary>
public interface IDocumentService : IDisposable
{
    int PendingCount { get; }

    Task<OpenResult> OpenAsync(string path, CancellationToken token = default);

    Task<OpenResult> UnlockAsync(string id, string password, CancellationToken token);

    void Cancel(string id);

    OpenResult Info(string id);

    string? Password(string id);

    void Close(string id);

    Task<RecentDocument[]> RecentAsync();

    Task<OpenResult> OpenRecentAsync(string hash, CancellationToken token);

    Task<ResourceResponse> ReadAsync(string id, bool image, string? range, CancellationToken token);

    Task<object> CheckSourceAsync(string id, CancellationToken token);

    Task<OpenResult> OpenVersionAsync(string id, CancellationToken token);

    Task<object> MigrationInfoAsync(string id, string oldHash, CancellationToken token);
}
