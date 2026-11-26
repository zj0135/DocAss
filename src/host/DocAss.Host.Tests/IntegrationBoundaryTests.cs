using System.Text;
using DocAss.Host.Contracts;
using DocAss.Host.Http;
using DocAss.Host.Storage;
using Xunit;
namespace DocAss.Host.Tests;
public class IntegrationBoundaryTests
{
    [Fact]public async Task PublishedCspAndEveryEncodedTraversalRemainClosed()
    {
        var dir=Path.Combine(Path.GetTempPath(),"DocAss-security-"+Guid.NewGuid());Directory.CreateDirectory(dir);await File.WriteAllTextAsync(Path.Combine(dir,"index.html"),"<!doctype html><title>test</title>");var h=new HostResourceHandler(dir,MainWindow.PublishedOrigin){LoopbackOrigin="http://127.0.0.1:12345"};
        try{var page=await h.HandleAsync(new("GET",MainWindow.PublishedOrigin+"/"),default);var csp=page.Headers!["Content-Security-Policy"];Assert.Contains("default-src 'none'",csp);Assert.Contains("frame-src 'none'",csp);Assert.DoesNotContain("script-src 'self' 'unsafe-eval'",csp);Assert.DoesNotContain("https:",csp);
            foreach(var path in new[]{"/%2E%2e/secrets","/%252e%252e/secrets","/a/../secrets","/a%5c..%5csecrets","/C:%5cWindows","/file%00.png","/folder./file","/folder%20/file"})Assert.Equal(403,(await h.HandleAsync(new("GET",MainWindow.PublishedOrigin+path),default)).Status);
            Assert.Equal(403,(await h.HandleAsync(new("GET","https://untrusted.invalid/_host/doc/anything/snapshot"),default)).Status);
        }finally{Directory.Delete(dir,true);}
    }
    [Fact]public async Task SqlPayloadIsDataAndMissingDocumentCannotReadOrWrite()
    {
        await using var w=new Workspace();await w.Initialize();var title="'); DROP TABLE documents; --";await w.Storage.CommitAsync(w.Payload(w.Conversation(title:title)),w.Documents);Assert.Equal(title,(await w.Storage.ReadDocumentAsync(w.Handle.DocHash)).Conversations[0].GetProperty("title").GetString());Assert.Throws<AppException>(()=>w.Documents.Resolve(Guid.NewGuid().ToString(),true));Assert.Throws<AppException>(()=>Contract.Check("Command",Json.Element(new{type="sql",query="SELECT * FROM secrets"})));
    }
    [Fact]public async Task CorruptAttachmentDoesNotDestroyMessagesAndBackupRestoresReferences()
    {
        await using var w=new Workspace();await w.Initialize();var service=new AttachmentService(w.Storage,w.Documents,w.Directory);var id=service.Begin(w.Handle.DocId);var png=Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=");await service.UploadAsync(w.Handle.DocId,id,new MemoryStream(png),"image/png",default);await service.CommitAsync(w.Handle.DocId,id);
        var c=Guid.NewGuid().ToString();var m=Guid.NewGuid().ToString();var command=Json.Element(new{type="batch",mutations=new object[]{new{type="conversation.put",value=new{id=c,title="backup",modelRef="fixture",createdAt="2026-11-26"}},new{type="message.put",value=new{id=m,conversationId=c,parentId=(string?)null,branchId=c,role="user",createdAt="2026-11-26",state="completed",sequence=0,content=new object[]{new{type="text",text="retained text"},new{type="attachment",attachmentId=id}}}}}});await w.Storage.CommitAsync(w.Payload(command),w.Documents);await w.Storage.BackupAsync();
        var path=Path.Combine(w.Directory,"attachments",w.Handle.DocHash,id+".png");await File.WriteAllBytesAsync(path,Encoding.UTF8.GetBytes("corrupt"));Assert.Null(await service.ReadAsync(w.Handle.DocId,id));Assert.Contains("retained text",(await w.Storage.ReadDocumentAsync(w.Handle.DocHash)).Messages[0].GetRawText());await File.WriteAllBytesAsync(path,png);await w.Storage.CommitAsync(w.Payload(Json.Element(new{type="batch",mutations=new[]{new{type="conversation.remove",id=c}}}),1),w.Documents);Assert.Equal(0,await service.CollectAsync(TimeSpan.Zero));await w.Storage.DisposeAsync();RecoveryService.Restore(w.Storage.DatabasePath,true);await using var restored=new StorageService(w.Storage.DatabasePath);await restored.InitializeAsync();var state=await restored.ReadDocumentAsync(w.Handle.DocHash);Assert.Single(state.Messages);var restoredAttachments=new AttachmentService(restored,w.Documents,w.Directory);Assert.Equal(png,await restoredAttachments.ReadAsync(w.Handle.DocId,id));
    }
}
