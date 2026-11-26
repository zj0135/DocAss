using DocAss.Host.Contracts;

namespace DocAss.Host.Documents;

/// <summary>
/// Abstraction for registering, tracking, and leasing document handles.
/// </summary>
public interface IDocumentRegistry : IDisposable
{
    DocHandle Register(string hash, string fileName, int pageCount, long length = 0, string kind = "pdf");

    DocHandle Resolve(string id, bool write = false);

    int PageCount(string id);

    DocHandle Reacquire(string id);

    void Close(string id);
}
