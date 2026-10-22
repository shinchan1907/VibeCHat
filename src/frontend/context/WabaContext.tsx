import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

interface WabaContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  connectionStatus: 'connected' | 'offline' | 'checking';
  phoneDetails: {
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
  };
  unreadCount: number;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  playNotificationSound: () => void;
  refreshConnection: () => Promise<void>;
}

const WabaContext = createContext<WabaContextType | undefined>(undefined);

export const WabaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'offline' | 'checking'>('checking');
  const [phoneDetails, setPhoneDetails] = useState<{
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
  }>({});
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('waba_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const refreshConnection = async () => {
    const token = localStorage.getItem('waba_token');
    if (!token) return;

    try {
      setConnectionStatus('checking');
      const res = await api.settings.test();
      if (res.success && res.data) {
        setConnectionStatus('connected');
        setPhoneDetails({
          verified_name: res.data.verified_name || 'ByteNex WABA',
          display_phone_number: res.data.display_phone_number,
          quality_rating: res.data.quality_rating || 'GREEN',
        });
      } else {
        setConnectionStatus('offline');
      }
    } catch {
      setConnectionStatus('offline');
    }
  };

  useEffect(() => {
    refreshConnection();
  }, []);

  // Web Audio Synthesized Notification Sound (no external MP3 asset dependency needed!)
  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // Gentle WhatsApp style double-tap chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08); // E6

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {}
  };

  return (
    <WabaContext.Provider
      value={{
        activeTab,
        setActiveTab,
        theme,
        toggleTheme,
        connectionStatus,
        phoneDetails,
        unreadCount,
        setUnreadCount,
        playNotificationSound,
        refreshConnection,
      }}
    >
      {children}
    </WabaContext.Provider>
  );
};

export const useWaba = () => {
  const context = useContext(WabaContext);
  if (!context) throw new Error('useWaba must be used within WabaProvider');
  return context;
};
