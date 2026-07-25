@echo off
chcp 65001 >nul
title 历史战争2D地图沙盘

echo ==========================================
echo   历史战争2D地图沙盘 - 启动中...
echo ==========================================
echo.

cd /d "%~dp0"

set PORT=8765

:: 查找Python
set PYTHON_CMD=
where python >nul 2>&1
if %errorlevel% equ 0 (
    set PYTHON_CMD=python
) else (
    where python3 >nul 2>&1
    if %errorlevel% equ 0 (
        set PYTHON_CMD=python3
    ) else (
        where py >nul 2>&1
        if %errorlevel% equ 0 (
            set PYTHON_CMD=py
        )
    )
)

if "%PYTHON_CMD%"=="" (
    echo ❌ 错误: 未找到Python，请先安装Python 3
    echo 下载地址: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo ✅ 使用 %PYTHON_CMD% 启动本地服务器
echo ✅ 服务端口: %PORT%
echo.
echo 🌐 正在打开浏览器...
echo.
echo 💡 提示:
echo    - 关闭此窗口即可停止服务器
echo    - 如浏览器未自动打开，请手动访问: http://localhost:%PORT%
echo.

:: 启动服务器
start "" /b %PYTHON_CMD% -m http.server %PORT%

:: 等待服务器启动
timeout /t 2 /nobreak >nul

:: 打开浏览器
start http://localhost:%PORT%

:: 保持窗口打开
echo 服务器运行中... 按 Ctrl+C 或关闭此窗口停止
pause >nul
