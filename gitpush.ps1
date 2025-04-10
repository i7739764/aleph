param (
    [string]$msg
)

if (-not $msg) {
    Write-Host "❌ Commit message required. Usage: ./gitpush.ps1 \"your message\"" -ForegroundColor Red
    exit 1
}

git add .
git commit -m "$msg"
git push
