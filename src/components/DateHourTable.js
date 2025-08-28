import React, { useState } from 'react';
import { Calendar, TrendingUp, Activity } from 'lucide-react';

const DateHourTable = ({ 
  selectedDate, 
  selectedHour, 
  onDateChange, 
  onHourChange, 
  detections, 
  stats,
  customRange, 
  onCustomRangeChange 
}) => {
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [fromHour, setFromHour] = useState(0);
  const [fromMinute, setFromMinute] = useState(0);
  const [toHour, setToHour] = useState(1);
  const [toMinute, setToMinute] = useState(0);
  
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  const getHourStats = (hour) => {
    // Usar estadísticas del backend si están disponibles
    if (stats?.hourly?.[hour]) {
      return {
        count: stats.hourly[hour].count,
        trajectories: stats.hourly[hour].trajectories,
        avgDuration: stats.hourly[hour].avgDuration
      };
    }
    
    // Fallback: calcular de las detecciones locales
    const hourDetections = detections.filter(d => {
      if (!d.points || d.points.length === 0) return false;
      const ts = new Date(d.points[0].ts);
      return ts.getHours() === hour;
    });
    
    return {
      count: hourDetections.length,
      trajectories: new Set(hourDetections.map(d => d.uid)).size,
      avgDuration: hourDetections.length > 0 
        ? hourDetections.reduce((acc, d) => {
            if (d.points.length < 2) return acc;
            const start = new Date(d.points[0].ts);
            const end = new Date(d.points[d.points.length - 1].ts);
            return acc + (end - start) / 1000;
          }, 0) / hourDetections.length
        : 0
    };
  };
  
  const handleCustomRangeApply = () => {
    const from = `${fromHour.toString().padStart(2, '0')}:${fromMinute.toString().padStart(2, '0')}`;
    const to = `${toHour.toString().padStart(2, '0')}:${toMinute.toString().padStart(2, '0')}`;
    onCustomRangeChange({ from, to, active: true });
  };
  
  const handleHourModeToggle = () => {
    setUseCustomRange(!useCustomRange);
    if (useCustomRange) {
      // Volver a modo por horas
      onCustomRangeChange({ from: null, to: null, active: false });
    }
  };

  const formatDuration = (seconds) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getHeatmapColor = (count, maxCount) => {
    if (count === 0) return 'bg-gray-700';
    const intensity = Math.min(count / Math.max(maxCount, 1), 1);
    
    if (intensity < 0.2) return 'bg-green-800';
    if (intensity < 0.4) return 'bg-green-700';
    if (intensity < 0.6) return 'bg-yellow-600';
    if (intensity < 0.8) return 'bg-orange-600';
    return 'bg-red-600';
  };

  // Calcular estadísticas generales
  const totalStats = stats ? {
    totalDetections: stats.total || 0,
    maxHourly: Math.max(...Object.values(stats.hourly || {}).map(h => h.count || 0)),
    activeHours: Object.values(stats.hourly || {}).filter(h => h.count > 0).length
  } : {
    totalDetections: detections.length,
    maxHourly: Math.max(...hours.map(h => getHourStats(h).count)),
    activeHours: hours.filter(h => getHourStats(h).count > 0).length
  };
  
  return (
    <div className="bg-gray-900 border-b border-gray-700 text-white">
      {/* Header principal */}
      <div className="p-4 flex items-center gap-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
          />
        </div>
        
        {/* Estadísticas rápidas */}
        <div className="flex items-center gap-4 text-sm text-gray-300">
          <div className="flex items-center gap-1">
            <Activity className="w-4 h-4" />
            <span>{totalStats.totalDetections} detecciones</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            <span>{totalStats.activeHours}/24 horas activas</span>
          </div>
        </div>

        {/* Toggle entre modo hora y rango personalizado */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleHourModeToggle}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              !useCustomRange 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Por Hora
          </button>
          <button
            onClick={handleHourModeToggle}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              useCustomRange 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Rango Personalizado
          </button>
        </div>
        
        <div className="text-sm text-gray-400">
          Zona horaria: América/Santiago
        </div>
      </div>
      
      {useCustomRange ? (
        /* Selector de rango personalizado */
        <div className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Seleccionar Rango de Tiempo</h3>
          
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-300">Desde:</label>
              <select
                value={fromHour}
                onChange={(e) => setFromHour(parseInt(e.target.value))}
                className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                ))}
              </select>
              <span className="text-gray-400">:</span>
              <select
                value={fromMinute}
                onChange={(e) => setFromMinute(parseInt(e.target.value))}
                className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-300">Hasta:</label>
              <select
                value={toHour}
                onChange={(e) => setToHour(parseInt(e.target.value))}
                className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                ))}
              </select>
              <span className="text-gray-400">:</span>
              <select
                value={toMinute}
                onChange={(e) => setToMinute(parseInt(e.target.value))}
                className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                ))}
              </select>
            </div>
            
            <button
              onClick={handleCustomRangeApply}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
            >
              Aplicar
            </button>
          </div>
          
          {customRange?.active && (
            <div className="p-3 bg-green-800 bg-opacity-20 border border-green-600 rounded-lg">
              <div className="text-sm text-green-400">
                ✓ Rango activo: {customRange.from} - {customRange.to}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Vista por horas con heatmap */
        <div className="p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Detecciones por hora (Heatmap)</h3>
          
          <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto">
            {hours.map(hour => {
              const hourStats = getHourStats(hour);
              const isSelected = selectedHour === hour;
              const hasData = hourStats.count > 0;
              
              return (
                <button
                  key={hour}
                  onClick={() => onHourChange(hour)}
                  className={`p-2 text-xs border rounded transition-all relative group ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-500 transform scale-105'
                      : hasData
                      ? `${getHeatmapColor(hourStats.count, totalStats.maxHourly)} text-white border-gray-600 hover:transform hover:scale-105`
                      : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600'
                  }`}
                >
                  <div className="font-medium">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  <div className="opacity-75">
                    {hourStats.count} det
                  </div>
                  
                  {/* Tooltip con información detallada */}
                  {hasData && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black bg-opacity-90 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      <div>{hourStats.count} detecciones</div>
                      <div>{hourStats.trajectories} trayectorias</div>
                      {hourStats.avgDuration > 0 && (
                        <div>Duración media: {formatDuration(hourStats.avgDuration)}</div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          
          {/* Leyenda del heatmap */}
          <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
            <div>Menos actividad</div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-700 rounded-sm"></div>
              <div className="w-3 h-3 bg-green-800 rounded-sm"></div>
              <div className="w-3 h-3 bg-yellow-600 rounded-sm"></div>
              <div className="w-3 h-3 bg-orange-600 rounded-sm"></div>
              <div className="w-3 h-3 bg-red-600 rounded-sm"></div>
            </div>
            <div>Más actividad</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateHourTable;