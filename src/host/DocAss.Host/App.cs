using System.IO;
using System.Windows;

namespace DocAss.Host;

public static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        if (args.FirstOrDefault() == "--storage-probe") { Verification.StorageProbe.Run(args.Skip(1).ToArray()).GetAwaiter().GetResult(); return; }
        if(args.FirstOrDefault()=="--generate-ocr-samples"&&args.Length==2){Verification.OcrSamples.Create(Path.GetFullPath(args[1]));return;}
        var application = new Application();
        application.DispatcherUnhandledException += (_, e) => { MessageBox.Show("操作失败，请重试。未确认的修改不会显示为已保存。", "DocAss"); e.Handled = true; };
        var dev = false;
#if DEBUG
        dev = args.Contains("--dev");
#endif
        application.Run(new MainWindow(dev, Verification.AcceptanceOptions.Parse(args)));
    }
}
