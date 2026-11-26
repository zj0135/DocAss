using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Http;
namespace DocAss.Host;
public sealed partial class MainWindow
{
    private void RegisterOcrMethods()
    {
        bridge.Register("ocr.start",async(p,token)=>{Contract.Check("OcrStart",p);if(closing)throw new AppException("BUSY","窗口正在关闭");return await ocr.StartAsync(p.Deserialize<OcrStart>(Json.Options)!,token);});
        bridge.Register("ocr.status",(p,_)=>{Contract.Fields(p,"docId","jobId","subscriptionId");return Task.FromResult<object?>(ocr.Status(p.GetProperty("docId").GetString()!,p.GetProperty("jobId").GetString()!,p.GetProperty("subscriptionId").GetString()!));});
        bridge.Register("ocr.unsubscribe",(p,_)=>{Contract.Fields(p,"docId","subscriptionId");ocr.Unsubscribe(p.GetProperty("docId").GetString()!,p.GetProperty("subscriptionId").GetString()!);return Task.FromResult<object?>(null);});
        bridge.Register("ocr.getOverride",async(p,_)=>{Contract.Fields(p,"docId","page");return await ocr.GetOverrideAsync(p.GetProperty("docId").GetString()!,p.GetProperty("page").GetInt32());});
        bridge.Register("ocr.setOverride",async(p,_)=>{Contract.Fields(p,"docId","page","mode");await ocr.SetOverrideAsync(p.GetProperty("docId").GetString()!,p.GetProperty("page").GetInt32(),p.GetProperty("mode").GetString()!);return null;});
        bridge.Register("ocr.clearCache",(p,_)=>{Contract.Fields(p);return Task.FromResult<object?>(new{removedBytes=ocr.ClearCache()});});
    }
    private async Task<ResourceResponse?> OcrResourceAsync(string[] parts,ResourceRequest request,CancellationToken token)
    {
        if(parts.Length<6||parts[3]!="ocr")return null;
        if(parts.Length==6&&parts[5]=="raster"&&request.Method=="PUT")
        {
            Contract.Require(request.Mime?.Split(';')[0]=="image/png");var bytes=await BoundedRead.ReadAsync(request.Body??Stream.Null,Ocr.OcrRasterizer.MaxEncoded,token);ocr.Upload(parts[2],parts[4],bytes);return ResourceResponse.Json(200,new{uploaded=true});
        }
        if(parts.Length==7&&parts[5]=="result"&&request.Method=="GET")return ResourceResponse.Json(200,ocr.Result(parts[2],parts[4],parts[6]));
        return null;
    }
}
