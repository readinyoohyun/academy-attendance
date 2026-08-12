@echo off
title Readin Local Scraper Agent
cd /d "%~dp0"

echo ====================================================
echo   Readin Local Scraper Agent Starting...
echo ====================================================

:: 1. check if node is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다!
    echo 이 프로그램을 실행하려면 Node.js 설치가 필수입니다.
    echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.
    pause
    exit
)

:: 2. check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] 필요한 패키지가 없습니다. npm install을 진행합니다.
    echo 이 작업은 첫 실행 시에만 수행되며, 최대 1~2분이 걸릴 수 있습니다...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install 설치 중 에러가 발생했습니다.
        pause
        exit
      )
)

:: 3. Run the server
echo [SUCCESS] 모든 준비가 완료되었습니다. 로컬 에이전트 서버를 구동합니다...
call npm start
pause
