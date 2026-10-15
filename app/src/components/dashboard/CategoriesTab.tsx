import React, { useCallback, useEffect, useState } from 'react';
import {
  CategoryItem,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../../api/seller';
import { AsyncState, Card, formatDateTime } from './ui';

interface CategoriesTabProps {
  onChanged?: () => void;
}

export const CategoriesTab: React.FC<CategoriesTabProps> = ({ onChanged }) => {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getCategories();
    if (!res.ok) {
      setError(res.error || 'Không tải được danh mục.');
      setLoading(false);
      return;
    }
    setCategories(res.data?.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreateForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (c: CategoryItem) => {
    setEditingId(c.id);
    setName(c.name);
    setDescription(c.description || '');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('Vui lòng nhập tên danh mục.');
      return;
    }
    setSaving(true);
    try {
      const res = editingId
        ? await updateCategory(editingId, { name: name.trim(), description: description.trim() })
        : await createCategory({ name: name.trim(), description: description.trim() });
      if (!res.ok) {
        setFormError(res.error || 'Lưu danh mục thất bại.');
        return;
      }
      setIsFormOpen(false);
      showToast(editingId ? 'Đã cập nhật danh mục.' : 'Đã thêm danh mục.');
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await deleteCategory(id);
    if (!res.ok) {
      showToast(res.error || 'Xoá danh mục thất bại.');
      return;
    }
    setPendingDeleteId(null);
    showToast('Đã xoá danh mục.');
    await load();
    onChanged?.();
  };

  return (
    <div className="space-y-5" data-testid="categories-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">Danh mục sách</h2>
          <p className="text-xs text-slate-500">Chỉ quản trị viên ({categories.length} danh mục)</p>
        </div>
        <button
          onClick={openCreateForm}
          data-testid="add-category-btn"
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <i className="fa-solid fa-plus mr-2"></i>
          Thêm danh mục
        </button>
      </div>

      {isFormOpen && (
        <Card className="p-5" data-testid="category-form">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Tên danh mục *</span>
                <input
                  data-testid="category-name-input"
                  className="paper-input w-full mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Mô tả</span>
                <input
                  data-testid="category-description-input"
                  className="paper-input w-full mt-1"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>
            {formError && (
              <p className="text-rose-600 text-xs font-semibold" data-testid="category-form-error">
                {formError}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                data-testid="category-submit"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                {saving ? 'Đang lưu…' : editingId ? 'Cập nhật' : 'Thêm danh mục'}
              </button>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Huỷ
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <AsyncState
          loading={loading}
          error={error}
          empty={!categories.length}
          emptyText="Chưa có danh mục nào."
          onRetry={load}
        />
        {!loading && !error && categories.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Danh mục</th>
                  <th className="px-4 py-3">Mô tả</th>
                  <th className="px-4 py-3">Tạo lúc</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60" data-testid="category-row">
                    <td className="px-4 py-3 font-semibold text-slate-900" data-testid="category-row-name">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.description || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(c.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {pendingDeleteId === c.id ? (
                          <>
                            <button
                              data-testid="category-delete-confirm"
                              onClick={() => handleDelete(c.id)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                            >
                              Xác nhận xoá
                            </button>
                            <button
                              onClick={() => setPendingDeleteId(null)}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                            >
                              Huỷ
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              data-testid={`category-edit-${c.id}`}
                              onClick={() => openEditForm(c)}
                              title="Sửa"
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 cursor-pointer"
                            >
                              <i className="fa-solid fa-pen text-xs"></i>
                            </button>
                            <button
                              data-testid={`category-delete-${c.id}`}
                              onClick={() => setPendingDeleteId(c.id)}
                              title="Xoá"
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 cursor-pointer"
                            >
                              <i className="fa-solid fa-trash text-xs"></i>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {toast && (
        <div
          data-testid="categories-toast"
          className="fixed bottom-6 right-6 z-50 bg-slate-900/95 text-amber-200 px-5 py-3 rounded-xl border border-amber-500/40 shadow-2xl text-sm font-medium"
        >
          {toast}
        </div>
      )}
    </div>
  );
};
