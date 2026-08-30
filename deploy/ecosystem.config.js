// deploy/ecosystem.config.js — Chạy 3 tiến trình bằng PM2, độc lập với nhau
// (một app lỗi không kéo sập app còn lại): pm2 start deploy/ecosystem.config.js
// frontend/, api-admin/, etl-admin/ là build tĩnh (npm run build -> dist/),
// phục vụ qua Nginx — không phải tiến trình PM2.
module.exports = {
  apps: [
    {
      name: 'hcrc-etl',
      cwd: '../etl',
      script: 'server.js', // chạy nền theo lịch + phục vụ /admin/* cho etl-admin/
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
