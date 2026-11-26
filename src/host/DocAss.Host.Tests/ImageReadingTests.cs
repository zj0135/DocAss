using System.Windows.Media;
using System.Windows.Media.Imaging;
using DocAss.Host.Contracts;
using DocAss.Host.Documents;
using Xunit;
namespace DocAss.Host.Tests;
public sealed class ImageReadingTests
{
    [Fact] public void EightExifOrientationsAreAppliedOnceToRealWicPixels()
    {
        var folder=Path.Combine(ReadingTests.Root,"artifacts","reading","exif");Directory.CreateDirectory(folder);
        var pixels=new byte[40*24*4];for(var y=0;y<24;y++)for(var x=0;x<40;x++){var i=(y*40+x)*4;pixels[i]=(byte)(x<20?0:220);pixels[i+1]=(byte)(y<12?0:220);pixels[i+2]=(byte)(x<20?220:0);pixels[i+3]=255;}
        var bitmap=BitmapSource.Create(40,24,144,72,PixelFormats.Bgra32,null,pixels,40*4);
        for(var orientation=1;orientation<=8;orientation++)
        {
            var source=Path.Combine(folder,$"orientation-{orientation}.jpg");var target=source+".png";
            var metadata=new BitmapMetadata("jpg");metadata.SetQuery("/app1/ifd/{ushort=274}",(ushort)orientation);
            var encoder=new JpegBitmapEncoder{QualityLevel=100};encoder.Frames.Add(BitmapFrame.Create(bitmap,null,metadata,null));using(var file=File.Create(source))encoder.Save(file);
            var info=ImageDecoder.Normalize(source,target);Assert.Equal(orientation,info.Orientation);Assert.Equal(orientation>=5?24:40,info.PixelWidth);Assert.Equal(orientation>=5?40:24,info.PixelHeight);
            using var original=File.OpenRead(source);var frame=BitmapDecoder.Create(original,BitmapCreateOptions.PreservePixelFormat,BitmapCacheOption.OnLoad).Frames[0];var raw=new byte[pixels.Length];new FormatConvertedBitmap(frame,PixelFormats.Bgra32,null,0).CopyPixels(raw,40*4,0);
            using var output=File.OpenRead(target);var normalized=BitmapDecoder.Create(output,BitmapCreateOptions.PreservePixelFormat,BitmapCacheOption.OnLoad).Frames[0];var result=new byte[pixels.Length];new FormatConvertedBitmap(normalized,PixelFormats.Bgra32,null,0).CopyPixels(result,info.PixelWidth*4,0);
            for(var y=0;y<24;y++)for(var x=0;x<40;x++){var (tx,ty)=ImageDecoder.Orient(x,y,40,24,orientation);Assert.Equal(raw.AsSpan((y*40+x)*4,4).ToArray(),result.AsSpan((ty*info.PixelWidth+tx)*4,4).ToArray());}
            var twice=ImageDecoder.Normalize(target,target+".png");Assert.Equal(1,twice.Orientation);Assert.Equal(info.PixelWidth,twice.PixelWidth);Assert.Equal(info.PixelHeight,twice.PixelHeight);
        }
    }
    [Fact] public void RejectsRealMultiframeAndCorruptImagesAndSupportsBmp()
    {
        var folder=Path.Combine(ReadingTests.Root,"artifacts","reading","images");Directory.CreateDirectory(folder);
        var bitmap=BitmapSource.Create(2,2,96,96,PixelFormats.Bgra32,null,new byte[16],8);
        var gif=new GifBitmapEncoder();gif.Frames.Add(BitmapFrame.Create(bitmap));gif.Frames.Add(BitmapFrame.Create(bitmap));var file=Path.Combine(folder,"multiframe.png");using(var output=File.Create(file))gif.Save(output);
        Assert.Equal("MULTIFRAME_IMAGE",Assert.Throws<AppException>(()=>ImageDecoder.Normalize(file,file+".png")).Code);
        var bmp=new BmpBitmapEncoder();bmp.Frames.Add(BitmapFrame.Create(bitmap));file=Path.Combine(folder,"valid.bmp");using(var output=File.Create(file))bmp.Save(output);Assert.Equal(2,ImageDecoder.Normalize(file,file+".png").PixelWidth);
        file=Path.Combine(folder,"broken.png");File.WriteAllText(file,"broken");Assert.Equal("INVALID_IMAGE",Assert.Throws<AppException>(()=>ImageDecoder.Normalize(file,file+".png")).Code);
        file=Path.Combine(folder,"animated.png");File.WriteAllBytes(file,[137,80,78,71,13,10,26,10,0,0,0,8,97,99,84,76,0,0,0,2,0,0,0,0,0,0,0,0]);
        Assert.Equal("MULTIFRAME_IMAGE",Assert.Throws<AppException>(()=>ImageDecoder.Normalize(file,file+".png")).Code);
    }
}
