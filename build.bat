@echo off
chcp 65001 >nul
cd /d %~dp0

echo ========================================
echo Building Folder Version (Shareable Folder)
echo ========================================

echo Cleaning old build files...
if exist "dist\win-unpacked" rmdir /s /q "dist\win-unpacked"

echo Installing missing dependencies...
call npx.cmd electron-builder version

echo Starting folder build...
call npx.cmd electron-builder --win dir

echo Checking results...
if exist "dist\win-unpacked" (
    echo SUCCESS: Folder version created!
    echo Build result: dist\win-unpacked\
    echo You can copy entire folder to others
    echo Main exe: Todooooo.exe
) else (
    echo ERROR: Folder build failed!
)

echo.
dir /b dist
echo.
echo ========================================
echo Summary:
echo 1. This is folder version
echo 2. Contains complete application files
echo 3. Copy folder to others
echo 4. Run "Todooooo.exe" to start
echo ========================================

pause