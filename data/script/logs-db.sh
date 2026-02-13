#!/bin/bash
# 查看 MongoDB 日志

LOG_FILE="$HOME/work/nlsw/data/log/mongod.log"

if [ ! -f "$LOG_FILE" ]; then
    echo "日志文件不存在: $LOG_FILE"
    exit 1
fi

echo "=== MongoDB 日志 (最后50行) ==="
tail -50 "$LOG_FILE"
echo "==============================="
echo "实时查看日志: tail -f $LOG_FILE"
