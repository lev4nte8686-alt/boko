import React, { useEffect, useRef, useState } from 'react';
import { Book, Currency } from '../types';
import { fetchLatestBooksApi, searchBooksApi } from '../api/catalog';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBook: (book: Book) => void;
  currency: Currency;
  /** Backend chưa được cấu hình (thiếu VITE_BACKEND_URL) hoặc đang không phản hồi. */
  isBackendReady?: boolean;
}

// Gõ 300ms mới hỏi server để không bắn request mỗi ký tự.
const SEARCH_DEBOUNCE_MS = 300;

export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectBook,
  currency,
  isBackendReady = true
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Reset mỗi lần mở lại ô tìm kiếm.
  useEffect(() => {
    if (isOpen) setQuery('');
  }, [isOpen]);

  // Tìm kiếm PHÍA SERVER (không lọc catalog trên trình duyệt).
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = query.trim();
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      let nextBooks: Book[] = [];
      let nextTotal = 0;
      let ok = true;

      if (trimmed === '') {
        nextBooks = await fetchLatestBooksApi(8);
        nextTotal = nextBooks.length;
      } else {
        const res = await searchBooksApi(trimmed, 25);
        nextBooks = res.books;
        nextTotal = res.total;
        ok = res.ok;
      }

      // Bỏ qua kết quả cũ về muộn (user đã gõ thêm ký tự).
      if (requestId !== requestIdRef.current) return;
      setResults(nextBooks);
      setTotal(nextTotal);
      setError(ok ? null : 'Không tìm được cơ sở dữ liệu sách. Vui lòng thử lại sau.');
      setIsLoading(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const showSuggestions = query.trim() === '';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-start justify-center pt-16 sm:pt-24 px-4 animate-fadeIn">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Search Bar Input */}
        <div className="p-4 sm:p-6 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
          <i className="fa-solid fa-magnifying-glass text-xl text-blue-600"></i>
          <input
            type="text"
            autoFocus
            data-testid="search-input"
            placeholder="Tìm theo tên sách hoặc tác giả..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent border-none text-base sm:text-lg text-slate-900 placeholder:text-slate-400 focus:ring-0 focus:outline-none font-body"
          />
          {isLoading && <i className="fa-solid fa-circle-notch fa-spin text-slate-400"></i>}
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 hover:bg-slate-200/60 rounded-full text-slate-500 cursor-pointer"
            >
              <i className="fa-solid fa-xmark text-base"></i>
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-2 font-label-caps text-xs text-slate-500 uppercase hover:text-slate-900 font-semibold cursor-pointer"
          >
            Đóng
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-4 sm:p-6 space-y-3">
          {!isBackendReady && (
            <div className="text-center py-10 text-slate-500">
              <i className="fa-solid fa-plug-circle-xmark text-2xl text-slate-300 mb-3 block"></i>
              <p className="font-body text-sm">
                Chưa kết nối được kho sách nên chức năng tìm kiếm tạm không hoạt động.
              </p>
            </div>
          )}

          {isBackendReady && error && (
            <div className="text-center py-10 text-red-600" data-testid="search-error">
              <i className="fa-solid fa-circle-exclamation text-2xl text-red-300 mb-3 block"></i>
              <p className="font-body text-sm">{error}</p>
            </div>
          )}

          {isBackendReady && !error && results.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              {isLoading ? (
                <p className="font-body text-sm">Đang tìm...</p>
              ) : (
                <>
                  <i className="fa-solid fa-book-open text-2xl text-slate-300 mb-3 block"></i>
                  <p className="font-body text-sm" data-testid="search-empty">
                    {showSuggestions
                      ? 'Chưa có sách nào để gợi ý.'
                      : `Không có sách nào phù hợp với "${query}"`}
                  </p>
                </>
              )}
            </div>
          )}

          {isBackendReady && !error && results.length > 0 && (
            <>
              {showSuggestions ? (
                <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400 mb-2">
                  Sách nổi bật
                </p>
              ) : (
                <p className="text-[11px] uppercase tracking-widest font-bold text-slate-400 mb-2">
                  {total > results.length
                    ? `${total} kết quả (hiển thị ${results.length})`
                    : `${total} kết quả`}
                </p>
              )}

              {results.map((book) => {
                const formattedPrice =
                  currency === 'EUR'
                    ? `€ ${book.priceEUR.toFixed(2)}`
                    : `${book.priceVND.toLocaleString('vi-VN')} ₫`;

                return (
                  <div
                    key={book.id}
                    data-testid="search-result"
                    onClick={() => {
                      onSelectBook(book);
                      onClose();
                    }}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group border border-transparent hover:border-slate-200"
                  >
                    <div className="w-12 h-16 shrink-0 bg-slate-100 rounded-md overflow-hidden book-spine-shadow border border-slate-200">
                      {book.coverUrl ? (
                        <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          style={{ backgroundColor: book.bgColor || '#334155' }}
                          className="w-full h-full flex items-center justify-center p-1 text-[7px] text-white font-bold text-center"
                        >
                          {book.title}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {book.category}
                        </span>
                        {book.brandName && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <i className="fa-solid fa-circle-check text-[10px]"></i>
                            <span>{book.brandName}</span>
                          </span>
                        )}
                      </div>
                      <h4 className="font-display font-bold text-base text-slate-900 group-hover:text-blue-600 truncate mt-1">
                        {book.title}
                      </h4>
                      <p className="font-body text-xs text-slate-500">{book.author} {book.editionType ? `• ${book.editionType}` : ''}</p>
                    </div>

                    <div className="font-body font-bold text-sm text-slate-900 shrink-0">
                      {formattedPrice}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
