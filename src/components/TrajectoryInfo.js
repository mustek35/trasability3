import React from 'react';
import { MapPin } from 'lucide-react';
import { CONFIG } from '../utils/config';

const TrajectoryInfo = ({ detections, timelineCursor, selectedHour, hoveredTrajectory, onTrajectoryHover }) => {
  const getVisiblePoints = (points, cursor) => {
    if (cursor === 60) return points;
    
    const hourStart = new Date();
    hourStart.setHours(selectedHour, 0, 0, 0);
    const cursorTime = new Date(hourStart.getTime() + cursor * 60000);
    
    return points.filter(point => new Date(point.ts) <= cursorTime);
  };

  const formatDuration = (points) => {
    if (points.length < 2) return '0s';
    
    const startTime = new Date(points[0].ts);
    const endTime = new Date(points[points.length - 1].ts);
    const durationSeconds = (endTime - startTime) / 1000;
    
    if (durationSeconds < 60) {
      return `${Math.round(durationSeconds)}s`;
    } else {
      return `${Math.round(durationSeconds / 60)}m ${Math.round(durationSeconds % 60)}s`;
    }
  };

  const formatTimeRange = (points) => {
    if (points.length === 0) return '';
    
    const startTime = new Date(points[0].ts);
    const endTime = new Date(points[points.length - 1].ts);
    
    const formatTime = (date) => date.toLocaleTimeString('es-CL', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      timeZone: 'America/Santiago'
    });
    
    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
  };

  const getTrajectoryColor = (points) => {
    if (points.length < 2) return CONFIG.COLORS.SHORT;
    
    const startTime = new Date(points[0].ts);
    const endTime = new Date(points[points.length - 1].ts);
    const durationSeconds = (endTime - startTime) / 1000;
    
    if (durationSeconds <= CONFIG.SHORT_MAX_SECONDS) {
      return CONFIG.COLORS.SHORT;
    } else if (durationSeconds >= CONFIG.LONG_MIN_SECONDS) {
      return CONFIG.COLORS.LONG;
    } else {
      return CONFIG.COLORS.MEDIUM;
    }
  };

  return (
    <div className="absolute top-4 right-4 w-80 bg-gray-800 rounded-lg shadow-lg p-4 max-h-96 overflow-y-auto z-10 border border-gray-600 text-white">
      <h4 className="text-sm font-semibold text-white mb-3">Trayectorias Activas</h4>
      
      <div className="space-y-2">
        {detections.map(detection => {
          const visiblePoints = getVisiblePoints(detection.points, timelineCursor);
          if (visiblePoints.length < 1) return null;
          
          const color = getTrajectoryColor(detection.points);
          const isHovered = hoveredTrajectory === detection.uid;
          
          return (
            <div
              key={detection.uid}
              className={`p-3 border rounded-lg cursor-pointer transition-all ${
                isHovered ? 'bg-blue-800 border-blue-500' : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
              }`}
              onMouseEnter={() => onTrajectoryHover(detection.uid)}
              onMouseLeave={() => onTrajectoryHover(null)}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-4 h-2 rounded"
                  style={{ backgroundColor: color }}
                ></div>
                <div className="font-medium text-sm text-white">
                  {detection.uid.substring(0, 8)}
                </div>
              </div>
              
              <div className="text-xs text-gray-300 space-y-1">
                <div>Tiempo: {formatTimeRange(visiblePoints)}</div>
                <div>Duración: {formatDuration(detection.points)}</div>
                <div>Puntos visibles: {visiblePoints.length} / {detection.points.length}</div>
                <div>Velocidad: {detection.speed?.toFixed(1)} m/s</div>
                <div>Confianza: {(detection.confidence * 100)?.toFixed(1)}%</div>
              </div>
            </div>
          );
        })}
      </div>
      
      {detections.length === 0 && (
        <div className="text-center text-gray-400 py-8">
          <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-500" />
          <div className="text-sm">No hay trayectorias</div>
        </div>
      )}
    </div>
  );
};

export default TrajectoryInfo;