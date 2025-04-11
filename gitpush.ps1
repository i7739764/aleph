param (
    [Parameter(Mandatory=$true)]
    [string]$msg
)

# Export SQLite schema before commit
Write-Host "📤 Exporting SQLite schema..."
$schemaFile = "db_schema.sql"
$dbPath = "bot_trades.db"

if (Test-Path $schemaFile) {
    Remove-Item $schemaFile
}

& sqlite3 $dbPath ".schema" | Out-File -Encoding UTF8 $schemaFile

# Stage all changes
Write-Host "📦 Staging changes..."
git add -A

# Commit
Write-Host "✅ Committing with message: $msg"
git commit -m "$msg"

# Push to GitHub
Write-Host "🚀 Pushing to GitHub..."
git push
