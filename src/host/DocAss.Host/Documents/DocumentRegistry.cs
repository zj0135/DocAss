using System.Collections.Concurrent;
using DocAss.Host.Contracts;

namespace DocAss.Host.Documents;

public sealed class DocumentRegistry(string dataDirectory) : IDisposable
{
    private sealed record Entry(DocHandle Handle, int PageCount, FileStream? WriteLock);
    private readonly ConcurrentDictionary<string, Entry> entries = new();
    private readonly object gate = new();
    public DocHandle Register(string hash, string fileName, int pageCount, long length = 0, string kind = "pdf")
    {
        Contract.Check("Hash", Json.Element(hash)); Contract.Require(pageCount > 0);
        lock (gate)
        {
            var existing = entries.Values.FirstOrDefault(e => e.Handle.DocHash == hash);
            if (existing != null) return existing.Handle;
            var writeLock = TryLock(hash);
            var handle = new DocHandle(Guid.NewGuid().ToString(), hash, fileName, kind, length, writeLock == null ? "readOnly" : "edit", hash);
            Contract.Check("DocHandle", Json.Element(handle));
            entries[handle.DocId] = new(handle, pageCount, writeLock); return handle;
        }
    }
    private FileStream? TryLock(string hash)
    {
        var directory = Path.Combine(dataDirectory, "locks"); Directory.CreateDirectory(directory);
        try { return new FileStream(Path.Combine(directory, hash + ".lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }
    public DocHandle Resolve(string id, bool write = false)
    {
        Contract.Check("Id", Json.Element(id));
        if (!entries.TryGetValue(id, out var entry)) throw new AppException("DOCUMENT_CLOSED", "文档已关闭，请重新打开");
        if (write && entry.WriteLock == null) throw new AppException("READ_ONLY", "文档由其他进程编辑，当前只读");
        return entry.Handle;
    }
    public int PageCount(string id) { Resolve(id); return entries[id].PageCount; }
    internal IDisposable? TryCollectionLease(string hash)
    {
        Contract.Check("Hash", Json.Element(hash));
        lock (gate)
        {
            var entry=entries.Values.FirstOrDefault(e=>e.Handle.DocHash==hash);
            return entry?.WriteLock != null ? new BorrowedLease() : TryLock(hash);
        }
    }
    private sealed class BorrowedLease : IDisposable { public void Dispose() { } }
    public DocHandle Reacquire(string id)
    {
        lock (gate)
        {
            Resolve(id); var e = entries[id];
            if (e.WriteLock == null)
            {
                var file = TryLock(e.Handle.DocHash);
                e = e with { WriteLock = file, Handle = e.Handle with { Access = file == null ? "readOnly" : "edit" } };
                entries[id] = e;
            }
            return e.Handle;
        }
    }
    public void Close(string id) { lock (gate) { if (entries.TryRemove(id, out var e)) e.WriteLock?.Dispose(); } }
    public void Dispose() { foreach (var id in entries.Keys) Close(id); }
}
