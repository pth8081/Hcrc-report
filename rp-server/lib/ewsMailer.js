// lib/ewsMailer.js — Gửi email qua Exchange Web Services (EWS, API HTTPS
// riêng của Exchange — KHÔNG phải SMTP), dùng cho Exchange CÀI TẠI CHỖ xác
// thực Basic (username/password đăng nhập THẲNG vào mailbox) — bản 8.65,
// theo yêu cầu người dùng (Postfix không cần đăng nhập, Exchange tại chỗ
// cần "truy cập trực tiếp vào mailbox để gửi" qua chính giao thức của
// Exchange thay vì SMTP). KHÔNG dùng được cho Exchange Online/Office 365 —
// Microsoft đã chặn Basic Auth cho EWS từ cuối 2022, chỉ còn OAuth2/
// Microsoft Graph (ngoài phạm vi bản này).
//
// Tự dựng request SOAP bằng module `https` gốc của Node — KHÔNG thêm thư
// viện ngoài (`node-ews`/`soap`...) cho 1 thao tác gửi mail đơn giản.
//
// Gửi CÓ file đính kèm cần 3 lượt gọi EWS (không gộp được thành 1 như
// CreateItem+SendAndSaveCopy của mail KHÔNG đính kèm):
//   1. CreateItem (MessageDisposition=SaveOnly) -> lưu nháp, lấy ItemId.
//   2. CreateAttachment cho từng file -> đính file vào nháp vừa tạo.
//   3. SendItem -> gửi thật bản nháp đã đính kèm đủ file, lưu vào Sent Items.
// Gửi KHÔNG đính kèm dùng thẳng CreateItem (MessageDisposition=
// SendAndSaveCopy) — gửi ngay trong 1 lượt gọi, không cần 2 bước sau.
const https = require('https');
const { URL } = require('url');

function escapeXml(s) {
  return String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// soapAction: giá trị header SOAPAction EWS đòi đúng tên thao tác (không
// bắt buộc với EWS nhưng 1 số máy chủ/proxy đứng trước kiểm tra header này).
function postSoap(ewsUrl, username, password, insecureTls, soapAction, bodyXml) {
  return new Promise((resolve, reject) => {
    const url = new URL(ewsUrl);
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      rejectUnauthorized: !insecureTls,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(bodyXml),
        SOAPAction: soapAction,
        Authorization: `Basic ${auth}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 401) return reject(new Error('EWS từ chối đăng nhập (HTTP 401) — kiểm tra lại Username/Password, hoặc máy chủ đã tắt Basic Auth.'));
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`EWS trả về HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
        resolve(data);
      });
    });
    req.on('error', (err) => reject(new Error(`Không kết nối được EWS (${ewsUrl}): ${err.message}`)));
    req.write(bodyXml);
    req.end();
  });
}

// HTTP 200 KHÔNG đồng nghĩa gửi thành công — EWS báo lỗi NGHIỆP VỤ (vd sai
// mailbox/thiếu quyền) qua ResponseClass="Error" kèm trong XML, vẫn HTTP
// 200 bình thường. Đọc thêm field này mới biết thật sự có lỗi hay không.
function assertSuccess(responseXml, context) {
  const classMatch = responseXml.match(/ResponseClass="([^"]+)"/);
  if (classMatch && classMatch[1] !== 'Success') {
    const codeMatch = responseXml.match(/<[\w:]*ResponseCode>([^<]+)<\/[\w:]*ResponseCode>/);
    const textMatch = responseXml.match(/<[\w:]*MessageText>([^<]+)<\/[\w:]*MessageText>/);
    throw new Error(`EWS báo lỗi lúc ${context} — ${codeMatch?.[1] || '(không rõ mã lỗi)'}: ${textMatch?.[1] || responseXml.slice(0, 300)}`);
  }
}

function soapHeader() {
  return `<soap:Header><t:RequestServerVersion Version="Exchange2013" /></soap:Header>`;
}

function buildMessageXml({ fromAddress, fromName, to, subject, text, html }) {
  const toList = (Array.isArray(to) ? to : String(to).split(',').map(s => s.trim()).filter(Boolean))
    .map(addr => `<t:Mailbox><t:EmailAddress>${escapeXml(addr)}</t:EmailAddress></t:Mailbox>`).join('');
  const bodyType = html ? 'HTML' : 'Text';
  return `<t:Message>
    <t:Subject>${escapeXml(subject)}</t:Subject>
    <t:Body BodyType="${bodyType}">${escapeXml(html || text || '')}</t:Body>
    <t:ToRecipients>${toList}</t:ToRecipients>
    <t:From><t:Mailbox><t:EmailAddress>${escapeXml(fromAddress)}</t:EmailAddress>${fromName ? `<t:Name>${escapeXml(fromName)}</t:Name>` : ''}</t:Mailbox></t:From>
  </t:Message>`;
}

