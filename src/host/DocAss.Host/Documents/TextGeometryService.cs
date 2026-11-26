using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using DocAss.Host.Contracts;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Tokens;

namespace DocAss.Host.Documents;

public sealed record NativePageResult(string DocId, string JobId, string ContentRevision, int PageGeneration, string Status, PageInfo PageInfo, Glyph[] Glyphs, string ProfileFingerprint, string? Reason)
{
    public NativeSpace[] Spaces {get;init;}=[];
}
public sealed class TextGeometryService(DocumentService files)
{
    internal sealed class GeometryLog:UglyToad.PdfPig.Logging.ILog
    {
        public bool Unreliable {get;private set;}
        public void Debug(string message){} public void Debug(string message,Exception ex){}
        public void Warn(string message){if(!message.StartsWith("User space unit"))Unreliable=true;}
        public void Error(string message)=>Unreliable=true;
        public void Error(string message,Exception ex)=>Unreliable=true;
    }
    public static readonly string Profile = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes("PdfPig-0.1.16/raw-user-space/v1")));
    private readonly SemaphoreSlim workers = new(2, 2);
    private readonly ConcurrentDictionary<(string Doc, string Job), CancellationTokenSource> jobs = new();
    private readonly Dictionary<(string Doc, int Page), (NativePageResult Value, int Bytes)> cache = new();
    private readonly LinkedList<(string Doc, int Page)> order = new();
    private readonly object gate = new();
    private int cacheBytes;
    public int CacheBytes { get { lock (gate) return cacheBytes; } }
    public void Cancel(string docId, string jobId) { files.Resolve(docId); Contract.Check("Id", Json.Element(jobId)); if (jobs.TryGetValue((docId, jobId), out var job)) job.Cancel(); }
    public void Forget(string docId)
    {
        foreach (var job in jobs.Where(p => p.Key.Doc == docId)) job.Value.Cancel();
        lock (gate) foreach (var key in cache.Keys.Where(k => k.Doc == docId).ToArray()) { cacheBytes -= cache[key].Bytes; cache.Remove(key); order.Remove(key); }
    }
    public async Task<NativePageResult> ExtractAsync(string docId, int page, string jobId, CancellationToken token = default)
    {
        var doc = files.Resolve(docId); Contract.Require(page >= 1 && page <= doc.PageCount); Contract.Check("Id", Json.Element(jobId));
        lock (gate) if (cache.TryGetValue((docId, page), out var saved)) { order.Remove((docId, page)); order.AddLast((docId, page)); return saved.Value with { JobId = jobId }; }
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, doc.Lifetime.Token); linked.CancelAfter(TimeSpan.FromSeconds(30));
        if (!jobs.TryAdd((docId, jobId), linked)) throw new AppException("BUSY", "重复的文字提取任务");
        try
        {
            await workers.WaitAsync(linked.Token);
            NativePageResult result;
            try
            {
                result = await Task.Run(() =>
                {
                    if (doc.Image != null) return new NativePageResult(docId, jobId, doc.Snapshot.Hash, 0, "unreliable", doc.Image.PageInfo, [], Profile, "此页需要 OCR");
                    var log=new GeometryLog();
                    using var pdf = PdfDocument.Open(doc.Snapshot.Path, new ParsingOptions { Password = doc.Password ?? "",Logger=log });
                    linked.Token.ThrowIfCancellationRequested();
                    var extracted=ExtractPage(pdf.GetPage(page), docId, jobId, doc.Snapshot.Hash, linked.Token);
                    return log.Unreliable ? extracted with {Status="unreliable",Reason="字体或字符映射无法可靠解析，请使用页面图像或 OCR"} : extracted;
                }, linked.Token);
            }
            finally { workers.Release(); }
            linked.Token.ThrowIfCancellationRequested(); files.Resolve(docId);
            var bytes = Encoding.UTF8.GetByteCount(Json.String(result));
            if (bytes > 8 * 1024 * 1024) throw new AppException("TEXT_TOO_LARGE", "单页文字过大，请使用页面图像");
            lock (gate)
            {
                var key = (docId, page);
                if (cache.Remove(key, out var previous)) { cacheBytes -= previous.Bytes; order.Remove(key); }
                while (cacheBytes + bytes > 64 * 1024 * 1024 && order.First != null) { var oldest = order.First.Value; cacheBytes -= cache[oldest].Bytes; cache.Remove(oldest); order.RemoveFirst(); }
                cache[key] = (result, bytes); order.AddLast(key); cacheBytes += bytes;
            }
            return result;
        }
        catch (OperationCanceledException) { throw; }
        catch (AppException) { throw; }
        catch { throw new AppException("TEXT_UNRELIABLE", "原生文字提取失败，此页可使用页面图像或 OCR"); }
        finally { jobs.TryRemove((docId, jobId), out _); }
    }
    public static PageInfo Info(Page page)
    {
        var b = page.CropBox.Bounds;
        var unit = page.Dictionary.TryGet(NameToken.Create("UserUnit"), out var value) && value is NumericToken number ? number.Double : 1;
        var rotate = page.Rotation.Value;
        return new() { Page = page.Number, PageBox = [b.Left, b.Bottom, b.Right, b.Top], Rotate = rotate, UserUnit = unit, Width = (rotate % 180 == 0 ? b.Width : b.Height) * unit, Height = (rotate % 180 == 0 ? b.Height : b.Width) * unit };
    }
    // PdfPig 0.1.16 translates CropBox to the origin and applies clockwise Rotate,
    // but intentionally does not scale UserUnit. Undo that transform, retaining raw units.
    public static PdfPoint ToPage(PdfPoint point, PageInfo info)
    {
        var b = info.PageBox; var w = b[2] - b[0]; var h = b[3] - b[1];
        var (x, y) = info.Rotate switch { 90 => (w - point.Y, point.X), 180 => (w - point.X, h - point.Y), 270 => (point.Y, h - point.X), _ => (point.X, point.Y) };
        return new(x + b[0], y + b[1]);
    }
    public static double[] CanonicalQuad(IEnumerable<PdfPoint> points)
    {
        var p = points.ToArray(); var cx = p.Average(v => v.X); var cy = p.Average(v => v.Y);
        p = p.OrderBy(v => Math.Atan2(v.Y - cy, v.X - cx)).ToArray();
        var first = Enumerable.Range(0, 4).OrderBy(i => Math.Round(p[i].Y, 8)).ThenBy(i => p[i].X).First();
        return Enumerable.Range(0, 4).SelectMany(i => new[] { p[(first + i) % 4].X, p[(first + i) % 4].Y }).ToArray();
    }
    public static NativePageResult ExtractPage(Page page, string docId, string jobId, string hash, CancellationToken token = default)
    {
        var info = Info(page); Contract.Check("PageInfo", Json.Element(info));
        if (page.Letters.Count > 25000) throw new AppException("TEXT_TOO_LARGE", "单页超过 25000 字形，已停止精确提取");
        var glyphs = new List<Glyph>();var spaces=new List<NativeSpace>(); var unreliable = false;
        for (var i = 0; i < page.Letters.Count; i++)
        {
            token.ThrowIfCancellationRequested(); var letter = page.Letters[i];
            if (letter.Value.Length > 256 || letter.Value.Contains('\ufffd') || letter.Value.Contains('\0')) { unreliable = true; continue; }
            if (string.IsNullOrWhiteSpace(letter.Value))
            {
                if(letter.Value.Length>0){var a=ToPage(letter.StartBaseLine,info);var b=ToPage(letter.EndBaseLine,info);spaces.Add(new(){Text=letter.Value,Baseline=[a.X,a.Y,b.X,b.Y]});}continue;
            }
            var box = letter.BoundingBox;
            var quad = CanonicalQuad(new[] { box.BottomLeft, box.BottomRight, box.TopRight, box.TopLeft }.Select(p => ToPage(p, info)));
            var start = ToPage(letter.StartBaseLine, info); var end = ToPage(letter.EndBaseLine, info);
            var advance=Math.Sqrt(Math.Pow(end.X-start.X,2)+Math.Pow(end.Y-start.Y,2));
            if(advance>.01){var dx=(end.X-start.X)/advance;var dy=(end.Y-start.Y)/advance;var projections=Enumerable.Range(0,4).Select(n=>quad[n*2]*dx+quad[n*2+1]*dy).ToArray();if(projections.Max()-projections.Min()>advance*4)unreliable=true;}
            var idBytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{hash}:{page.Number}:{i}"));
            var glyph = new Glyph { Id = new Guid(idBytes.AsSpan(0, 16)).ToString(), Text = letter.Value, Quad = quad, Baseline = [start.X, start.Y, end.X, end.Y], Source = "native" };
            try { Contract.Check("Glyph", Json.Element(glyph)); glyphs.Add(glyph); }
            catch (AppException) { unreliable = true; }
        }
        return new(docId, jobId, hash, 0, unreliable || glyphs.Count == 0 ? "unreliable" : "ready", info, glyphs.ToArray(), Profile, unreliable ? "部分字形无法可靠映射，请使用页面图像或 OCR" : glyphs.Count == 0 ? "此页没有原生文字" : null){Spaces=spaces.ToArray()};
    }
}
