#!/bin/bash
# MongoDB 状态检查脚本

WORK_DIR="$HOME/nlsw-saas"
PID_FILE="$WORK_DIR/data/mongod.pid"
LOG_FILE="$WORK_DIR/data/log/mongod.log"

if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
    PID=$(cat "$PID_FILE")
    echo "✅ MongoDB 正在运行"
    echo "PID: $PID"
    echo "端口: 27028"
    echo "运行时间: $(ps -o etime= -p $PID | xargs)"
    
    # 检查连接
    if mongosh --port 27028 --eval "db.version()" --quiet >/dev/null 2>&1; then
        echo "连接状态: ✅ 正常"
    else
        echo "连接状态: ⚠️  进程运行但无法连接"
    fi
else
    echo "❌ MongoDB 未运行"
    
    # 检查是否有残留进程
    if pgrep -f "mongod.*27028" >/dev/null; then
        echo "⚠️  发现残留的 MongoDB 进程:"
        pgrep -f "mongod.*27028" | xargs ps -fp
    fi
fi
