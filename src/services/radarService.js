import { apiClient } from './api';

class RadarService {
  /**
   * Obtener lista de dispositivos/centros
   * @returns {Promise<Array>} Lista de dispositivos
   */
  async getDevices() {
    try {
      const response = await apiClient.get('/api/devices');
      
      // Transformar respuesta si es necesario
      return response.map(device => ({
        id: device.device_id || device.id,
        name: device.name || device.device_id,
        count: device.detection_count || 0,
        lastEvent: device.last_detection || null,
        isActive: device.is_active || false
      }));
    } catch (error) {
      console.error('Error fetching devices:', error);
      // Fallback a datos mock en caso de error
      return this.getMockDevices();
    }
  }

  /**
   * Obtener detecciones por rango de tiempo
   * @param {Object} params - Parámetros de búsqueda
   * @param {string} params.deviceId - ID del dispositivo
   * @param {string} params.from - Fecha/hora inicio (ISO string)
   * @param {string} params.to - Fecha/hora fin (ISO string)
   * @returns {Promise<Array>} Lista de detecciones agrupadas por UID
   */
  async getDetections({ deviceId, from, to }) {
    try {
      const params = {
        device_id: deviceId,
        from: from,
        to: to
      };

      const response = await apiClient.get('/api/detections', params);
      
      // Procesar y agrupar detecciones por UID
      return this.processDetections(response);
    } catch (error) {
      console.error('Error fetching detections:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas por fecha y dispositivo
   * @param {string} deviceId - ID del dispositivo
   * @param {string} date - Fecha (YYYY-MM-DD)
   * @returns {Promise<Object>} Estadísticas por hora
   */
  async getStats(deviceId, date) {
    try {
      const params = {
        device_id: deviceId,
        date: date
      };

      const response = await apiClient.get('/api/stats', params);
      
      return this.processStats(response);
    } catch (error) {
      console.error('Error fetching stats:', error);
      return this.getMockStats();
    }
  }

  /**
   * Procesar detecciones del backend y agrupar por UID
   * @param {Array} rawDetections - Detecciones brutas del backend
   * @returns {Array} Detecciones procesadas y agrupadas
   */
  processDetections(rawDetections) {
    const groupedByUid = {};
    
    // Agrupar por UID
    rawDetections.forEach(detection => {
      const uid = detection.uid;
      if (!uid) return;

      if (!groupedByUid[uid]) {
        groupedByUid[uid] = {
          uid: uid,
          points: [],
          speed: detection.speed || 0,
          bearing: detection.bearing || 0,
          distance: detection.distance || 0,
          confidence: detection.confidence || 0,
          device_id: detection.device_id
        };
      }

      // Agregar punto si tiene coordenadas válidas
      if (detection.lat && detection.lon) {
        groupedByUid[uid].points.push({
          lat: parseFloat(detection.lat),
          lng: parseFloat(detection.lon),
          alt: parseFloat(detection.altitude || 0),
          ts: detection.ts_utc || detection.timestamp
        });
      }

      // Si tiene tail (trayectoria completa), agregarla
      if (detection.tail && Array.isArray(detection.tail)) {
        const tailPoints = detection.tail
          .filter(point => point.lat && point.lng)
          .map(point => ({
            lat: parseFloat(point.lat),
            lng: parseFloat(point.lng),
            alt: parseFloat(point.alt || 0),
            ts: point.ts || detection.ts_utc
          }));
        
        groupedByUid[uid].points.push(...tailPoints);
      }
    });

    // Convertir a array y ordenar puntos por timestamp
    return Object.values(groupedByUid)
      .filter(trajectory => trajectory.points.length > 0)
      .map(trajectory => ({
        ...trajectory,
        points: trajectory.points
          .sort((a, b) => new Date(a.ts) - new Date(b.ts))
          // Remover duplicados por timestamp
          .filter((point, index, arr) => 
            index === 0 || point.ts !== arr[index - 1].ts
          )
      }));
  }

  /**
   * Procesar estadísticas del backend
   * @param {Object} rawStats - Estadísticas brutas
   * @returns {Object} Estadísticas procesadas
   */
  processStats(rawStats) {
    const hourlyStats = {};
    
    // Inicializar todas las horas con 0
    for (let hour = 0; hour < 24; hour++) {
      hourlyStats[hour] = {
        count: 0,
        trajectories: 0,
        avgDuration: 0
      };
    }

    // Procesar datos reales
    if (rawStats.hourly) {
      rawStats.hourly.forEach(stat => {
        const hour = parseInt(stat.hour);
        if (hour >= 0 && hour < 24) {
          hourlyStats[hour] = {
            count: stat.detection_count || 0,
            trajectories: stat.trajectory_count || 0,
            avgDuration: stat.avg_duration || 0
          };
        }
      });
    }

    return {
      total: rawStats.total || 0,
      hourly: hourlyStats,
      date: rawStats.date
    };
  }

  /**
   * Convertir hora y fecha local a UTC para enviar al backend
   * @param {string} date - Fecha (YYYY-MM-DD)
   * @param {number} hour - Hora (0-23)
   * @param {number} minute - Minuto (0-59)
   * @returns {string} Timestamp UTC en formato ISO
   */
  localToUTC(date, hour = 0, minute = 0) {
    // Crear fecha en zona horaria de Chile
    const localDate = new Date(`${date}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`);
    
    // Convertir a UTC considerando zona horaria de Chile (UTC-3 o UTC-4)
    const utcDate = new Date(localDate.getTime() + (localDate.getTimezoneOffset() * 60000));
    
    return utcDate.toISOString();
  }

  /**
   * Datos mock para fallback
   */
  getMockDevices() {
    return [
      { id: 'Huelmo', name: 'Radar Huelmo', count: 0, lastEvent: null, isActive: false },
      { id: 'Valdivia', name: 'Radar Valdivia', count: 0, lastEvent: null, isActive: false },
      { id: 'Osorno', name: 'Radar Osorno', count: 0, lastEvent: null, isActive: false },
      { id: 'Puerto Montt', name: 'Radar Puerto Montt', count: 0, lastEvent: null, isActive: false }
    ];
  }

  getMockStats() {
    const hourlyStats = {};
    for (let hour = 0; hour < 24; hour++) {
      hourlyStats[hour] = { count: 0, trajectories: 0, avgDuration: 0 };
    }
    return { total: 0, hourly: hourlyStats, date: new Date().toISOString().split('T')[0] };
  }
}

// Instancia global del servicio
const radarService = new RadarService();

export default radarService;