using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Windows.Media.Imaging;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using Microsoft.Data.Sqlite;

namespace DocAss.Host.Storage;

public sealed class AttachmentService(StorageService storage, DocumentRegistry documents, string dataDirectory) : IAttachmentService
{
    public const int MaxBytes = 8 * 1024 * 1024;
    private sealed class Upload(string docId, string hash)
    {
        public string DocId { get; } = docId;
        public string Hash { get; } = hash;
        public SemaphoreSlim Gate { get; } = new(1);
        public DateTime Created { get; } = DateTime.UtcNow;
        public long Length { get; set; }
        public string? Digest { get; set; }
    }
    private readonly ConcurrentDictionary<string, Upload> pending = new();
    private string FilePath(string hash, string id) => Path.Combine(dataDirectory, "attachments", hash, id + ".png");
    public string Begin(string docId)
    {
        var doc = documents.Resolve(docId, true);
        if (pending.Count >= 128) throw new AppException("BUSY", "待提交附件过多", true);
        var id = Guid.NewGuid().ToString(); pending[id] = new(docId, doc.DocHash); return id;
    }
    public async Task UploadAsync(string docId, string uploadId, Stream body, string mime, CancellationToken token)
    {
        documents.Resolve(docId, true);
        if (!pending.TryGetValue(uploadId, out var upload) || upload.DocId != docId) throw new AppException("FORBIDDEN", "附件上传能力无效");
        if (mime != "image/png") throw new AppException("INVALID_PAYLOAD", "附件只接受 PNG");
        await upload.Gate.WaitAsync(token);
        var path = FilePath(upload.Hash, uploadId); var temporary = path + ".part";
        try
        {
            if (upload.Digest != null) throw new AppException("INVALID_PAYLOAD", "附件已上传");
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var bytes = await Http.BoundedRead.ReadAsync(body, MaxBytes, token);
            ValidatePng(bytes);
            await using (var file = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None, 65536, FileOptions.Asynchronous | FileOptions.WriteThrough))
            { await file.WriteAsync(bytes, token); await file.FlushAsync(token); file.Flush(true); }
            token.ThrowIfCancellationRequested(); documents.Resolve(docId, true);
            File.Move(temporary, path, true); upload.Length = bytes.Length; upload.Digest = Convert.ToHexStringLower(SHA256.HashData(bytes));
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); upload.Gate.Release(); }
    }
    private static void ValidatePng(byte[] bytes)
    {
        Contract.Require(bytes.Length > 24 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }), "附件 MIME 与文件不一致");
        var width = System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16, 4));
        var height = System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20, 4));
        Contract.Require(width > 0 && height > 0 && (ulong)width * height <= 12_000_000, "附件像素超限");
        try
        {
            using var stream = new MemoryStream(bytes);
            var decoder = BitmapDecoder.Create(stream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            Contract.Require(decoder.Frames.Count == 1);
            var frame = decoder.Frames[0];
            Contract.Require(frame.PixelWidth == width && frame.PixelHeight == height);
            var stride = (frame.PixelWidth * frame.Format.BitsPerPixel + 7) / 8;
            frame.CopyPixels(new byte[stride * frame.PixelHeight], stride, 0);
        }
        catch (Exception ex) when (ex is not AppException) { throw new AppException("INVALID_PAYLOAD", "PNG 解码失败"); }
    }
    public async Task<string> CommitAsync(string docId, string id)
    {
        documents.Resolve(docId, true);
        if (!pending.TryGetValue(id, out var upload) || upload.DocId != docId) throw new AppException("FORBIDDEN", "无效的上传能力");
        await upload.Gate.WaitAsync();
        try
        {
            Contract.Require(upload.Digest != null, "附件尚未完整上传");
            await storage.Enqueue(() =>
            {
                documents.Resolve(docId, true); using var c = storage.OpenWrite(); using var tx = c.BeginTransaction();
                StorageService.Execute(c, "INSERT INTO attachments(docHash,attachmentId,mime,byteLength,sha256,createdAt) VALUES($h,$i,'image/png',$l,$s,$t)", tx, ("$h", upload.Hash), ("$i", id), ("$l", upload.Length), ("$s", upload.Digest), ("$t", DateTime.UtcNow.ToString("O")));
                storage.FaultInjection?.Invoke("attachment"); tx.Commit(); storage.MarkDirty(); return true;
            });
            pending.TryRemove(id, out _); return id;
        }
        finally { upload.Gate.Release(); }
    }
    public Task<byte[]?> ReadAsync(string docId, string id) => storage.Enqueue(() =>
    {
        var doc = documents.Resolve(docId); Contract.Check("Id", Json.Element(id)); using var c = storage.OpenRead();
        var digest = StorageService.Scalar(c, "SELECT sha256 FROM attachments WHERE docHash=$h AND attachmentId=$i", null, ("$h", doc.DocHash), ("$i", id)) as string;
        if (digest == null) throw new AppException("FORBIDDEN", "附件不属于该文档");
        var path = FilePath(doc.DocHash, id); if (!File.Exists(path)) return null;
        var bytes = File.ReadAllBytes(path); return Convert.ToHexStringLower(SHA256.HashData(bytes)) == digest ? bytes : null;
    });
    public Task<int> CollectAsync(TimeSpan? minimumAge = null) => storage.Enqueue(() =>
    {
        using var backupLock = new FileStream(storage.BackupPath + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var cutoff = DateTime.UtcNow - (minimumAge ?? TimeSpan.FromHours(24));
        using var c = storage.OpenWrite(); var keep = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        void ReadRefs(SqliteConnection connection)
        {
            using var cmd = StorageService.Command(connection, "SELECT docHash,attachmentId FROM attachment_refs"); using var r = cmd.ExecuteReader();
            while (r.Read()) keep.Add(FilePath(r.GetString(0), r.GetString(1)));
        }
        ReadRefs(c);
        if (File.Exists(storage.BackupPath))
        {
            using var backup = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = storage.BackupPath, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString()); backup.Open();
            if (StorageService.Scalar(backup, "SELECT name FROM sqlite_master WHERE name='attachment_refs'") != null) ReadRefs(backup);
        }
        foreach (var (id, upload) in pending)
        {
            if (upload.Created >= DateTime.UtcNow - TimeSpan.FromHours(24) || upload.Gate.CurrentCount == 0) keep.Add(FilePath(upload.Hash, id));
            else pending.TryRemove(id, out _);
        }
        var root = Path.Combine(dataDirectory, "attachments"); var removed = 0;
        if (!Directory.Exists(root)) return removed;
        foreach (var directory in Directory.EnumerateDirectories(root))
        {
            var docHash = Path.GetFileName(directory);
            if (!System.Text.RegularExpressions.Regex.IsMatch(docHash, "^[a-f0-9]{64}$") || (File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0) continue;
            using var documentLease = documents.TryCollectionLease(docHash);
            if (documentLease == null) continue;
            foreach (var path in Directory.EnumerateFiles(directory))
            {
                if (keep.Contains(path) || keep.Contains(path.Replace(".part", "")) || File.GetLastWriteTimeUtc(path) >= cutoff) continue;
                var hash = Path.GetFileName(Path.GetDirectoryName(path)); var id = Path.GetFileNameWithoutExtension(path);
                using var tx = c.BeginTransaction();
                if (Convert.ToInt64(StorageService.Scalar(c, "SELECT COUNT(*) FROM attachment_refs WHERE docHash=$h AND attachmentId=$i", tx, ("$h", hash), ("$i", id))) > 0) continue;
                StorageService.Execute(c, "DELETE FROM attachments WHERE docHash=$h AND attachmentId=$i AND NOT EXISTS(SELECT 1 FROM attachment_refs WHERE docHash=$h AND attachmentId=$i)", tx, ("$h", hash), ("$i", id)); tx.Commit();
                File.Delete(path); removed++;
            }
        }
        return removed;
    });
}
