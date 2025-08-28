const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de PostgreSQL con pool de conexiones optimizado
const pool = new Pool({
  host: '179.57.170.61',
  port: 24301,
  database: 'radar',
  user: 'orca',
  password: 'estadoscam.',
  ssl: false,
  // Optimizaciones para mejor rendimiento
  max: 20,                // máximo 20 conexiones en el pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Helper para manejar errores de DB
const handleDBError = (error, res, operation) => {
  console.error(`Error en ${operation}:`, error);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    operation: operation,
    timestamp: new Date().toISOString()
  });
};

// Endpoint para obtener dispositivos con estadísticas
app.get('/api/devices', async (req, res) => {
  try {
    const query = `
      SELECT 
        device_id,
        COUNT(*) as detection_count,
        MAX(ts_utc) as last_detection,
        CASE 
          WHEN MAX(ts_utc) > NOW() - INTERVAL '1 hour' THEN true 
          ELSE false 
        END as is_active,
        MIN(ts_utc) as first_detection,
        COUNT(DISTINCT uid) as unique_targets
      FROM radar 
      GROUP BY device_id
      ORDER BY device_id
    `;
    
    const result = await pool.query(query);
    
    const devices = result.rows.map(row => ({
      id: row.device_id,
      name: `Radar ${row.device_id}`,
      count: parseInt(row.detection_count),
      lastEvent: row.last_detection,
      firstEvent: row.first_detection,
      isActive: row.is_active,
      uniqueTargets: parseInt(row.unique_targets)
    }));
    
    res.json(devices);
  } catch (error) {
    handleDBError(error, res, 'obtener dispositivos');
  }
});

// Endpoint optimizado para obtener detecciones
app.get('/api/detections', async (req, res) => {
  try {
    const { device_id, from, to } = req.query;
    
    if (!device_id || !from || !to) {
      return res.status(400).json({ 
        error: 'Parámetros requeridos: device_id, from, to' 
      });
    }
    
    // Query optimizada que agrupa por UID y construye trayectorias
    const query = `
      SELECT 
        uid,
        device_id,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'lat', lat,
            'lng', lon,
            'alt', altitude,
            'ts', ts_utc,
            'speed', speed,
            'bearing', bearing,
            'accuracy', accuracy
          ) ORDER BY ts_utc
        ) as points,
        AVG(speed) as avg_speed,
        MAX(speed) as max_speed,
        AVG(confidence) as avg_confidence,
        COUNT(*) as point_count,
        MIN(ts_utc) as start_time,
        MAX(ts_utc) as end_time,
        EXTRACT(EPOCH FROM (MAX(ts_utc) - MIN(ts_utc))) as duration_seconds
      FROM radar 
      WHERE device_id = $1 
        AND ts_utc >= $2 
        AND ts_utc <= $3
        AND uid IS NOT NULL
        AND lat IS NOT NULL 
        AND lon IS NOT NULL
      GROUP BY uid, device_id
      HAVING COUNT(*) >= 2  -- Solo trayectorias con al menos 2 puntos
      ORDER BY MIN(ts_utc) DESC
      LIMIT 100  -- Limitar a las 100 trayectorias más recientes
    `;
    
    const result = await pool.query(query, [device_id, from, to]);
    
    // Transformar datos para el frontend
    const trajectories = result.rows.map(row => ({
      uid: row.uid,
      points: row.points,
      speed: parseFloat(row.avg_speed) || 0,
      maxSpeed: parseFloat(row.max_speed) || 0,
      bearing: 0, // Se calcula en el frontend si es necesario
      distance: 0, // Se puede calcular en el frontend
      confidence: parseFloat(row.avg_confidence) || 0,
      pointCount: parseInt(row.point_count),
      startTime: row.start_time,
      endTime: row.end_time,
      durationSeconds: parseFloat(row.duration_seconds) || 0
    }));
    
    res.json(trajectories);
  } catch (error) {
    handleDBError(error, res, 'obtener detecciones');
  }
});

