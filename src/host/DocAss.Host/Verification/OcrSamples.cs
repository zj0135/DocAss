using System.Globalization;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using DocAss.Host.Contracts;
namespace DocAss.Host.Verification;

public static class OcrSamples
{
    public static readonly string[] English = ["Document assistant verification sample.", "Invoice number 20261126. Total amount USD 1234.56.", "Please review this contract before signing.", "The quick brown fox jumps over the lazy dog."];
    public static readonly string[] Chinese = ["中文文档识别与标注验证。", "请核对合同内容并确认签署日期。", "本地文字识别保护文档隐私。", "页面坐标保持一致，标注可以保存。"];
    public static void Create(string root)
    {
        Directory.CreateDirectory(root); Exception? failure = null; var thread = new Thread(() => { try { Render("english", English, "Arial"); Render("chinese", Chinese, "Microsoft YaHei"); OcrSyntheticSamples.Create(root); } catch (Exception e) { failure = e; } }); thread.SetApartmentState(ApartmentState.STA); thread.Start(); thread.Join(); if (failure != null) throw failure;
        void Render(string name, string[] lines, string font)
        {
            var visual = new DrawingVisual(); using (var drawing = visual.RenderOpen()) { drawing.DrawRectangle(Brushes.White, null, new Rect(0, 0, 1653, 2339)); for (var i = 0; i < 24; i++) drawing.DrawText(new FormattedText(lines[i % 4], CultureInfo.InvariantCulture, FlowDirection.LeftToRight, new Typeface(font), 36, Brushes.Black, 1), new Point(120, 100 + i * 80)); }
            var bitmap = new RenderTargetBitmap(1653, 2339, 96, 96, PixelFormats.Pbgra32); bitmap.Render(visual); var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap)); using var output = File.Create(Path.Combine(root, $"ocr-{name}.png")); encoder.Save(output);
            File.WriteAllText(Path.Combine(root, $"ocr-{name}-truth.txt"), string.Join("\n", Enumerable.Range(0, 24).Select(i => lines[i % 4])));
        }
    }
}
