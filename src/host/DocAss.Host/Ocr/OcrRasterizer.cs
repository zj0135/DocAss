using System.Buffers.Binary;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using DocAss.Host.Contracts;
namespace DocAss.Host.Ocr;

public sealed record OcrPixels(byte[] Data, int Width, int Height, int Stride);
public static class OcrRasterizer
{
    public const int MaxPixels = 12_000_000, MaxEncoded = 16 * 1024 * 1024;
    public static void Validate(OcrRaster raster, PageInfo actual, string kind)
    {
        Contract.Check("OcrRaster", Json.Element(raster));
        Contract.Require(raster.Kind == kind && Json.Canonical(Json.Element(raster.PageInfo)) == Json.Canonical(Json.Element(actual)), "OCR 页面定义不匹配");
        Contract.Require(raster.Width * raster.Height <= MaxPixels, "OCR 栅格超过 12M 像素");
        var b = actual.PageBox; double[] expected;
        if (kind == "image") expected = [(b[2] - b[0]) / raster.Width, 0, 0, -(b[3] - b[1]) / raster.Height, b[0], b[3]];
        else
        {
            Contract.Require(raster.Dpi <= 200.000001); var s = raster.Dpi * actual.UserUnit / 72;
            var width = (actual.Rotate % 180 == 0 ? b[2] - b[0] : b[3] - b[1]) * s; var height = (actual.Rotate % 180 == 0 ? b[3] - b[1] : b[2] - b[0]) * s;
            Contract.Require(Math.Abs(raster.Width - Math.Ceiling(width)) <= 1 && Math.Abs(raster.Height - Math.Ceiling(height)) <= 1, "OCR 栅格尺寸不匹配");
            expected = actual.Rotate switch { 90 => [0, 1 / s, 1 / s, 0, b[0], b[1]], 180 => [-1 / s, 0, 0, 1 / s, b[2], b[1]], 270 => [0, -1 / s, -1 / s, 0, b[2], b[3]], _ => [1 / s, 0, 0, -1 / s, b[0], b[3]] };
        }
        Contract.Require(expected.Zip(raster.RasterToPage).All(p => Math.Abs(p.First - p.Second) < 1e-7), "OCR 坐标矩阵不匹配");
    }
    public static OcrPixels Decode(byte[] encoded, OcrRaster raster)
    {
        Contract.Require(encoded.Length is >= 24 and <= MaxEncoded && encoded.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }), "OCR 只接受受限 PNG");
        Contract.Require(BinaryPrimitives.ReadUInt32BigEndian(encoded.AsSpan(16)) == raster.Width && BinaryPrimitives.ReadUInt32BigEndian(encoded.AsSpan(20)) == raster.Height, "PNG 声明尺寸与任务不符");
        using var stream = new MemoryStream(encoded); return DecodeStream(stream, raster, false);
    }
    public static OcrPixels DecodeImage(string path, OcrRaster raster) { using var stream = File.OpenRead(path); return DecodeStream(stream, raster, true); }
    private static OcrPixels DecodeStream(Stream stream, OcrRaster raster, bool resize)
    {
        Contract.Require(raster.Width > 0 && raster.Height > 0 && raster.Width * raster.Height <= MaxPixels);
        var decoder = BitmapDecoder.Create(stream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnDemand); Contract.Require(decoder.Frames.Count == 1);
        BitmapSource frame = decoder.Frames[0]; Contract.Require((long)frame.PixelWidth * frame.PixelHeight <= (resize ? Documents.ImageDecoder.MaxPixels : MaxPixels));
        if (resize && (frame.PixelWidth != raster.Width || frame.PixelHeight != raster.Height)) frame = new TransformedBitmap(frame, new ScaleTransform((double)raster.Width / frame.PixelWidth, (double)raster.Height / frame.PixelHeight));
        Contract.Require(frame.PixelWidth == raster.Width && frame.PixelHeight == raster.Height);
        var stride = checked((int)raster.Width * 4); var pixels = new byte[checked(stride * (int)raster.Height)]; new FormatConvertedBitmap(frame, PixelFormats.Bgra32, null, 0).CopyPixels(pixels, stride, 0);
        // Composite transparent pixels onto white before recognition.
        for (var i = 0; i < pixels.Length; i += 4) { var alpha = pixels[i + 3]; for (var c = 0; c < 3; c++) pixels[i + c] = (byte)((pixels[i + c] * alpha + 255 * (255 - alpha) + 127) / 255); pixels[i + 3] = 255; }
        return new(pixels, (int)raster.Width, (int)raster.Height, stride);
    }
}
