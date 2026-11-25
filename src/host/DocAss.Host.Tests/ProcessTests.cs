using System.Diagnostics;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using Xunit;

namespace DocAss.Host.Tests;
public class ProcessTests
{
    private static string HostPath()
    {
        var root=new DirectoryInfo(AppContext.BaseDirectory);while(root!=null&&!File.Exists(Path.Combine(root.FullName,"DocAss.sln")))root=root.Parent;
        return Path.Combine(root!.FullName,"src","host","DocAss.Host","bin","Release","net11.0-windows","win-x64","DocAss.Host.exe");
    }
    private static Process Start(string mode,string directory,string report,string hash)
    {var start=new ProcessStartInfo(HostPath()){UseShellExecute=false,CreateNoWindow=true};foreach(var argument in new[]{"--storage-probe",mode,directory,report,hash})start.ArgumentList.Add(argument);return Process.Start(start)!;}
    private static async Task WaitUntil(Func<bool> test,Process child)
    {for(var i=0;i<1000;i++){if(test())return;if(child.HasExited)throw new Exception("Probe exited: "+child.ExitCode);await Task.Delay(10);}throw new TimeoutException("Probe timeout");}
    [Fact] public async Task CrossProcessLockAndKilledOwnerRelease()
    {
        await using var w=new Workspace();await w.Initialize();w.Documents.Close(w.Handle.DocId);var report=Path.Combine(w.Directory,"lock.json");using var process=Start("lock",w.Directory,report,w.Handle.DocHash);
        try
        {
            await WaitUntil(()=>File.Exists(report)&&new FileInfo(report).Length>0,process);var other=w.Documents.Register(w.Handle.DocHash,"second.pdf",12);Assert.Equal("readOnly",other.Access);Assert.Equal(0,await w.Storage.ReadRevisionAsync(other.DocHash));Assert.Throws<AppException>(()=>w.Documents.Resolve(other.DocId,true));
            Assert.Equal("edit",w.Documents.Register(new string('b',64),"other.pdf",1).Access);process.Kill(true);await process.WaitForExitAsync();Assert.Equal("edit",w.Documents.Reacquire(other.DocId).Access);
        }
        finally{if(!process.HasExited){process.Kill(true);await process.WaitForExitAsync();}}
    }
    [Theory][InlineData(17)][InlineData(31)][InlineData(79)]
    public async Task OneHundredAcknowledgedCommitsSurviveRandomKill(int seed)
    {
        await using var w=new Workspace();await w.Initialize();w.Documents.Close(w.Handle.DocId);var report=Path.Combine(w.Directory,"acks.jsonl");using var child=Start("write",w.Directory,report,w.Handle.DocHash);
        try
        {
        await WaitUntil(()=>{try{using var file=new FileStream(report,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);using var reader=new StreamReader(file);return reader.ReadToEnd().Split('\n',StringSplitOptions.RemoveEmptyEntries).Length==100;}catch(IOException){return false;}},child);await Task.Delay(new Random(seed).Next(1,40));child.Kill(true);await child.WaitForExitAsync();
            Assert.Equal(100,await w.Storage.ReadRevisionAsync(w.Handle.DocHash));Assert.Equal(100,(await w.Storage.ReadEntitiesAsync(w.Handle.DocHash,"conversations")).Length);
            foreach(var line in File.ReadLines(report)){using var json=JsonDocument.Parse(line);Assert.NotNull(await w.Storage.GetOperationAsync(w.Handle.DocHash,json.RootElement.GetProperty("operationId").GetString()!));}
        }
        finally{if(!child.HasExited){child.Kill(true);await child.WaitForExitAsync();}}
    }
}
