import { User } from '../types';
import { loginWithGoogleOAuth } from './googleAuth';
import {
  isBackendConfigured,
  serverLogin,
  serverRegister,
  serverLogout,
  serverGoogleAuth,
  serverGetProfile,
  serverUpdateProfile,
  getBackendBaseUrl,
  ServerLoginPayload,
  ServerRegisterPayload,
  ServerGoogleAuthPayload,
  ServerAuthResponse,
} from './serverAuth';

// Re-export server auth utilities for direct access
export {
  isBackendConfigured,
  serverLogin,
  serverRegister,
  serverLogout,
  serverGoogleAuth,
  serverGetProfile,
  serverUpdateProfile,
  getBackendBaseUrl,
};
export type { ServerLoginPayload, ServerRegisterPayload, ServerGoogleAuthPayload, ServerAuthResponse };

export interface LoginCredentials {
  identifier: string; // email or username
  password: string;
}

export interface SignupData {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
  message?: string;
}

// Default Mock User as requested
export const MOCK_USER_CREDENTIALS = {
  email: 'test@gmail.com',
  username: 'test_user',
  password: 'testpass',
};

const DEFAULT_MOCK_USER: User = {
  id: 'user-test-001',
  name: 'test_user',
  email: 'test@gmail.com',
  phone: '0901234567',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
  provider: 'email',
  memberSince: '28/08/2026',
  bio: 'Độc giả yêu thích sách văn học kinh điển và trinh thám tại Boko.',
  shippingAddress: {
    fullName: 'test_user',
    phone: '0901234567',
    province: 'Hà Nội',
    ward: 'Phường Hàng Trống, Quận Hoàn Kiếm',
    streetAddress: '12 Tràng Thi',
  },
};

const STORAGE_REGISTERED_USERS_KEY = 'boko_registered_users';
const STORAGE_AUTH_USER_KEY = 'boko_user';
const STORAGE_AUTH_TOKEN_KEY = 'boko_auth_token';

