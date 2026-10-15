import React, { useCallback, useEffect, useState } from 'react';
import { EmailLog, getEmailLogs } from '../../api/seller';
import { AsyncState, Card, formatDateTime } from './ui';

interface EmailLogsTabProps {
  onChanged?: () => void;
}

export const EmailLogsTab: React.FC<EmailLogsTabProps> = () => {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getEmailLogs(limit);
    if (!res.ok) {
      setError(res.error || 'Không tải được nhật ký email.');
      setLoading(false);
      return;
    }
    setLogs(res.data?.data || []);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5" data-testid="email-logs-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">Nhật ký email giao dịch</h2>
          <p className="text-xs text-slate-500">
            Đối soát email hệ thống gửi cho khách (chỉ quản trị viên xem được)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            data-testid="email-logs-limit"
            className="paper-input text-xs py-1.5"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value={20}>20 gần nhất</option>
            <option value={50}>50 gần nhất</option>
            <option value={100}>100 gần nhất</option>
            <option value={200}>200 gần nhất</option>
          </select>
          <button
            data-testid="email-logs-refresh"
            onClick={load}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
          >
            <i className="fa-solid fa-rotate mr-2"></i>
            Tải lại
          </button>
        </div>
      </div>

      <Card>
        <AsyncState
          loading={loading}
          error={error}
          empty={!logs.length}
          emptyText="Chưa có email nào được ghi nhận."
          onRetry={load}
        />
        {!loading && !error && logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Người nhận</th>
                  <th className="px-4 py-3">Tiêu đề</th>
                  <th className="px-4 py-3 text-center">Nhà cung cấp</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/60" data-testid="email-log-row">
                    <td className="px-4 py-3 text-slate-700">{l.to}</td>
                    <td className="px-4 py-3 text-slate-900 max-w-xs truncate" title={l.subject}>
                      {l.subject}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                        {l.provider}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {l.status === 'sent' ? (
                        <span
                          data-testid="email-status"
                          data-status="sent"
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800"
                        >
                          Đã gửi
                        </span>
                      ) : (
                        <span
                          data-testid="email-status"
                          data-status="failed"
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700"
                          title={l.error}
                        >
                          Thất bại
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
