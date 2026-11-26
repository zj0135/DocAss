namespace DocAss.Host.Storage;

/// <summary>
/// Abstraction for staging, committing, reading, and garbage-collecting binary file attachments.
/// </summary>
public interface IAttachmentService
{
    string Begin(string docId);

    Task UploadAsync(string docId, string uploadId, Stream body, string mime, CancellationToken token);

    Task<string> CommitAsync(string docId, string id);

    Task<byte[]?> ReadAsync(string docId, string id);

    Task<int> CollectAsync(TimeSpan? minimumAge = null);
}
