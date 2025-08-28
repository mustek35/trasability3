const WebSocket = require('ws');
const { Pool } = require('pg');
const http = require('http');
const express = require('express');

// Configuración de PostgreSQL
const pool = new Pool({
  host: '179.57.170.61',
  port: 24301,
  database: 'radar',
  user: 'orca',
  password: 'estadoscam.',
  ssl: false
});

class RadarWebSocketServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });
    this.clients = new Map(); // Map<WebSocket, ClientInfo>
    this.lastDetections = new Map(); // Cache de últimas detecciones
    this.setupWebSocketHandlers();
    this.startPeriodicUpdates();
  }

  setupWebSocketHandlers() {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      const clientInfo = {
        id: clientId,
        ip: req.socket.remoteAddress,
        connectedAt: new Date(),
        subscriptions: new Set(),
        lastPing: Date.now()
      };

      this.clients.set(ws, clientInfo);
      console.log(`Cliente WebSocket conectado: ${clientId} (${clientInfo.ip})`);

      // Enviar mensaje de bienvenida
      this.sendMessage(ws, {
        type: 'CONNECTION_ESTABLISHED',
        clientId: clientId,
        serverTime: new Date().toISOString(),
        availableCommands: [
          'SUBSCRIBE_DEVICE',
          'UNSUBSCRIBE_DEVICE', 
          'GET_LIVE_STATS',
          'PING'
        ]
      });

      // Manejar mensajes del cliente
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('Error parsing client message:', error);
          this.sendError(ws, 'Invalid JSON message');
        }
      });

      // Manejar desconexión
      ws.on('close', () => {
        console.log(`Cliente WebSocket desconectado: ${clientId}`);
        this.clients.delete(ws);
      });

      // Manejar errores
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(ws);
      });

      // Heartbeat
      ws.on('pong', () => {
        if (this.clients.has(ws)) {
          this.clients.get(ws).lastPing = Date.now();
        }
      });
    });

    console.log('WebSocket server configurado');
  }

  handleClientMessage(ws, data) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    console.log(`Mensaje de ${clientInfo.id}:`, data.type);

    switch (data.type) {
      case 'SUBSCRIBE_DEVICE':
        this.handleSubscribeDevice(ws, data.deviceId);
        break;
      
      case 'UNSUBSCRIBE_DEVICE':
        this.handleUnsubscribeDevice(ws, data.deviceId);
        break;
      
      case 'GET_LIVE_STATS':
        this.handleGetLiveStats(ws, data.deviceId);
        break;
      
      case 'PING':
        this.sendMessage(ws, { type: 'PONG', timestamp: Date.now() });
        break;
      
      default:
        this.sendError(ws, `Unknown command: ${data.type}`);
    }
  }

  handleSubscribeDevice(ws, deviceId) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    clientInfo.subscriptions.add(deviceId);
    
    this.sendMessage(ws, {
      type: 'SUBSCRIPTION_CONFIRMED',
      deviceId: deviceId,
      message: `Suscrito a detecciones de ${deviceId}`
    });

    // Enviar datos recientes si los hay
    if (this.lastDetections.has(deviceId)) {
      const recentDetections = this.lastDetections.get(deviceId);
      this.sendMessage(ws, {
        type: 'RECENT_DETECTIONS',
        deviceId: deviceId,
        detections: recentDetections.slice(-10) // Últimas 10
      });
    }

    console.log(`Cliente ${clientInfo.id} suscrito a ${deviceId}`);
  }

  handleUnsubscribeDevice(ws, deviceId) {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    clientInfo.subscriptions.delete(deviceId);
    
    this.sendMessage(ws, {
      type: 'SUBSCRIPTION_REMOVED',
      deviceId: deviceId,
      message: `Desuscrito de detecciones de ${deviceId}`
    });

    console.log(`Cliente ${clientInfo.id} desuscrito de ${deviceId}`);
  }

  async handleGetLiveStats(ws, deviceId) {
    try {
      const stats = await this.getLiveStats(deviceId);
      this.sendMessage(ws, {
        type: 'LIVE_STATS',
        deviceId: deviceId,
        stats: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting live stats:', error);
      this.sendError(ws, 'Error obteniendo estadísticas en vivo');
    }
  }

  async getLiveStats(deviceId) {
    const query = `
      SELECT 
        COUNT(*) as total_today,
        COUNT(DISTINCT uid) as unique_targets,
        MAX(ts_utc) as last_detection,
        AVG(speed) as avg_speed,
        COUNT(CASE WHEN ts_utc > NOW() - INTERVAL '1 hour' THEN 1 END) as last_hour_count
      FROM radar 
      WHERE device_id = $1 
        AND DATE(ts_utc AT TIME ZONE 'America/Santiago') = CURRENT_DATE
    `;
    
    const result = await pool.query(query, [deviceId]);
    return result.rows[0];
  }

  // Método principal para enviar nuevas detecciones
  broadcastNewDetection(detection) {
    if (!detection.device_id) return;

    // Actualizar cache
    if (!this.lastDetections.has(detection.device_id)) {
      this.lastDetections.set(detection.device_id, []);
    }
    
    const deviceDetections = this.lastDetections.get(detection.device_id);
    deviceDetections.push({
      ...detection,
      receivedAt: new Date().toISOString()
    });

    // Mantener solo las últimas 50 detecciones por dispositivo
    if (deviceDetections.length > 50) {
      deviceDetections.splice(0, deviceDetections.length - 50);
    }

    // Broadcast a clientes suscritos
    const message = {
      type: 'NEW_DETECTION',
      deviceId: detection.device_id,
      detection: detection,
      timestamp: new Date().toISOString()
    };

    this.broadcastToSubscribers(detection.device_id, message);
  }

  // Enviar alarmas de zona
  broadcastZoneAlarm(alarmData) {
    const message = {
      type: 'ZONE_ALARM',
      deviceId: alarmData.device_id,
      alarm: {
        zoneId: alarmData.zone_id,
        zoneName: alarmData.zone_name,
        isAlarmed: alarmData.is_alarmed,
        targetId: alarmData.target_id,
        coordinates: alarmData.coordinates
      },
      timestamp: new Date().toISOString(),
      priority: 'HIGH'
    };

    this.broadcastToSubscribers(alarmData.device_id, message);
  }

  broadcastToSubscribers(deviceId, message) {
    let sentCount = 0;
    
    this.clients.forEach((clientInfo, ws) => {
      if (clientInfo.subscriptions.has(deviceId) && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
          sentCount++;
        } catch (error) {
          console.error(`Error sending to client ${clientInfo.id}:`, error);
          this.clients.delete(ws);
        }
      }
    });

    if (sentCount > 0) {
      console.log(`Enviado ${message.type} de ${deviceId} a ${sentCount} clientes`);
    }
  }

  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  }

  sendError(ws, errorMessage) {
    this.sendMessage(ws, {
      type: 'ERROR',
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  generateClientId() {
    return Math.random().toString(36).substr(2, 9);
  }

  startPeriodicUpdates() {
    // Heartbeat cada 30 segundos
    setInterval(() => {
      this.clients.forEach((clientInfo, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
          
          // Desconectar clientes inactivos (2 minutos sin respuesta)
          if (Date.now() - clientInfo.lastPing > 120000) {
            console.log(`Desconectando cliente inactivo: ${clientInfo.id}`);
            ws.terminate();
            this.clients.delete(ws);
          }
        }
      });
    }, 30000);

    // Estadísticas periódicas cada 5 minutos
    setInterval(async () => {
      await this.broadcastPeriodicStats();
    }, 5 * 60 * 1000);
  }

  async broadcastPeriodicStats() {
    try {
      // Obtener dispositivos activos
      const devicesQuery = `
        SELECT DISTINCT device_id 
        FROM radar 
        WHERE ts_utc > NOW() - INTERVAL '1 hour'
      `;
      
      const devicesResult = await pool.query(devicesQuery);
      
      for (const row of devicesResult.rows) {
        const deviceId = row.device_id;
        const stats = await this.getLiveStats(deviceId);
        
        const message = {
          type: 'PERIODIC_STATS',
          deviceId: deviceId,
          stats: stats,
          timestamp: new Date().toISOString()
        };

        this.broadcastToSubscribers(deviceId, message);
      }
    } catch (error) {
      console.error('Error broadcasting periodic stats:', error);
    }
  }

  getServerStats() {
    return {
      connectedClients: this.clients.size,
      totalSubscriptions: Array.from(this.clients.values())
        .reduce((total, client) => total + client.subscriptions.size, 0),
      cacheSize: this.lastDetections.size,
      uptime: process.uptime()
    };
  }

  start(port = 8765) {
    this.server.listen(port, () => {
      console.log(`WebSocket server corriendo en puerto ${port}`);
      console.log(`Conectarse a: ws://localhost:${port}`);
    });

    // Endpoint HTTP para estadísticas del servidor
    this.app.get('/ws-stats', (req, res) => {
      res.json(this.getServerStats());
    });
  }
}

// Instancia global del servidor
const wsServer = new RadarWebSocketServer();

// Exportar métodos para usar desde el script de Python
module.exports = {
  broadcastNewDetection: (detection) => wsServer.broadcastNewDetection(detection),
  broadcastZoneAlarm: (alarm) => wsServer.broadcastZoneAlarm(alarm),
  getServerStats: () => wsServer.getServerStats(),
  start: (port) => wsServer.start(port)
};

// Si se ejecuta directamente
if (require.main === module) {
  wsServer.start(8765);
}