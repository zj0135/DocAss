using System.Security.Cryptography;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using DocAss.Host.Http;
using DocAss.Host.Storage;
using UglyToad.PdfPig;
using Xunit;

namespace DocAss.Host.Tests;

public sealed class ReadingTests : IAsyncLifetime
{
    internal static string Root { get { var dir = new DirectoryInfo(AppContext.BaseDirectory); while (dir != null && !File.Exists(Path.Combine(dir.FullName,"DocAss.sln"))) dir = dir.Parent; return dir!.FullName; } }
    internal static string Fixture(string name) => Path.Combine(Root,"docs","fixtures","generated",name);
    private readonly string temp=Path.Combine(Path.GetTempPath(),"docass-reading-"+Guid.NewGuid());
    private StorageService storage=null!; private DocumentRegistry registry=null!;private DocumentService files=null!;
    public async Task InitializeAsync(){Directory.CreateDirectory(temp);storage=new(Path.Combine(temp,"workspace.db"));await storage.InitializeAsync();registry=new(temp);files=new(temp,registry,storage);}
    public async Task DisposeAsync(){files.Dispose();registry.Dispose();await storage.DisposeAsync();Directory.Delete(temp,true);}
    [Fact] public async Task SnapshotIdentityRangesMoveBusyAndCancellation()
    {
        var source=Path.Combine(temp,"sample.pdf");File.Copy(Fixture("native-matrix.pdf"),source);
        var original=await File.ReadAllBytesAsync(source);var hash=Convert.ToHexStringLower(SHA256.HashData(original));
        var a=await files.OpenAsync(source);Assert.Equal("ready",a.Status);Assert.Equal(hash,a.Handle!.DocHash);Assert.Equal(10,a.PageCount);
        var moved=Path.Combine(temp,"moved.pdf");File.Move(source,moved);var b=await files.OpenAsync(moved);Assert.Equal(a.Handle.DocId,b.Handle!.DocId);
        var bytes=await files.ReadAsync(a.Handle.DocId,false,"bytes=10-99",default);Assert.Equal(206,bytes.Status);Assert.Equal(original[10..100],bytes.Body);
        Assert.Equal(416,(await files.ReadAsync(a.Handle.DocId,false,"bytes=999999999-",default)).Status);
        Assert.Equal(original[^12..],(await files.ReadAsync(a.Handle.DocId,false,"bytes=-12",default)).Body);
        var full=await files.ReadAsync(a.Handle.DocId,false,null,default);using(var stream=full.BodyStream!){Assert.Equal(hash,Convert.ToHexStringLower(await SHA256.HashDataAsync(stream)));}
        var largeRange=await files.ReadAsync(a.Handle.DocId,false,$"bytes=0-{original.Length-1}",default);Assert.Equal(206,largeRange.Status);
        using(var stream=largeRange.BodyStream!){Assert.Equal(original.Length,stream.Length);Assert.Equal(hash,Convert.ToHexStringLower(await SHA256.HashDataAsync(stream)));stream.Seek(10,SeekOrigin.Begin);var part=new byte[20];await stream.ReadExactlyAsync(part);Assert.Equal(original[10..30],part);}
        using(var busy=new FileStream(moved,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){Assert.Equal("FILE_BUSY",(await Assert.ThrowsAsync<AppException>(()=>files.OpenAsync(moved))).Code);}
        using var cancel=new CancellationTokenSource();cancel.Cancel();await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>files.OpenAsync(moved,cancel.Token));Assert.Empty(Directory.GetFiles(Path.Combine(temp,"snapshots"),"*.tmp"));
        Assert.Equal(hash,Convert.ToHexStringLower(SHA256.HashData(await File.ReadAllBytesAsync(moved))));
        var recent=await files.RecentAsync();Assert.Single(recent);Assert.DoesNotContain(temp,Json.String(recent));Assert.Equal("moved.pdf",recent[0].FileName);
        files.Close(a.Handle.DocId);var reopened=await files.OpenRecentAsync(hash,default);Assert.NotEqual(a.Handle.DocId,reopened.Handle!.DocId);Assert.Equal(hash,reopened.Handle.DocHash);
    }
    [Fact] public async Task PasswordRetryCancelCloseAndTextShareCredential()
    {
        var locked=await files.OpenAsync(Fixture("password.pdf"));Assert.Equal("password-needed",locked.Status);Assert.Null(locked.Handle);
        var wrong=await files.UnlockAsync(locked.OpenId,"wrong",default);Assert.Equal("incorrect",wrong.Status);
        files.Cancel(locked.OpenId);Assert.Equal(0,files.PendingCount);await Assert.ThrowsAsync<AppException>(()=>files.UnlockAsync(locked.OpenId,"fixture-reader",default));
        locked=await files.OpenAsync(Fixture("password.pdf"));var ready=await files.UnlockAsync(locked.OpenId,"fixture-reader",default);Assert.Equal("ready",ready.Status);Assert.Equal("fixture-reader",files.Password(ready.Handle!.DocId));
        var text=await new TextGeometryService(files).ExtractAsync(ready.Handle.DocId,1,Guid.NewGuid().ToString());Assert.Contains("Native",string.Concat(text.Glyphs.Select(g=>g.Text)));
        files.Close(ready.Handle.DocId);Assert.Equal("password-needed",(await files.OpenAsync(Fixture("password.pdf"))).Status);
        Assert.DoesNotContain("fixture-reader",System.Text.Encoding.UTF8.GetString(await File.ReadAllBytesAsync(storage.DatabasePath)));
    }
    [Fact] public async Task ImagesBadFilesAndDocumentCapability()
    {
        var image=await files.OpenAsync(Fixture("ocr-grid.png"));Assert.Equal("image",image.Handle!.Kind);Assert.Equal(1000,image.Image!.PixelWidth);Assert.Equal(750,image.Image.PageInfo.Width);
        Assert.Equal("INVALID_DOCUMENT",(await Assert.ThrowsAsync<AppException>(()=>files.OpenAsync(Fixture("broken.pdf")))).Code);
        await Assert.ThrowsAsync<AppException>(()=>files.ReadAsync(Guid.NewGuid().ToString(),false,null,default));
        var geometry=new TextGeometryService(files);Assert.Equal("unreliable",(await geometry.ExtractAsync(image.Handle.DocId,1,Guid.NewGuid().ToString())).Status);
        await Assert.ThrowsAsync<AppException>(()=>geometry.ExtractAsync(image.Handle.DocId,2,Guid.NewGuid().ToString()));
        files.Close(image.Handle.DocId);await Assert.ThrowsAsync<AppException>(()=>geometry.ExtractAsync(image.Handle.DocId,1,Guid.NewGuid().ToString()));
    }
    [Fact] public async Task MalformedCffRemainsAnExplicitNegativeAndCancelledJobCannotCache()
    {
        var opened=await files.OpenAsync(Fixture("native-legacy-cff.pdf"));var geometry=new TextGeometryService(files);
        var result=await geometry.ExtractAsync(opened.Handle!.DocId,1,Guid.NewGuid().ToString());Assert.Equal("unreliable",result.Status);Assert.Contains("字体",result.Reason);
        Contract.Check("NativePage",Json.Element(result));geometry.Forget(opened.Handle.DocId);Assert.Equal(0,geometry.CacheBytes);
        using var abort=new CancellationTokenSource();abort.Cancel();await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>geometry.ExtractAsync(opened.Handle.DocId,2,Guid.NewGuid().ToString(),abort.Token));Assert.Equal(0,geometry.CacheBytes);
    }
    [Fact] public void NativeGeometryGateAndExport()
    {
        using var pdf=PdfDocument.Open(Fixture("native-matrix.pdf"));using var truth=JsonDocument.Parse(File.ReadAllText(Fixture("native-truth.json")));
        var id=Guid.NewGuid().ToString();var hash=Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Fixture("native-matrix.pdf"))));
        var extracted=Enumerable.Range(1,pdf.NumberOfPages).Select(p=>TextGeometryService.ExtractPage(pdf.GetPage(p),id,Guid.NewGuid().ToString(),hash)).ToArray();
        var evidence=Path.Combine(Root,"artifacts","reading");Directory.CreateDirectory(evidence);File.WriteAllText(Path.Combine(evidence,"native-pages.json"),Json.String(extracted));
        var report=new List<object>();var total=0;
        foreach(var category in new[]{"chinese","mixed","tj","rotate","crop","userunit"})
        {
            var expected=truth.RootElement.GetProperty("truth").EnumerateArray().Where(g=>g.GetProperty("case").GetString()==category).ToArray();var actual=extracted[expected[0].GetProperty("page").GetInt32()-1];
            var passed=0;var maxError=0d;var maxVertexError=0d;
            Assert.Equal(expected.Length,actual.Glyphs.Length);
            for(var i=0;i<expected.Length;i++)
            {
                var q=expected[i].GetProperty("quad").EnumerateArray().Select(v=>v.GetDouble()).ToArray();var g=actual.Glyphs[i];Assert.Equal(expected[i].GetProperty("text").GetString(),g.Text);
                var error=Math.Max(Math.Abs(q[0]-g.Quad[0]),Math.Abs(q[2]-g.Quad[2]))/Math.Max(.01,q[2]-q[0]);maxError=Math.Max(maxError,error);if(error<.15)passed++;
                for(var vertex=0;vertex<8;vertex++)maxVertexError=Math.Max(maxVertexError,Math.Abs(q[vertex]-g.Quad[vertex]));
            }
            total+=expected.Length;report.Add(new{category,count=expected.Length,passed,ratio=(double)passed/expected.Length,maxError,maxVertexError});
            Assert.InRange(maxVertexError,0,.000001);
            Assert.True((double)passed/expected.Length>=.98,$"{category}: {passed}/{expected.Length}, max={maxError}");
        }
        Assert.True(total>=1000);
        var output=Path.Combine(Root,"artifacts","reading");Directory.CreateDirectory(output);File.WriteAllText(Path.Combine(output,"native-pages.json"),Json.String(extracted));File.WriteAllText(Path.Combine(output,"geometry-gate.json"),Json.String(new{total,report}));
        using(var unicode=PdfDocument.Open(Fixture("unicode-positive.pdf")))File.WriteAllText(Path.Combine(output,"unicode-pages.json"),Json.String(Enumerable.Range(1,unicode.NumberOfPages).Select(p=>TextGeometryService.ExtractPage(unicode.GetPage(p),id,Guid.NewGuid().ToString(),hash)).ToArray()));
        using var tj=JsonDocument.Parse(File.ReadAllText(Fixture("tj-counterexample.json")));var letters=extracted[9].Glyphs;var known=tj.RootElement.GetProperty("glyphs").EnumerateArray().ToArray();for(var i=0;i<letters.Length;i++)Assert.InRange(Math.Abs(letters[i].Baseline[0]-known[i].GetProperty("start").GetDouble()),0,.02);
    }
    [Theory][InlineData(0)][InlineData(double.NaN)][InlineData(35)][InlineData(1201)]public void InvalidDpiUses96(double dpi)=>Assert.Equal(96,ImageDecoder.EffectiveDpi(dpi));
    [Theory][InlineData(1,0,0)][InlineData(2,2,0)][InlineData(3,2,1)][InlineData(4,0,1)][InlineData(5,0,0)][InlineData(6,1,0)][InlineData(7,1,2)][InlineData(8,0,2)]public void ExifCorner(int orientation,int x,int y)=>Assert.Equal((x,y),ImageDecoder.Orient(0,0,3,2,orientation));
}
