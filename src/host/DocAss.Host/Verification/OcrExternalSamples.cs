using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using DocAss.Host.Contracts;
using DocAss.Host.Ocr;
namespace DocAss.Host.Verification;
public static class OcrExternalSamples
{
    public static void Run(string root,string output)
    {
        Directory.CreateDirectory(output);using var engine=new OcrEngine();using var truth=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,"docs/fixtures/ocr-real-transcription.json")));var reports=new List<object>();
        foreach(var name in new[]{"phototest.tif","11.jpg","12.jpg"})
        {
            var file=Path.Combine(root,"docs/fixtures/downloads/real-ocr",name);var decoder=BitmapDecoder.Create(new Uri(file),BitmapCreateOptions.PreservePixelFormat,BitmapCacheOption.OnLoad);var frame=decoder.Frames[0];var normalized=new FormatConvertedBitmap(frame,PixelFormats.Bgra32,null,0);var pixels=new byte[normalized.PixelWidth*normalized.PixelHeight*4];normalized.CopyPixels(pixels,normalized.PixelWidth*4,0);
            var expected=name=="phototest.tif"?File.ReadAllText(Path.Combine(Path.GetDirectoryName(file)!,"phototest.txt")):string.Join('\n',truth.RootElement.GetProperty("samples").EnumerateArray().Single(s=>s.GetProperty("image").GetString()==name).GetProperty("lines").EnumerateArray().Select(v=>v.GetString()));
            foreach(var tier in new[]{"Tiny","Small","Medium"})
            {
                var profile=new OcrProfile{Fingerprint=new string('a',64),ModelHash=OcrEngine.ModelHash(tier),ModelTier=tier,Backend="Cpu",EngineVersion="2.0.0",Preprocessing="external-v1"};var watch=Stopwatch.StartNew();
                try{var result=engine.Run(new(pixels,normalized.PixelWidth,normalized.PixelHeight,normalized.PixelWidth*4),profile,[1,0,0,-1,0,normalized.PixelHeight]);var actual=string.Join('\n',result.Lines.Select(l=>l.Text));var a=Clean(expected);var b=Clean(actual);var distance=Distance(a,b);reports.Add(new{sample=name,tier,milliseconds=watch.Elapsed.TotalMilliseconds,characters=a.Length,distance,cer=(double)distance/a.Length,expected,actual,sha256=Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file))),geometry="No independent human character quads available; not a G5 geometry pass"});}
                catch(Exception e){reports.Add(new{sample=name,tier,error=e.GetType().Name+": "+e.Message});}
            }
        }
        File.WriteAllText(Path.Combine(output,"real-ocr.json"),Json.String(new{completed=true,g5Complete=false,reason="Supplementary public samples do not replace required clear Chinese scans and 100 human tilted/vertical character quads",results=reports}));
    }
    private static string Clean(string s)=>string.Concat(s.Where(c=>!char.IsWhiteSpace(c)));
    private static int Distance(string a,string b){var previous=Enumerable.Range(0,b.Length+1).ToArray();for(var i=0;i<a.Length;i++){var next=new int[b.Length+1];next[0]=i+1;for(var j=0;j<b.Length;j++)next[j+1]=Math.Min(previous[j]+(a[i]==b[j]?0:1),Math.Min(previous[j+1],next[j])+1);previous=next;}return previous[^1];}
}
