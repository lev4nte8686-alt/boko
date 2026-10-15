import React, { useCallback, useEffect, useState } from 'react';
import {
  SellerBook,
  CategoryItem,
  getSellerBooks,
  getCategories,
  createBook,
  updateBook,
  deleteBook,
} from '../../api/seller';
import { AsyncState, Card, formatVND, formatDateTime } from './ui';

interface BooksTabProps {
  onChanged?: () => void;
}

interface BookFormState {
  title: string;
  author: string;
  description: string;
  price: string;
  stock: string;
  image_url: string;
  category_id: string;
}

const EMPTY_FORM: BookFormState = {
  title: '',
  author: '',
  description: '',
  price: '',
  stock: '0',
  image_url: '',
  category_id: '',
};

export const BooksTab: React.FC<BooksTabProps> = ({ onChanged }) => {
  const [books, setBooks] = useState<SellerBook[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BookFormState>(EMPTY_FORM);
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
    const [booksRes, categoriesRes] = await Promise.all([getSellerBooks(), getCategories()]);
    if (!booksRes.ok) {
      setError(booksRes.error || 'Không tải được danh sách sách.');
      setLoading(false);
      return;
    }
    setBooks(booksRes.data?.data || []);
    setCategories(categoriesRes.ok ? categoriesRes.data?.data || [] : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (book: SellerBook) => {
    setEditingId(book.id);
    setForm({
      title: book.title,
      author: book.author,
      description: book.description || '',
      price: String(book.price ?? ''),
      stock: String(book.stock ?? 0),
      image_url: book.image_url || '',
      category_id: book.category_id ? String(book.category_id) : '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const price = Number(form.price);
    const stock = Number(form.stock);
    if (!form.title.trim() || !form.author.trim()) {
      setFormError('Vui lòng nhập tên sách và tác giả.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setFormError('Giá phải là số lớn hơn 0.');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setFormError('Tồn kho không hợp lệ.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      author: form.author.trim(),
      description: form.description.trim(),
      price,
      stock,
      image_url: form.image_url.trim(),
      category_id: form.category_id ? Number(form.category_id) : null,
    };

    setSaving(true);
    try {
      const res = editingId ? await updateBook(editingId, payload) : await createBook(payload);
      if (!res.ok) {
        setFormError(res.error || 'Lưu sách thất bại.');
        return;
      }
      setIsFormOpen(false);
      showToast(editingId ? 'Đã cập nhật sách.' : 'Đã thêm sách mới.');
      await load();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await deleteBook(id);
    if (!res.ok) {
      showToast(res.error || 'Xoá sách thất bại.');
      return;
    }
    setPendingDeleteId(null);
    showToast('Đã xoá sách.');
    await load();
    onChanged?.();
  };

  return (
    <div className="space-y-5" data-testid="books-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900">Quản lý sách</h2>
          <p className="text-xs text-slate-500">{books.length} đầu sách trong cửa hàng</p>
        </div>
        <button
          onClick={openCreateForm}
          data-testid="add-book-btn"
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
        >
          <i className="fa-solid fa-plus mr-2"></i>
          Thêm sách
        </button>
      </div>

      {isFormOpen && (
        <Card className="p-5" data-testid="book-form">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="font-display font-bold text-base text-slate-900">
              {editingId ? `Sửa sách #${editingId}` : 'Thêm sách mới'}
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Tên sách *</span>
                <input
                  data-testid="book-title-input"
                  className="paper-input w-full mt-1"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Tác giả *</span>
                <input
                  data-testid="book-author-input"
                  className="paper-input w-full mt-1"
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Giá (VND) *</span>
                <input
                  data-testid="book-price-input"
                  type="number"
                  min="0"
                  className="paper-input w-full mt-1"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Tồn kho *</span>
                <input
                  data-testid="book-stock-input"
                  type="number"
                  min="0"
                  className="paper-input w-full mt-1"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Danh mục</span>
                <select
                  data-testid="book-category-select"
                  className="paper-input w-full mt-1"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">— Không chọn —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-600">Ảnh bìa (URL)</span>
                <input
                  data-testid="book-image-input"
                  className="paper-input w-full mt-1"
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Mô tả</span>
              <textarea
                data-testid="book-description-input"
                rows={2}
                className="paper-input w-full mt-1"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            {formError && (
              <p className="text-rose-600 text-xs font-semibold" data-testid="book-form-error">
                {formError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                data-testid="book-submit"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                {saving ? 'Đang lưu…' : editingId ? 'Cập nhật' : 'Thêm sách'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Huỷ
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <AsyncState loading={loading} error={error} empty={!books.length} emptyText="Chưa có sách nào." onRetry={load} />
        {!loading && !error && books.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Sách</th>
                  <th className="px-4 py-3">Danh mục</th>
                  <th className="px-4 py-3 text-right">Giá</th>
                  <th className="px-4 py-3 text-center">Tồn kho</th>
                  <th className="px-4 py-3">Cập nhật</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {books.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/60" data-testid="book-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-12 rounded bg-slate-100 overflow-hidden shrink-0">
                          {b.image_url ? (
                            <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                              <i className="fa-solid fa-book"></i>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 line-clamp-1" data-testid="book-row-title">
                            {b.title}
                          </p>
                          <p className="text-xs text-slate-500 line-clamp-1">{b.author}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{b.category?.name || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatVND(b.price)}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block min-w-[2.5rem] px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          b.stock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {b.stock}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(b.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {pendingDeleteId === b.id ? (
                          <>
                            <button
                              data-testid="book-delete-confirm"
                              onClick={() => handleDelete(b.id)}
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
                              data-testid={`book-edit-${b.id}`}
                              onClick={() => openEditForm(b)}
                              title="Sửa"
                              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 cursor-pointer"
                            >
                              <i className="fa-solid fa-pen text-xs"></i>
                            </button>
                            <button
                              data-testid={`book-delete-${b.id}`}
                              onClick={() => setPendingDeleteId(b.id)}
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
          data-testid="books-toast"
          className="fixed bottom-6 right-6 z-50 bg-slate-900/95 text-amber-200 px-5 py-3 rounded-xl border border-amber-500/40 shadow-2xl text-sm font-medium"
        >
          {toast}
        </div>
      )}
    </div>
  );
};
