// lib/AuthContext.jsx — Một nguồn sự thật duy nhất cho "user hiện tại là ai,
// thấy được menu nào" — cả Sidebar lẫn RequireMenuAccess đều đọc từ đây, lấy
// từ GET /api/me (đã lọc theo quyền ở phía server, xem rp-server/routes/me.js).
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import Modal from '../components/Modal';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null); // { username, fullName, roles, isSystemRole, menu }
  const [loading, setLoading] = useState(true);
  // sessionConflict (bản 10.68, theo yêu cầu người dùng — hỏi xác nhận
  // trước khi ghi đè phiên cũ, giống HCRC Workspace) — { overrideToken,
  // resolve } khi 1 trong 4 hàm đăng nhập bên dưới gặp lỗi sessionConflict
  // (409, xem lib/api.js) — `resolve(true/false)` là cầu nối giữa Promise
  // đang treo trong withSessionConflict() và nút Huỷ/OK của hộp thoại vẽ
  // ngay bên dưới (DÙNG CHUNG đúng 1 hộp thoại cho CẢ 4 luồng đăng nhập —
  // mật khẩu thường, mã 2FA/mã khôi phục, vân tay sau mật khẩu, vân tay
  // thẳng không cần mật khẩu — vì cả 4 đều đi qua ĐÚNG 1 điểm issueToken()
  // phía server, xem rp-server/lib/auth.js).
  const [sessionConflict, setSessionConflict] = useState(null);
  const [confirmingOverride, setConfirmingOverride] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/me');
      setMe(data);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // withSessionConflict (bản 10.68) — BỌC quanh 1 lượt gọi API đăng nhập
  // (apiCallFn). Bình thường (không xung đột) chạy xuyên qua, trả nguyên
  // kết quả. Gặp lỗi `err.sessionConflict` (409, xem lib/api.js): TREO lại
  // bằng 1 Promise, hiện hộp thoại (vẽ ở JSX bên dưới) chờ người dùng bấm
  // Huỷ/OK — Huỷ thì ném lỗi `{ cancelled: true }` (LoginPage.jsx nhận biết
  // để KHÔNG hiện chữ đỏ, giống cách đã xử lý `NotAllowedError` khi người
  // dùng tự huỷ hộp thoại vân tay của trình duyệt); OK thì gọi
  // POST /auth/confirm-session (KHÔNG cần mật khẩu/2FA/vân tay lần nữa, chỉ
  // cần overrideToken đã cấp kèm lỗi 409) để cấp phiên thật — phiên cũ bị
  // từ chối NGAY ở lượt gọi API kế tiếp của nó (cơ chế có sẵn từ bản 10.6).
  const withSessionConflict = useCallback(async (apiCallFn) => {
    try {
      return await apiCallFn();
    } catch (err) {
      if (!err.sessionConflict) throw err;
      const proceed = await new Promise((resolve) => setSessionConflict({ overrideToken: err.overrideToken, resolve }));
      if (!proceed) {
        setSessionConflict(null);
        throw Object.assign(new Error(''), { cancelled: true });
      }
      setConfirmingOverride(true);
      try {
        const result = await api.post('/auth/confirm-session', { overrideToken: err.overrideToken });
        await refresh();
        return result;
      } finally {
        setConfirmingOverride(false);
        setSessionConflict(null);
      }
    }
  }, [refresh]);

  // Trả nguyên response cho LoginPage tự quyết định bước tiếp theo:
  // { ok: true } -> xong ngay (không phải vai trò Admin hệ thống, không cần 2FA)
  // { twofa: 'pending', token } -> đã bật 2FA, cần nhập mã (xem 2fa/verify)
  // { twofa: 'setupRequired', token } -> CHƯA bật 2FA, bắt buộc đăng ký ngay
  const login = useCallback(async (username, password, captchaToken, captchaAnswer) => withSessionConflict(async () => {
    const result = await api.post('/auth/login', { username, password, captchaToken, captchaAnswer });
    if (result?.ok) await refresh();
    return result;
  }), [refresh, withSessionConflict]);

  // 3 bước còn lại của 2FA (xem rp-server/routes/twoFactor.js) — chỉ setup()
  // KHÔNG tự refresh() (chưa có phiên đầy đủ), confirm()/verify() có.
  const setupTwoFactor = useCallback((body) => api.post('/2fa/setup', body), []);
  const confirmTwoFactor = useCallback(async (token, code) => {
    const result = await api.post('/2fa/confirm', { token, code });
    await refresh();
    return result;
  }, [refresh]);
  const verifyTwoFactor = useCallback(async (token, { code, recoveryCode }) => withSessionConflict(async () => {
    const result = await api.post('/2fa/verify', { token, code, recoveryCode });
    await refresh();
    return result;
  }), [refresh, withSessionConflict]);

  // Vân tay/Face ID (WebAuthn, bản 8.41) — xem rp-server/routes/webauthn.js.
  // 2 nhóm: quản lý thiết bị (cần phiên đầy đủ, dùng ở "Tài khoản của tôi")
  // và đăng nhập bằng thiết bị đã đăng ký (thay bước nhập mã 2FA, dùng ở
  // LoginPage.jsx — nhận "token" pending y hệt verifyTwoFactor() ở trên).
  const webauthnListDevices = useCallback(() => api.get('/webauthn/devices'), []);
  const webauthnDeleteDevice = useCallback((id) => api.del(`/webauthn/devices/${id}`), []);
  const webauthnRegisterOptions = useCallback(() => api.post('/webauthn/register/options', {}), []);
  const webauthnRegisterVerify = useCallback((response, label) => api.post('/webauthn/register/verify', { response, label }), []);
  const webauthnLoginOptions = useCallback((token) => api.post('/webauthn/login/options', { token }), []);
  const webauthnLoginVerify = useCallback(async (token, response) => withSessionConflict(async () => {
    const result = await api.post('/webauthn/login/verify', { token, response });
    await refresh();
    return result;
  }), [refresh, withSessionConflict]);

  // Đăng nhập THẲNG bằng vân tay/Face ID — THAY THẾ HẲN mật khẩu (bản 8.89,
  // theo yêu cầu người dùng) — dùng ở LoginPage.jsx ngay màn hình đầu tiên,
  // KHÁC webauthnLoginOptions/Verify ở trên (những cái đó vẫn đòi mật khẩu
  // đúng trước). Nhận "username" (không phải token 2FA, vì CHƯA qua bước
  // mật khẩu nào).
  const webauthnPasswordlessOptions = useCallback((username) => api.post('/webauthn/login-by-username/options', { username }), []);
  const webauthnPasswordlessVerify = useCallback(async (token, response) => withSessionConflict(async () => {
    const result = await api.post('/webauthn/login-by-username/verify', { token, response });
    await refresh();
    return result;
  }), [refresh, withSessionConflict]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setMe(null);
  }, []);

  const hasMenu = useCallback((code) => !!me?.menu?.some(m => m.code === code), [me]);

  return (
    <AuthContext.Provider value={{
      me, loading, login, logout, hasMenu, refresh, setupTwoFactor, confirmTwoFactor, verifyTwoFactor,
      webauthnListDevices, webauthnDeleteDevice, webauthnRegisterOptions, webauthnRegisterVerify, webauthnLoginOptions, webauthnLoginVerify,
      webauthnPasswordlessOptions, webauthnPasswordlessVerify
    }}>
      {children}
      {sessionConflict && (
        <Modal>
          <div className="modal-body">
            <h3>⚠️ Tài khoản này có thể đang đăng nhập ở nơi khác</h3>
            <p>Tiếp tục đăng nhập ở đây sẽ ĐĂNG XUẤT phiên đó ngay.</p>
            <p>Bạn có muốn tiếp tục?</p>
            <div className="inline-actions">
              <button type="button" disabled={confirmingOverride} onClick={() => sessionConflict.resolve(false)}>Huỷ</button>
              <button type="button" disabled={confirmingOverride} onClick={() => sessionConflict.resolve(true)}>{confirmingOverride ? 'Đang xử lý...' : 'OK'}</button>
            </div>
          </div>
        </Modal>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() phải dùng bên trong <AuthProvider>');
  return ctx;
}
