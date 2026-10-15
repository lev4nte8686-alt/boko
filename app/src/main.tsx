import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';

// Sentry — chỉ bật khi có VITE_SENTRY_DSN. Thiếu biến thì app chạy bình thường
// (no-op), không gửi dữ liệu ra ngoài. Cấu hình trong Vercel/`.env` (xem .env.example).
const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    integrations: [Sentry.browserTracingIntegration()],
    // Theo dõi hiệu năng: giữ thấp để không tốn quota (0 = tắt tracing).
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  });
}

function RootErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto">
          <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
        </div>
        <h1 className="font-display font-bold text-xl text-slate-900">Ứng dụng gặp sự cố</h1>
        <p className="font-body text-sm text-slate-500 leading-relaxed">
          Đã có lỗi bất ngờ xảy ra. Lỗi đã được ghi nhận để đội kỹ thuật xử lý.
          Vui lòng tải lại trang để tiếp tục.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-widest shadow-md cursor-pointer"
        >
          <i className="fa-solid fa-rotate-right mr-2"></i>
          Tải lại trang
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Sentry.ErrorBoundary fallback={<RootErrorFallback />} showDialog={false}>
        <App />
      </Sentry.ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
