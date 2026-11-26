using System.Collections.Concurrent;
using System.Security.Cryptography;
using DocAss.Host.Contracts;
using DocAss.Host.Http;
using DocAss.Host.Storage;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Exceptions;

namespace DocAss.Host.Documents;

public sealed record OpenResult(string Status, string OpenId, string FileName, DocHandle? Handle = null, int PageCount = 0, ImageInfo? Image = null){public string? PreviousHash {get;init;}}
public sealed record RecentDocument(string DocHash, string FileName, string OpenedAt);
internal sealed record SourceSnapshot(string Path, string SourcePath, string Hash, string FileName, string Kind, long Length);
internal sealed record OpenDocument(SourceSnapshot Snapshot, int PageCount, string? Password, ImageInfo? Image, CancellationTokenSource Lifetime, FileStream Lease)
{
    public string? PreviousHash {get;set;}
    // WebView2 owns response streams until consumed. Weak tracking permits its
    // released responses to be collected, while close can invalidate live ones.
    public List<WeakReference<Stream>> Streams {get;} = new();
}

public sealed partial class DocumentService(string directory, DocumentRegistry registry, StorageService storage) : IDisposable
{
    public const long MaxLength = 1024L * 1024 * 1024;
    private readonly ConcurrentDictionary<string, SourceSnapshot> pending = new();
    private readonly ConcurrentDictionary<string, OpenDocument> opened = new();
    private readonly SemaphoreSlim opening = new(1, 1);
    private readonly string snapshots = System.IO.Path.Combine(directory, "snapshots");
    public int PendingCount => pending.Count;
    public async Task<OpenResult> OpenAsync(string path, CancellationToken token = default)
    {
        await opening.WaitAsync(token);
        try
        {
            var snapshot = await CopyAsync(path, token);
            var existing = opened.FirstOrDefault(x => x.Value.Snapshot.Hash == snapshot.Hash);
            if (existing.Value != null) { await RememberAsync(snapshot); return Ready(existing.Key, existing.Value); }
            var id = Guid.NewGuid().ToString(); pending[id] = snapshot;
            try { return await FinishAsync(id, null, token); }
            catch { pending.TryRemove(id, out _); throw; }
        }
        finally { opening.Release(); }
    }
    public async Task<OpenResult> UnlockAsync(string id, string password, CancellationToken token)
    {
        Contract.Check("Id", Json.Element(id)); Contract.Require(password.Length <= 1024);
        await opening.WaitAsync(token);
        try { return await FinishAsync(id, password, token); }
        catch (OperationCanceledException) { Cancel(id); throw; }
        finally { opening.Release(); }
    }
    public void Cancel(string id) { Contract.Check("Id", Json.Element(id)); pending.TryRemove(id, out _); }
    private async Task<OpenResult> FinishAsync(string id, string? password, CancellationToken token)
    {
        if (!pending.TryGetValue(id, out var snapshot)) throw new AppException("CANCELLED", "打开任务已取消");
        var existing=opened.FirstOrDefault(e=>e.Value.Snapshot.Hash==snapshot.Hash);
        if(existing.Value!=null){pending.TryRemove(id,out _);await RememberAsync(snapshot);return Ready(existing.Key,existing.Value);}
        var pages = 1; ImageInfo? image = null;
        try
        {
            if (snapshot.Kind == "pdf") pages = await Task.Run(() => { using var pdf = PdfDocument.Open(snapshot.Path, new ParsingOptions { Password = password ?? "" }); return pdf.NumberOfPages; }, token);
            else image = await Task.Run(() => ImageDecoder.Normalize(snapshot.Path, snapshot.Path + ".png",token), token);
        }
        catch (PdfDocumentEncryptedException) { return new(password == null ? "password-needed" : "incorrect", id, snapshot.FileName); }
        catch (AppException) { pending.TryRemove(id, out _); throw; }
        catch (OperationCanceledException) { throw; }
        catch { pending.TryRemove(id, out _); throw new AppException("INVALID_DOCUMENT", "文件损坏或无法解析"); }
        token.ThrowIfCancellationRequested();
        if (!pending.TryRemove(id, out _)) throw new AppException("CANCELLED", "打开任务已取消");
        var handle = registry.Register(snapshot.Hash, snapshot.FileName, pages, snapshot.Length, snapshot.Kind);
        var document = new OpenDocument(snapshot, pages, password, image, new(), new(snapshot.Path,FileMode.Open,FileAccess.Read,FileShare.Read));
        try
        {
            await storage.EnsureDocumentAsync(handle, pages); await RememberAsync(snapshot);
            document.PreviousHash=await MigrationCandidateAsync(snapshot);
            token.ThrowIfCancellationRequested(); opened[handle.DocId] = document;
            return Ready(handle.DocId, document);
        }
        catch { registry.Close(handle.DocId); document.Lifetime.Dispose(); document.Lease.Dispose(); throw; }
    }
    private OpenResult Ready(string id, OpenDocument document) => new("ready", id, document.Snapshot.FileName, registry.Resolve(id), document.PageCount, document.Image){PreviousHash=document.PreviousHash};
    internal OpenDocument Resolve(string id) { registry.Resolve(id); return opened.TryGetValue(id, out var document) ? document : throw new AppException("DOCUMENT_CLOSED", "文档已关闭"); }
    public OpenResult Info(string id) => Ready(id, Resolve(id));
    public string? Password(string id) => Resolve(id).Password;
    public void Close(string id) { if (opened.TryRemove(id, out var doc)) { doc.Lifetime.Cancel();lock(doc.Streams){foreach(var reference in doc.Streams)if(reference.TryGetTarget(out var stream))stream.Dispose();doc.Streams.Clear();}doc.Lifetime.Dispose();doc.Lease.Dispose(); } registry.Close(id); }
    private async Task<SourceSnapshot> CopyAsync(string path, CancellationToken token)
    {
        var extension = System.IO.Path.GetExtension(path).ToLowerInvariant();
        if (extension is not (".pdf" or ".png" or ".jpg" or ".jpeg" or ".bmp")) throw new AppException("UNSUPPORTED_FORMAT", "支持 PDF、PNG、JPEG 和 BMP 文件");
        Directory.CreateDirectory(snapshots); var temporary = System.IO.Path.Combine(snapshots, Guid.NewGuid() + ".tmp");
        try
        {
            await using var source = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.Asynchronous | FileOptions.SequentialScan);
            if (source.Length is <= 0 or > MaxLength) throw new AppException("FILE_TOO_LARGE", "文件为空或超过 1 GiB 上限");
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, FileOptions.Asynchronous))
            {
                var buffer = new byte[65536]; int count;
                while ((count = await source.ReadAsync(buffer, token)) > 0) { token.ThrowIfCancellationRequested(); hash.AppendData(buffer, 0, count); await output.WriteAsync(buffer.AsMemory(0, count), token); }
                output.Flush(true);
            }
            var digest = Convert.ToHexStringLower(hash.GetHashAndReset()); var target = System.IO.Path.Combine(snapshots, digest);
            if(File.Exists(target))
            {
                await using var saved=File.OpenRead(target);
                if(Convert.ToHexStringLower(await SHA256.HashDataAsync(saved,token))!=digest)throw new AppException("SNAPSHOT_CORRUPT","快照校验失败，请关闭文档后清理损坏的缓存再重试");
            }
            if (!File.Exists(target)) { try { File.Move(temporary, target); } catch (IOException) when (File.Exists(target)) { } }
            return new(target, System.IO.Path.GetFullPath(path), digest, System.IO.Path.GetFileName(path), extension == ".pdf" ? "pdf" : "image", source.Length);
        }
        catch (IOException) { throw new AppException("FILE_BUSY", "文件被占用或读取失败，请关闭写入程序后重试", true); }
        catch (UnauthorizedAccessException) { throw new AppException("FILE_ACCESS", "没有读取文件或写入快照的权限", true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private Task RememberAsync(SourceSnapshot snapshot) => storage.Enqueue(() =>
    {
        using var c = storage.OpenWrite(); using var tx = c.BeginTransaction();
        StorageService.Execute(c, "INSERT INTO source_paths(docHash,path) VALUES($h,$p) ON CONFLICT DO NOTHING", tx, ("$h", snapshot.Hash), ("$p", snapshot.SourcePath));
        StorageService.Execute(c, "UPDATE documents SET displayName=$n WHERE docHash=$h", tx, ("$h", snapshot.Hash), ("$n", snapshot.FileName));
        StorageService.Execute(c, "INSERT INTO recent_items(docHash,openedAt) VALUES($h,$t) ON CONFLICT(docHash) DO UPDATE SET openedAt=$t", tx, ("$h", snapshot.Hash), ("$t", DateTimeOffset.UtcNow.ToString("O")));
        tx.Commit(); return true;
    });
    public Task<RecentDocument[]> RecentAsync() => storage.Enqueue(() =>
    {
        using var c = storage.OpenRead(); using var q = c.CreateCommand(); q.CommandText = "SELECT r.docHash,d.displayName,r.openedAt FROM recent_items r JOIN documents d USING(docHash) ORDER BY r.openedAt DESC LIMIT 20";
        using var rows = q.ExecuteReader(); var result = new List<RecentDocument>(); while (rows.Read()) result.Add(new(rows.GetString(0), rows.GetString(1), rows.GetString(2))); return result.ToArray();
    });
    public async Task<OpenResult> OpenRecentAsync(string hash, CancellationToken token)
    {
        Contract.Check("Hash", Json.Element(hash));
        var paths = await storage.Enqueue(() => { using var c = storage.OpenRead(); using var q = c.CreateCommand(); q.CommandText = "SELECT path FROM source_paths WHERE docHash=$h"; q.Parameters.AddWithValue("$h", hash); using var rows = q.ExecuteReader(); var list = new List<string>(); while (rows.Read()) list.Add(rows.GetString(0)); return list; });
        var path = paths.FirstOrDefault(File.Exists) ?? throw new AppException("FILE_MISSING", "原文件已移动，请重新选择文件以关联已有状态");
        return await OpenAsync(path, token);
    }
    public async Task<ResourceResponse> ReadAsync(string id, bool image, string? range, CancellationToken token)
    {
        var doc = Resolve(id); var path = image && doc.Image != null ? doc.Snapshot.Path + ".png" : doc.Snapshot.Path;
        var mime = image ? "image/png" : "application/pdf";
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, doc.Lifetime.Token);
        var response=await HostResourceHandler.FileRangeAsync(path, mime, range, linked.Token);
        if(response.BodyStream!=null)lock(doc.Streams){if(linked.IsCancellationRequested){response.BodyStream.Dispose();linked.Token.ThrowIfCancellationRequested();}doc.Streams.RemoveAll(reference=>!reference.TryGetTarget(out _));doc.Streams.Add(new(response.BodyStream));}
        return response;
    }
    public void Dispose() { foreach (var id in opened.Keys) Close(id); pending.Clear(); }
}
