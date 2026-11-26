namespace DocAss.Host.Documents;
public sealed partial class DocumentService
{
    // Snapshot paths are owned cache files; source paths are never candidates.
    internal long SnapshotBytes=>Directory.Exists(snapshots)?new DirectoryInfo(snapshots).GetFiles().Sum(f=>f.Length):0;
    internal long CollectSnapshots(long budget,ISet<string> referenced)
    {
        if(!Directory.Exists(snapshots)||!opening.Wait(0))return 0;
        try
        {
        var protectedHashes=opened.Values.Select(d=>d.Snapshot.Hash).Concat(pending.Values.Select(s=>s.Hash)).Concat(referenced).ToHashSet();
        var candidates=new DirectoryInfo(snapshots).GetFiles().Where(f=>f.Name.Length==64||f.Name.Length==68&&f.Name.EndsWith(".png",StringComparison.Ordinal)).Where(f=>f.Name[..64].All(c=>c is >= '0' and <= '9' or >= 'a' and <= 'f')).OrderBy(f=>f.LastWriteTimeUtc).ToArray();
        var bytes=candidates.Sum(f=>f.Length);long removed=0;foreach(var file in candidates){if(bytes<=budget)break;if(protectedHashes.Contains(file.Name[..64]))continue;try{var length=file.Length;file.Delete();bytes-=length;removed+=length;}catch(IOException){/* A response stream still owns this snapshot. */}}return removed;
        }
        finally{opening.Release();}
    }
}
