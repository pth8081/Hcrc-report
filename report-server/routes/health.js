const express = require('express');
const { version } = require('../package.json');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ status: 'ok', version, time: new Date().toISOString() });
});

module.exports = router;
