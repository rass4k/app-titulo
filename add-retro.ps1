# add-retro.ps1: commits con LastWriteTime y CreationTime en el mensaje
Get-ChildItem -Recurse -Include *.js,*.py,*.html,*.css -Path .\src | ForEach-Object {
    $file     = $_.FullName
    $created  = $_.CreationTime.ToString("yyyy-MM-dd HH:mm:ss")
    $modified = $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
    git add "$file"
    git commit -q --date="$modified" -m "snapshot: $($_.Name) (created: $created)"
}