// Endpoint optimizado para obtener estadísticas por hora
app.get('/api/stats', async (req, res) => {
  try {
    const { device_id, date } = req.query;
    
    if (!device_id || !date) {
      return res.status(400).json({ 
        error: 'Parámetros requeridos: device_id, date' 
      });
    }
    
    // Query para estadísticas por hora en zona horaria de Chile
    const hourlyQuery = `
      SELECT 
        EXTRACT(HOUR FROM ts_utc AT TIME ZONE 'America/Santiago') as hour,
        COUNT(*) as detection_count,
        COUNT(DISTINCT uid) as trajectory_count,
        AVG(speed) as avg_speed,
        MAX(speed) as max_speed,
        AVG(confidence) as avg_confidence
      FROM radar 
      WHERE device_id = $1 
        AND DATE(ts_utc AT TIME ZONE 'America/Santiago') = $2
      GROUP BY EXTRACT(HOUR FROM ts_utc AT TIME ZONE 'America/Santiago')
      ORDER BY hour
    `;
    
    // Query para totales del día
    const totalQuery = `
      SELECT 
        COUNT(*) as total_detections,
        COUNT(DISTINCT uid) as total_trajectories,
        AVG(speed) as avg_speed_day,
        MAX(speed) as max_speed_day
      FROM radar 
      WHERE device_id = $1 
        AND DATE(ts_utc AT TIME ZONE 'America/Santiago') = $2
    `;
    
    const [hourlyResult, totalResult] = await Promise.all([
      pool.query(hourlyQuery, [device_id, date]),
      pool.query(totalQuery, [device_id, date])
    ]);
    
    // Crear array de 24 horas con datos o ceros
    const hourlyStats = {};
    for (let hour = 0; hour < 24; hour++) {
      hourlyStats[hour] = {
        count: 0,
        trajectories: 0,
        avgSpeed: 0,
        maxSpeed: 0,
        avgConfidence: 0
      };
    }
    
    // Llenar con datos reales
    hourlyResult.rows.forEach(row => {
      const hour = parseInt(row.hour);
      if (hour >= 0 && hour < 24) {
        hourlyStats[hour] = {
          count: parseInt(row.detection_count),
          trajectories: parseInt(row.trajectory_count),
          avgSpeed: parseFloat(row.avg_speed) || 0,
          maxSpeed: parseFloat(row.max_speed) || 0,
          avgConfidence: parseFloat(row.avg_confidence) || 0
        };
      }
    });
    
    const totalData = totalResult.rows[0];
    
    res.json({
      date: date,
      deviceId: device_id,
      total: parseInt(totalData.total_detections) || 0,
      totalTrajectories: parseInt(totalData.total_trajectories) || 0,
      avgSpeedDay: parseFloat(totalData.avg_speed_day) || 0,
      maxSpeedDay: parseFloat(totalData.max_speed_day) || 0,
      hourly: hourlyStats
    });
  } catch (error) {
    handleDBError(error, res, 'obtener estadísticas');
  }
});

// Endpoint para obtener detecciones recientes (últimas X horas)
app.get('/api/recent-detections', async (req, res) => {
  try {
    const { device_id, hours = 1, limit = 50 } = req.query;
    
    if (!device_id) {
      return res.status(400).json({ 
        error: 'Parámetro requerido: device_id' 
      });
    }
    
    const query = `
      SELECT 
        device_id, lat, lon, speed, bearing, altitude, accuracy,
        ts_utc, uid, distance, confidence, tail
      FROM radar 
      WHERE device_id = $1 
        AND ts_utc >= NOW() - INTERVAL '${parseInt(hours)} hours'
      ORDER BY ts_utc DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [device_id, parseInt(limit)]);
    res.json(result.rows);
    
  } catch (error) {
    handleDBError(error, res, 'obtener detecciones recientes');
  }
});

// Health check mejorado
app.get('/health', async (req, res) => {
  try {
    // Verificar conexión a la base de datos
    const result = await pool.query('SELECT NOW() as server_time, version() as db_version');
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        serverTime: result.rows[0].server_time,
        version: result.rows[0].db_version
      },
      pool: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: error.message
      }
    });
  }
});

// Endpoint para limpiar conexiones del pool
app.post('/api/admin/reset-pool', (req, res) => {
  pool.end().then(() => {
    res.json({ 
      status: 'Pool de conexiones reiniciado',
      timestamp: new Date().toISOString()
    });
  }).catch(error => {
    res.status(500).json({ 
      error: 'Error reiniciando pool',
      details: error.message 
    });
  });
});

// Manejo de errores globales
app.use((error, req, res, next) => {
  console.error('Error no manejado:', error);
  res.status(500).json({
    error: 'Error interno del servidor',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Cerrando servidor...');
  pool.end(() => {
    console.log('Pool de conexiones cerrado');
    process.exit(0);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor API REST corriendo en puerto ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});