using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Storage;
using Xunit;

namespace DocAss.Host.Tests;
public class AttachmentTests
{
    private static byte[] Png => Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=");
    [Fact] public async Task RejectsPartialSpoofedOversizedAndCrossDocumentUploads()
    {
        await using var w=new Workspace();await w.Initialize();var service=new AttachmentService(w.Storage,w.Documents,w.Directory);var id=service.Begin(w.Handle.DocId);
        await Assert.ThrowsAsync<AppException>(()=>service.CommitAsync(w.Handle.DocId,id));
        await Assert.ThrowsAsync<AppException>(()=>service.UploadAsync(w.Handle.DocId,id,new MemoryStream([1,2,3]),"image/png",default));
        await Assert.ThrowsAsync<AppException>(()=>service.UploadAsync(w.Handle.DocId,id,new MemoryStream(Png),"text/html",default));
        await Assert.ThrowsAsync<AppException>(()=>service.UploadAsync(w.Handle.DocId,id,new MemoryStream(new byte[AttachmentService.MaxBytes+1]),"image/png",default));
        using var cancelled=new CancellationTokenSource();cancelled.Cancel();await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>service.UploadAsync(w.Handle.DocId,id,new MemoryStream(Png),"image/png",cancelled.Token));
        await service.UploadAsync(w.Handle.DocId,id,new MemoryStream(Png),"image/png",default);await service.CommitAsync(w.Handle.DocId,id);Assert.Equal(Png,await service.ReadAsync(w.Handle.DocId,id));
        var other=w.Documents.Register(new string('b',64),"other.pdf",1);await w.Storage.EnsureDocumentAsync(other,1);await Assert.ThrowsAsync<AppException>(()=>service.ReadAsync(other.DocId,id));
        File.Delete(Path.Combine(w.Directory,"attachments",w.Handle.DocHash,id+".png"));Assert.Null(await service.ReadAsync(w.Handle.DocId,id));
    }
    [Fact] public async Task ReferencesAndBackupProtectAttachmentFromCollection()
    {
        await using var w=new Workspace();await w.Initialize();var service=new AttachmentService(w.Storage,w.Documents,w.Directory);var id=service.Begin(w.Handle.DocId);await service.UploadAsync(w.Handle.DocId,id,new MemoryStream(Png),"image/png",default);await service.CommitAsync(w.Handle.DocId,id);
        var conversation=Guid.NewGuid().ToString();var first=Guid.NewGuid().ToString();var second=Guid.NewGuid().ToString();
        object Message(string messageId)=>new{type="message.put",value=new{id=messageId,conversationId=conversation,parentId=(string?)null,branchId=conversation,role="user",createdAt="2026-11-25",state="completed",sequence=0,content=new[]{new{type="attachment",attachmentId=id}}}};
        var command=Json.Element(new{type="batch",mutations=new object[]{new{type="conversation.put",value=new{id=conversation,title="with attachments",modelRef="fixture",createdAt="2026-11-25"}},Message(first),Message(second)}});await w.Storage.CommitAsync(w.Payload(command),w.Documents);
        var remove=Json.Element(new{type="batch",mutations=new[]{new{type="message.remove",id=first}}});await w.Storage.CommitAsync(w.Payload(remove,1),w.Documents);Assert.Equal(0,await service.CollectAsync(TimeSpan.Zero));
        await w.Storage.BackupAsync();remove=Json.Element(new{type="batch",mutations=new[]{new{type="message.remove",id=second}}});await w.Storage.CommitAsync(w.Payload(remove,2),w.Documents);Assert.Equal(0,await service.CollectAsync(TimeSpan.Zero));Assert.NotNull(await service.ReadAsync(w.Handle.DocId,id));
        await w.Storage.BackupAsync();Assert.Equal(1,await service.CollectAsync(TimeSpan.Zero));
    }
    [Fact] public async Task FailedMetadataTransactionLeavesRecoverableOrphan()
    {
        await using var w=new Workspace();await w.Initialize();var service=new AttachmentService(w.Storage,w.Documents,w.Directory);var id=service.Begin(w.Handle.DocId);await service.UploadAsync(w.Handle.DocId,id,new MemoryStream(Png),"image/png",default);
        w.Storage.FaultInjection=s=>{if(s=="attachment")throw new IOException("disk full");};await Assert.ThrowsAsync<AppException>(()=>service.CommitAsync(w.Handle.DocId,id));w.Storage.FaultInjection=null;
        // A new service represents the next process: pending memory is gone, the orphan remains reclaimable.
        var recovered=new AttachmentService(w.Storage,w.Documents,w.Directory);Assert.Equal(1,await recovered.CollectAsync(TimeSpan.Zero));
    }
}
