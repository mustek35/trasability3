import React, { useState } from 'react';
import { Search, Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';

const SidebarDevices = ({ devices, selectedDevice, onDeviceChange, connectionStatus }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredDevices = devices.filter(device =>
    device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <Wifi className="w-4 h-4 text-green-400" />;
      case 'connecting':
        return <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <WifiOff className="w-4 h-4 text-gray-400" />;
    }
  };

  const getConnectionText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Conectado al servidor';
      case 'connecting':
        return 'Conectando...';
      case 'error':
        return 'Error de conexión';
      default:
        return 'Sin conexión';
    }
  };

  const formatLastEvent = (lastEvent) => {
    if (!lastEvent) return 'Sin eventos';
    
    try {
      const date = new Date(lastEvent);
      return date.toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-700 flex flex-col text-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Historial de Eventos</h2>
          <div className="flex items-center gap-1">
            {getConnectionIcon()}
          </div>
        </div>
        
        {/* Status de conexión */}
        <div className="text-xs text-gray-400 mb-3 flex items-center gap-2">
          {getConnectionIcon()}
          <span>{getConnectionText()}</span>
        </div>
        
        {/* Buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar eventos..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      {/* Lista de dispositivos */}
      <div className="flex-1 overflow-y-auto">
        {filteredDevices.length === 0 ? (
          <div className="p-4 text-center text-gray-400">
            {devices.length === 0 ? (
              connectionStatus === 'connecting' ? (
                <div>
                  <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                  <div className="text-sm">Cargando dispositivos...</div>
                </div>
              ) : (
                <div>
                  <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                  <div className="text-sm">No se pudieron cargar los dispositivos</div>
                  <div className="text-xs mt-1">Verifica la conexión</div>
                </div>
              )
            ) : (
              <div>
                <Search className="w-6 h-6 mx-auto mb-2" />
                <div className="text-sm">No se encontraron dispositivos</div>
                <div className="text-xs mt-1">Intenta otro término de búsqueda</div>
              </div>
            )}
          </div>
        ) : (
          filteredDevices.map(device => (
            <button
              key={device.id}
              onClick={() => onDeviceChange(device.id)}
              className={`w-full text-left p-4 border-b border-gray-700 hover:bg-gray-800 transition-colors ${
                selectedDevice === device.id ? 'bg-blue-800 border-l-4 border-l-blue-400' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium text-white">{device.name}</div>
                <div className={`w-2 h-2 rounded-full ${
                  device.isActive ? 'bg-green-400' : 'bg-gray-500'
                }`} />
              </div>
              
              <div className="text-sm text-gray-300 mb-1">
                {device.count.toLocaleString()} detecciones
              </div>
              
              <div className="text-xs text-gray-400">
                Último: {formatLastEvent(device.lastEvent)}
              </div>
              
              {device.id === selectedDevice && (
                <div className="text-xs text-blue-300 mt-1">
                  ● Seleccionado
                </div>
              )}
            </button>
          ))
        )}
      </div>
      
      {/* Footer con información adicional */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-400">
        <div className="flex items-center justify-between">
          <span>Total: {devices.length} dispositivos</span>
          <span>{filteredDevices.filter(d => d.isActive).length} activos</span>
        </div>
      </div>
    </div>
  );
};

export default SidebarDevices;