# Regenera data/galeria.js a partir de las carpetas de img/galeria/
# Uso:  powershell -ExecutionPolicy Bypass -File actualizar-galeria.ps1
#
# Nombre de carpeta:  AAAA-MM-DD            -> img/galeria/2026-10-17
#                o:   AAAA-MM-DD Titulo     -> img/galeria/2026-10-17 Noche Tropical

$raiz      = Split-Path -Parent $MyInvocation.MyCommand.Path
$galeria   = Join-Path $raiz "img\galeria"
$salida    = Join-Path $raiz "data\galeria.js"
$extension = @(".jpg", ".jpeg", ".png", ".webp", ".gif")

function Escapar([string]$s) { return $s.Replace('\', '\\').Replace('"', '\"') }

$noches = @()
Get-ChildItem -Path $galeria -Directory | Sort-Object Name -Descending | ForEach-Object {
    $carpeta = $_
    if ($carpeta.Name -notmatch '^(\d{4}-\d{2}-\d{2})\s*(.*)$') {
        Write-Warning "Carpeta ignorada (no empieza por AAAA-MM-DD): $($carpeta.Name)"
        return
    }
    $fecha  = $Matches[1]
    $titulo = $Matches[2].Trim()

    $fotos = Get-ChildItem -Path $carpeta.FullName -File |
        Where-Object { $extension -contains $_.Extension.ToLower() } |
        Sort-Object Name |
        ForEach-Object { '"' + (Escapar ("img/galeria/" + $carpeta.Name + "/" + $_.Name)) + '"' }

    if (-not $fotos) { return }

    $noches += "  { fecha: `"$fecha`", titulo: `"$(Escapar $titulo)`", fotos: [`n    " + ($fotos -join ",`n    ") + "`n  ] }"
    Write-Host "$fecha  ->  $(@($fotos).Count) fotos"
}

$contenido = @"
/* =========================================================
   GALERIA DE FOTOS DE LA DISCOTECA
   Archivo generado por actualizar-galeria.ps1 - no editar a mano
   (o editalo, pero se sobrescribe al volver a ejecutar el script).
   ========================================================= */
window.BOTANIC_GALERIA = [
$($noches -join ",`n")
];
"@

[System.IO.File]::WriteAllText($salida, $contenido, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Galeria actualizada: $($noches.Count) noches -> data\galeria.js"
