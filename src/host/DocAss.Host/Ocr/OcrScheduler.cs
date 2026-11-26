using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using DocAss.Host.Settings;
using DocAss.Host.Storage;
namespace DocAss.Host.Ocr;

public sealed class OcrScheduler(DocumentService files, TextGeometryService geometry, SettingsService settings, StorageService storage, string directory, OcrEngine? suppliedEngine = null) : IOcrScheduler
{
    private sealed class Work(OcrTicket ticket, OcrRaster raster, int priority, long order, string? image)
    {
        public OcrTicket Ticket = ticket; public OcrRaster Raster = raster; public int Priority = priority; public long Order = order;
        public string? Image = image, Error; public byte[]? Encoded; public string Phase = "awaitingRaster"; public bool Running; public OcrResult? Result;
        public readonly HashSet<string> Subscribers = [];
    }
    public static readonly OcrSettings Defaults = new() { ModelTier = "Small", Backend = "Auto", CacheMiB = 512 };
    private readonly object gate = new(); private readonly Dictionary<string, Work> jobs = []; private readonly Dictionary<string, Work> subscriptions = [];
    private readonly Dictionary<(string, int), (long Generation, string Profile)> generations = [];
    private readonly ConcurrentDictionary<string, Lazy<string>> modelHashes = new();
    private readonly OcrCache cache = new(Path.Combine(directory, "ocr-cache")); private readonly OcrEngine engine = suppliedEngine ?? new();
    private Task? worker; private bool stopping; private long order; private int served; private long budget = 512L * 1024 * 1024;
    public event Action<OcrStatus>? Changed;
    public int InferenceCount => engine.Runs;
    internal object Diagnostics { get { lock (gate) return jobs.Values.Select(w => new { w.Ticket.Page, w.Phase, w.Error, w.Running }).ToArray(); } }
    public async Task<OcrTicket> StartAsync(OcrStart request, CancellationToken token = default)
    {
        Contract.Check("OcrStart", Json.Element(request)); var doc = files.Resolve(request.DocId); Contract.Require(request.Page <= doc.PageCount);
        PageInfo actual; try { actual = (await geometry.ExtractAsync(request.DocId, (int)request.Page, Guid.NewGuid().ToString(), token)).PageInfo; }
        catch (AppException) { actual = await Task.Run(() => { if (doc.Image != null) return doc.Image.PageInfo; using var pdf = UglyToad.PdfPig.PdfDocument.Open(doc.Snapshot.Path, new UglyToad.PdfPig.ParsingOptions { Password = doc.Password ?? "" }); return TextGeometryService.Info(pdf.GetPage((int)request.Page)); }, token); }
        OcrRasterizer.Validate(request.Raster, actual, doc.Snapshot.Kind);
        if (doc.Image != null) Contract.Require(request.Raster.Width <= doc.Image.PixelWidth && request.Raster.Height <= doc.Image.PixelHeight);
        var saved = await settings.GetAsync(); var options = saved.TryGetProperty("ocr", out var ocr) ? ocr.Deserialize<OcrSettings>(Json.Options)! : Defaults;
        string modelHash; try { modelHash = await Task.Run(() => modelHashes.GetOrAdd(options.ModelTier, t => new Lazy<string>(() => OcrEngine.ModelHash(t))).Value, token); } catch (Exception e) when (e is FileNotFoundException or FileLoadException or BadImageFormatException) { throw new AppException("OCR_MODEL_MISSING", "OCR 模型资源缺失或损坏，请重新安装完整模型包"); }
        var profile = new OcrProfile { ModelTier = options.ModelTier, Backend = options.Backend, EngineVersion = "SimdPaddleOCR-2.0.0", ModelHash = modelHash, Preprocessing = "white-bgra32-ctc-v1", Fingerprint = "" };
        profile = profile with { Fingerprint = Json.Hash(Json.Element(new { docHash = doc.Snapshot.Hash, page = request.Page, raster = request.Raster, profile, geometry = 1, schema = 1 })) };
        var cached = request.Force ? null : await Task.Run(() => cache.Read(profile.Fingerprint), token); token.ThrowIfCancellationRequested(); files.Resolve(request.DocId);
        lock (gate)
        {
            if (stopping || doc.Lifetime.IsCancellationRequested) throw new AppException("BUSY", "OCR 正在关闭"); budget = options.CacheMiB * 1024 * 1024;
            var key = (doc.Snapshot.Hash, (int)request.Page); generations.TryGetValue(key, out var current);
            if (request.Force || current.Profile != profile.Fingerprint) { current = (current.Generation + 1, profile.Fingerprint); generations[key] = current; foreach (var old in jobs.Values.Where(j => j.Ticket.ContentRevision == key.Hash && j.Ticket.Page == request.Page)) Cancel(old); }
            var existing = jobs.Values.FirstOrDefault(j => j.Ticket.DocId == request.DocId && j.Ticket.Page == request.Page && j.Ticket.PageGeneration == current.Generation && j.Phase is not ("failed" or "cancelled"));
            var subscription = Guid.NewGuid().ToString();
            if (existing != null) { existing.Priority = Math.Min(existing.Priority, (int)request.Priority); existing.Subscribers.Add(subscription); subscriptions[subscription] = existing; return existing.Ticket with { SubscriptionId = subscription, NeedsRaster = existing.Phase == "awaitingRaster" }; }
            foreach (var old in jobs.Values.Where(j => !j.Running && j.Subscribers.Count == 0).ToArray()) jobs.Remove(old.Ticket.JobId);
            if (jobs.Count >= 512) throw new AppException("BUSY", "OCR 待处理任务过多，请稍后重试");
            var ticket = new OcrTicket { DocId = request.DocId, JobId = Guid.NewGuid().ToString(), SubscriptionId = subscription, Page = request.Page, PageGeneration = current.Generation, ContentRevision = doc.Snapshot.Hash, Profile = profile, NeedsRaster = cached == null && doc.Image == null };
            var work = new Work(ticket, request.Raster, (int)request.Priority, order++, doc.Image != null ? doc.Snapshot.Path + ".png" : null); work.Subscribers.Add(subscription); subscriptions[subscription] = work; jobs[ticket.JobId] = work;
            if (cached != null) { work.Result = cached with { DocId = ticket.DocId, JobId = ticket.JobId, PageGeneration = ticket.PageGeneration }; work.Phase = "completed"; }
            else if (doc.Image != null) work.Phase = "queued";
            StartWorker(); return ticket;
        }
    }
    public void Upload(string docId, string jobId, byte[] bytes)
    {
        files.Resolve(docId); lock (gate) { var work = Resolve(docId, jobId); if (work.Phase != "awaitingRaster") return; Contract.Require(bytes.Length <= OcrRasterizer.MaxEncoded); if (jobs.Values.Sum(j => (long)(j.Encoded?.Length ?? 0)) + bytes.Length > 64 * 1024 * 1024) throw new AppException("BUSY", "OCR 上传队列达到内存上限"); work.Encoded = bytes; work.Phase = "queued"; Publish(work); StartWorker(); }
    }
    private Work Resolve(string docId, string id) { if (!jobs.TryGetValue(id, out var w) || w.Ticket.DocId != docId) throw new AppException("OCR_JOB_MISSING", "OCR 任务不存在"); return w; }
    public OcrStatus Status(string docId, string jobId, string subscriptionId)
    {
        files.Resolve(docId); lock (gate) { var w = Resolve(docId, jobId); return State(w, subscriptionId); }
    }
    private OcrStatus State(Work w, string sub) => new() { DocId = w.Ticket.DocId, JobId = w.Ticket.JobId, SubscriptionId = sub, Page = w.Ticket.Page, ContentRevision = w.Ticket.ContentRevision, PageGeneration = w.Ticket.PageGeneration, Profile = w.Ticket.Profile, NeedsRaster = w.Phase == "awaitingRaster", Phase = w.Subscribers.Contains(sub) ? w.Phase : "cancelled", NativeRunning = w.Running, Error = w.Error, CompletedPages = w.Phase == "completed" ? 1 : 0, TotalPages = 1 };
    public OcrResult Result(string docId, string jobId, string subscriptionId)
    {
        files.Resolve(docId); lock (gate) { var w = Resolve(docId, jobId); if (!Current(w) || !w.Subscribers.Contains(subscriptionId) || w.Result == null) throw new AppException("OCR_NOT_READY", "OCR 结果未就绪或已失效"); return w.Result; }
    }
    public void Unsubscribe(string docId, string subscriptionId)
    {
        lock (gate) { if (!subscriptions.TryGetValue(subscriptionId, out var w) || w.Ticket.DocId != docId) return; subscriptions.Remove(subscriptionId); w.Subscribers.Remove(subscriptionId); if (w.Subscribers.Count == 0) { if (w.Phase != "completed") Cancel(w); else { w.Result = null; jobs.Remove(w.Ticket.JobId); } } Changed?.Invoke(State(w, subscriptionId)); }
    }
    public void Forget(string docId) { lock (gate) foreach (var w in jobs.Values.Where(w => w.Ticket.DocId == docId).ToArray()) { foreach (var sub in w.Subscribers.ToArray()) Unsubscribe(docId, sub); } }
    private void Cancel(Work w) { w.Phase = "cancelled"; w.Encoded = null; w.Result = null; Publish(w); }
    private bool Current(Work w) => !stopping && w.Subscribers.Count > 0 && generations.GetValueOrDefault((w.Ticket.ContentRevision, (int)w.Ticket.Page)).Generation == w.Ticket.PageGeneration && w.Phase != "cancelled";
    private void Publish(Work w) { foreach (var sub in w.Subscribers) Changed?.Invoke(State(w, sub)); }
    private void StartWorker() { if (worker != null || stopping) return; worker = Task.Run(Drain); }
    private void Drain()
    {
        while (true)
        {
            Work w; lock (gate) { var queued = jobs.Values.Where(j => j.Phase == "queued" && Current(j)); var next = ++served % 5 == 0 ? queued.OrderBy(j => j.Order).FirstOrDefault() : queued.OrderBy(j => j.Priority).ThenBy(j => j.Order).FirstOrDefault(); if (next == null) { worker = null; return; } w = next; w.Phase = "running"; w.Running = true; Publish(w); }
            try
            {
                var clock = Stopwatch.StartNew(); var pixels = w.Image != null ? OcrRasterizer.DecodeImage(w.Image, w.Raster) : OcrRasterizer.Decode(w.Encoded!, w.Raster); w.Encoded = null;
                lock (gate) if (!Current(w)) continue;
                var recognized = engine.Run(pixels, w.Ticket.Profile, w.Raster.RasterToPage);
                var result = new OcrResult { DocId = w.Ticket.DocId, JobId = w.Ticket.JobId, ContentRevision = w.Ticket.ContentRevision, PageGeneration = w.Ticket.PageGeneration, Profile = w.Ticket.Profile, Raster = w.Raster, Lines = recognized.Lines, Empty = recognized.Lines.All(l => string.IsNullOrWhiteSpace(l.Text)), Device = recognized.Device, Fallback = recognized.Fallback, Cached = false, ElapsedMs = clock.Elapsed.TotalMilliseconds };
                lock (gate) if (!Current(w)) continue;
                cache.Write(result);
                lock (gate) { if (!Current(w)) continue; w.Result = result; w.Phase = "completed"; Collect(budget); }
            }
            catch (Exception e) { lock (gate) if (Current(w)) { w.Error = (e is AppException ? e.Message : $"OCR 失败：{e.GetType().Name}；请检查模型包或切换 CPU 后重试"); w.Phase = "failed"; } }
            finally { lock (gate) { w.Running = false; w.Encoded = null; Publish(w); } }
        }
    }
    public Task<string> GetOverrideAsync(string docId, int page) { var doc = files.Resolve(docId); Contract.Require(page > 0 && page <= doc.PageCount); return storage.Enqueue(() => { using var c = storage.OpenRead(); return StorageService.Scalar(c, "SELECT mode FROM ocr_overrides WHERE docHash=$h AND page=$p", null, ("$h", doc.Snapshot.Hash), ("$p", page)) as string ?? "auto"; }); }
    public async Task SetOverrideAsync(string docId, int page, string mode)
    {
        var doc = files.Resolve(docId); Contract.Require(page > 0 && page <= doc.PageCount && mode is "auto" or "native" or "ocr" or "hybrid");
        await storage.Enqueue(() => { using var c = storage.OpenWrite(); StorageService.Execute(c, "INSERT INTO ocr_overrides(docHash,page,mode) VALUES($h,$p,$m) ON CONFLICT(docHash,page) DO UPDATE SET mode=$m", null, ("$h", doc.Snapshot.Hash), ("$p", page), ("$m", mode)); storage.MarkDirty(); return true; });
        lock (gate) { var key = (doc.Snapshot.Hash, page); var old = generations.GetValueOrDefault(key); generations[key] = (old.Generation + 1, old.Profile); foreach (var w in jobs.Values.Where(j => j.Ticket.ContentRevision == doc.Snapshot.Hash && j.Ticket.Page == page)) Cancel(w); }
    }
    private long Collect(long limit) { var protectedJobs = jobs.Values.Where(j => j.Subscribers.Count > 0 || j.Running).ToArray(); var removed = cache.Collect(Math.Max(0, limit - files.SnapshotBytes), protectedJobs.Select(j => j.Ticket.Profile.Fingerprint).ToHashSet()); return removed + files.CollectSnapshots(Math.Max(0, limit - cache.Bytes), protectedJobs.Select(j => j.Ticket.ContentRevision).ToHashSet()); }
    public long ClearCache() { lock (gate) return Collect(0); }
    public async ValueTask DisposeAsync() { Task? running; lock (gate) { stopping = true; foreach (var w in jobs.Values) Cancel(w); running = worker; } if (running != null) await running; engine.Dispose(); }
}
