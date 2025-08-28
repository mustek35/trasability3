import { useState, useCallback } from 'react';

export const useStore = () => {
  const [state, setState] = useState({
    selectedDevice: 'Huelmo',
    selectedDate: new Date().toISOString().split('T')[0],
    selectedHour: new Date().getHours(),
    timelineCursor: 0,
    isPlaying: false,
    playSpeed: 1,
    detections: [],
    devices: [],
    stats: null,
    loading: false,
    error: null,
    hoveredTrajectory: null,
    customRange: { from: null, to: null, active: false },
    // Estados adicionales para la API
    connectionStatus: 'disconnected', // 'connected', 'connecting', 'disconnected', 'error'
    lastFetch: null,
    cache: new Map() // Cache simple para optimizar requests
  });
  
  const updateState = useCallback((updates) => {
    setState(prev => ({ 
      ...prev, 
      ...updates,
      lastFetch: updates.detections ? new Date().toISOString() : prev.lastFetch
    }));
  }, []);

  // Helper para limpiar errores
  const clearError = useCallback(() => {
    updateState({ error: null });
  }, [updateState]);

  // Helper para establecer error
  const setError = useCallback((error) => {
    updateState({ 
      error: error.message || 'Error desconocido',
      loading: false,
      connectionStatus: 'error'
    });
  }, [updateState]);

  return [state, updateState, { clearError, setError }];
};