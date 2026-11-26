using System.IO;
using System.Windows;

namespace DocAss.Host;

public static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        if (args.FirstOrDefault() == "--storage-probe") { Verification.StorageProbe.Run(args.Skip(1).ToArray()).GetAwaiter().GetResult(); return; }
        if (args.FirstOrDefault() == "--generate-ocr-samples" && args.Length == 2) { Verification.OcrSamples.Create(Path.GetFullPath(args[1])); return; }
        if (args.FirstOrDefault() == "--verify-external-ocr" && args.Length == 3) { Verification.OcrExternalSamples.Run(Path.GetFullPath(args[1]), Path.GetFullPath(args[2])); return; }
        if (args.FirstOrDefault() == "--verify-provider-smoke" && args.Length is 3 or 4) { Verification.ProviderSmoke.RunAsync(Path.GetFullPath(args[1]), Path.GetFullPath(args[2]), args.Length == 4 ? args[3] : null).GetAwaiter().GetResult(); return; }
        var application = new Application();
        var acceptance = Verification.AcceptanceOptions.Parse(args);
        application.DispatcherUnhandledException += (_, e) =>
        {
            if (acceptance != null) { Directory.CreateDirectory(Path.GetDirectoryName(acceptance.Output)!); File.WriteAllText(acceptance.Output, Contracts.Json.String(new { ok = false, error = e.Exception.ToString(), unhandled = true })); e.Handled = true; application.Shutdown(1); return; }
            MessageBox.Show("操作失败，请重试。未确认的修改不会显示为已保存。", "DocAss"); e.Handled = true;
        };
        var dev = false;
#if DEBUG
        dev = args.Contains("--dev");
#endif
        application.Run(new MainWindow(dev, acceptance));
    }
}
