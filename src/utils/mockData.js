import { CONFIG } from './config';

export const generateMockData = (deviceId, fromTime, toTime) => {
  const detections = [];
  const numTrajectories = Math.floor(Math.random() * 8) + 2; // 2-10 trayectorias
  
  for (let i = 0; i < numTrajectories; i++) {
    const uid = `TGT_${Math.random().toString(36).substr(2, 8)}`;
    const numPoints = Math.floor(Math.random() * 20) + 5; // 5-25 puntos
    const points = [];
    
    // Punto inicial aleatorio cerca del centro
    let lat = CONFIG.MAP.CENTER[0] + (Math.random() - 0.5) * 0.01;
    let lng = CONFIG.MAP.CENTER[1] + (Math.random() - 0.5) * 0.01;
    
    const startTime = new Date(fromTime.getTime() + Math.random() * (toTime.getTime() - fromTime.getTime()));
    
    for (let j = 0; j < numPoints; j++) {
      // Movimiento aleatorio pero continuo
      lat += (Math.random() - 0.5) * 0.0005;
      lng += (Math.random() - 0.5) * 0.0005;
      
      const pointTime = new Date(startTime.getTime() + j * 5000); // Cada 5 segundos
      if (pointTime > toTime) break;
      
      points.push({
        lat: lat,
        lng: lng,
        alt: Math.random() * 100,
        ts: pointTime.toISOString()
      });
    }
    
    if (points.length > 1) {
      detections.push({
        uid,
        points,
        speed: Math.random() * 20,
        bearing: Math.random() * 360,
        distance: Math.random() * 1000,
        confidence: Math.random()
      });
    }
  }
  
  return detections;
};