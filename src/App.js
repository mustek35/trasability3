import React, { useMemo, useState } from 'react';
import { Clock, AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useStore } from './hooks/useStore';
import { useConnection } from './hooks/useConnection';
import { 
  useDevices, 
  useDetections, 
  useStats, 
  useRefreshData,
  useInvalidateQueries 
} from './hooks/useRadarQuery';
import radarService from './services/radarService';
import SidebarDevices from './components/SidebarDevices';
import DateHourTable from './components/DateHourTable';
import OpenStreetMapCanvas from './components/OpenStreetMapCanvas';
import TrajectoryInfo from './components/TrajectoryInfo';
import Timeline from './components/Timeline';
import Legend from './components/Legend';
import './styles/globals.css';

const App = () => {
  const [state, updateState] = useStore();
  const [showNoDataOverlay, setShowNoDataOverlay] = useState(true);
  const connection = useConnection();
  const invalidateQueries = useInvalidateQueries();
  const refreshMutation = useRefreshData();

  // Calcular parámetros para las queries
  const queryParams = useMemo(() => {
    if (!state.selectedDevice || !state.selectedDate) {
      return { from: null, to: null };
    }

    if (state.customRange?.active) {
      const [fromHour, fromMinute] = state.customRange.from.split(':').map(Number);
      const [toHour, toMinute] = state.customRange.to.split(':').map(Number);
      
      return {
        from: radarService.localToUTC(state.selectedDate, fromHour, fromMinute),
        to: radarService.localToUTC(state.selectedDate, toHour, toMinute)
      };
    } else {
      return {
        from: radarService.localToUTC(state.selectedDate, state.selectedHour, 0),
        to: radarService.localToUTC(state.selectedDate, state.selectedHour + 1, 0)
      };
    }
  }, [state.selectedDevice, state.selectedDate, state.selectedHour, state.customRange]);

  // Queries
  const devicesQuery = useDevices();
  const detectionsQuery = useDetections(
    state.selectedDevice, 
    queryParams.from, 
    queryParams.to,
    !!queryParams.from && !!queryParams.to
  );
  const statsQuery = useStats(state.selectedDevice, state.selectedDate);

  // Handlers
  const handleDeviceChange = (deviceId) => {
    updateState({ 
      selectedDevice: deviceId,
      timelineCursor: 0,
      isPlaying: false,
      hoveredTrajectory: null
    });
    setShowNoDataOverlay(true); // Mostrar overlay al cambiar dispositivo
  };
  
  const handleDateChange = (date) => {
    updateState({ 
      selectedDate: date,
      timelineCursor: 0,
      isPlaying: false,
      hoveredTrajectory: null
    });
    setShowNoDataOverlay(true); // Mostrar overlay al cambiar fecha
  };
  
  const handleHourChange = (hour) => {
    updateState({ 
      selectedHour: hour,
      timelineCursor: 0,
      isPlaying: false,
      hoveredTrajectory: null
    });
    setShowNoDataOverlay(true); // Mostrar overlay al cambiar hora
  };
  
  const handleTimelineCursorChange = (cursor) => {
    updateState({ timelineCursor: cursor });
  };
  
  const handlePlayToggle = () => {
    updateState({ isPlaying: !state.isPlaying });
  };
  
  const handleSpeedChange = (speed) => {
    updateState({ playSpeed: speed });
  };
  
  const handleTimelineReset = () => {
    updateState({ 
      timelineCursor: 0, 
      isPlaying: false 
    });
  };
  
  const handleCustomRangeChange = (range) => {
    updateState({ 
      customRange: range,
      timelineCursor: 0,
      isPlaying: false,
      hoveredTrajectory: null
    });
    setShowNoDataOverlay(true); // Mostrar overlay al cambiar rango
  };
  
  const handleTrajectoryHover = (uid) => {
    updateState({ hoveredTrajectory: uid });
  };

  const handleRefresh = async () => {
    try {
      await refreshMutation.mutateAsync({
        type: 'detections',
        params: {
          deviceId: state.selectedDevice,
          from: queryParams.from,
          to: queryParams.to
        }
      });
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  // Estado de la aplicación
  const getAppStatus = () => {
    if (!connection.isOnline) return 'offline';
    if (devicesQuery.isLoading) return 'loading';
    if (devicesQuery.isError || detectionsQuery.isError) return 'error';
    if (detectionsQuery.isLoading) return 'loading-data';
    return 'connected';
  };

  const getStatusInfo = () => {
    const status = getAppStatus();
    switch (status) {
      case 'offline':
        return { icon: WifiOff, text: 'Sin conexión', color: 'text-red-400' };
      case 'loading':
        return { icon: RefreshCw, text: 'Conectando...', color: 'text-yellow-400' };
      case 'loading-data':
        return { icon: RefreshCw, text: 'Cargando datos...', color: 'text-blue-400' };
      case 'error':
        return { icon: AlertTriangle, text: 'Error de conexión', color: 'text-red-400' };
      default:
        return { icon: Wifi, text: 'Conectado', color: 'text-green-400' };
    }
  };

  // Determinar si tenemos datos válidos para mostrar
  const hasValidData = detectionsQuery.data && detectionsQuery.data.length > 0;
  const isLoadingData = detectionsQuery.isLoading;
  const hasError = detectionsQuery.isError;

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Sidebar */}
      <SidebarDevices
        devices={devicesQuery.data || []}
        selectedDevice={state.selectedDevice}
        onDeviceChange={handleDeviceChange}
        connectionStatus={getAppStatus()}
        isLoading={devicesQuery.isLoading}
        error={devicesQuery.error}
      />
      
      {/* Panel principal */}
      <div className="flex-1 flex flex-col">
        {/* Error Banner */}
        {(detectionsQuery.isError || devicesQuery.isError) && (
          <div className="bg-red-900 text-red-100 px-4 py-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="flex-1">
              {detectionsQuery.error?.message || devicesQuery.error?.message || 'Error de conexión'}
            </span>
            <button
              onClick={() => invalidateQueries.invalidateAll()}
              className="text-red-200 hover:text-white px-2 py-1 rounded"
            >
              Reintentar
            </button>
            <button
              onClick={() => {
                detectionsQuery.error && detectionsQuery.refetch();
                devicesQuery.error && devicesQuery.refetch();
              }}
              className="text-red-200 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header con selector de fecha y horas */}
        <DateHourTable
          selectedDate={state.selectedDate}
          selectedHour={state.selectedHour}
          onDateChange={handleDateChange}
          onHourChange={handleHourChange}
          detections={detectionsQuery.data || []}
          stats={statsQuery.data}
          customRange={state.customRange}
          onCustomRangeChange={handleCustomRangeChange}
          isLoading={statsQuery.isLoading}
        />
        
        {/* Área del mapa - SIEMPRE VISIBLE */}
        <div className="flex-1 relative overflow-hidden">
          {/* Mapa base - siempre renderizado */}
          <div className="absolute inset-0">
            <OpenStreetMapCanvas
              detections={hasValidData ? detectionsQuery.data : []}
              timelineCursor={state.timelineCursor}
              selectedHour={state.selectedHour}
              hoveredTrajectory={state.hoveredTrajectory}
              onTrajectoryHover={handleTrajectoryHover}
            />
          </div>

          {/* Overlay de carga */}
          {isLoadingData && (
            <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-20">
              <div className="text-center">
                <RefreshCw className="animate-spin w-12 h-12 text-blue-500 mx-auto mb-4" />
                <div className="text-gray-300">Cargando detecciones...</div>
                <div className="text-xs text-gray-500 mt-2">
                  {state.selectedDevice} - {state.selectedDate}
                </div>
                {connection.retryAttempts > 0 && (
                  <div className="text-xs text-yellow-400 mt-1">
                    Reintento {connection.retryAttempts}/3...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Overlay de sin datos - DISMISSIBLE */}
          {!isLoadingData && !hasError && !hasValidData && state.selectedDevice && showNoDataOverlay && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-30">
              <div className="bg-gray-800 rounded-lg p-4 text-center text-gray-300 border border-gray-600 shadow-lg max-w-sm relative">
                {/* Botón X para cerrar */}
                <button
                  onClick={() => setShowNoDataOverlay(false)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-white text-xl leading-none w-6 h-6 flex items-center justify-center"
                >
                  ×
                </button>
                
                <Clock className="w-8 h-8 mx-auto mb-3 text-gray-500" />
                <div className="text-sm font-medium mb-2">No hay detecciones disponibles</div>
                <div className="text-xs text-gray-400 mb-1">
                  {state.selectedDevice} - {state.selectedDate}
                </div>
                {state.customRange.active ? (
                  <div className="text-xs text-gray-500 mb-3">
                    Rango: {state.customRange.from} - {state.customRange.to}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 mb-3">
                    Hora: {state.selectedHour}:00-{state.selectedHour + 1}:00
                  </div>
                )}
                <button
                  onClick={handleRefresh}
                  disabled={refreshMutation.isLoading}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs transition-colors"
                >
                  {refreshMutation.isLoading ? (
                    <>
                      <RefreshCw className="w-3 h-3 inline mr-1 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    'Actualizar datos'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Panel de información de trayectorias - solo si hay datos */}
          {hasValidData && (
            <TrajectoryInfo
              detections={detectionsQuery.data}
              timelineCursor={state.timelineCursor}
              selectedHour={state.selectedHour}
              hoveredTrajectory={state.hoveredTrajectory}
              onTrajectoryHover={handleTrajectoryHover}
            />
          )}

          {/* Leyenda - siempre visible */}
          <Legend />
        </div>
        
        {/* Timeline - solo si hay datos */}
        {hasValidData && (
          <Timeline
            timelineCursor={state.timelineCursor}
            isPlaying={state.isPlaying}
            playSpeed={state.playSpeed}
            onCursorChange={handleTimelineCursorChange}
            onPlayToggle={handlePlayToggle}
            onSpeedChange={handleSpeedChange}
            onReset={handleTimelineReset}
          />
        )}

        {/* Status Bar */}
        <div className="bg-gray-800 text-gray-300 px-4 py-1 text-xs flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <StatusIcon className={`w-3 h-3 ${statusInfo.color} ${statusInfo.icon === RefreshCw ? 'animate-spin' : ''}`} />
              <span>{statusInfo.text}</span>
            </span>
            <span>Detecciones: {detectionsQuery.data?.length || 0}</span>
            <span>Dispositivos: {devicesQuery.data?.length || 0}</span>
          </div>
          <div className="flex items-center gap-4">
            {detectionsQuery.isFetching && (
              <span className="flex items-center gap-1 text-blue-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Actualizando...
              </span>
            )}
            {detectionsQuery.dataUpdatedAt && (
              <span>
                Última actualización: {new Date(detectionsQuery.dataUpdatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;