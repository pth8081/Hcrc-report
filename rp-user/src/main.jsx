import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
// Phông Inter (bản 9.69, theo yêu cầu người dùng — "phông này hơi xấu...
// tham khảo phông chữ báo cáo quốc tế chuyên nghiệp hơn", demo 4 lựa chọn
// qua Artifact, người dùng chọn Inter) — TỰ LƯU TRỮ qua @fontsource/inter
// (KHÔNG tải từ fonts.googleapis.com lúc chạy — tránh phụ thuộc mạng ngoài/
// tường lửa doanh nghiệp, nhất quán với cách PDF đã tự lưu trữ font qua gói
// @openfonts/noto-sans_vietnamese, xem rp-server/lib/exportPdf.js). Chỉ
// import ĐÚNG 5 cỡ chữ thật dùng trong styles.css (400/500/600/700/800,
// kiểu "normal" — ứng dụng không dùng chữ nghiêng), KHÔNG import "index.css"
// (sẽ kéo đủ 9 cỡ × 2 kiểu × nhiều bộ ký tự không cần). Trình duyệt chỉ TẢI
// đúng bộ ký tự (Latin/Latin Extended/Vietnamese) THẬT SỰ xuất hiện trên
// trang (unicode-range per @font-face), không tải thừa cỡ chữ/ngôn ngữ khác
// dù khai báo đủ trong các file CSS này.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
