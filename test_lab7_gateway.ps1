<#
.SYNOPSIS
    Automated Test Runner for Lab 7: API Gateway, Service Discovery & Cloud Deployment
    Web Services & SOA Laboratory

.DESCRIPTION
    Validates:
    1. Gateway Health Check (GET /health -> 200 OK)
    2. Service Discovery Registry (GET /routes -> 200 OK)
    3. Gateway Reverse-Proxy to User Service (GET /users -> 200 OK)
    4. Gateway Reverse-Proxy to Product Service (GET /products -> 200 OK)
    5. Gateway Reverse-Proxy to Order Service (POST /orders -> 201 Created)
    6. Security Enforcement: Direct host access to 3001/3002/3003 is BLOCKED
    7. Configuration-Based Service Discovery Dynamic Reconfiguration
    8. Centralized 502/503 Error Handling when backend container is stopped
    9. Service Recovery after container restart
#>

param(
    [string]$GatewayUrl = "http://localhost:8080",
    [switch]$IncludeContainerLifecycleTests
)

$ErrorActionPreference = "Continue"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  CampusConnect Lab 7: API Gateway & Discovery Test Suite" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Gateway Target URL: $GatewayUrl" -ForegroundColor Gray
Write-Host ""

$passed = 0
$failed = 0

function Assert-Test {
    param(
        [string]$TestName,
        [bool]$Condition,
        [string]$Details = ""
    )
    if ($Condition) {
        Write-Host "[PASS] $TestName" -ForegroundColor Green
        if ($Details) { Write-Host "       $Details" -ForegroundColor DarkGray }
        $script:passed++
    } else {
        Write-Host "[FAIL] $TestName" -ForegroundColor Red
        if ($Details) { Write-Host "       $Details" -ForegroundColor DarkYellow }
        $script:failed++
    }
}

# -------------------------------------------------------------
# Stage 1: Gateway Direct Health & Service Discovery Inspection
# -------------------------------------------------------------
Write-Host "--- Stage 1: Testing Gateway Direct Endpoints ---" -ForegroundColor Yellow

try {
    $gwHealth = Invoke-RestMethod -Uri "$GatewayUrl/health" -Method Get -TimeoutSec 5
    Assert-Test "API Gateway Health Check (:8080/health)" ($gwHealth.status -eq "UP") "Gateway Status: $($gwHealth.status), Service: $($gwHealth.service)"
} catch {
    Assert-Test "API Gateway Health Check (:8080/health)" $false $_.Exception.Message
}

try {
    $routes = Invoke-RestMethod -Uri "$GatewayUrl/routes" -Method Get -TimeoutSec 5
    $hasServices = $routes.routingTable.Count -ge 3
    Assert-Test "Service Discovery Registry (:8080/routes)" ($routes.success -eq $true -and $hasServices) "Found $($routes.routingTable.Count) registered upstream microservices"
} catch {
    Assert-Test "Service Discovery Registry (:8080/routes)" $false $_.Exception.Message
}

# -------------------------------------------------------------
# Stage 2: Gateway Reverse-Proxy Route Verification
# -------------------------------------------------------------
Write-Host ""
Write-Host "--- Stage 2: Testing Gateway Reverse-Proxy Routes ---" -ForegroundColor Yellow

try {
    $users = Invoke-RestMethod -Uri "$GatewayUrl/users" -Method Get -TimeoutSec 5
    Assert-Test "Gateway -> User Service (GET /users)" ($users.success -eq $true -and $users.data.Count -gt 0) "Proxied cleanly. Users found: $($users.data.Count)"
} catch {
    Assert-Test "Gateway -> User Service (GET /users)" $false $_.Exception.Message
}

try {
    $user101 = Invoke-RestMethod -Uri "$GatewayUrl/users/101" -Method Get -TimeoutSec 5
    Assert-Test "Gateway -> User Service by ID (GET /users/101)" ($user101.data.name -eq "Aarav Patel") "User name: $($user101.data.name)"
} catch {
    Assert-Test "Gateway -> User Service by ID (GET /users/101)" $false $_.Exception.Message
}

try {
    $products = Invoke-RestMethod -Uri "$GatewayUrl/products" -Method Get -TimeoutSec 5
    Assert-Test "Gateway -> Product Service (GET /products)" ($products.success -eq $true -and $products.data.Count -gt 0) "Proxied cleanly. Products found: $($products.data.Count)"
} catch {
    Assert-Test "Gateway -> Product Service (GET /products)" $false $_.Exception.Message
}

