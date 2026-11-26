using System.Security.Cryptography;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using DocAss.Host.Contracts;

namespace DocAss.Host.Verification;

public sealed record OcrTruthCharacter(string Id,string Text,double[] Quad);
public sealed record OcrTruthPage(int Page,string Category,string Image,string ImageHash,string Font,string FontHash,OcrTruthCharacter[] Characters);
public sealed record OcrTruthCorpus(int Version,string Provenance,int Width,int Height,double Dpi,OcrTruthPage[] Pages);

// Fixture-only font outlines and layout generate independent truth BEFORE any OCR runs.
// These are synthetic coordinates, not human annotations or production text geometry.
public static class OcrSyntheticSamples
{
    public const int Width=1653,Height=2339;
    public static void Create(string root)
    {
        var pages=new[]{
            Render(1,"tilted-english","Arial",48,7,false,["Document assistant reads local files","Search selected words and save notes","Check rotated pages before signing","Every highlight stays on its page"]),
            Render(2,"tilted-chinese","Microsoft YaHei",52,-9,false,["中文文档识别与标注验证保持坐标一致","请核对合同内容并确认签署日期和金额","本地文字识别保护文档隐私无需上传","页面旋转缩放之后文字高亮仍然准确"]),
            Render(3,"vertical-chinese","Microsoft YaHei",52,0,true,["本地文字识别保护文档隐私并保持页面坐标一致","扫描文档经过识别之后可以选择复制搜索和标注","重新打开文件应当恢复已经保存的文字高亮位置","竖排中文按照从上到下从右到左的顺序连续阅读","取消识别立即停止等待后台结果不会覆盖新的任务","页面旋转缩放以后文本与字框仍然保持准确对应"])
        };
        File.WriteAllText(Path.Combine(root,"ocr-synthetic-truth.json"),Json.String(new OcrTruthCorpus(1,"synthetic-font-outline-layout; user-authorized substitute; not human annotations",Width,Height,200,pages)));

        OcrTruthPage Render(int page,string category,string family,double size,double angle,bool vertical,string[] lines)
        {
            if(!new Typeface(family).TryGetGlyphTypeface(out var font))throw new InvalidOperationException("Fixture font unavailable: "+family);
            var characters=new List<OcrTruthCharacter>();var visual=new DrawingVisual();
            using(var drawing=visual.RenderOpen())
            {
                drawing.DrawRectangle(Brushes.White,null,new Rect(0,0,Width,Height));
                for(var line=0;line<lines.Length;line++)
                {
                    var origin=new Point(vertical?1420-line*200:180,vertical?240:260+line*210);double advance=0;
                    foreach(var rune in lines[line].EnumerateRunes())
                    {
                        if(!font.CharacterToGlyphMap.TryGetValue(rune.Value,out var index))throw new InvalidOperationException("Missing fixture glyph: "+rune);
                        var glyph=font.GetGlyphOutline(index,size,size);var bounds=glyph.Bounds;
                        var transform=new TransformGroup();transform.Children.Add(new TranslateTransform(origin.X+(vertical?0:advance),origin.Y+(vertical?advance:0)));transform.Children.Add(new RotateTransform(angle,origin.X,origin.Y));
                        drawing.PushTransform(transform);drawing.DrawGeometry(Brushes.Black,null,glyph);drawing.Pop();
                        if(!string.IsNullOrWhiteSpace(rune.ToString()))
                        {
                            if(bounds.IsEmpty||bounds.Width<=0||bounds.Height<=0)throw new InvalidOperationException("Empty fixture outline");
                            var quad=new[]{bounds.TopLeft,bounds.TopRight,bounds.BottomRight,bounds.BottomLeft}.Select(transform.Transform).SelectMany(p=>new[]{p.X,p.Y}).ToArray();
                            characters.Add(new($"p{page}-l{line+1}-c{characters.Count+1}",rune.ToString(),quad));
                        }
                        advance+=vertical?60:font.AdvanceWidths[index]*size;
                    }
                }
            }
            var bitmap=new RenderTargetBitmap(Width,Height,96,96,PixelFormats.Pbgra32);bitmap.Render(visual);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));var name="ocr-"+category+".png";var path=Path.Combine(root,name);
            using(var output=File.Create(path))encoder.Save(output);
            return new(page,category,name,Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path))),family,Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(font.FontUri.LocalPath))),characters.ToArray());
        }
    }
}
