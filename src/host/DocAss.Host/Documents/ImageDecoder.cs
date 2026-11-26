using System.Windows.Media;
using System.Windows.Media.Imaging;
using DocAss.Host.Contracts;

namespace DocAss.Host.Documents;

public sealed record ImageInfo(int PixelWidth, int PixelHeight, double DpiX, double DpiY, int Orientation, PageInfo PageInfo);
public static class ImageDecoder
{
    public const long MaxPixels = 64L * 1024 * 1024;
    public static double EffectiveDpi(double dpi) => double.IsFinite(dpi) && dpi >= 36 && dpi <= 1200 ? dpi : 96;
    // WIC decodes the source without applying EXIF. Transform raw pixels exactly once;
    // the output PNG has no orientation metadata and is also the future OCR input.
    public static ImageInfo Normalize(string source, string destination, CancellationToken token = default)
    {
        var temporary = destination + "." + Guid.NewGuid() + ".tmp";
        try
        {
            using var input = File.OpenRead(source);
            RejectAnimatedPng(input); input.Position = 0;
            var decoder = BitmapDecoder.Create(input, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnDemand);
            if (decoder.Frames.Count != 1) throw new AppException("MULTIFRAME_IMAGE", "暂不支持多帧图片");
            var frame = decoder.Frames[0];
            if (frame.PixelWidth <= 0 || frame.PixelHeight <= 0 || (long)frame.PixelWidth * frame.PixelHeight > MaxPixels || Math.Max(frame.PixelWidth, frame.PixelHeight) > 32768)
                throw new AppException("IMAGE_TOO_LARGE", "图片尺寸超过解码上限（64M 像素 / 单边 32768）");
            var orientation = 1;
            if (frame.Metadata is BitmapMetadata metadata)
                foreach (var query in new[] { "/app1/ifd/{ushort=274}", "/ifd/{ushort=274}" })
                    try { if (metadata.GetQuery(query) is { } value) { orientation = Convert.ToInt32(value); break; } } catch (NotSupportedException) { }
            if (orientation is < 1 or > 8) orientation = 1;
            var width = frame.PixelWidth; var height = frame.PixelHeight;
            var swapped = orientation >= 5; var targetWidth = swapped ? height : width; var targetHeight = swapped ? width : height;
            var dpiX = EffectiveDpi(swapped ? frame.DpiY : frame.DpiX); var dpiY = EffectiveDpi(swapped ? frame.DpiX : frame.DpiY);
            var pixels = new byte[checked(width * height * 4)];
            new FormatConvertedBitmap(frame, PixelFormats.Bgra32, null, 0).CopyPixels(pixels, width * 4, 0);
            var output = new byte[pixels.Length];
            for (var y = 0; y < height; y++)
            {
                token.ThrowIfCancellationRequested();
                for (var x = 0; x < width; x++)
                {
                    var (tx, ty) = Orient(x, y, width, height, orientation);
                    Buffer.BlockCopy(pixels, (y * width + x) * 4, output, (ty * targetWidth + tx) * 4, 4);
                }
            }
            var bitmap = BitmapSource.Create(targetWidth, targetHeight, dpiX, dpiY, PixelFormats.Bgra32, null, output, targetWidth * 4);
            var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap));
            using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { encoder.Save(file); file.Flush(true); }
            token.ThrowIfCancellationRequested(); File.Move(temporary, destination, true);
            var w = targetWidth * 72 / dpiX; var h = targetHeight * 72 / dpiY;
            return new(targetWidth, targetHeight, dpiX, dpiY, orientation, new() { Page = 1, PageBox = [0, 0, w, h], Width = w, Height = h, UserUnit = 1, Rotate = 0 });
        }
        catch (AppException) { throw; }
        catch (Exception ex) when (ex is FileFormatException or NotSupportedException or ArgumentException or System.Runtime.InteropServices.COMException)
        { throw new AppException("INVALID_IMAGE", "图片损坏或格式不受支持"); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
    private static void RejectAnimatedPng(Stream input)
    {
        Span<byte> signature = stackalloc byte[8]; if (input.Read(signature) != 8 || !signature.SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return;
        Span<byte> header = stackalloc byte[8];
        while (input.Read(header) == 8)
        {
            var length = System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(header);
            if (header[4..].SequenceEqual("acTL"u8)) throw new AppException("MULTIFRAME_IMAGE", "暂不支持动画 PNG");
            if (length > input.Length - input.Position - 4) return;
            input.Seek((long)length + 4, SeekOrigin.Current);
        }
    }
    public static (int X, int Y) Orient(int x, int y, int w, int h, int orientation) => orientation switch
    {
        2 => (w - 1 - x, y),
        3 => (w - 1 - x, h - 1 - y),
        4 => (x, h - 1 - y),
        5 => (y, x),
        6 => (h - 1 - y, x),
        7 => (h - 1 - y, w - 1 - x),
        8 => (y, w - 1 - x),
        _ => (x, y)
    };
}
