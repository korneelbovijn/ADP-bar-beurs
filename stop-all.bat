@echo off
echo Stopping all bar-beurs processes...
taskkill /F /IM node.exe >nul 2>&1
echo Done.
