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

title Remove Local Domain - wa-api.api
color 0C

echo.
echo ============================================
echo   Remove Local Domain: wa-api.api
echo ============================================
echo.

set HOSTS_FILE=C:\Windows\System32\drivers\etc\hosts
set DOMAIN=wa-api.api
set TEMP_FILE=%TEMP%\hosts_temp.txt

echo [1] Checking if domain exists...
findstr /C:"%DOMAIN%" "%HOSTS_FILE%" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Domain %DOMAIN% not found in hosts file
    echo Nothing to remove.
    pause
    exit /b 0
)

echo [OK] Domain found, removing...

echo.
echo [2] Creating backup...
copy "%HOSTS_FILE%" "%HOSTS_FILE%.backup" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Backup created: %HOSTS_FILE%.backup
) else (
    echo [ERROR] Failed to create backup
    pause
    exit /b 1
)

echo.
echo [3] Removing domain from hosts file...
findstr /V /C:"%DOMAIN%" "%HOSTS_FILE%" > "%TEMP_FILE%"
findstr /V /C:"# Baileys WhatsApp API Local Domain" "%TEMP_FILE%" > "%HOSTS_FILE%"
del "%TEMP_FILE%" >nul 2>&1

echo [OK] Domain removed

echo.
echo [4] Flushing DNS cache...
ipconfig /flushdns >nul 2>&1
echo [OK] DNS cache flushed

echo.
echo ============================================
echo   REMOVAL COMPLETE!
echo ============================================
echo.
echo Domain wa-api.api has been removed from hosts file
echo Backup saved as: %HOSTS_FILE%.backup
echo.
echo The application is still accessible via:
echo   http://localhost:8080
echo.
echo ============================================
echo.
pause