// Helper to get registered mock users
function getRegisteredMockUsers(): Array<{ email: string; username?: string; password: string; user: User }> {
  try {
    const raw = localStorage.getItem(STORAGE_REGISTERED_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Helper to save new user to mock list
function saveRegisteredMockUser(record: { email: string; username?: string; password: string; user: User }) {
  try {
    const list = getRegisteredMockUsers();
    list.push(record);
    localStorage.setItem(STORAGE_REGISTERED_USERS_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save user to mock storage', e);
  }
}

/**
 * Login API function
 * - When VITE_BACKEND_URL is configured: sends credentials to POST /api/auth/login
 * - When VITE_BACKEND_URL is not set: falls back gracefully to mock credentials (test@gmail.com / test_user / testpass) and localStorage
 */
export async function loginApi(credentials: LoginCredentials): Promise<AuthResponse> {
  const trimmedIdentifier = credentials.identifier.trim();
  const trimmedPassword = credentials.password;

  if (!trimmedIdentifier) {
    return {
      success: false,
      error: 'Vui lòng nhập Username hoặc Email.',
    };
  }

  if (!trimmedPassword) {
    return {
      success: false,
      error: 'Vui lòng nhập mật khẩu.',
    };
  }

  // 1. If backend host is configured in .env, call real backend API
  if (isBackendConfigured()) {
    const serverResult = await serverLogin({
      identifier: trimmedIdentifier,
      password: trimmedPassword,
    });

    if (serverResult.success && serverResult.user) {
      try {
        localStorage.setItem(STORAGE_AUTH_USER_KEY, JSON.stringify(serverResult.user));
        if (serverResult.token) {
          localStorage.setItem(STORAGE_AUTH_TOKEN_KEY, serverResult.token);
        }
      } catch (e) {
        console.error(e);
      }
      return serverResult;
    }

    // Return the server's authentication failure or error message
    return {
      success: false,
      error: serverResult.error || 'Đăng nhập không thành công.',
    };
  }

  // 2. Local Fallback Mode (when backend host is not yet added)
  // Simulate network latency (500ms)
  await new Promise((resolve) => setTimeout(resolve, 500));

  const isMockDefault =
    (trimmedIdentifier.toLowerCase() === MOCK_USER_CREDENTIALS.email.toLowerCase() ||
      trimmedIdentifier.toLowerCase() === MOCK_USER_CREDENTIALS.username.toLowerCase()) &&
    trimmedPassword === MOCK_USER_CREDENTIALS.password;

  if (isMockDefault) {
    const mockToken = `mock-token-${Date.now()}`;
    try {
      localStorage.setItem(STORAGE_AUTH_USER_KEY, JSON.stringify(DEFAULT_MOCK_USER));
      localStorage.setItem(STORAGE_AUTH_TOKEN_KEY, mockToken);
    } catch (e) {
      console.error(e);
    }

    return {
      success: true,
      user: DEFAULT_MOCK_USER,
      token: mockToken,
      message: 'Đăng nhập thành công với tài khoản thử nghiệm!',
    };
  }

  // Check custom registered users
  const registeredUsers = getRegisteredMockUsers();
  const found = registeredUsers.find(
    (u) =>
      (u.email.toLowerCase() === trimmedIdentifier.toLowerCase() ||
        (u.username && u.username.toLowerCase() === trimmedIdentifier.toLowerCase())) &&
      u.password === trimmedPassword
  );

  if (found) {
    const mockToken = `mock-token-${Date.now()}`;
    try {
      localStorage.setItem(STORAGE_AUTH_USER_KEY, JSON.stringify(found.user));
      localStorage.setItem(STORAGE_AUTH_TOKEN_KEY, mockToken);
    } catch (e) {
      console.error(e);
    }

    return {
      success: true,
      user: found.user,
      token: mockToken,
      message: 'Đăng nhập thành công!',
    };
  }

  return {
    success: false,
    error: 'Tài khoản hoặc mật khẩu không chính xác. Bạn có thể sử dụng tài khoản thử nghiệm: test_user / test@gmail.com (Mật khẩu: testpass)',
  };
}

/**
 * Signup API function
 * - When VITE_BACKEND_URL is configured: sends credentials to POST /api/auth/register
 * - When VITE_BACKEND_URL is not set: falls back gracefully to local storage registration
 */
export async function signupApi(data: SignupData): Promise<AuthResponse> {
  const trimmedName = data.name.trim();
  const trimmedEmail = data.email.trim();
  const trimmedPassword = data.password;

  if (!trimmedName) {
    return { success: false, error: 'Vui lòng nhập Họ và Tên.' };
  }
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    return { success: false, error: 'Vui lòng nhập địa chỉ Email hợp lệ.' };
  }
  if (trimmedPassword.length < 6) {
    return { success: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
  }

  // 1. If backend host is configured in .env, call real backend API
  if (isBackendConfigured()) {
    const serverResult = await serverRegister({
      name: trimmedName,
      email: trimmedEmail,
      password: trimmedPassword,
      username: trimmedEmail.split('@')[0],
      phone: data.phone?.trim() || undefined,
    });

    if (serverResult.success && serverResult.user) {
      try {
        localStorage.setItem(STORAGE_AUTH_USER_KEY, JSON.stringify(serverResult.user));
        if (serverResult.token) {
          localStorage.setItem(STORAGE_AUTH_TOKEN_KEY, serverResult.token);
        }
      } catch (e) {
        console.error(e);
      }
      return serverResult;
    }

    return {
      success: false,
      error: serverResult.error || 'Đăng ký tài khoản không thành công.',
    };
  }

  // 2. Local Fallback Mode
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Check if email already exists
  if (trimmedEmail.toLowerCase() === MOCK_USER_CREDENTIALS.email.toLowerCase()) {
    return { success: false, error: 'Email này đã tồn tại trong hệ thống.' };
  }

  const registeredUsers = getRegisteredMockUsers();
  if (registeredUsers.some((u) => u.email.toLowerCase() === trimmedEmail.toLowerCase())) {
    return { success: false, error: 'Email này đã được đăng ký.' };
  }

  const newUser: User = {
    id: `user-${Date.now()}`,
    name: trimmedName,
    email: trimmedEmail,
    phone: data.phone?.trim() || undefined,
    avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200`,
    provider: 'email',
    memberSince: new Date().toLocaleDateString('vi-VN'),
  };

  saveRegisteredMockUser({
    email: trimmedEmail,
    username: trimmedEmail.split('@')[0],
    password: trimmedPassword,
    user: newUser,
  });

  const mockToken = `mock-token-${Date.now()}`;
  try {
    localStorage.setItem(STORAGE_AUTH_USER_KEY, JSON.stringify(newUser));
    localStorage.setItem(STORAGE_AUTH_TOKEN_KEY, mockToken);
  } catch (e) {
    console.error(e);
  }

  return {
    success: true,
    user: newUser,
    token: mockToken,
    message: 'Đăng ký tài khoản thành công!',
  };
}

/**
 * Forgot Password API function
 * Gửi yêu cầu đặt lại mật khẩu tới POST /api/auth/forgot-password.
 * Backend luôn trả 200 (không tiết lộ email có tồn tại hay không).
 */
export async function forgotPasswordApi(
  email: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes('@')) {
    return { success: false, error: 'Vui lòng nhập địa chỉ email hợp lệ.' };
  }

  try {
    const base = getBackendBaseUrl();
    const res = await fetch(`${base}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: trimmed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.error || 'Không gửi được yêu cầu đặt lại mật khẩu.' };
    }
    return { success: true, message: data?.message };
  } catch {
    return { success: false, error: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.' };
  }
}

/**
 * Reset Password API function
 * Đặt lại mật khẩu bằng token: POST /api/auth/reset-password.
 */
export async function resetPasswordApi(
  token: string,
  password: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const trimmedToken = (token || '').trim();
  if (!trimmedToken) {
    return { success: false, error: 'Thiếu mã đặt lại mật khẩu trong đường dẫn.' };
  }
  if (password.length < 6) {
    return { success: false, error: 'Mật khẩu phải có ít nhất 6 ký tự.' };
  }

  try {
    const base = getBackendBaseUrl();
    const res = await fetch(`${base}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: trimmedToken, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.error || 'Đặt lại mật khẩu không thành công.' };
    }
    return { success: true, message: data?.message };
  } catch {
    return { success: false, error: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.' };
  }
}

/**
 * Social OAuth Login API function
 */
export async function socialLoginApi(provider: 'google' | 'facebook' | 'apple'): Promise<AuthResponse> {
  if (provider === 'google') {
    return await loginWithGoogleOAuth();
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  let socialUser: User;
  if (provider === 'facebook') {
    socialUser = {
      id: `facebook-${Date.now()}`,
      name: 'Minh Trần (Facebook)',
      email: 'minh.tran.fb@facebook.com',
      avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&q=80&w=200',
      provider: 'facebook',
      memberSince: new Date().toLocaleDateString('vi-VN'),
    };
  } else {
    socialUser = {
      id: `apple-${Date.now()}`,
      name: 'Bảo Hoàng (Apple ID)',
      email: 'bao.hoang@icloud.com',
      avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=200',
      provider: 'apple',
      memberSince: new Date().toLocaleDateString('vi-VN'),
    };
  }

  const mockToken = `mock-token-${Date.now()}`;
  try {
    localStorage.setItem(STORAGE_AUTH_USER_KEY, JSON.stringify(socialUser));
    localStorage.setItem(STORAGE_AUTH_TOKEN_KEY, mockToken);
  } catch (e) {
    console.error(e);
  }

  return {
    success: true,
    user: socialUser,
    token: mockToken,
    message: `Đăng nhập thành công với ${provider}!`,
  };
}

/**
 * Logout API function
 */
export async function logoutApi(): Promise<void> {
  const currentToken = getStoredAuthToken();
  if (isBackendConfigured() && currentToken) {
    await serverLogout(currentToken);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  try {
    localStorage.removeItem(STORAGE_AUTH_USER_KEY);
    localStorage.removeItem(STORAGE_AUTH_TOKEN_KEY);
  } catch (e) {
    console.error(e);
  }
}

/**
 * Get current authenticated user from local persistence
 */
export function getStoredAuthUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Get current stored authentication token
 */
export function getStoredAuthToken(): string | null {
  try {
    const token = localStorage.getItem(STORAGE_AUTH_TOKEN_KEY);
    // Loại bỏ token giả lập/offline (mock-token-*, google-demo-token-*) — không gửi lên backend.
    if (!token || token.startsWith('mock-token-') || token.startsWith('google-demo-token-')) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}
