@echo off
:: BatchGotAdmin
:-------------------------------------
REM  --> Check for permissions
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"

REM --> If error flag set, we do not have admin.
if '%errorlevel%' NEQ '0' (
    echo Requesting administrative privileges...
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    if exist "%temp%\getadmin.vbs" ( del "%temp%\getadmin.vbs" )
    pushd "%CD%"
    CD /D "%~dp0"
:--------------------------------------

title Setup Local Domain - wa-api.api
color 0A

echo.
echo ============================================
echo   Setup Local Domain: wa-api.api
echo ============================================
echo.

set HOSTS_FILE=C:\Windows\System32\drivers\etc\hosts
set DOMAIN=wa-api.api
set IP=127.0.0.1

echo [1] Checking if domain already exists...
findstr /C:"%DOMAIN%" "%HOSTS_FILE%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Domain %DOMAIN% already exists in hosts file
    echo.
    findstr /C:"%DOMAIN%" "%HOSTS_FILE%"
    echo.
    choice /C YN /M "Do you want to update it"
    if errorlevel 2 goto :skip_add
)

echo.
echo [2] Adding domain to hosts file...
echo # Baileys WhatsApp API Local Domain >> "%HOSTS_FILE%"
echo %IP%	%DOMAIN% >> "%HOSTS_FILE%"

if %errorlevel% equ 0 (
    echo [OK] Domain added successfully!
) else (
    echo [ERROR] Failed to add domain
    pause
    exit /b 1
)

:skip_add
echo.
echo [3] Flushing DNS cache...
ipconfig /flushdns >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] DNS cache flushed
) else (
    echo [WARNING] Could not flush DNS cache
)

echo.
echo [4] Testing domain resolution...
ping -n 1 %DOMAIN% | findstr /C:"127.0.0.1" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Domain resolves correctly to 127.0.0.1
) else (
    echo [WARNING] Domain resolution may need manual verification
)

echo.
echo ============================================
echo   SETUP COMPLETE!
echo ============================================
echo.
echo Domain: %DOMAIN%
echo IP:     %IP%
echo URL:    http://%DOMAIN%:8080
echo.
echo You can now access the application at:
echo   http://wa-api.api:8080
echo.
echo Login:
echo   Email:    admin@admin.com
echo   Password: admin123
echo.
echo ============================================
echo.
pause
