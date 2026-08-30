// routes/emailSettings.js — Trang "Thiết lập email": cấu hình SMTP dùng
// chung cho toàn hệ thống (vd gửi báo cáo định kỳ sau này). Chỉ MỘT dòng
// (Id=1). Mật khẩu KHÔNG BAO GIỜ trả về nguyên văn qua API — GET chỉ báo
// hasPassword để giao diện biết đã cấu hình hay chưa.
const express = require('express');
const nodemailer = require('nodemailer');
const { sql, getPool } = require('../db');
const { requireAuth, requireMenuAccess } = require('../lib/auth');
const { encrypt, decrypt } = require('../lib/crypto');
const { logAction } = require('../lib/auditLog');

const router = express.Router();
router.use(requireAuth, requireMenuAccess('system-email-settings'));

router.get('/', async (req, res, next) => {
  try {
    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT SmtpHost, SmtpPort, Secure, Username, PasswordEncrypted, FromAddress, FromName
      FROM app.EmailSettings WHERE Id = 1
    `);
    if (!result.recordset.length) return res.json(null);
    const row = result.recordset[0];
    res.json({
      smtpHost: row.SmtpHost,
      smtpPort: row.SmtpPort,
      secure: !!row.Secure,
      username: row.Username,
      hasPassword: !!row.PasswordEncrypted,
      fromAddress: row.FromAddress,
      fromName: row.FromName
    });
  } catch (err) { next(err); }
});

router.put('/', async (req, res, next) => {
  try {
    const { smtpHost, smtpPort, secure, username, password, fromAddress, fromName } = req.body || {};
    if (!smtpHost || !fromAddress) return res.status(400).json({ error: 'Thiếu smtpHost/fromAddress' });

    const pool = await getPool('RP');
    // Không đổi password nếu request không gửi (giữ nguyên giá trị mã hoá cũ).
    let passwordEncrypted;
    if (password) {
      passwordEncrypted = encrypt(password);
    } else {
      const existing = await pool.request().query('SELECT PasswordEncrypted FROM app.EmailSettings WHERE Id = 1');
      passwordEncrypted = existing.recordset[0]?.PasswordEncrypted || null;
    }

    await pool.request()
      .input('smtpHost', sql.NVarChar(200), smtpHost)
      .input('smtpPort', sql.Int, smtpPort || 587)
      .input('secure', sql.Bit, secure ? 1 : 0)
      .input('username', sql.NVarChar(200), username || null)
      .input('passwordEncrypted', sql.NVarChar(500), passwordEncrypted)
      .input('fromAddress', sql.NVarChar(200), fromAddress)
      .input('fromName', sql.NVarChar(200), fromName || null)
      .query(`
        MERGE app.EmailSettings AS target
        USING (SELECT 1 AS Id) AS src ON target.Id = src.Id
        WHEN MATCHED THEN UPDATE SET
          SmtpHost = @smtpHost, SmtpPort = @smtpPort, Secure = @secure,
          Username = @username, PasswordEncrypted = @passwordEncrypted,
          FromAddress = @fromAddress, FromName = @fromName, UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (Id, SmtpHost, SmtpPort, Secure, Username, PasswordEncrypted, FromAddress, FromName)
          VALUES (1, @smtpHost, @smtpPort, @secure, @username, @passwordEncrypted, @fromAddress, @fromName);
      `);

    await logAction(req, { module: 'Thiết lập email', actionType: 'CAP_NHAT', description: 'Cập nhật cấu hình SMTP' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/test', async (req, res, next) => {
  try {
    const { to } = req.body || {};
    if (!to) return res.status(400).json({ error: 'Thiếu địa chỉ nhận (to)' });

    const pool = await getPool('RP');
    const result = await pool.request().query(`
      SELECT SmtpHost, SmtpPort, Secure, Username, PasswordEncrypted, FromAddress, FromName
      FROM app.EmailSettings WHERE Id = 1
    `);
    if (!result.recordset.length) return res.status(400).json({ error: 'Chưa cấu hình email' });
    const row = result.recordset[0];

    const transport = nodemailer.createTransport({
      host: row.SmtpHost,
      port: row.SmtpPort,
      secure: !!row.Secure,
      auth: row.Username ? { user: row.Username, pass: row.PasswordEncrypted ? decrypt(row.PasswordEncrypted) : undefined } : undefined
    });

    await transport.sendMail({
      from: row.FromName ? `${row.FromName} <${row.FromAddress}>` : row.FromAddress,
      to,
      subject: 'HCRC — Email thử nghiệm',
      text: `Đây là email thử nghiệm gửi từ trang Thiết lập email, lúc ${new Date().toISOString()}.`
    });

    await logAction(req, { module: 'Thiết lập email', actionType: 'GUI_THU', targetObject: to, description: `Gửi email thử nghiệm tới ${to}` });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
