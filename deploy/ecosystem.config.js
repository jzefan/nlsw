// PM2配置文件
// 文件路径: /home/ubuntu/nlsw2/ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'nlsw-backend',
      script: 'app.js',
      cwd: '/home/ubuntu/nlsw2',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 1081,
      },
      error_file: '/home/ubuntu/nlsw2/logs/backend-error.log',
      out_file: '/home/ubuntu/nlsw2/logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
}
