// lib/brgPostRecapRunner.js — SourceType='brgPostRecap' (bản 11.24, "BRG
// Weekly Post" — Báo cáo 3 MKT, sheet "Recap" của file mẫu thật) — 2
// khối: (1) Tổng quan Toàn chuỗi/Mart/Mini Mart (Doanh số Post, Kế hoạch,
// Dự kiến theo xu hướng, Doanh số thiếu hụt), (2) Doanh số theo Ngành
// hàng cùng cấu trúc.
//
// ⚠️ PHẠM VI — KHÔNG replicate khối "TRỪ DS BÁN BUÔN BIA 333" của file
// mẫu: đối chiếu số liệu cho thấy đây là 1 ĐIỀU CHỈNH TAY, MỘT LẦN, CHỈ
// cho ĐÚNG 1 SKU cụ thể (Bia 333) của ĐÚNG chiến dịch mẫu đó (tổng Doanh
// số Post bảng này = 548,717,752.28 khớp đúng "By Store"/combined
// DoanhThu; bảng "TRỪ..." = 385,161,967.51 khớp đúng tổng "By items" —
// chênh lệch đúng bằng phần bán buôn của riêng Bia 333) — KHÔNG phải quy
// tắc chung áp cho mọi chiến dịch/mọi SKU, không có cách suy ra tự động
// — báo cáo này CHỈ dùng số liệu TỔNG (combined bán lẻ+bán buôn, giống
// "By Store"), không trừ riêng SKU nào. Xem "bc-brg-weekly-post.md".
//
// "Xu hướng dự kiến" dùng ĐÚNG projectionFactor/elapsedDays/totalCampaignDays
// đã tính ở lib/brgWeeklyPostCore.js:loadCampaignData() — đã dò ngược
// khớp đúng số liệu mẫu thật ở cả 2 khối.
const { loadCampaignData, buildStoreRows, divOrNull } = require('./brgWeeklyPostCore');
const { describeColumns } = require('./reportEngine');

const LOAI_LABEL = { MART: 'Mart', MINIMART: 'Mini Mart' };

function buildColumns() {
  return [
    { key: 'chuoi', label: 'Chuỗi / Ngành hàng' },
    { key: 'doanhSoPost', label: 'Doanh số Post' },
    { key: 'soLuongDonVi', label: 'Số lượng đơn vị SP Post' },
    { key: 'keHoachDoanhSo', label: 'Kế hoạch — Doanh số' },
    { key: 'tyLeHoanThanhDoanhSo', label: 'Kế hoạch — Tỷ lệ hoàn thành doanh số', format: 'percent' },
    { key: 'keHoachSoLuong', label: 'Kế hoạch — Số lượng đơn vị' },
    { key: 'tyLeHoanThanhSoLuong', label: 'Kế hoạch — Tỷ lệ hoàn thành số lượng', format: 'percent' },
    { key: 'xuHuongTbNgay', label: 'Xu hướng — DS dự kiến TB/ngày' },
    { key: 'xuHuongTbNgayKeHoach', label: 'Xu hướng — DS TB/ngày theo kế hoạch' },
    { key: 'tyLeXuHuong', label: 'Xu hướng — Tỷ lệ dự kiến/kế hoạch', format: 'percent' },
    { key: 'doanhSoDuKienCuoiKy', label: 'Xu hướng — DS dự kiến đến cuối kỳ' },
    { key: 'doanhSoThieuHut', label: 'Doanh số thiếu hụt' },
    { key: 'soLuongTon', label: 'SL sản phẩm KM còn tồn' },
    { key: 'giaTriTon', label: 'Giá trị sản phẩm KM còn tồn' }
  ];
}

