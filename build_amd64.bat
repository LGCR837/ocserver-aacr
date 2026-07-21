@echo off
cd /d "%~dp0"
echo Building server_windows_amd64.exe ...
go build -mod=mod -buildvcs=false -o server_windows_amd64.exe .\cmd\api
if errorlevel 1 (
    echo.
    echo Build FAILED!
    pause
    exit /b 1
)
echo.
echo Build OK: server_windows_amd64.exe
pause
