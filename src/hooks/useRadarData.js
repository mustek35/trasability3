import { useEffect, useCallback } from 'react';
import { useStore } from './useStore';
import radarService from '../services/radarService';

export const useRadarData = () => {
  const [state, updateState, { clearError, setError }] = useStore();

  // Cargar dispositivos
  const loadDevices = useCallback(async () => {
    try {
      updateState({ connectionStatus: 'connecting' });
      const devices = await radarService.getDevices();
      updateState({ 
        devices,
        connectionStatus: 'connected'
      });
    } catch (error) {
      console.error('Error loading devices:', error);
      setError(error);
    }
  }, [updateState, setError]);

  // Cargar detecciones
  const loadDetections = useCallback(async (deviceId, date, hour, customRange = null) => {
    try {
      updateState({ loading: true });
      clearError();

      let fromTime, toTime;

      if (customRange && customRange.active) {
        // Usar rango personalizado
        const [fromHour, fromMinute] = customRange.from.split(':').map(Number);
        const [toHour, toMinute] = customRange.to.split(':').map(Number);
        
        fromTime = radarService.localToUTC(date, fromHour, fromMinute);
        toTime = radarService.localToUTC(date, toHour, toMinute);
      } else {
        // Usar hora seleccionada (rango de 1 hora)
        fromTime = radarService.localToUTC(date, hour, 0);
        toTime = radarService.localToUTC(date, hour + 1, 0);
      }

      // Crear clave de cache
      const cacheKey = `${deviceId}-${fromTime}-${toTime}`;
      
      // Verificar cache
      if (state.cache.has(cacheKey)) {
        const cachedData = state.cache.get(cacheKey);
        const cacheAge = Date.now() - cachedData.timestamp;
        
        // Cache válido por 5 minutos
        if (cacheAge < 5 * 60 * 1000) {
          updateState({
            detections: cachedData.detections,
            loading: false,
            connectionStatus: 'connected'
          });
          return cachedData.detections;
        }
      }

      const detections = await radarService.getDetections({
        deviceId,
        from: fromTime,
        to: toTime
      });

      // Guardar en cache
      const newCache = new Map(state.cache);
      newCache.set(cacheKey, {
        detections,
        timestamp: Date.now()
      });

      updateState({
        detections,
        loading: false,
        cache: newCache,
        connectionStatus: 'connected',
        timelineCursor: 0,
        isPlaying: false,
        hoveredTrajectory: null
      });

      return detections;
    } catch (error) {
      console.error('Error loading detections:', error);
      setError(error);
      return [];
    }
  }, [state.cache, updateState, clearError, setError]);

  // Cargar estadísticas
  const loadStats = useCallback(async (deviceId, date) => {
    try {
      const stats = await radarService.getStats(deviceId, date);
      updateState({ stats });
      return stats;
    } catch (error) {
      console.error('Error loading stats:', error);
      // No mostrar error para stats, son opcionales
      return null;
    }
  }, [updateState]);

  // Cargar dispositivos al montar el componente
  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  return {
    state,
    updateState,
    loadDevices,
    loadDetections,
    loadStats,
    clearError
  };
};