function buildOverviewRow(label, storeRows, data) {
  const doanhSoPost = storeRows.reduce((s, r) => s + r.doanhThuThucTe, 0);
  const soLuongDonVi = storeRows.reduce((s, r) => s + r.soLuongThucTe, 0);
  const keHoachDoanhSo = storeRows.reduce((s, r) => s + r.doanhThuKeHoach, 0);
  const keHoachSoLuong = storeRows.reduce((s, r) => s + r.soLuongKeHoach, 0);
  const soLuongTon = storeRows.reduce((s, r) => s + r.tonKho, 0);
  const giaTriTon = storeRows.reduce((s, r) => s + r.giaTriTon, 0);

  const xuHuongTbNgay = doanhSoPost / data.elapsedDays;
  const xuHuongTbNgayKeHoach = keHoachDoanhSo / data.totalCampaignDays;
  const tyLeDoanhSo = divOrNull(doanhSoPost, keHoachDoanhSo);
  const tyLeSoLuong = divOrNull(soLuongDonVi, keHoachSoLuong);
  const tyLeXuHuong = divOrNull(xuHuongTbNgay, xuHuongTbNgayKeHoach);

  return {
    chuoi: label,
    doanhSoPost, soLuongDonVi,
    keHoachDoanhSo, tyLeHoanThanhDoanhSo: tyLeDoanhSo !== null ? tyLeDoanhSo * 100 : null,
    keHoachSoLuong, tyLeHoanThanhSoLuong: tyLeSoLuong !== null ? tyLeSoLuong * 100 : null,
    xuHuongTbNgay, xuHuongTbNgayKeHoach,
    tyLeXuHuong: tyLeXuHuong !== null ? tyLeXuHuong * 100 : null,
    doanhSoDuKienCuoiKy: xuHuongTbNgay * data.totalCampaignDays,
    doanhSoThieuHut: doanhSoPost - keHoachDoanhSo,
    soLuongTon, giaTriTon
  };
}

function buildDeptRow(deptName, skuRowsOfDept, data) {
  const doanhSoPost = skuRowsOfDept.reduce((s, r) => s + r.doanhThuThucTe, 0);
  const keHoachDoanhSo = skuRowsOfDept.reduce((s, r) => s + r.doanhThuKeHoachTotal, 0);
  const soLuongTon = skuRowsOfDept.reduce((s, r) => s + r.tonKho, 0);
  const giaTriTon = skuRowsOfDept.reduce((s, r) => s + r.giaTriTon, 0);
  const xuHuongTbNgay = doanhSoPost / data.elapsedDays;
  const xuHuongTbNgayKeHoach = keHoachDoanhSo / data.totalCampaignDays;
  const tyLeDoanhSo = divOrNull(doanhSoPost, keHoachDoanhSo);
  const tyLeXuHuong = divOrNull(xuHuongTbNgay, xuHuongTbNgayKeHoach);

  return {
    chuoi: deptName || '(chưa khai ngành hàng)',
    doanhSoPost,
    keHoachDoanhSo, tyLeHoanThanhDoanhSo: tyLeDoanhSo !== null ? tyLeDoanhSo * 100 : null,
    xuHuongTbNgay, xuHuongTbNgayKeHoach,
    tyLeXuHuong: tyLeXuHuong !== null ? tyLeXuHuong * 100 : null,
    doanhSoDuKienCuoiKy: xuHuongTbNgay * data.totalCampaignDays,
    doanhSoThieuHut: doanhSoPost - keHoachDoanhSo,
    soLuongTon, giaTriTon
  };
}

async function runBrgPostRecapReport(definition, filterValues) {
  const campaignId = Number((filterValues && filterValues.campaignId) || 0);
  if (!campaignId) throw new Error('Thiếu bộ lọc "Chiến dịch khuyến mãi" — chọn 1 chiến dịch trước khi chạy báo cáo.');

  const data = await loadCampaignData(campaignId);
  const storeRows = buildStoreRows(data);

  const martRows = storeRows.filter(r => r.loaiChuoi === 'MART');
  const miniRows = storeRows.filter(r => r.loaiChuoi === 'MINIMART');

  const overview = [
    buildOverviewRow('Toàn chuỗi', storeRows, data),
    buildOverviewRow('Mart', martRows, data),
    buildOverviewRow('Mini Mart', miniRows, data)
  ];

  const deptMap = new Map();
  for (const sku of data.skuRows) {
    const key = sku.deptName || '';
    if (!deptMap.has(key)) deptMap.set(key, []);
    deptMap.get(key).push(sku);
  }
  const deptRows = [...deptMap.entries()]
    .map(([deptName, rows]) => buildDeptRow(deptName, rows, data))
    .sort((a, b) => (a.tyLeHoanThanhDoanhSo || 0) - (b.tyLeHoanThanhDoanhSo || 0));

  const allRows = [
    { __isSectionHeader: true, __sectionLabel: 'TỔNG QUAN TOÀN CHUỖI' },
    ...overview,
    { __isSectionHeader: true, __sectionLabel: 'DOANH SỐ THEO NGÀNH HÀNG' },
    ...deptRows
  ];

  const columns = describeColumns(buildColumns());
  return { columns, rows: allRows, columnGroups: null, columnSuperGroups: null };
}

module.exports = { runBrgPostRecapReport, buildColumns };
