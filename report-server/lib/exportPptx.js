// lib/exportPptx.js — Xuất báo cáo dạng slide theo mẫu .pptx có sẵn (vd báo
// cáo định kỳ, tương tự mau-bao-cao-dinh-ky.pptx). CHƯA triển khai — cần file
// mẫu .pptx thật đặt trong templates/ để biết vị trí các placeholder cần điền,
// không thể dựng trước khi có file mẫu thật.
async function exportPptx() {
  throw new Error(
    'Xuất PPTX chưa được triển khai — cần đặt file mẫu .pptx thật vào templates/ trước.'
  );
}

module.exports = { exportPptx };
