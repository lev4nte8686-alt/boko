import { User } from '../types';

/**
 * Backend Host Configuration
 * Can be set via VITE_BACKEND_URL in .env (e.g. 'https://api.boko.vn' or 'http://localhost:8080')
 */
export function getBackendBaseUrl(): string {
  // Nếu VITE_BACKEND_URL được set (ví dụ: http://localhost:8080 khi dev local),
  // dùng nó làm base URL. Nếu không (khi deploy qua nginx), trả về '' để
  // các request dùng relative path /api/... và được nginx proxy tới backend.
  // Strip dấu / cuối để tránh double-slash (//api/...) gây 404 phía Gin.
  return (import.meta.env.VITE_BACKEND_URL || '').trim().replace(/\/+$/, '');
}

/**
 * Checks if backend is reachable.
 * Luôn trả true vì relative path /api/... qua nginx proxy luôn hợp lệ.
 */
export function isBackendConfigured(): boolean {
  return true;
}

// Payload DTOs for Server Requests
export interface ServerLoginPayload {
  identifier: string; // email or username
  password: string;
  rememberMe?: boolean;
}

export interface ServerRegisterPayload {
  name: string;
  email: string;
  password: string;
  username?: string;
  phone?: string;
}

export interface ServerGoogleAuthPayload {
  google_id: string; // 'sub' identifier from Google
  email: string;
  name: string;
  avatar_url?: string;
  provider: 'google';
  email_verified?: boolean;
  access_token?: string;
}

export interface ServerAuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
  message?: string;
}

/**
 * Helper to perform fetch requests to the backend server with standard headers and timeout
 */
async function fetchServer<T>(endpoint: string, options: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const baseUrl = getBackendBaseUrl();
  console.log("[fetchServer] Base URL:", baseUrl);
  // if (!baseUrl) {
  //   throw new Error('BACKEND_URL_NOT_CONFIGURED');
  // }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  console.log("[fetchServer] Requesting:", endpoint, "with options:", options);
  try {
    const res = await fetch(endpoint, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    clearTimeout(timer);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.message || data.error || `Server returned error status ${res.status}`);
    }

    return data as T;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Kết nối tới server bị quá thời gian (Timeout).');
    }
    throw err;
  }
}

/**
 * 1. Send Login Request to Server
 * Endpoint: POST /api/auth/login
 */
export async function serverLogin(payload: ServerLoginPayload): Promise<ServerAuthResponse> {
  try {
    const response = await fetchServer<ServerAuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Không thể kết nối đến máy chủ đăng nhập.',
    };
  }
}

/**
 * 2. Send Register Request to Server
 * Endpoint: POST /api/auth/register
 */
export async function serverRegister(payload: ServerRegisterPayload): Promise<ServerAuthResponse> {
  try {
    const response = await fetchServer<ServerAuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Không thể kết nối đến máy chủ đăng ký.',
    };
  }
}

/**
 * 3. Send Google OAuth Payload to Server
 * Endpoint: POST /api/auth/google
 */
export async function serverGoogleAuth(payload: ServerGoogleAuthPayload): Promise<ServerAuthResponse> {
  try {
    const response = await fetchServer<ServerAuthResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Không thể gửi thông tin xác thực Google lên máy chủ.',
    };
  }
}

/**
 * 4. Fetch Current User Profile from Server
 * Endpoint: GET /api/auth/me
 */
export async function serverGetProfile(token: string): Promise<ServerAuthResponse> {
  try {
    const response = await fetchServer<ServerAuthResponse>('/api/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Không thể lấy thông tin người dùng từ máy chủ.',
    };
  }
}

/**
 * 5. Update User Profile on Server
 * Endpoint: PUT /api/auth/profile
 */
export async function serverUpdateProfile(userData: Partial<User>, token: string): Promise<ServerAuthResponse> {
  try {
    const response = await fetchServer<ServerAuthResponse>('/api/auth/profile', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(userData),
    });
    return response;
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Không thể cập nhật hồ sơ trên máy chủ.',
    };
  }
}

/**
 * 6. Send Logout Request to Server
 * Endpoint: POST /api/auth/logout
 */
export async function serverLogout(token?: string): Promise<{ success: boolean; message?: string }> {
  try {
    if (!token) return { success: true };
    const response = await fetchServer<{ success: boolean; message?: string }>('/api/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response;
  } catch {
    // Graceful logout even if server fails
    return { success: true };
  }
}
