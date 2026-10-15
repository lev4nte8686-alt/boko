import { Book } from '../types';
import { safeFetchJson } from './client';
import { normalizeBook, normalizeCategoryName } from './normalizers';

export async function fetchBooksFromBackend(): Promise<Book[]> {
  const response = await safeFetchJson<{ data?: any[]; total?: number; page?: number; limit?: number }>(`/api/books?limit=50&sort=newest`);
  if (!response.ok || !response.data) {
    if (response.error) {
      console.log("Get error during get books: ", response.error.toString());
    }
    return [];
  }

  const payload = Array.isArray(response.data) ? response.data : response.data.data ?? [];
  return (payload as any[]).map(normalizeBook);
}

export async function fetchBookDetailFromBackend(id: string | number): Promise<Book | null> {
  const response = await safeFetchJson<{ data?: { book?: any; reviews?: any[] } }>(`/api/books/${id}`);
  if (!response.ok || !response.data) return null;

  return response.data.data?.book ? normalizeBook(response.data.data.book) : null;
}

/**
 * Resolve ID backend (số) cho 1 cuốn sách trên kệ.
 * Kệ frontend gồm sách backend (id số) + sách demo (id chuỗi như 'tt-1'):
 * id số dùng thẳng; id chuỗi tra backend theo đúng tên sách.
 * Tự retry vì backend free-tier (Render) có thể đang ngủ (cold start > timeout).
 * Ném lỗi thân thiện khi sách không có trong hệ thống.
 */
export async function resolveBackendBookId(book: { id: string | number; title: string }): Promise<number> {
  const direct = Number(book.id);
  if (Number.isSafeInteger(direct) && direct > 0) return direct;

  const norm = (s: string) =>
    String(s ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  const target = norm(book.title);

  // Thử tối đa 3 lần, cách nhau 8s để chờ backend cold-start dậy.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await safeFetchJson<any>(`/api/books?search=${encodeURIComponent(book.title)}&limit=10`);
    const body: any = res.data;
    const list: any[] = Array.isArray(body) ? body : body?.data ?? [];
    let hit = list.find((b) => norm(b?.title ?? '') === target) ?? list[0];
    if (!hit && attempt === 3) {
      // Fallback cuối: quét toàn catalog rồi so khớp không dấu.
      const all = await safeFetchJson<any>(`/api/books?limit=50`);
      const allBody: any = all.data;
      const allList: any[] = Array.isArray(allBody) ? allBody : allBody?.data ?? [];
      hit = allList.find((b) => norm(b?.title ?? '') === target);
    }
    const id = Number(hit?.id);
    if (Number.isSafeInteger(id) && id > 0) return id;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error(`Sách "${book.title}" hiện không có trong hệ thống nên không thể đặt hàng. Vui lòng chọn cuốn khác.`);
}

export async function fetchCategoriesFromBackend(): Promise<string[]> {
  const response = await safeFetchJson<{ data?: any[] }>(`/api/categories`);
  if (!response.ok || !response.data) return [];

  const categories = Array.isArray(response.data) ? response.data : response.data.data ?? [];
  return categories
    .map((category: any) => normalizeCategoryName(category?.name))
    .filter((name: string | undefined): name is string => Boolean(name && String(name).trim()));
}
