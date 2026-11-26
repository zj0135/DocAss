namespace DocAss.Host.Verification;

public sealed record AcceptanceOptions(string Output, string Scenario)
{
    public static AcceptanceOptions? Parse(string[] args)
    {
        var index=Array.IndexOf(args,"--verify");
        if(index<0||index+1>=args.Length)return null;
        var caseIndex=Array.IndexOf(args,"--verify-case");
        var scenario=caseIndex>=0&&caseIndex+1<args.Length?args[caseIndex+1]:"channel";
        if(scenario is not ("channel" or "native" or "reading" or "annotations" or "ocr" or "ocrBenchmark" or "ocrSynthetic" or "closeButton" or "altF4" or "hmr" or "runtimeMissing" or "devUnavailable"))throw new ArgumentException("Unknown acceptance case");
        return new(Path.GetFullPath(args[index+1]),scenario);
    }
}
