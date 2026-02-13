#!/bin/bash
# MongoDB 启动脚本

WORK_DIR="$HOME/work/nlsw-saas"
# 配置文件路径
CONFIG_FILE="$WORK_DIR/data/config/mongod.conf"
LOG_FILE="$WORK_DIR/data/log/mongod.log"
PID_FILE="$WORK_DIR/data/mongod.pid"

# 检查是否已经在运行
if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
    echo "MongoDB 已经在运行 (PID: $(cat "$PID_FILE"))"
    exit 1
fi

# 启动 MongoDB
echo "正在启动 MongoDB..."
mongod --config "$CONFIG_FILE"

# 等待并检查启动状态
sleep 2
if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
    echo "✅ MongoDB 启动成功！"
    echo "PID: $(cat "$PID_FILE")"
    echo "端口: 27027"
    echo "数据库路径: $WORK_DIR/data/db"
    echo "日志: $LOG_FILE"
    echo "连接命令: mongosh --port 27027"
else
    echo "❌ MongoDB 启动失败"
    echo "查看日志: tail -20 $LOG_FILE"
    exit 1
fi
