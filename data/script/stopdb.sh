#!/bin/bash
# MongoDB 停止脚本

WORK_DIR="$HOME/work/nlsw-saas"
PID_FILE="$WORK_DIR/data/mongod.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "MongoDB 未运行"
    exit 0
fi

PID=$(cat "$PID_FILE")
echo "正在停止 MongoDB (PID: $PID)..."

# 优雅停止
kill $PID 2>/dev/null

# 等待最多10秒
for i in {1..10}; do
    if ! kill -0 $PID 2>/dev/null; then
        echo "✅ MongoDB 已停止"
        rm -f "$PID_FILE"
        exit 0
    fi
    sleep 1
done

# 强制停止
echo "强制停止..."
kill -9 $PID 2>/dev/null
rm -f "$PID_FILE"
echo "MongoDB 已强制停止"
