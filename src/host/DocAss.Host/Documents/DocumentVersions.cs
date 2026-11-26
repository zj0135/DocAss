using System.Security.Cryptography;
using DocAss.Host.Contracts;
using DocAss.Host.Storage;
using UglyToad.PdfPig;

namespace DocAss.Host.Documents;

public sealed partial class DocumentService
{
    private readonly Dictionary<string, (long Length, DateTime Modified, bool Changed)> observations = new();
    private Task<string?> MigrationCandidateAsync(SourceSnapshot snapshot) => storage.Enqueue(() =>
    {
        using var c = storage.OpenRead(); return StorageService.Scalar(c, "SELECT s.docHash FROM source_paths s LEFT JOIN recent_items r ON r.docHash=s.docHash WHERE s.path=$p AND s.docHash<>$h AND EXISTS(SELECT 1 FROM annotations a WHERE a.docHash=s.docHash) AND NOT EXISTS(SELECT 1 FROM migration_decisions m WHERE m.oldHash=s.docHash AND m.newHash=$h) ORDER BY r.openedAt DESC LIMIT 1", null, ("$p", snapshot.SourcePath), ("$h", snapshot.Hash)) as string;
    });
    public async Task<object> CheckSourceAsync(string id, CancellationToken token)
    {
        var doc = Resolve(id); var info = new FileInfo(doc.Snapshot.SourcePath); if (!info.Exists) return new { changed = false, missing = true };
        var length = info.Length; var modified = info.LastWriteTimeUtc;
        lock (observations) if (observations.TryGetValue(id, out var previous) && previous.Length == length && previous.Modified == modified) return new { changed = previous.Changed, missing = false };
        await using var input = new FileStream(info.FullName, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.Asynchronous | FileOptions.SequentialScan);
        var hash = Convert.ToHexStringLower(await SHA256.HashDataAsync(input, token)); var changed = hash != doc.Snapshot.Hash;
        lock (observations) observations[id] = (length, modified, changed); return new { changed, missing = false };
    }
    public Task<OpenResult> OpenVersionAsync(string id, CancellationToken token) => OpenAsync(Resolve(id).Snapshot.SourcePath, token);
    public async Task<object> MigrationInfoAsync(string id, string oldHash, CancellationToken token)
    {
        var doc = Resolve(id); Contract.Check("Hash", Json.Element(oldHash));
        var decision = await storage.Enqueue(() => { using var c = storage.OpenRead(); Contract.Require(StorageService.Scalar(c, "SELECT 1 FROM source_paths a JOIN source_paths b ON a.path=b.path WHERE a.docHash=$o AND b.docHash=$n", null, ("$o", oldHash), ("$n", doc.Snapshot.Hash)) != null, "版本不属于同一源文件"); return StorageService.Scalar(c, "SELECT decision FROM migration_decisions WHERE oldHash=$o AND newHash=$n", null, ("$o", oldHash), ("$n", doc.Snapshot.Hash)) as string; });
        var annotations = await storage.ReadEntitiesAsync(oldHash, "annotations"); var pages = new List<PageInfo>();
        var old = opened.Values.FirstOrDefault(d => d.Snapshot.Hash == oldHash); var path = Path.Combine(snapshots, oldHash);
        if (File.Exists(path)) await Task.Run(() =>
        {
            try
            {
                if (old?.Image != null) { pages.Add(old.Image.PageInfo); return; }
                using var input = File.OpenRead(path); Span<byte> magic = stackalloc byte[5]; input.ReadExactly(magic);
                if (!magic.SequenceEqual("%PDF-"u8)) { var image = ImageDecoder.Normalize(path, path + ".png", token); pages.Add(image.PageInfo); return; }
                using var pdf = PdfDocument.Open(path, new ParsingOptions { Password = old?.Password ?? "" });
                foreach (var number in annotations.Select(a => a.GetProperty("page").GetInt32()).Distinct()) { token.ThrowIfCancellationRequested(); if (number <= pdf.NumberOfPages) pages.Add(TextGeometryService.Info(pdf.GetPage(number))); }
            }
            catch (OperationCanceledException) { throw; }
            catch { /* Missing old geometry remains unconfirmed. */ }
        }, token);
        return new { annotations, pages, decision };
    }
}
