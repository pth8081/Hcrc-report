const express = require('express');
const { version } = require('../../package.json');

const router = express.Router();

// Không yêu cầu API key — dùng để hệ thống ngoài/monitoring kiểm tra tình
// trạng trước khi gọi các endpoint cần xác thực.
router.get('/', (req, res) => {
  res.json({ status: 'ok', version, time: new Date().toISOString() });
});

module.exports = router;
