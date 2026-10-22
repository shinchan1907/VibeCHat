import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

interface User {
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requestOtp: (email: string) => Promise<{ success: boolean; previewCode?: string; message: string }>;
  verifyOtp: (email: string, code: string) => Promise<boolean>;
  loginWithCfAccess: () => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('waba_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAuth = async () => {
      // 1. Check if Cloudflare Access Zero Trust OTP has already verified this admin session
      try {
        const cfRes = await api.auth.checkCfAccess();
        if (cfRes.success && cfRes.user && cfRes.token) {
          localStorage.setItem('waba_token', cfRes.token);
          setToken(cfRes.token);
          setUser(cfRes.user);
          setIsLoading(false);
          return;
        }
      } catch {
        // Not accessed via Cloudflare Access Zero Trust or headers not present
      }

      // 2. Standard token verification
      const storedToken = localStorage.getItem('waba_token');
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await api.auth.getMe();
        if (res.success && res.user) {
          setUser(res.user);
          setToken(storedToken);
        } else {
          logout();
        }
      } catch {
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    const handleForceLogout = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener('auth:logout', handleForceLogout);
    return () => window.removeEventListener('auth:logout', handleForceLogout);
  }, []);

  const requestOtp = async (email: string) => {
    return await api.auth.sendOtp(email);
  };

  const verifyOtp = async (email: string, code: string) => {
    try {
      const res = await api.auth.verifyOtp(email, code);
      if (res.success && res.token) {
        localStorage.setItem('waba_token', res.token);
        setToken(res.token);
        setUser(res.user);
        return true;
      }
      return false;
    } catch (err) {
      throw err;
    }
  };

  const loginWithCfAccess = async () => {
    try {
      const res = await api.auth.checkCfAccess();
      if (res.success && res.token && res.user) {
        localStorage.setItem('waba_token', res.token);
        setToken(res.token);
        setUser(res.user);
        return true;
      }
      return false;
    } catch (err) {
      throw err;
    }
  };

  const logout = () => {
    api.auth.logout().catch(() => {});
    localStorage.removeItem('waba_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isLoading,
        requestOtp,
        verifyOtp,
        loginWithCfAccess,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
