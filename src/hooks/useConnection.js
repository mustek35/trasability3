import { useState, useEffect } from 'react';
import connectionManager from '../services/connectionManager';

export const useConnection = () => {
  const [connectionState, setConnectionState] = useState({
    isOnline: navigator.onLine,
    retryAttempts: 0,
    lastError: null
  });

  useEffect(() => {
    const unsubscribe = connectionManager.addListener((status) => {
      setConnectionState(prev => ({
        ...prev,
        isOnline: status === 'online',
        retryAttempts: connectionManager.getRetryInfo().attempts
      }));
    });

    return unsubscribe;
  }, []);

  return connectionState;
};