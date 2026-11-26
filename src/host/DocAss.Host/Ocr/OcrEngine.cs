using System.Reflection;
using System.Security.Cryptography;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using Sdcb.SimdPaddleOCR;
using Sdcb.SimdPaddleOCR.Models.ChineseV6Tiny;
using Sdcb.SimdPaddleOCR.Models.ChineseV6Small;
using Sdcb.SimdPaddleOCR.Models.ChineseV6Medium;
using UglyToad.PdfPig.Core;
namespace DocAss.Host.Ocr;

public interface IOcrSession:IDisposable { OcrLine[] Run(OcrPixels image,double[] matrix,string identity); }
public sealed record OcrEngineResult(OcrLine[] Lines,string Device,bool Fallback);
// Only the scheduler's single worker calls Run/Dispose; never the WPF dispatcher.
public sealed class OcrEngine(Func<string,string,IOcrSession>? factory=null):IDisposable
{
    private IOcrSession? session;private string? loaded;private readonly HashSet<string> cpuFallback=[];
    public int Loads {get;private set;} public int Disposals {get;private set;} public int Runs {get;private set;}
    public OcrEngineResult Run(OcrPixels image,OcrProfile profile,double[] matrix)
    {
        var fallback=profile.Backend=="Auto"&&cpuFallback.Contains(profile.ModelTier);var backend=fallback?"Cpu":profile.Backend;
        try{return new(RunOnce(backend),backend=="Auto"?"Auto（引擎按设备能力选择）":"CPU",fallback);}
        catch(Exception) when(backend=="Auto") {Release();cpuFallback.Add(profile.ModelTier);return new(RunOnce("Cpu"),"CPU（自动设备失败后回退）",true);}
        OcrLine[] RunOnce(string target){var key=profile.ModelTier+":"+target;if(loaded!=key){Release();session=(factory??Create)(profile.ModelTier,target);loaded=key;Loads++;}Runs++;return session!.Run(image,matrix,profile.Fingerprint);}
    }
    private void Release(){if(session!=null){session.Dispose();session=null;Disposals++;}loaded=null;}
    public void Dispose()=>Release();
    private static IOcrSession Create(string tier,string backend)=>new PaddleSession(tier,backend);
    public static string ModelHash(string tier)
    {
        var model=tier switch{"Tiny"=>typeof(ChineseV6TinyModels).Assembly,"Small"=>typeof(ChineseV6SmallModels).Assembly,"Medium"=>typeof(ChineseV6MediumModels).Assembly,_=>throw new AppException("INVALID_PAYLOAD","未知 OCR 模型")};
        var classifier=Assembly.Load("Sdcb.SimdPaddleOCR.Models.TextLineOrientation");
        using var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        foreach(var assembly in new[]{model,classifier})foreach(var name in assembly.GetManifestResourceNames().Order()) {using var stream=assembly.GetManifestResourceStream(name)!;var buffer=new byte[65536];int count;while((count=stream.Read(buffer))>0)hash.AppendData(buffer,0,count);}
        return Convert.ToHexStringLower(hash.GetHashAndReset());
    }
    private sealed class PaddleSession:IOcrSession
    {
        private readonly PaddleOcrAll engine;
        public PaddleSession(string tier,string target)
        {
            var bundle=tier switch{"Tiny"=>ChineseV6TinyModels.Default,"Small"=>ChineseV6SmallModels.Default,_=>ChineseV6MediumModels.Default};
            var backend=target=="Cpu"?OcrBackend.Cpu:OcrBackend.Auto;
            engine=PaddleOcrAll.Load(bundle,new PaddleOcrOptions{Detector=new(){Backend=backend},Classifier=new(){Backend=backend},Recognizer=new(){Backend=backend}});
        }
        public OcrLine[] Run(OcrPixels image,double[] m,string identity)
        {
            var result=engine.Run(image.Data,image.Width,image.Height,returnCtcAlignment:true,sourceStride:image.Stride,format:ImagePixelFormat.Bgra32);var index=0;
            PdfPoint Point(double x,double y)=>new(m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]);
            return result.Lines.Select(line=>new OcrLine{Text=line.Text,Glyphs=line.EstimateCharacterBoxes().Select(box=>{
                var p1=Point(box.X1,box.Y1);var p2=Point(box.X2,box.Y2);var p3=Point(box.X3,box.Y3);var p4=Point(box.X4,box.Y4);
                var id=SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(identity+":"+index++));
                var glyph=new Glyph{Id=new Guid(id.AsSpan(0,16)).ToString(),Text=box.Text,Quad=TextGeometryService.CanonicalQuad([p1,p2,p3,p4]),Baseline=[p4.X,p4.Y,p3.X,p3.Y],Source="ocr"};
                try{Contract.Check("Glyph",Json.Element(glyph));}catch(AppException e){throw new AppException("OCR_GEOMETRY",$"OCR 字符 {box.Text} 的坐标不可用：{e.Message}");}return glyph;
            }).ToArray()}).ToArray();
        }
        public void Dispose()=>engine.Dispose();
    }
}
