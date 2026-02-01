// PM2配置文件
// 文件路径: /home/app/nlsw/ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'nlsw-backend',
      script: 'app.js',
      cwd: '/home/app/nlsw',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 1080,
        MONGODB: 'mongodb://localhost:27027/test',
      },
      error_file: '/home/app/nlsw/logs/backend-error.log',
      out_file: '/home/app/nlsw/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
}
