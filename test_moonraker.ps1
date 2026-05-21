# test_moonraker.ps1

$api_key = "e9d902901dae4566ab0a0ebb5f59c815"
$base_url = "http://10.19.84.68:7125"

$endpoints = @(
    "/server/database/item?namespace=fluidd",
    "/server/database/list?namespace=fluidd",
    "/server/info",
    "/server/config",
    "/server/temperature_store",
    "/server/gcode_store",
    "/printer",
    "/api/system/info",
    "/api/printer"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Moonraker API Endpoints" -ForegroundColor Cyan
Write-Host "Base URL: $base_url" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($endpoint in $endpoints) {
    $url = "$base_url$endpoint"
    Write-Host "GET $endpoint" -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri $url `
            -Headers @{
                "X-API-KEY" = $api_key
                "Content-Type" = "application/json"
            } `
            -TimeoutSec 5 `
            -ErrorAction Stop
        
        Write-Host "  ✓ Status: $($response.StatusCode)" -ForegroundColor Green
        
        if ($response.Content) {
            try {
                $data = $response.Content | ConvertFrom-Json
                $json = $data | ConvertTo-Json -Depth 2
                if ($json.Length -gt 500) {
                    Write-Host "  Response (truncated):" -ForegroundColor Cyan
                    Write-Host $json.Substring(0, 500) -ForegroundColor White
                    Write-Host "  ... (response too long)" -ForegroundColor Gray
                } else {
                    Write-Host "  Response:" -ForegroundColor Cyan
                    Write-Host $json -ForegroundColor White
                }
            } catch {
                Write-Host "  Response: $($response.Content.Substring(0, 200))" -ForegroundColor White
            }
        }
    }
    catch {
        if ($_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode.Value__
            Write-Host "  ✗ Error: $statusCode - $($_.Exception.Message)" -ForegroundColor Red
        } else {
            Write-Host "  ✗ Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
}