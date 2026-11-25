using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using DocAss.Host.Settings;
using DocAss.Host.Storage;
using DocAss.Host.Windowing;
using Microsoft.Data.Sqlite;
using Xunit;

namespace DocAss.Host.Tests;
public class AcceptanceTests
{
    [DllImport("advapi32.dll",SetLastError=true)] private static extern bool ImpersonateAnonymousToken(nint thread);
    [DllImport("advapi32.dll",SetLastError=true)] private static extern bool RevertToSelf();
    [DllImport("kernel32.dll")] private static extern nint GetCurrentThread();
    [Fact] public void DifferentWindowsSecurityIdentityCannotDecryptCredential()
    {
        var original=WindowsIdentity.GetCurrent().User!.Value;
        var cipher=ProtectedData.Protect(Encoding.UTF8.GetBytes("identity-bound-test"),null,DataProtectionScope.CurrentUser);
        Assert.Equal("identity-bound-test",Encoding.UTF8.GetString(CredentialVault.Decrypt(cipher)));
        Assert.True(ImpersonateAnonymousToken(GetCurrentThread()),Marshal.GetLastWin32Error().ToString());
        try
        {
            Assert.NotEqual(original,WindowsIdentity.GetCurrent().User!.Value);
            Assert.Equal("CREDENTIAL_UNAVAILABLE",Assert.Throws<AppException>(()=>CredentialVault.Decrypt(cipher)).Code);
        }
        finally { Assert.True(RevertToSelf()); }
    }
    [Fact] public void WindowPlacementRetainsSecondaryMonitorAndRecoversRemovedMonitor()
    {
        var first=new Bounds(0,0,1920,1040);var second=new Bounds(-1600,0,1600,900);var saved=new Bounds(-1500,100,1100,700);
        Assert.Equal(second,WindowPlacement.SelectWorkArea(saved,[first,second]));Assert.Equal(saved,WindowPlacement.Clamp(saved,second));
        var fallback=WindowPlacement.SelectWorkArea(saved,[first]);Assert.Equal(first,fallback);Assert.Equal(0,WindowPlacement.Clamp(saved,fallback).Left);
    }
    [Fact] public async Task SixtySecondDirtyBackupTimerPersistsAcknowledgedRevision()
    {
        await using var w=new Workspace();await w.Initialize();await w.Storage.CommitAsync(w.Payload(w.Conversation()),w.Documents);
        var deadline=DateTime.UtcNow.AddSeconds(70);while(DateTime.UtcNow<deadline)
        {
            if(File.Exists(w.Storage.BackupPath)&&RecoveryService.Inspect(w.Storage.BackupPath).DocumentRevisions.GetValueOrDefault(w.Handle.DocHash)==1)break;
            await Task.Delay(250);
        }
        Assert.Equal(1,RecoveryService.Inspect(w.Storage.BackupPath).DocumentRevisions[w.Handle.DocHash]);Assert.False(w.Storage.Dirty);
    }
    private static JsonElement Annotation(string hash,string id)
    {
        using var fixtures=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"contract-fixtures.json")));
        var value=fixtures.RootElement.EnumerateArray().First(f=>f.GetProperty("name").GetString()=="valid-Annotation").GetProperty("value");
        var fields=value.EnumerateObject().ToDictionary(p=>p.Name,p=>p.Value.Clone());fields["docHash"]=Json.Element(hash);fields["id"]=Json.Element(id);return Json.Element(fields);
    }
    [Fact] public async Task ConcurrentAnnotationAndMessageCheckpointPreserveBoth()
    {
        await using var w=new Workspace();await w.Initialize();var conversation=Guid.NewGuid().ToString();await w.Storage.CommitAsync(w.Payload(w.Conversation(conversation)),w.Documents);
        var annotation=Json.Element(new{type="batch",mutations=new[]{new{type="annotation.put",value=Annotation(w.Handle.DocHash,Guid.NewGuid().ToString())}}});
        var message=Json.Element(new{type="batch",mutations=new[]{new{type="message.put",value=new{id=Guid.NewGuid().ToString(),conversationId=conversation,parentId=(string?)null,branchId=conversation,role="assistant",createdAt="2026-11-25",state="running",sequence=1,content=new[]{new{type="text",text="checkpoint"}}}}}});
        var commands=new[]{w.Payload(annotation,1),w.Payload(message,1)};
        var results=await Task.WhenAll(commands.Select(async p=>{try{await w.Storage.CommitAsync(p,w.Documents);return true;}catch(AppException e)when(e.Code=="REVISION_CONFLICT"){return false;}}));
        Assert.Single(results,x=>x);var failed=Array.IndexOf(results,false);await w.Storage.CommitAsync(w.Payload(commands[failed].GetProperty("command"),2,commands[failed].GetProperty("operationId").GetString()),w.Documents);
        var state=await w.Storage.ReadDocumentAsync(w.Handle.DocHash);Assert.Equal(3,state.DocumentRevision);Assert.Single(state.Annotations);Assert.Single(state.Messages);Assert.Single(state.Conversations);
    }
    [Fact] public async Task SnapshotAndOnlineBackupStayConsistentDuringOtherConnectionWrites()
    {
        await using var w=new Workspace();await w.Initialize();await using var reader=new StorageService(w.Storage.DatabasePath);await reader.InitializeAsync();
        var write=Task.Run(async()=>{for(var i=0;i<100;i++)await w.Storage.CommitAsync(w.Payload(w.Conversation(),i),w.Documents);});
        for(var i=0;i<12;i++)
        {
            var snapshot=await reader.ReadDocumentAsync(w.Handle.DocHash);Assert.Equal(snapshot.DocumentRevision,snapshot.Conversations.Length);
            await reader.BackupAsync();using var backup=new SqliteConnection($"Data Source={w.Storage.BackupPath};Mode=ReadOnly;Pooling=False");backup.Open();Assert.Equal(StorageService.Scalar(backup,"SELECT documentRevision FROM documents"),StorageService.Scalar(backup,"SELECT COUNT(*) FROM conversations"));Assert.Equal("ok",StorageService.Scalar(backup,"PRAGMA integrity_check"));
        }
        await write;Assert.Equal(100,(await reader.ReadDocumentAsync(w.Handle.DocHash)).DocumentRevision);
    }
    [Fact] public async Task CollectionProtectsPendingUploadsAndAnotherWriter()
    {
        await using var w=new Workspace();await w.Initialize();var uploader=new AttachmentService(w.Storage,w.Documents,w.Directory);var id=uploader.Begin(w.Handle.DocId);
        var png=Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=");
        await uploader.UploadAsync(w.Handle.DocId,id,new MemoryStream(png),"image/png",default);Assert.Equal(0,await uploader.CollectAsync(TimeSpan.Zero));
        using var other=new DocumentRegistry(w.Directory);Assert.Equal("readOnly",other.Register(w.Handle.DocHash,"other.pdf",12).Access);
        var collector=new AttachmentService(w.Storage,other,w.Directory);Assert.Equal(0,await collector.CollectAsync(TimeSpan.Zero));await uploader.CommitAsync(w.Handle.DocId,id);Assert.Equal(png,await uploader.ReadAsync(w.Handle.DocId,id));
    }
    [Theory][InlineData(1)][InlineData(2)][InlineData(3)][InlineData(4)]
    public async Task AnnotationMessageAndToolEffectCommitAsOneTransaction(int failAt)
    {
        await using var w=new Workspace();await w.Initialize();var conversation=Guid.NewGuid().ToString();var annotation=Guid.NewGuid().ToString();
        var command=Json.Element(new{type="batch",mutations=new object[]{
            new{type="conversation.put",value=new{id=conversation,title="atomic",modelRef="fixture",createdAt="2026-11-25"}},
            new{type="annotation.put",value=Annotation(w.Handle.DocHash,annotation)},
            new{type="message.put",value=new{id=Guid.NewGuid().ToString(),conversationId=conversation,parentId=(string?)null,branchId=conversation,role="assistant",createdAt="2026-11-25",state="completed",sequence=1,content=new[]{new{type="text",text="tool result"}}}},
            new{type="effect.put",value=new{conversationId=conversation,runId=Guid.NewGuid().ToString(),toolCallId=Guid.NewGuid().ToString(),annotationIds=new[]{annotation},result="created"}}
        }});var payload=w.Payload(command);var mutation=0;w.Storage.FaultInjection=step=>{if(step=="mutation"&&++mutation==failAt)throw new IOException("injected full disk");};
        await Assert.ThrowsAsync<AppException>(()=>w.Storage.CommitAsync(payload,w.Documents));w.Storage.FaultInjection=null;
        using(var c=w.Storage.OpenRead())foreach(var table in new[]{"annotations","conversations","messages","tool_effects","operations"})Assert.Equal(0L,StorageService.Scalar(c,"SELECT COUNT(*) FROM "+table));
        Assert.Equal(0,await w.Storage.ReadRevisionAsync(w.Handle.DocHash));await w.Storage.CommitAsync(payload,w.Documents);await w.Storage.CommitAsync(payload,w.Documents);
        using(var c=w.Storage.OpenRead())foreach(var table in new[]{"annotations","conversations","messages","tool_effects","operations"})Assert.Equal(1L,StorageService.Scalar(c,"SELECT COUNT(*) FROM "+table));
    }
}
