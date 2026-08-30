// deploy/ecosystem.config.js — Chạy cả 3 tiến trình bằng PM2, độc lập với
// nhau (một app lỗi không kéo sập app còn lại): pm2 start deploy/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'hcrc-etl',
      cwd: '../etl',
      script: 'index.js',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'hcrc-report-server',
      cwd: '../report-server',
      script: 'server.js',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'hcrc-api-server',
      cwd: '../api-server',
      script: 'server.js',
      env: { NODE_ENV: 'production' }
    }
  ]
};
