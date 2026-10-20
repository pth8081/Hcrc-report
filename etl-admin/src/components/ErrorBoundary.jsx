import { Component } from 'react';

// bản 9.79, theo báo cáo người dùng — trang "Đối tác API" bấm "Sửa" bị
// "treo luôn không tắt được" (bấm "Huỷ" cũng không phản hồi). Nguyên nhân
// gốc: 1 lỗi JS lúc render (vd dữ liệu thiếu trường) làm React âm thầm gỡ
// (unmount) cây giao diện mà KHÔNG nơi nào bắt lại — màn hình đứng yên,
// bấm gì cũng vô tác dụng, chỉ F5 mới thoát được, nhưng người dùng không
// biết phải làm vậy. Trước bản này KHÔNG app nào trong 3 app (api-admin/
// etl-admin/rp-user) có error boundary — MỌI lỗi render chưa lường trước ở
// BẤT KỲ trang nào đều "treo" kiểu này. Bọc <App/> trong boundary này
// (main.jsx) để lỗi không bắt được ở nơi khác luôn hiện 1 màn hình rõ ràng
// + nút "Tải lại trang" thay vì treo vô hình.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary bắt được lỗi:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto' }}>
          <h2>Đã có lỗi xảy ra</h2>
          <p>Trang gặp lỗi không mong muốn và không thể tiếp tục hiển thị bình thường.</p>
          <p style={{ color: '#888', fontSize: 13, wordBreak: 'break-word' }}>
            {String(this.state.error?.message || this.state.error)}
          </p>
          <button type="button" onClick={() => window.location.reload()}>Tải lại trang</button>
        </div>
      );
    }
    return this.props.children;
  }
}
