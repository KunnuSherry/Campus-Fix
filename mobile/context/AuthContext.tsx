import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../../shared/types';
import { api } from '../services/api';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  role: UserRole;
  isLoading: boolean;
  loginWithVerifiedData: (data: {
    token: string;
    user_id: string;
    role: UserRole;
    college_id: string;
    pseudonym: string;
    full_name?: string;
    email: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    // Safety timer: ensures app never stays stuck on loading spinner even if network lags
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    try {
      const storedToken = await api.loadStoredToken();
      if (storedToken) {
        setToken(storedToken);
        const profile = await api.getMyProfile();
        setUser(profile);
      }
    } catch (e) {
      console.log('No active session found or token expired');
      await api.setToken(null);
      setToken(null);
      setUser(null);
    } finally {
      clearTimeout(safetyTimer);
      setIsLoading(false);
    }
  };

  const loginWithVerifiedData = async (data: {
    token: string;
    user_id: string;
    role: UserRole;
    college_id: string;
    pseudonym: string;
    full_name?: string;
    email: string;
  }) => {
    await api.setToken(data.token);
    setToken(data.token);
    const profile: UserProfile = {
      id: data.user_id,
      college_id: data.college_id,
      role: data.role,
      full_name: data.full_name,
      email: data.email,
      pseudonym: data.pseudonym,
      created_at: new Date().toISOString(),
    };
    setUser(profile);
  };

  const logout = async () => {
    await api.setToken(null);
    setToken(null);
    setUser(null);
  };

  const refreshProfile = async () => {
    if (token) {
      try {
        const profile = await api.getMyProfile();
        setUser(profile);
      } catch (e) {
        console.warn('Failed to refresh profile:', e);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role: user?.role || 'student',
        isLoading,
        loginWithVerifiedData,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
