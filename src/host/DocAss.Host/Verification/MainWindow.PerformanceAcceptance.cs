using System.Diagnostics;
using System.Text.Json;
using DocAss.Host.Contracts;
using DocAss.Host.Verification;
namespace DocAss.Host;
public sealed partial class MainWindow
{
    private async Task VerifyPerformanceAsync()
    {
        NativeInput.GetCursorPos(out originalCursor);originalForeground=NativeInput.GetForegroundWindow();Topmost=true;NativeInput.Activate(this);web.Focus();
        var root=new DirectoryInfo(AppContext.BaseDirectory);while(root!=null&&!File.Exists(Path.Combine(root.FullName,"DocAss.sln")))root=root.Parent;
        var fixture=Path.Combine(root!.FullName,"docs/fixtures/generated/integration-500.pdf");var watch=Stopwatch.StartNew();var opened=await files.OpenAsync(fixture);Emit("doc.opened",opened);
        await RunPageCheck("firstScreen","await until(()=>document.querySelector('[data-page=\"1\"] canvas[data-rendered]'));",15000);
        acceptanceResults["firstScreenMs"]=watch.Elapsed.TotalMilliseconds;acceptanceResults["fixtureBytes"]=new FileInfo(fixture).Length;
        await RunPageCheck("beginWorkload","""
            window.perfErrors=[];window.addEventListener('unhandledrejection',e=>window.perfErrors.push(String(e.reason)));window.addEventListener('docass.renderError',e=>window.perfErrors.push(JSON.stringify(e.detail)));
            button('缩略图').click();window.perfFrames=[];window.perfSamples=[];window.perfSearch=[];window.perfDone=false;let searchRound=-1,searchStarted=0;
            const start=performance.now();let last=start,lastSample=0,lastSwitch=0;const scroll=document.querySelector('[data-testid="reader-scroll"]');
            const tick=now=>{const elapsed=now-start;window.perfFrames.push(now-last);last=now;
              const phase=(elapsed%40000)/20000;scroll.scrollTop=(phase<=1?phase:2-phase)*(scroll.scrollHeight-scroll.clientHeight);
              if(now-lastSample>=1000){lastSample=now;window.perfSamples.push({ms:elapsed,...window.__docassResources});}
              if(elapsed-lastSwitch>30000){lastSwitch=elapsed;button('缩略图').click();button(Math.floor(elapsed/30000)%2?'适合宽度':'适合整页').click();}
              if(Math.floor(elapsed/200000)>searchRound&&elapsed%200000>90000){searchRound=Math.floor(elapsed/200000);searchStarted=elapsed;button('查找').click();setTimeout(()=>{const input=document.querySelector('input[placeholder="在文档中查找..."]');if(input)setValue(input,'REFERENCE-250');},100);}
              if(searchStarted&&elapsed-searchStarted>10000){window.perfSearch.push(document.querySelector('[data-testid="search-coverage"]')?.textContent);document.querySelector('button[title="关闭 (Esc)"]')?.click();searchStarted=0;}
              if(elapsed<600000)requestAnimationFrame(tick);else window.perfDone=true;
            };requestAnimationFrame(tick);
            """,10000);
        var samples=new List<object>();var peaks=new long[3];var deadline=Stopwatch.StartNew();
        while(deadline.Elapsed.TotalSeconds<620)
        {
            long memory=0;var processes=web.CoreWebView2.Environment.GetProcessInfos().Select(p=>(int)p.ProcessId).Append(Environment.ProcessId).Distinct().ToArray();
            foreach(var pid in processes)try{using var process=Process.GetProcessById(pid);memory+=process.PrivateMemorySize64;}catch(ArgumentException){}
            var elapsed=deadline.Elapsed.TotalMilliseconds;peaks[Math.Min(2,(int)(elapsed/200000))]=Math.Max(peaks[Math.Min(2,(int)(elapsed/200000))],memory);samples.Add(new{elapsedMs=elapsed,privateBytes=memory,processes=processes.Length});
            if(await web.CoreWebView2.ExecuteScriptAsync("window.perfDone")=="true")break;await Task.Delay(1000);
        }
        using var data=JsonDocument.Parse(await web.CoreWebView2.ExecuteScriptAsync("JSON.stringify({frames:window.perfFrames,samples:window.perfSamples,search:window.perfSearch,errors:window.perfErrors,done:window.perfDone})"));
        using var parsed=JsonDocument.Parse(data.RootElement.GetString()!);var values=parsed.RootElement.GetProperty("frames").EnumerateArray().Select(v=>v.GetDouble()).Order().ToArray();var p95=values[(int)Math.Ceiling(values.Length*.95)-1];
        acceptanceResults["workload"]=parsed.RootElement.Clone();acceptanceResults["processMemory"]=samples;acceptanceResults["roundPeaksBytes"]=peaks;acceptanceResults["scrollP95Ms"]=p95;
        acceptanceResults["g6FirstScreen"]=Convert.ToDouble(acceptanceResults["firstScreenMs"])<=3000;acceptanceResults["g6Frames"]=p95<=33;acceptanceResults["g6Peak"]=peaks.Max()<=1.5*1024*1024*1024;acceptanceResults["g6Stable"]=Math.Abs(peaks[2]-peaks[1])/(double)Math.Max(1,peaks[1])<=.1;
        acceptanceResults["completedTenMinutes"]=parsed.RootElement.GetProperty("done").GetBoolean();
        acceptanceResults["resourceBounds"]=parsed.RootElement.GetProperty("samples").EnumerateArray().All(s=>s.GetProperty("activeDocuments").GetInt32()<=3&&s.GetProperty("pageBytes").GetInt64()<=256L*1024*1024&&s.GetProperty("thumbnailBytes").GetInt64()<=32L*1024*1024&&s.GetProperty("offscreenBytes").GetInt64()<=96L*1024*1024&&s.GetProperty("textBytes").GetInt64()<=128L*1024*1024);
        await RunPageCheck("closeReopenCycles","""
            for(let n=0;n<3;n++){document.querySelector('button[title="关闭标签页 (Ctrl+W)"]').click();await until(()=>!document.querySelector('[data-reader]'));await pause(200);check(window.__docassResources.pageBytes===0,'released canvases');button('integration-500.pdf').click();await until(()=>document.querySelector('[data-page="1"] canvas[data-rendered]'));}check(window.__docassResources.activeDocuments<=3,'bounded documents');
            """,30000);
        acceptanceResults["ok"]=new[]{"g6FirstScreen","g6Frames","g6Peak","g6Stable","completedTenMinutes","resourceBounds"}.All(k=>acceptanceResults[k] is true)&&parsed.RootElement.GetProperty("errors").GetArrayLength()==0;await FinishAcceptanceAsync(acceptanceResults);
    }
}
