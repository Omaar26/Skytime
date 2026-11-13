$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:5012"
$client = [System.Net.Http.HttpClient]::new()

function Assert-True([bool]$condition, [string]$message) {
    if (-not $condition) { throw $message }
}

function Get-Response([string]$path, [hashtable]$headers = @{}) {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, "$baseUrl$path")
    foreach ($key in $headers.Keys) { $request.Headers.Add($key, $headers[$key]) }
    return $client.SendAsync($request).GetAwaiter().GetResult()
}

try {
    $cors = Get-Response "/api/catalog/targets" @{ Origin = "http://localhost:5173" }
    Assert-True ($cors.Headers.Contains("Access-Control-Allow-Origin")) "CORS header is missing."

    $existing = Get-Response "/api/catalog/targets/sample-target/observations"
    $observations = $existing.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    Assert-True ([int]$existing.StatusCode -eq 200 -and $observations.Count -eq 2) "Existing target should have two sample observations."

    $empty = Get-Response "/api/catalog/targets/sample-empty-target/observations"
    $emptyBody = $empty.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    Assert-True ([int]$empty.StatusCode -eq 200 -and $emptyBody.Count -eq 0) "No-observation target should return an empty array."

    $wrongId = Get-Response "/api/catalog/targets/no-such-target/observations"
    $wrongBody = $wrongId.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    Assert-True ([int]$wrongId.StatusCode -eq 404 -and $wrongBody.error.code -eq "TARGET_NOT_FOUND") "Unknown target must return a JSON 404."

    $missing = Get-Response "/images/sample-target/missing.png"
    $missingBody = $missing.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    Assert-True ([int]$missing.StatusCode -eq 404 -and $missingBody.error.code -eq "FRAME_NOT_FOUND") "Missing image must return a JSON 404."

    $image = Get-Response "/images/sample-target/observation-1.png"
    Assert-True ($image.Content.Headers.ContentType.MediaType -eq "image/png") "Image route did not return image/png."
    $bytes = $image.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    $signature = [System.BitConverter]::ToString($bytes, 0, 8).Replace("-", "")
    Assert-True ($bytes.Length -gt 8 -and $signature -eq "89504E470D0A1A0A") "Image response is not a PNG."

    $contractImage = Get-Response "/api/frames/SAMPLE-OBSERVATION-1/image"
    Assert-True ($contractImage.Content.Headers.ContentType.MediaType -eq "image/png") "Contract frame image route did not return image/png."

    Write-Host "Person B API checks passed: CORS, existing target, empty observations, wrong ID, both PNG routes, and missing image JSON 404."
} finally {
    $client.Dispose()
}
