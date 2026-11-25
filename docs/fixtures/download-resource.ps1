param([Parameter(Mandatory=$true)][string]$Uri,[Parameter(Mandatory=$true)][string]$Output,[int]$PrefixBytes=0)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
if($PrefixBytes -eq 0){Invoke-WebRequest -Uri $Uri -OutFile $Output -TimeoutSec 120;exit}
$request=[Net.WebRequest]::Create($Uri)
$request.Timeout=120000
$request.AddRange(0,$PrefixBytes-1)
$response=$request.GetResponse()
$inputStream=$response.GetResponseStream()
$outputStream=[IO.File]::Create($Output)
$buffer=New-Object byte[] 65536
$remaining=$PrefixBytes
try {
    while($remaining -gt 0){
        $count=$inputStream.Read($buffer,0,[Math]::Min($buffer.Length,$remaining))
        if($count -eq 0){throw 'Incomplete archive prefix'}
        $outputStream.Write($buffer,0,$count)
        $remaining-=$count
    }
} finally {$outputStream.Dispose();$inputStream.Dispose();$response.Dispose()}
