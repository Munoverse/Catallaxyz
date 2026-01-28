'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

type NotificationItem = {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
};

type NotificationContextValue = {
  notify: (type: NotificationType, message: string, duration?: number) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const DEFAULT_DURATION = 5000;

const getStyles = (type: NotificationType) => {
  switch (type) {
    case 'success': return 'bg-green-50 border-green-200 text-green-700';
    case 'error': return 'bg-red-50 border-red-200 text-red-700';
    case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-700';
    default: return 'bg-blue-50 border-blue-200 text-blue-700';
  }
};

const getIcon = (type: NotificationType) => {
  switch (type) {
    case 'success': return '✓';
    case 'error': return '✕';
    case 'warning': return '⚠';
    default: return 'ℹ';
  }
};

/**
 * Notification Provider with proper cleanup
 * AUDIT FIX: Added useEffect cleanup for setTimeout
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  // AUDIT FIX: Track timeout IDs for cleanup
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
      timeoutRefs.current.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    // Clear the timeout if it exists
    const timeout = timeoutRefs.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    timeoutRefs.current.forEach((timeout) => clearTimeout(timeout));
    timeoutRefs.current.clear();
    setItems([]);
  }, []);

  const notify = useCallback((type: NotificationType, message: string, duration = DEFAULT_DURATION) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setItems((prev) => [...prev, { id, type, message, duration }]);
    
    // AUDIT FIX: Store timeout reference for cleanup
    const timeout = setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
      timeoutRefs.current.delete(id);
    }, duration);
    
    timeoutRefs.current.set(id, timeout);
  }, []);

  const value = useMemo(() => ({ notify, dismiss, dismissAll }), [notify, dismiss, dismissAll]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div 
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="alert"
            className={`border rounded-lg px-4 py-3 text-sm shadow flex items-center gap-2 ${getStyles(item.type)}`}
          >
            <span className="flex-shrink-0">{getIcon(item.type)}</span>
            <span className="flex-1">{item.message}</span>
            <button
              onClick={() => dismiss(item.id)}
              className="flex-shrink-0 opacity-60 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
