using System.Security.Cryptography;
using DocAss.Host.Contracts;

namespace DocAss.Host.Settings;

internal static class CredentialVault
{
    internal static byte[] Decrypt(byte[] cipher)
    {
        try { return ProtectedData.Unprotect(cipher, null, DataProtectionScope.CurrentUser); }
        catch (Exception ex) when (ex is CryptographicException or UnauthorizedAccessException)
        { throw new AppException("CREDENTIAL_UNAVAILABLE", "当前 Windows 用户无法解密凭据，请重新输入"); }
    }
}
