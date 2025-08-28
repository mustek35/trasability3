import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import radarService from '../services/radarService';
import connectionManager from '../services/connectionManager';

// Keys para las queries
export const queryKeys = {
  devices: ['devices'],
  detections: (deviceId, from, to) => ['detections', { deviceId, from, to }],
  stats: (deviceId, date) => ['stats', { deviceId, date }]
};

// Hook para dispositivos
export const useDevices = () => {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: async () => {
      return await connectionManager.executeWithRetry(
        () => radarService.getDevices(),
        'Carga de dispositivos'
      );
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
    cacheTime: 10 * 60 * 1000, // 10 minutos
    retry: false, // Manejamos reintentos con connectionManager
    refetchOnWindowFocus: false,
    refetchInterval: 60000, // Actualizar cada minuto
  });
};

// Hook para detecciones
export const useDetections = (deviceId, from, to, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.detections(deviceId, from, to),
    queryFn: async () => {
      return await connectionManager.executeWithRetry(
        () => radarService.getDetections({ deviceId, from, to }),
        'Carga de detecciones'
      );
    },
    enabled: enabled && !!deviceId && !!from && !!to,
    staleTime: 2 * 60 * 1000, // 2 minutos
    cacheTime: 5 * 60 * 1000, // 5 minutos
    retry: false,
    refetchOnWindowFocus: true,
  });
};

// Hook para estadísticas
export const useStats = (deviceId, date, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.stats(deviceId, date),
    queryFn: async () => {
      return await connectionManager.executeWithRetry(
        () => radarService.getStats(deviceId, date),
        'Carga de estadísticas'
      );
    },
    enabled: enabled && !!deviceId && !!date,
    staleTime: 5 * 60 * 1000, // 5 minutos
    cacheTime: 10 * 60 * 1000, // 10 minutos
    retry: false,
    refetchOnWindowFocus: false,
  });
};

// Hook para invalidar cache
export const useInvalidateQueries = () => {
  const queryClient = useQueryClient();

  return {
    invalidateDevices: () => queryClient.invalidateQueries({ queryKey: queryKeys.devices }),
    invalidateDetections: (deviceId, from, to) => 
      queryClient.invalidateQueries({ queryKey: queryKeys.detections(deviceId, from, to) }),
    invalidateStats: (deviceId, date) => 
      queryClient.invalidateQueries({ queryKey: queryKeys.stats(deviceId, date) }),
    invalidateAll: () => queryClient.invalidateQueries()
  };
};

// Mutation para refresh manual
export const useRefreshData = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ type, params }) => {
      switch (type) {
        case 'devices':
          return await radarService.getDevices();
        case 'detections':
          return await radarService.getDetections(params);
        case 'stats':
          return await radarService.getStats(params.deviceId, params.date);
        default:
          throw new Error('Tipo de refresh no válido');
      }
    },
    onSuccess: (data, variables) => {
      // Actualizar cache con nuevos datos
      switch (variables.type) {
        case 'devices':
          queryClient.setQueryData(queryKeys.devices, data);
          break;
        case 'detections':
          queryClient.setQueryData(
            queryKeys.detections(variables.params.deviceId, variables.params.from, variables.params.to), 
            data
          );
          break;
        case 'stats':
          queryClient.setQueryData(
            queryKeys.stats(variables.params.deviceId, variables.params.date), 
            data
          );
          break;
      }
    }
  });
};