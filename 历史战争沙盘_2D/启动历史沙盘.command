#!/bin/bash

# 历史战争2D地图沙盘 - 一键启动脚本 (macOS)
# 双击此文件即可自动启动服务器并在浏览器中打开

# 获取脚本所在目录
cd "$(dirname "$0")"

echo "=========================================="
echo "  历史战争2D地图沙盘 - 启动中..."
echo "=========================================="
echo ""

# 查找可用的Python版本
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ 错误: 未找到Python，请先安装Python 3"
    echo "下载地址: https://www.python.org/downloads/"
    echo ""
    read -p "按回车键退出..."
    exit 1
fi

PORT=8765

# 检查端口是否被占用
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  端口 $PORT 已被占用，尝试使用端口 8766..."
    PORT=8766
fi

echo "✅ 使用 $PYTHON_CMD 启动本地服务器"
echo "✅ 服务端口: $PORT"
echo ""
echo "🌐 正在打开浏览器..."
echo ""
echo "💡 提示:"
echo "   - 关闭此终端窗口即可停止服务器"
echo "   - 如浏览器未自动打开，请手动访问: http://localhost:$PORT"
echo ""

# 在后台启动服务器
$PYTHON_CMD -m http.server $PORT > /dev/null 2>&1 &
SERVER_PID=$!

# 等待服务器启动
sleep 1

# 打开浏览器
open "http://localhost:$PORT"

# 等待用户按Ctrl+C或关闭窗口
trap "echo ''; echo '👋 服务器已停止，再见！'; kill $SERVER_PID 2>/dev/null; exit 0" INT TERM

# 保持脚本运行
wait $SERVER_PID
