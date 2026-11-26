using System.Diagnostics;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Ocr;
using DocAss.Host.Documents;
using DocAss.Host.Settings;
using DocAss.Host.Verification;
using Xunit;
namespace DocAss.Host.Tests;

public sealed class OcrTests
{
    private static readonly string Samples=Path.Combine(ReadingTests.Root,"artifacts","ocr-samples");
    private static readonly Lazy<bool> Generated=new(()=>{OcrSamples.Create(Samples);return true;});
    private static OcrRaster Raster()=>new(){Kind="pdf",PageInfo=new(){Page=1,PageBox=[0,0,595.08,842.04],Width=595.08,Height=842.04,Rotate=0,UserUnit=1},Width=1653,Height=2339,Dpi=200,RasterToPage=[.36,0,0,-.36,0,842.04]};
    private static OcrProfile Profile(string tier="Small",string backend="Cpu")=>new(){Fingerprint=new string('a',64),ModelHash=OcrEngine.ModelHash(tier),ModelTier=tier,Backend=backend,EngineVersion="2.0.0",Preprocessing="v1"};
    [Fact] public void RealCpuModelsRecognizeAndReleasePreviousTier()
    {
        _=Generated.Value;var pixels=OcrRasterizer.Decode(File.ReadAllBytes(Path.Combine(Samples,"ocr-english.png")),Raster());using var engine=new OcrEngine();var results=new List<object>();
        foreach(var tier in new[]{"Tiny","Small","Medium"}){var clock=Stopwatch.StartNew();var result=engine.Run(pixels,Profile(tier),Raster().RasterToPage);var text=string.Join('\n',result.Lines.Select(l=>l.Text));Assert.Contains("Document assistant",text);Assert.All(result.Lines.SelectMany(l=>l.Glyphs),g=>Contract.Check("Glyph",Json.Element(g)));results.Add(new{tier,text,milliseconds=clock.Elapsed.TotalMilliseconds,characters=result.Lines.Sum(l=>l.Glyphs.Length)});}
        Assert.Equal(3,engine.Loads);Assert.Equal(2,engine.Disposals);File.WriteAllText(Path.Combine(Samples,"models.json"),Json.String(results));
    }
    private sealed class Session(Func<OcrLine[]> run,Action? dispose=null):IOcrSession {public OcrLine[] Run(OcrPixels _,double[] m,string identity)=>run();public void Dispose()=>dispose?.Invoke();}
    [Fact] public void AutoFailureDisposesAndRetriesCpuOnceWhileCpuFailureDoesNotLoop()
    {
        var attempts=new List<string>();var disposed=0;using var engine=new OcrEngine((tier,backend)=>{attempts.Add(backend);return new Session(()=>backend=="Auto"?throw new InvalidOperationException("gpu"):[],()=>disposed++);});
        var result=engine.Run(new([],1,1,4),Profile(backend:"Auto"),Raster().RasterToPage);Assert.True(result.Fallback);Assert.Equal(new[]{"Auto","Cpu"},attempts);Assert.Equal(1,disposed);engine.Run(new([],1,1,4),Profile(backend:"Auto"),Raster().RasterToPage);Assert.Equal(2,attempts.Count);
        var calls=0;using var broken=new OcrEngine((_,_)=>{calls++;throw new IOException("missing model");});Assert.Throws<IOException>(()=>broken.Run(new([],1,1,4),Profile(backend:"Auto"),Raster().RasterToPage));Assert.Equal(2,calls);
        calls=0;Assert.Throws<IOException>(()=>broken.Run(new([],1,1,4),Profile(),Raster().RasterToPage));Assert.Equal(1,calls);
    }
    [Fact] public void RejectsOversizedPngAndForgedDimensionsOrMatricesBeforeDecode()
    {
        _=Generated.Value;var bytes=File.ReadAllBytes(Path.Combine(Samples,"ocr-english.png"));Assert.Throws<AppException>(()=>OcrRasterizer.Decode(bytes,Raster() with{Width=1}));var forged=bytes.ToArray();System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(forged.AsSpan(16),int.MaxValue);Assert.Throws<AppException>(()=>OcrRasterizer.Decode(forged,Raster()));Assert.Throws<AppException>(()=>OcrRasterizer.Validate(Raster() with{RasterToPage=[1,0,0,1,0,0]},Raster().PageInfo,"pdf"));OcrRasterizer.Validate(Raster(),Raster().PageInfo,"pdf");
    }
    private static async Task<OcrStatus> Until(OcrScheduler scheduler,OcrTicket ticket,string phase){for(var i=0;i<1000;i++){var value=scheduler.Status(ticket.DocId,ticket.JobId,ticket.SubscriptionId);if(value.Phase==phase)return value;if(value.Phase=="failed")throw new Exception(value.Error);await Task.Delay(10);}throw new TimeoutException(phase);}
    [Fact] public async Task ThreeSubscriptionsOneInferenceCancellationAndSameProfileGeneration()
    {
        _=Generated.Value;await using var w=new Workspace();await w.Initialize();using var files=new DocumentService(w.Directory,w.Documents,w.Storage);var handle=(await files.OpenAsync(Path.Combine(Samples,"ocr-english.png")) ).Handle!;var info=files.Info(handle.DocId).Image!;
        var raster=new OcrRaster{Kind="image",PageInfo=info.PageInfo,Width=info.PixelWidth,Height=info.PixelHeight,Dpi=info.DpiX,RasterToPage=[info.PageInfo.Width/info.PixelWidth,0,0,-info.PageInfo.Height/info.PixelHeight,0,info.PageInfo.Height]};
        using var entered=new ManualResetEventSlim();using var release=new ManualResetEventSlim();var engine=new OcrEngine((_,_)=>new Session(()=>{entered.Set();if(!release.Wait(10000))throw new TimeoutException();return [];}));
        await using var scheduler=new OcrScheduler(files,new(files),new(w.Storage),w.Storage,w.Directory,engine);var request=new OcrStart{DocId=handle.DocId,Page=1,Raster=raster,Priority=3,Force=false};
        var a=await scheduler.StartAsync(request);var b=await scheduler.StartAsync(request);var c=await scheduler.StartAsync(request);Assert.Equal(a.JobId,b.JobId);Assert.Equal(a.JobId,c.JobId);Assert.NotEqual(a.SubscriptionId,b.SubscriptionId);Assert.True(entered.Wait(3000));scheduler.Unsubscribe(a.DocId,a.SubscriptionId);Assert.Equal("cancelled",scheduler.Status(a.DocId,a.JobId,a.SubscriptionId).Phase);Assert.True(scheduler.Status(b.DocId,b.JobId,b.SubscriptionId).NativeRunning);
        release.Set();await Until(scheduler,b,"completed");Assert.Equal(1,scheduler.InferenceCount);Assert.True(scheduler.Result(c.DocId,c.JobId,c.SubscriptionId).Empty);
        var newer=await scheduler.StartAsync(request with{Force=true});Assert.True(newer.PageGeneration>a.PageGeneration);Assert.Throws<AppException>(()=>scheduler.Result(b.DocId,b.JobId,b.SubscriptionId));await Until(scheduler,newer,"completed");Assert.Equal(2,scheduler.InferenceCount);
        scheduler.Unsubscribe(newer.DocId,newer.SubscriptionId);var hit=await scheduler.StartAsync(request);await Until(scheduler,hit,"completed");Assert.True(scheduler.Result(hit.DocId,hit.JobId,hit.SubscriptionId).Cached);Assert.Equal(2,scheduler.InferenceCount);
    }
    [Fact] public void CacheChecksIntegrityAndProtectsPendingConsumers()
    {
        var root=Path.Combine(Path.GetTempPath(),"docass-ocr-"+Guid.NewGuid());try{var cache=new OcrCache(root);var value=new OcrResult{DocId=Guid.NewGuid().ToString(),JobId=Guid.NewGuid().ToString(),ContentRevision=new string('b',64),PageGeneration=1,Profile=Profile(),Raster=Raster(),Lines=[],Empty=true,Device="CPU",Fallback=false,Cached=false,ElapsedMs=1};cache.Write(value);Assert.NotNull(cache.Read(value.Profile.Fingerprint));Assert.Equal(0,cache.Collect(0,new HashSet<string>{value.Profile.Fingerprint}));File.WriteAllText(Path.Combine(root,value.Profile.Fingerprint+".json"),"{}");Assert.Null(cache.Read(value.Profile.Fingerprint));Assert.True(cache.Collect(0,new HashSet<string>())>0);}finally{if(Directory.Exists(root))Directory.Delete(root,true);}
    }
    [Fact] public void SmallCpuLanguageQualityUsesIndependentSourceText()
    {
        _=Generated.Value;using var engine=new OcrEngine();var report=new List<object>();
        foreach(var language in new[]{"english","chinese"}){var pixels=OcrRasterizer.Decode(File.ReadAllBytes(Path.Combine(Samples,"ocr-"+language+".png")),Raster());var result=engine.Run(pixels,Profile(),Raster().RasterToPage);var expected=Clean(File.ReadAllText(Path.Combine(Samples,"ocr-"+language+"-truth.txt")));var actual=Clean(string.Join("\n",result.Lines.Select(l=>l.Text)));var distance=Distance(expected,actual);var cer=(double)distance/expected.Length;report.Add(new{language,characters=expected.Length,distance,cer,text=actual});Assert.True(cer<=(language=="english"?.01:.02),$"{language}: CER {cer:P2}");}
        File.WriteAllText(Path.Combine(Samples,"quality.json"),Json.String(report));
        static string Clean(string s)=>string.Concat(s.Where(c=>!char.IsWhiteSpace(c)));
        static int Distance(string a,string b){var previous=Enumerable.Range(0,b.Length+1).ToArray();for(var i=0;i<a.Length;i++){var next=new int[b.Length+1];next[0]=i+1;for(var j=0;j<b.Length;j++)next[j+1]=Math.Min(previous[j]+(a[i]==b[j]?0:1),Math.Min(previous[j+1],next[j])+1);previous=next;}return previous[^1];}
    }
    [Fact] public async Task QueuedCancellationNeverRunsAndOldGenerationCannotPublish()
    {
        _=Generated.Value;await using var w=new Workspace();await w.Initialize();using var files=new DocumentService(w.Directory,w.Documents,w.Storage);
        var a=(await files.OpenAsync(Path.Combine(Samples,"ocr-english.png"))).Handle!;var b=(await files.OpenAsync(Path.Combine(Samples,"ocr-chinese.png"))).Handle!;
        using var entered=new ManualResetEventSlim();using var release=new ManualResetEventSlim();var runs=0;var engine=new OcrEngine((_,_)=>new Session(()=>{if(Interlocked.Increment(ref runs)==1){entered.Set();if(!release.Wait(10000))throw new TimeoutException();}return [];}));await using var scheduler=new OcrScheduler(files,new(files),new(w.Storage),w.Storage,w.Directory,engine);
        OcrStart Request(DocHandle handle){var info=files.Info(handle.DocId).Image!;return new(){DocId=handle.DocId,Page=1,Priority=3,Force=false,Raster=new(){PageInfo=info.PageInfo,Width=info.PixelWidth,Height=info.PixelHeight,Dpi=info.DpiX,Kind="image",RasterToPage=[info.PageInfo.Width/info.PixelWidth,0,0,-info.PageInfo.Height/info.PixelHeight,0,info.PageInfo.Height]}};}
        var first=await scheduler.StartAsync(Request(a));Assert.True(entered.Wait(3000));var queued=await scheduler.StartAsync(Request(b));Assert.Equal("queued",scheduler.Status(b.DocId,queued.JobId,queued.SubscriptionId).Phase);scheduler.Unsubscribe(b.DocId,queued.SubscriptionId);
        var newest=await scheduler.StartAsync(Request(a) with{Force=true,Priority=0});Assert.True(newest.PageGeneration>first.PageGeneration);release.Set();await Until(scheduler,newest,"completed");Assert.Equal(2,runs);Assert.Throws<AppException>(()=>scheduler.Result(a.DocId,first.JobId,first.SubscriptionId));Assert.Throws<AppException>(()=>scheduler.Status(b.DocId,queued.JobId,queued.SubscriptionId));
        await scheduler.SetOverrideAsync(a.DocId,1,"native");Assert.Equal("native",await scheduler.GetOverrideAsync(a.DocId,1));scheduler.Forget(a.DocId);files.Close(a.DocId);var again=(await files.OpenAsync(Path.Combine(Samples,"ocr-english.png"))).Handle!;Assert.Equal("native",await scheduler.GetOverrideAsync(again.DocId,1));
        var protectedFile=files.Resolve(again.DocId).Snapshot.Path;scheduler.ClearCache();Assert.True(File.Exists(protectedFile));
    }
    [Fact] public void RealAutoBackendAndModelResourceHashesAreObservable()
    {
        _=Generated.Value;using var engine=new OcrEngine();var hashes=new[]{"Tiny","Small","Medium"}.Select(OcrEngine.ModelHash).ToArray();Assert.Equal(3,hashes.Distinct().Count());Assert.DoesNotContain(Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData([])),hashes);
        var output=engine.Run(OcrRasterizer.Decode(File.ReadAllBytes(Path.Combine(Samples,"ocr-chinese.png")),Raster()),Profile("Tiny","Auto"),Raster().RasterToPage);Assert.Contains(output.Lines,l=>l.Text.Contains("中文"));File.WriteAllText(Path.Combine(Samples,"auto-device.json"),Json.String(new{output.Device,output.Fallback,loads=engine.Loads,runs=engine.Runs,modelHashes=hashes}));
    }
    [Fact] public async Task NormalizedImageUsesRealEngineAndModelChangesInvalidateCachedProfile()
    {
        _=Generated.Value;await using var w=new Workspace();await w.Initialize();using var files=new DocumentService(w.Directory,w.Documents,w.Storage);var settings=new SettingsService(w.Storage);
        async Task Configure(string tier){var current=(await settings.GetAsync()).EnumerateObject().ToDictionary(p=>p.Name,p=>p.Value);current["ocr"]=Json.Element(new{modelTier=tier,backend="Cpu",cacheMiB=512});await settings.UpdateAsync(Json.Element(current));}
        await Configure("Small");var handle=(await files.OpenAsync(Path.Combine(Samples,"ocr-english.png"))).Handle!;var image=files.Info(handle.DocId).Image!;
        var raster=new OcrRaster{Kind="image",PageInfo=image.PageInfo,Width=image.PixelWidth,Height=image.PixelHeight,Dpi=image.DpiX,RasterToPage=[image.PageInfo.Width/image.PixelWidth,0,0,-image.PageInfo.Height/image.PixelHeight,0,image.PageInfo.Height]};
        await using var scheduler=new OcrScheduler(files,new(files),settings,w.Storage,w.Directory);var request=new OcrStart{DocId=handle.DocId,Page=1,Priority=1,Force=false,Raster=raster};
        var first=await scheduler.StartAsync(request);Assert.False(first.NeedsRaster);await Until(scheduler,first,"completed");var value=scheduler.Result(handle.DocId,first.JobId,first.SubscriptionId);Assert.Contains(value.Lines,l=>l.Text.Contains("Document assistant"));Assert.Equal(raster.RasterToPage,value.Raster.RasterToPage);scheduler.Unsubscribe(handle.DocId,first.SubscriptionId);
        var cached=await scheduler.StartAsync(request);Assert.True(scheduler.Result(handle.DocId,cached.JobId,cached.SubscriptionId).Cached);Assert.Equal(1,scheduler.InferenceCount);
        await Configure("Tiny");var changed=await scheduler.StartAsync(request);Assert.NotEqual(first.Profile.Fingerprint,changed.Profile.Fingerprint);Assert.True(changed.PageGeneration>first.PageGeneration);Assert.Throws<AppException>(()=>scheduler.Result(handle.DocId,cached.JobId,cached.SubscriptionId));await Until(scheduler,changed,"completed");Assert.False(scheduler.Result(handle.DocId,changed.JobId,changed.SubscriptionId).Cached);Assert.Equal(2,scheduler.InferenceCount);
    }
    [Fact] public void SyntheticTiltedAndVerticalGeometryUsesIndependentOutlineTruth()
    {
        _=Generated.Value;var truth=JsonSerializer.Deserialize<OcrTruthCorpus>(File.ReadAllText(Path.Combine(Samples,"ocr-synthetic-truth.json")),Json.Options)!;using var engine=new OcrEngine();var scores=new List<OcrGeometryScore>();
        foreach(var page in truth.Pages)
        {
            var raster=Raster() with{PageInfo=Raster().PageInfo with{Page=page.Page}};var pixels=OcrRasterizer.Decode(File.ReadAllBytes(Path.Combine(Samples,page.Image)),raster);var recognized=engine.Run(pixels,Profile(),raster.RasterToPage);
            var result=new OcrResult{DocId=Guid.NewGuid().ToString(),JobId=Guid.NewGuid().ToString(),ContentRevision=new string('b',64),PageGeneration=1,Profile=Profile(),Raster=raster,Lines=recognized.Lines,Empty=false,Device=recognized.Device,Fallback=recognized.Fallback,Cached=false,ElapsedMs=0};
            scores.Add(OcrGeometryAcceptance.Score(truth,page,result));File.WriteAllText(Path.Combine(Samples,page.Category+"-result.json"),Json.String(result));OcrGeometryAcceptance.Overlay(Samples,Path.Combine(Samples,page.Category+"-overlay.svg"),truth,page,result);
            var shifted=result with{Lines=result.Lines.Select(l=>l with{Glyphs=l.Glyphs.Select(g=>g with{Quad=g.Quad.Select((v,i)=>i%2==0?v+300:v).ToArray()}).ToArray()}).ToArray()};Assert.False(OcrGeometryAcceptance.Score(truth,page,shifted).Meets95Percent);
        }
        File.WriteAllText(Path.Combine(Samples,"synthetic-geometry.json"),Json.String(scores));Assert.True(scores.Sum(s=>s.Expected)>=100);Assert.True((double)scores.Sum(s=>s.Hits)/scores.Sum(s=>s.Expected)>=.95,Json.String(scores));
    }
}
