<#
.SYNOPSIS
    Dbt Admin Console'u bu makinede sürekli çalışır hâlde tutar.

.DESCRIPTION
    Oturum açıldığında başlayan bir Zamanlanmış Görev kurar; görev
    `scripts/serve-local.mjs` ile derlenmiş çıktıyı http://localhost/admin-console
    adresinden servis eder.

    NEDEN WINDOWS SERVİSİ DEĞİL: gerçek bir servis (sc.exe / nssm) yönetici hakkı
    ister ve nssm gibi bir araç kurulmasını gerektirir. Zamanlanmış görev aynı işi
    yükseltme olmadan görür: her oturum açılışında başlar, çökerse yeniden denenir,
    buradan durdurulup başlatılabilir. Tek farkı oturum kapalıyken çalışmaması —
    kendi makinenizde geliştirme aracı için bu bir sorun değil.
    Oturumdan bağımsız çalışması gerekirse nssm ile gerçek servise taşınabilir;
    komut aynı: node scripts\serve-local.mjs

.PARAMETER Action
    install   : görevi kurar ve başlatır
    uninstall : görevi durdurur ve kaldırır
    start     : başlatır
    stop      : durdurur
    restart   : durdurup başlatır (yeni derlemeyi devreye alır)
    status    : durumu gösterir
    deploy    : yeniden derler (build:local) ve servisi yeniden başlatır

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\local-service.ps1 -Action install
#>

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('install', 'uninstall', 'start', 'stop', 'restart', 'status', 'deploy')]
    [string]$Action,

    [string]$TaskName = 'DbtAdminConsole',
    [int]$Port = 80,
    [string]$BasePath = '/admin-console'
)

$ErrorActionPreference = 'Stop'

$webRoot = Split-Path -Parent $PSScriptRoot
$serveScript = Join-Path $PSScriptRoot 'serve-local.mjs'

function Get-NodePath {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) { throw "node bulunamadi. Node.js kurulu mu?" }
    return $cmd.Source
}

function Get-Task {
    return Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Show-Status {
    $task = Get-Task
    if (-not $task) {
        Write-Output "Gorev kurulu degil ($TaskName). Kurmak icin: -Action install"
        return
    }

    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Output ("Gorev    : " + $task.TaskName + " [" + $task.State + "]")
    Write-Output ("Son calisma: " + $info.LastRunTime + "  sonuc: " + $info.LastTaskResult)

    $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($listening) {
        Write-Output ("Port $Port : dinleniyor (pid " + ($listening.OwningProcess | Select-Object -First 1) + ")")
        Write-Output ("Adres    : http://localhost" + $BasePath + "/")
    }
    else {
        Write-Output "Port $Port : dinlenmiyor"
    }
}

switch ($Action) {
    'install' {
        if (Get-Task) {
            Write-Output "Gorev zaten kurulu; yeniden kuruluyor."
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }

        $node = Get-NodePath

        # PowerShell sarmalayici: pencere acilmasin. node, gizli kabugun cocugu olarak kosar.
        $inner = "& '$node' '$serveScript'"
        $arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -Command `"$inner`""

        # DIKKAT: degisken adlari $action/$trigger/$settings OLAMAZ - PowerShell degisken
        # adlarinda buyuk/kucuk harf ayirmadigi icin $action, -Action parametresini ezer ve
        # ValidateSet hatasi verir.
        $taskAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $webRoot
        $taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

        # Suresiz kossun, cokerse yeniden denensin, pil/guc durumundan etkilenmesin.
        $taskSettings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -RestartCount 3 `
            -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

        Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings `
            -Description 'Dbt Admin Console - lokal statik sunucu (http://localhost/admin-console)' | Out-Null

        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 2

        Write-Output "Kuruldu ve baslatildi."
        Show-Status
    }

    'uninstall' {
        if (-not (Get-Task)) { Write-Output "Gorev zaten yok."; break }
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Output "Kaldirildi."
    }

    'start' {
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 2
        Show-Status
    }

    'stop' {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

        # Zamanlanmis gorev sarmalayiciyi durdurur; node cocugu bazen ayakta kalir.
        # YALNIZ node sureclerini kapatiyoruz: port 80'i tutan baska bir sey (IIS, baska bir
        # uygulama) varsa ona dokunulmamali.
        $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($procId in ($listening.OwningProcess | Select-Object -Unique)) {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq 'node') {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            }
            elseif ($proc) {
                Write-Output ("Port $Port'i node disi bir surec tutuyor, dokunulmadi: " + $proc.ProcessName + " (pid $procId)")
            }
        }

        Write-Output "Durduruldu."
    }

    'restart' {
        & $PSCommandPath -Action stop -TaskName $TaskName -Port $Port -BasePath $BasePath
        Start-Sleep -Seconds 1
        & $PSCommandPath -Action start -TaskName $TaskName -Port $Port -BasePath $BasePath
    }

    'status' { Show-Status }

    'deploy' {
        Write-Output "Derleniyor (build:local)..."
        Push-Location $webRoot
        try { & npm run build:local } finally { Pop-Location }

        Write-Output "Servis yeniden baslatiliyor..."
        & $PSCommandPath -Action restart -TaskName $TaskName -Port $Port -BasePath $BasePath
    }
}