try {
    $prod501 = Invoke-RestMethod -Uri "$GatewayUrl/products/501" -Method Get -TimeoutSec 5
    Assert-Test "Gateway -> Product Service by ID (GET /products/501)" ($prod501.data.price -eq 45) "Product: $($prod501.data.name), Price: $$($prod501.data.price)"
} catch {
    Assert-Test "Gateway -> Product Service by ID (GET /products/501)" $false $_.Exception.Message
}

# Order creation through gateway
$orderPayload = @{
    userId = "101"
    productId = "501"
    quantity = 2
} | ConvertTo-Json

try {
    $orderRes = Invoke-RestMethod -Uri "$GatewayUrl/orders" -Method Post -Body $orderPayload -ContentType "application/json" -TimeoutSec 10
    Assert-Test "Gateway -> Order Service (POST /orders)" ($orderRes.success -eq $true) "Order Created via Gateway! ID: $($orderRes.data.id), Total: $$($orderRes.data.totalAmount)"
} catch {
    Assert-Test "Gateway -> Order Service (POST /orders)" $false $_.Exception.Message
}

# -------------------------------------------------------------
# Stage 3: Security & Isolation Check (Ports 3001/3002/3003 Blocked)
# -------------------------------------------------------------
Write-Host ""
Write-Host "--- Stage 3: Testing Host Port Isolation (Security Enforcement) ---" -ForegroundColor Yellow

function Test-PortBlocked {
    param([int]$Port, [string]$ServiceName)
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(800, $false)
        if ($wait) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            return $false # Connected = Not blocked
        }
        $tcp.Close()
        return $true # Timeout = Blocked
    } catch {
        return $true # Exception = Blocked
    }
}

$uBlocked = Test-PortBlocked 3001 "user-service"
$pBlocked = Test-PortBlocked 3002 "product-service"
$oBlocked = Test-PortBlocked 3003 "order-service"

Assert-Test "User Service port 3001 NOT exposed on host" $uBlocked "Reachable ONLY through Gateway via Docker network"
Assert-Test "Product Service port 3002 NOT exposed on host" $pBlocked "Reachable ONLY through Gateway via Docker network"
Assert-Test "Order Service port 3003 NOT exposed on host" $oBlocked "Reachable ONLY through Gateway via Docker network"

# -------------------------------------------------------------
# Stage 4: Configuration-Based Service Discovery Proof
# -------------------------------------------------------------
Write-Host ""
Write-Host "--- Stage 4: Testing Configuration-Based Service Discovery ---" -ForegroundColor Yellow

$updatePayload = @{
    newUrl = "http://user-service:3001"
} | ConvertTo-Json

try {
    $updateRes = Invoke-RestMethod -Uri "$GatewayUrl/registry/userService" -Method Put -Body $updatePayload -ContentType "application/json" -TimeoutSec 5
    Assert-Test "Dynamic service discovery reconfiguration without code restart" ($updateRes.success -eq $true) "Route updated: $($updateRes.service.url)"
} catch {
    Assert-Test "Dynamic service discovery reconfiguration without code restart" $false $_.Exception.Message
}

# -------------------------------------------------------------
# Stage 5: Centralized 502/503 Error Handling & Resilience
# -------------------------------------------------------------
if ($IncludeContainerLifecycleTests) {
    Write-Host ""
    Write-Host "--- Stage 5: Testing Gateway Centralized 502/503 Error Handling ---" -ForegroundColor Yellow
    
    Write-Host "[INFO] Stopping user-service container to simulate failure..." -ForegroundColor Gray
    docker compose stop user-service | Out-Null
    Start-Sleep -Seconds 2

    try {
        $null = Invoke-WebRequest -Uri "$GatewayUrl/users" -Method Get -TimeoutSec 5
        Assert-Test "Gateway returns centralized 502/503 on unreachable upstream" $false "Expected 502/503, but request succeeded."
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Assert-Test "Gateway returns centralized 502/503 on unreachable upstream" ($statusCode -eq 502 -or $statusCode -eq 503 -or $statusCode -eq 504) "Gateway returned controlled code: $statusCode"
    }

    Write-Host "[INFO] Restarting user-service container..." -ForegroundColor Gray
    docker compose start user-service | Out-Null
    Start-Sleep -Seconds 4

    try {
        $recovery = Invoke-RestMethod -Uri "$GatewayUrl/users" -Method Get -TimeoutSec 10
        Assert-Test "Gateway automatically recovers when upstream service restarts" ($recovery.success -eq $true) "Successfully recovered via Gateway!"
    } catch {
        Assert-Test "Gateway automatically recovers when upstream service restarts" $false $_.Exception.Message
    }
} else {
    Write-Host ""
    Write-Host "[INFO] To test container stop/restart (502/503 error handling), run with: -IncludeContainerLifecycleTests" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  Test Summary: $passed PASSED, $failed FAILED" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "=================================================================" -ForegroundColor Cyan