async function createItem(cfg, mail, disposition) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  ${soapHeader()}
  <soap:Body>
    <m:CreateItem MessageDisposition="${disposition}">
      <m:SavedItemFolderId><t:DistinguishedFolderId Id="drafts" /></m:SavedItemFolderId>
      <m:Items>${buildMessageXml(mail)}</m:Items>
    </m:CreateItem>
  </soap:Body>
</soap:Envelope>`;
  const xml = await postSoap(cfg.ewsUrl, cfg.username, cfg.password, cfg.insecureTls, 'http://schemas.microsoft.com/exchange/services/2006/messages/CreateItem', body);
  assertSuccess(xml, 'tạo email');
  const idMatch = xml.match(/<[\w:]*ItemId Id="([^"]+)" ChangeKey="([^"]+)"/);
  return idMatch ? { itemId: idMatch[1], changeKey: idMatch[2] } : null;
}

async function addAttachment(cfg, itemId, attachment) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  ${soapHeader()}
  <soap:Body>
    <m:CreateAttachment>
      <m:ParentItemId Id="${escapeXml(itemId)}" />
      <m:Attachments>
        <t:FileAttachment>
          <t:Name>${escapeXml(attachment.filename)}</t:Name>
          <t:Content>${Buffer.isBuffer(attachment.content) ? attachment.content.toString('base64') : Buffer.from(attachment.content).toString('base64')}</t:Content>
        </t:FileAttachment>
      </m:Attachments>
    </m:CreateAttachment>
  </soap:Body>
</soap:Envelope>`;
  const xml = await postSoap(cfg.ewsUrl, cfg.username, cfg.password, cfg.insecureTls, 'http://schemas.microsoft.com/exchange/services/2006/messages/CreateAttachment', body);
  assertSuccess(xml, `đính kèm file "${attachment.filename}"`);
  // Đính thêm file làm ChangeKey của email nháp bị đổi (Exchange tăng
  // ChangeKey ở MỌI lần sửa item) — CreateAttachment trả kèm
  // RootItemId/RootItemChangeKey MỚI NHẤT của email cha ngay trong
  // AttachmentId, PHẢI dùng đúng cặp này cho SendItem ở bước sau, dùng lại
  // ChangeKey CŨ (lúc tạo nháp) sẽ bị EWS từ chối (xung đột phiên bản).
  const rootMatch = xml.match(/RootItemId="([^"]+)" RootItemChangeKey="([^"]+)"/);
  return rootMatch ? { itemId: rootMatch[1], changeKey: rootMatch[2] } : null;
}

async function sendItem(cfg, itemId, changeKey) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  ${soapHeader()}
  <soap:Body>
    <m:SendItem SaveItemToFolder="true">
      <m:ItemIds><t:ItemId Id="${escapeXml(itemId)}" ChangeKey="${escapeXml(changeKey)}" /></m:ItemIds>
      <m:SavedItemFolderId><t:DistinguishedFolderId Id="sentitems" /></m:SavedItemFolderId>
    </m:SendItem>
  </soap:Body>
</soap:Envelope>`;
  const xml = await postSoap(cfg.ewsUrl, cfg.username, cfg.password, cfg.insecureTls, 'http://schemas.microsoft.com/exchange/services/2006/messages/SendItem', body);
  assertSuccess(xml, 'gửi email');
}

// cfg = { ewsUrl, username, password, insecureTls }
// mail = { fromAddress, fromName, to, subject, text, html, attachments? }
// attachments theo đúng hình dạng nodemailer dùng ở lib/mailer.js:
// [{ filename, content: Buffer }] — tái dùng thẳng, không cần chuyển đổi.
async function sendMailEws(cfg, mail) {
  if (!cfg.ewsUrl) throw new Error('Chưa khai EWS URL — vào "Thiết lập email" điền URL EWS đầy đủ (vd https://mail.noibo.local/EWS/Exchange.asmx)');

  if (!mail.attachments?.length) {
    await createItem(cfg, mail, 'SendAndSaveCopy');
    return;
  }

  // Có đính kèm -> PHẢI lưu nháp trước (SaveOnly), đính file, rồi mới gửi
  // (EWS không cho đính file vào email ĐÃ gửi/đang gửi trong cùng 1 bước).
  const created = await createItem(cfg, mail, 'SaveOnly');
  if (!created) throw new Error('EWS không trả về ItemId sau khi tạo nháp — không thể đính kèm file.');
  let latest = created;
  for (const attachment of mail.attachments) {
    const updated = await addAttachment(cfg, latest.itemId, attachment);
    if (updated) latest = updated;
  }
  await sendItem(cfg, latest.itemId, latest.changeKey);
}

module.exports = { sendMailEws };
