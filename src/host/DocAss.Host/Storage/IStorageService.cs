using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using Microsoft.Data.Sqlite;

namespace DocAss.Host.Storage;

/// <summary>
/// Abstraction for persistent SQLite storage of documents, annotations, conversations and operations.
/// </summary>
public interface IStorageService : IAsyncDisposable
{
    string DatabasePath { get; }
    string BackupPath { get; }
    bool IsReadOnly { get; }
    bool Dirty { get; }
    Action<string>? FaultInjection { get; set; }
    event Action<AppException>? BackgroundError;

    Task InitializeAsync();
    Task<T> Enqueue<T>(Func<T> action);
    SqliteConnection OpenRead();
    Task EnsureDocumentAsync(DocHandle handle, int pageCount);
    Task<DocumentSnapshot> ReadDocumentAsync(string hash, int? messageLimit = null);
    Task<JsonElement[]> ReadMessagesPageAsync(string hash, string conversationId, int before);
    Task<long> ReadRevisionAsync(string hash);
    Task<JsonElement?> GetOperationAsync(string hash, string operationId);
    Task<CommitResult> CommitAsync(JsonElement payload, DocumentRegistry registry);
    Task<JsonElement[]> ReadEntitiesAsync(string hash, string entity);
    Task BackupAsync();
    Task DrainAsync();
}
