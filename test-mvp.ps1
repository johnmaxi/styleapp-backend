$baseUrl = "http://localhost:3000"

function Post-Json($url, $body) {
    try {
        return Invoke-RestMethod `
            -Method POST `
            -Uri $url `
            -ContentType "application/json" `
            -Body ($body | ConvertTo-Json -Depth 5)
    } catch {
        Write-Host "ERROR en POST $url" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        return $null
    }
}

function Get-Json($url) {
    try {
        return Invoke-RestMethod -Method GET -Uri $url
    } catch {
        Write-Host "ERROR en GET $url" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        return $null
    }
}

Write-Host "Creando usuarios..."

$cliente = Post-Json "$baseUrl/auth/register" @{
    name = "Juan Cliente"
    email = "cliente@test.com"
    password = "123456"
    role = "client"
    phone = "3000000000"
}

$barbero = Post-Json "$baseUrl/auth/register" @{
    name = "Pedro Barbero"
    email = "barbero@test.com"
    password = "123456"
    role = "barber"
    phone = "3111111111"
}

Write-Host "Usuarios listos.`n"

Write-Host "Login Cliente..."

$login = Post-Json "$baseUrl/auth/login" @{
    email = "cliente@test.com"
    password = "123456"
}

if (-not $login) {
    Write-Host "Login fallido. Abortando pruebas." -ForegroundColor Red
    exit
}

$clientId = $login.user.id
Write-Host "Login OK:"
$login | ConvertTo-Json -Depth 5
Write-Host ""

Write-Host "Creando service request..."

$job = Post-Json "$baseUrl/service-request" @{
    client_id = $clientId
    title = "Corte de cabello"
    description = "Quiero un corte moderno"
}

if (-not $job) {
    Write-Host "Error creando service request"
    exit
}

$jobId = $job.job.id
Write-Host "Service request creado con ID $jobId`n"

Write-Host "Creando bid..."

$bid = Post-Json "$baseUrl/bids" @{
    job_request_id = $jobId
    barber_id = 2
    amount = 50000
}

if (-not $bid) {
    Write-Host "Error creando bid"
    exit
}

Write-Host "Bid creado.`n"

Write-Host "Listando service requests..."

$jobs = Get-Json "$baseUrl/service-request"
$jobs | ConvertTo-Json -Depth 5
Write-Host ""

Write-Host "Listando bids de la solicitud..."

$bids = Get-Json "$baseUrl/bids/request/$jobId"
$bids | ConvertTo-Json -Depth 5

Write-Host "`nScript de prueba completado correctamente."