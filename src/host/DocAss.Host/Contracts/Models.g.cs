// Generated from the shared schema. Validate before deserializing wire data.
#nullable enable
using System.Text.Json;
using System.Text.Json.Serialization;
namespace DocAss.Host.Contracts;
public sealed record TextRange
{
    public long Start { get; init; } = default!;
    public long End { get; init; } = default!;
}
public sealed record PageInfo
{
    public long Page { get; init; } = default!;
    public double[] PageBox { get; init; } = default!;
    public int Rotate { get; init; } = default!;
    public double UserUnit { get; init; } = default!;
    public double Width { get; init; } = default!;
    public double Height { get; init; } = default!;
}
public sealed record Glyph
{
    public string Id { get; init; } = default!;
    public string Text { get; init; } = default!;
    public double[] Quad { get; init; } = default!;
    public double[] Baseline { get; init; } = default!;
    public string Source { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Confidence { get; init; } = default!;
}
public sealed record TextSpan
{
    public TextRange Range { get; init; } = default!;
    public string[] GlyphIds { get; init; } = default!;
    public string Kind { get; init; } = default!;
    public string LineId { get; init; } = default!;
}
public sealed record TextLine
{
    public string Id { get; init; } = default!;
    public TextRange Range { get; init; } = default!;
    public double[] Quad { get; init; } = default!;
    public string Direction { get; init; } = default!;
    public string[] GlyphIds { get; init; } = default!;
}
public sealed record PageText
{
    public long Page { get; init; } = default!;
    public double[] PageBox { get; init; } = default!;
    public double UserUnit { get; init; } = default!;
    public string TextRevision { get; init; } = default!;
    public string Source { get; init; } = default!;
    public string Text { get; init; } = default!;
    public Glyph[] Glyphs { get; init; } = default!;
    public TextSpan[] Spans { get; init; } = default!;
    public TextLine[] Lines { get; init; } = default!;
    public string Quality { get; init; } = default!;
    public string ProfileFingerprint { get; init; } = default!;
}
public sealed record TextAnchor
{
    public string Quote { get; init; } = default!;
    public string Prefix { get; init; } = default!;
    public string Suffix { get; init; } = default!;
    public TextRange[] Ranges { get; init; } = default!;
    public string TextRevision { get; init; } = default!;
    public string Source { get; init; } = default!;
}
public sealed record Annotation
{
    public string Id { get; init; } = default!;
    public string DocHash { get; init; } = default!;
    public long Page { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? GroupId { get; init; } = default!;
    public string Type { get; init; } = default!;
    public double[] Rect { get; init; } = default!;
    public string Color { get; init; } = default!;
    public double Opacity { get; init; } = default!;
    public string Author { get; init; } = default!;
    public string CreatedAt { get; init; } = default!;
    public string ModifiedAt { get; init; } = default!;
    public long Revision { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Contents { get; init; } = default!;
    public string MigrationState { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double[][]? Quads { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public TextAnchor? TextAnchor { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double[]? Anchor { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Text { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? FontSize { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? FontFamily { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Alignment { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double[][][]? Paths { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Width { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? StrokeWidth { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Fill { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double[]? From { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double[]? To { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? EndStyle { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonElement? LlmRef { get; init; } = default!;
}
public sealed record Message
{
    public string Id { get; init; } = default!;
    public string ConversationId { get; init; } = default!;
    public JsonElement ParentId { get; init; } = default!;
    public string BranchId { get; init; } = default!;
    public string Role { get; init; } = default!;
    public string CreatedAt { get; init; } = default!;
    public string State { get; init; } = default!;
    public long Sequence { get; init; } = default!;
    public JsonElement[] Content { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ModelRef { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonElement? Usage { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RunId { get; init; } = default!;
}
public sealed record Conversation
{
    public string Id { get; init; } = default!;
    public string Title { get; init; } = default!;
    public string ModelRef { get; init; } = default!;
    public string CreatedAt { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonElement? HeadId { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? Renamed { get; init; } = default!;
}
public sealed record Model
{
    public string ModelId { get; init; } = default!;
    public string[] Input { get; init; } = default!;
    public long ContextWindow { get; init; } = default!;
    public long MaxOutputTokens { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonElement? Compat { get; init; } = default!;
}
public sealed record Provider
{
    public string Id { get; init; } = default!;
    public string Name { get; init; } = default!;
    public string Api { get; init; } = default!;
    public string BaseUrl { get; init; } = default!;
    public bool IsDefault { get; init; } = default!;
    public bool ImageAllowed { get; init; } = default!;
    public Model[] Models { get; init; } = default!;
    public bool HasKey { get; init; } = default!;
}
public sealed record Job
{
    public string JobId { get; init; } = default!;
    public string DocId { get; init; } = default!;
    public long Page { get; init; } = default!;
    public string ContentRevision { get; init; } = default!;
    public string TextRevision { get; init; } = default!;
    public long PageGeneration { get; init; } = default!;
    public string Phase { get; init; } = default!;
}
public sealed record Effect
{
    public string ConversationId { get; init; } = default!;
    public string RunId { get; init; } = default!;
    public string ToolCallId { get; init; } = default!;
    public string[] AnnotationIds { get; init; } = default!;
    public string Result { get; init; } = default!;
}
public sealed record Command
{
    public string Type { get; init; } = default!;
    public JsonElement[] Mutations { get; init; } = default!;
}
public sealed record CommitCommandDto
{
    public int SchemaVersion { get; init; } = default!;
    public string OperationId { get; init; } = default!;
    public string DocId { get; init; } = default!;
    public long ExpectedRevision { get; init; } = default!;
    public string PayloadHash { get; init; } = default!;
    public Command Command { get; init; } = default!;
}
public sealed record Error
{
    public string Code { get; init; } = default!;
    public string Message { get; init; } = default!;
    public bool Retryable { get; init; } = default!;
}
public sealed record Request
{
    public int V { get; init; } = default!;
    public string Kind { get; init; } = default!;
    public string Id { get; init; } = default!;
    public string Method { get; init; } = default!;
    public JsonElement Params { get; init; } = default!;
}
public sealed record Event
{
    public int V { get; init; } = default!;
    public string Kind { get; init; } = default!;
    public string Topic { get; init; } = default!;
    public long Seq { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DocId { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? JobId { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? RunId { get; init; } = default!;
    public JsonElement Payload { get; init; } = default!;
}
public sealed record Settings
{
    public long Revision { get; init; } = default!;
    public string Author { get; init; } = default!;
    public long ChatWidth { get; init; } = default!;
    public string SidePanel { get; init; } = default!;
    public string Tool { get; init; } = default!;
    public string Color { get; init; } = default!;
    public double StrokeWidth { get; init; } = default!;
    public double Opacity { get; init; } = default!;
    public JsonElement Window { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonElement[]? ToolPreferences { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public OcrSettings? Ocr { get; init; } = default!;
}
public sealed record NativePage
{
    public string DocId { get; init; } = default!;
    public string JobId { get; init; } = default!;
    public string ContentRevision { get; init; } = default!;
    public long PageGeneration { get; init; } = default!;
    public string Status { get; init; } = default!;
    public PageInfo PageInfo { get; init; } = default!;
    public Glyph[] Glyphs { get; init; } = default!;
    public string ProfileFingerprint { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonElement? Reason { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public NativeSpace[]? Spaces { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? HasImages { get; init; } = default!;
}
public sealed record NativeSpace
{
    public string Text { get; init; } = default!;
    public double[] Baseline { get; init; } = default!;
}
public sealed record OcrSettings
{
    public string ModelTier { get; init; } = default!;
    public string Backend { get; init; } = default!;
    public long CacheMiB { get; init; } = default!;
}
public sealed record OcrRaster
{
    public PageInfo PageInfo { get; init; } = default!;
    public long Width { get; init; } = default!;
    public long Height { get; init; } = default!;
    public double Dpi { get; init; } = default!;
    public double[] RasterToPage { get; init; } = default!;
    public string Kind { get; init; } = default!;
}
public sealed record OcrStart
{
    public string DocId { get; init; } = default!;
    public long Page { get; init; } = default!;
    public OcrRaster Raster { get; init; } = default!;
    public long Priority { get; init; } = default!;
    public bool Force { get; init; } = default!;
}
public sealed record OcrProfile
{
    public string Fingerprint { get; init; } = default!;
    public string ModelHash { get; init; } = default!;
    public string EngineVersion { get; init; } = default!;
    public string ModelTier { get; init; } = default!;
    public string Backend { get; init; } = default!;
    public string Preprocessing { get; init; } = default!;
}
public sealed record OcrTicket
{
    public string DocId { get; init; } = default!;
    public string JobId { get; init; } = default!;
    public string SubscriptionId { get; init; } = default!;
    public long Page { get; init; } = default!;
    public string ContentRevision { get; init; } = default!;
    public long PageGeneration { get; init; } = default!;
    public OcrProfile Profile { get; init; } = default!;
    public bool NeedsRaster { get; init; } = default!;
}
public sealed record OcrStatus
{
    public string DocId { get; init; } = default!;
    public string JobId { get; init; } = default!;
    public string SubscriptionId { get; init; } = default!;
    public long Page { get; init; } = default!;
    public string ContentRevision { get; init; } = default!;
    public long PageGeneration { get; init; } = default!;
    public OcrProfile Profile { get; init; } = default!;
    public bool NeedsRaster { get; init; } = default!;
    public string Phase { get; init; } = default!;
    public bool NativeRunning { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Error { get; init; } = default!;
    public long CompletedPages { get; init; } = default!;
    public long TotalPages { get; init; } = default!;
}
public sealed record OcrLine
{
    public string Text { get; init; } = default!;
    public Glyph[] Glyphs { get; init; } = default!;
}
public sealed record OcrResult
{
    public string DocId { get; init; } = default!;
    public string JobId { get; init; } = default!;
    public string ContentRevision { get; init; } = default!;
    public long PageGeneration { get; init; } = default!;
    public OcrProfile Profile { get; init; } = default!;
    public OcrRaster Raster { get; init; } = default!;
    public OcrLine[] Lines { get; init; } = default!;
    public bool Empty { get; init; } = default!;
    public string Device { get; init; } = default!;
    public bool Fallback { get; init; } = default!;
    public bool Cached { get; init; } = default!;
    public double ElapsedMs { get; init; } = default!;
}
public sealed record ToolGetInfo
{
}
public sealed record ToolPageText
{
    public long From { get; init; } = default!;
    public long To { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Cursor { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? MaxChars { get; init; } = default!;
}
public sealed record ToolSearch
{
    public string Query { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Cursor { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? MaxHits { get; init; } = default!;
}
public sealed record ToolPageImage
{
    public long Page { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? MaxEdge { get; init; } = default!;
}
public sealed record ToolRegionImage
{
    public long Page { get; init; } = default!;
    public double[] Rect { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? MaxEdge { get; init; } = default!;
}
public sealed record ToolAnnotations
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? Page { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Type { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Cursor { get; init; } = default!;
}
public sealed record ToolCreateAnnotation
{
    public long Page { get; init; } = default!;
    public string Quote { get; init; } = default!;
    public string Type { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Comment { get; init; } = default!;
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? AnchorToken { get; init; } = default!;
}
