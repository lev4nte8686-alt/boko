import { User } from '../types';
import { AuthResponse } from './auth';
import { isBackendConfigured, serverGoogleAuth } from './serverAuth';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: any) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
          initCodeClient?: (config: any) => any;
        };
      };
    };
  }
}

export interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export interface GoogleUserInfo {
  sub: string;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email: string;
  email_verified?: boolean;
  locale?: string;
}

const STORAGE_AUTH_USER_KEY = 'boko_user';
const STORAGE_AUTH_TOKEN_KEY = 'boko_auth_token';

/**
 * Ensures Google Identity Services script is loaded in the window
 */
function waitForGoogleScript(timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) {
      resolve(true);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Initiates Google OAuth Login
 * - If VITE_GOOGLE_CLIENT_ID is provided: opens official Google OAuth popup via Google Identity Services
 * - If VITE_GOOGLE_CLIENT_ID is empty: falls back gracefully to a seamless demo Google account
 */
export async function loginWithGoogleOAuth(): Promise<AuthResponse> {
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

  // If Client ID is configured in .env, use real Google Identity Services OAuth
  if (clientId) {
    const isGoogleReady = await waitForGoogleScript();

    if (!isGoogleReady || !window.google?.accounts?.oauth2) {
      return {
        success: false,
        error: 'Không thể tải thư viện Google Identity Services. Vui lòng kiểm tra kết nối mạng.',
      };
    }

    return new Promise<AuthResponse>((resolve) => {
      try {
        const tokenClient = window.google!.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: async (tokenResponse: GoogleTokenResponse) => {
            if (tokenResponse.error) {
              resolve({
                success: false,
                error: tokenResponse.error_description || tokenResponse.error || 'Đăng nhập Google thất bại.',
              });
              return;
            }

            if (!tokenResponse.access_token) {
              resolve({
                success: false,
                error: 'Không nhận được mã xác thực từ Google.',
              });
              return;
            }

            try {
              // Fetch user profile from Google UserInfo API
              const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: {
                  Authorization: `Bearer ${tokenResponse.access_token}`,
                },
              });

              if (!userInfoRes.ok) {
                throw new Error('Không thể lấy thông tin tài khoản Google.');
              }

              const profile: GoogleUserInfo = await userInfoRes.json();

              let finalUser: User = {
                id: `google-${profile.sub}`,
                name: profile.name || profile.given_name || profile.email.split('@')[0],
                email: profile.email,
                avatarUrl: profile.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
                provider: 'google',
                memberSince: new Date().toLocaleDateString('vi-VN'),
                bio: 'Độc giả đăng nhập qua tài khoản Google tại Boko Bookstore.',
              };

              let finalToken = '';

              // Nếu backend được cấu hình: BẮT BUỘC xác thực qua server để lấy
              // JWT của Boko. KHÔNG dùng access_token của Google làm token phiên
              // (server sẽ từ chối) — lỗi thì báo lỗi, không tạo phiên giả.
              if (isBackendConfigured()) {
                const serverRes = await serverGoogleAuth({
                  google_id: profile.sub,
                  email: profile.email,
                  name: finalUser.name,
                  avatar_url: profile.picture,
                  provider: 'google',
                  email_verified: profile.email_verified,
                  access_token: tokenResponse.access_token,
                });

                if (!serverRes.success || !serverRes.token) {
                  resolve({
                    success: false,
                    error: serverRes.error || 'Máy chủ chưa xác thực được tài khoản Google.',
                  });
                  return;
                }
                if (serverRes.user) {
                  finalUser = serverRes.user;
                }
                finalToken = serverRes.token;
              } else {
                finalToken = tokenResponse.access_token || '';
              }

              try {
                localStorage.setItem(STORAGE_AUTH_USER_KEY, JSON.stringify(finalUser));
                localStorage.setItem(STORAGE_AUTH_TOKEN_KEY, finalToken);
              } catch (err) {
                console.error(err);
              }

              resolve({
                success: true,
                user: finalUser,
                token: finalToken,
                message: `Chào mừng ${finalUser.name} đăng nhập qua Google!`,
              });
            } catch (err: any) {
              resolve({
                success: false,
                error: err?.message || 'Lỗi khi xử lý thông tin tài khoản Google.',
              });
            }
          },
          error_callback: (err: any) => {
            console.error('Google OAuth error:', err);
            resolve({
              success: false,
              error: 'Người dùng đã hủy hoặc có lỗi xảy ra trong quá trình đăng nhập Google.',
            });
          },
        });

        // Request Google Access Token via standard popup window
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } catch (err: any) {
        console.error('InitTokenClient exception:', err);
        resolve({
          success: false,
          error: err?.message || 'Có lỗi khi khởi tạo phiên đăng nhập Google.',
        });
      }
    });
  }

  // Chưa cấu hình VITE_GOOGLE_CLIENT_ID.
  if (isBackendConfigured()) {
    // Môi trường thật (có backend): KHÔNG tạo phiên giả — token demo bị chặn sẽ
    // khiến người dùng tưởng đã đăng nhập nhưng không gọi được API.
    return {
      success: false,
      error:
        'Đăng nhập Google chưa được cấu hình. Vui lòng thêm VITE_GOOGLE_CLIENT_ID (Google OAuth Client ID) cho web.',
    };
  }

  // Chế độ mô phỏng offline (không có backend) để dev giao diện.
  await new Promise((resolve) => setTimeout(resolve, 600));

  const demoGoogleUser: User = {
    id: `google-user-${Date.now()}`,
    name: 'Nguyễn Hoàng An (Google Account)',
    email: 'hoang.an.google@gmail.com',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
    provider: 'google',
    memberSince: new Date().toLocaleDateString('vi-VN'),
    bio: 'Độc giả kết nối tài khoản Google tại Boko Bookstore.',
  };

  const demoToken = `google-demo-token-${Date.now()}`;
  try {
    localStorage.setItem(STORAGE_AUTH_USER_KEY, JSON.stringify(demoGoogleUser));
    localStorage.setItem(STORAGE_AUTH_TOKEN_KEY, demoToken);
  } catch (e) {
    console.error(e);
  }

  return {
    success: true,
    user: demoGoogleUser,
    token: demoToken,
    message: 'Đăng nhập Google thành công! (Chế độ mô phỏng - Bạn có thể điền VITE_GOOGLE_CLIENT_ID trong .env bất cứ lúc nào).',
  };
}
