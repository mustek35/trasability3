import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { CONFIG } from '../utils/config';

const OpenStreetMapCanvas = ({ detections, timelineCursor, selectedHour, hoveredTrajectory, onTrajectoryHover }) => {
  const canvasRef = useRef(null);
  const tilesCanvasRef = useRef(null); // Canvas separado para tiles (estático)
  const containerRef = useRef(null);
  const animationFrameRef = useRef(null);

  const frameRequestedRef = useRef(false);
  const pendingUpdateRef = useRef(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const lastMoveTime = useRef(0);
  const lastRenderState = useRef(null);


  const [mapState, setMapState] = useState({
    center: CONFIG.MAP.CENTER,
    zoom: CONFIG.MAP.ZOOM,

    dragging: false,
    dragStart: null,
    tileImages: new Map(),
    tilesLoaded: new Set(),
    isAnimating: false,
    tilesNeedRedraw: true
  });

  // Throttled setState using requestAnimationFrame for smoother dragging
  const throttledSetMapState = useCallback((updates) => {
    pendingUpdateRef.current = { ...(pendingUpdateRef.current || {}), ...updates };
    if (!frameRequestedRef.current) {
      frameRequestedRef.current = true;
      requestAnimationFrame(() => {
        setMapState(prev => ({ ...prev, ...pendingUpdateRef.current }));
        pendingUpdateRef.current = null;
        frameRequestedRef.current = false;
      });
    }
  }, []);

  // Función optimizada para cargar tiles con pool de conexiones
  const loadTile = useCallback(async (x, y, zoom) => {
    const tileKey = `${zoom}/${x}/${y}`;
    
    if (mapState.tileImages.has(tileKey)) {
      return mapState.tileImages.get(tileKey);
    }

    if (mapState.tilesLoaded.has(tileKey)) {
      return null;
    }

    try {
      setMapState(prev => ({
        ...prev,
        tilesLoaded: new Set([...prev.tilesLoaded, tileKey])
      }));

      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          console.warn(`Tile loading timeout: ${tileKey}`);
          resolve(null);
        }, 5000); // 5 second timeout

        img.onload = () => {
          clearTimeout(timeoutId);
          setMapState(prev => ({
            ...prev,
            tileImages: new Map([...prev.tileImages, [tileKey, img]]),
            tilesNeedRedraw: true
          }));
          resolve(img);
        };
        
        img.onerror = () => {
          clearTimeout(timeoutId);
          resolve(null);
        };
        
        // Usar diferentes proveedores para balancear carga
        const providers = [
          `https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/${zoom}/${x}/${y}.png`,
          `https://cartodb-basemaps-b.global.ssl.fastly.net/dark_all/${zoom}/${x}/${y}.png`,
          `https://cartodb-basemaps-c.global.ssl.fastly.net/dark_all/${zoom}/${x}/${y}.png`,
          `https://cartodb-basemaps-d.global.ssl.fastly.net/dark_all/${zoom}/${x}/${y}.png`
        ];
        
        const providerIndex = Math.abs(x + y) % providers.length;
        img.src = providers[providerIndex];
      });
    } catch (error) {
      console.warn(`Error loading tile ${tileKey}:`, error);
      return null;
    }
  }, [mapState.tileImages, mapState.tilesLoaded]);

  // Conversión de coordenadas optimizada con memoización
  const lonLatToPixel = useMemo(() => {
    return (lon, lat, zoom, centerLon, centerLat, width, height) => {
      const scale = Math.pow(2, zoom);
      const worldWidth = 256 * scale;
      const worldHeight = 256 * scale;

      const pixelX = (lon + 180) * (worldWidth / 360);
      const pixelY = (worldHeight / 2) - (worldHeight * Math.log(Math.tan((Math.PI / 4) + (lat * Math.PI / 360))) / (2 * Math.PI));

      const centerPixelX = (centerLon + 180) * (worldWidth / 360);
      const centerPixelY = (worldHeight / 2) - (worldHeight * Math.log(Math.tan((Math.PI / 4) + (centerLat * Math.PI / 360))) / (2 * Math.PI));

      return [
        pixelX - centerPixelX + width / 2,
        pixelY - centerPixelY + height / 2
      ];
    };
  }, []);

  const pixelToLonLat = useMemo(() => {
    return (x, y, zoom, centerLon, centerLat, width, height) => {
      const scale = Math.pow(2, zoom);
      const worldWidth = 256 * scale;
      const worldHeight = 256 * scale;

      const centerPixelX = (centerLon + 180) * (worldWidth / 360);
      const centerPixelY = (worldHeight / 2) - (worldHeight * Math.log(Math.tan((Math.PI / 4) + (centerLat * Math.PI / 360))) / (2 * Math.PI));

      const worldX = centerPixelX + (x - width / 2);
      const worldY = centerPixelY + (y - height / 2);

      const lon = (worldX / worldWidth) * 360 - 180;
      const lat = (2 * Math.atan(Math.exp((worldHeight / 2 - worldY) * 2 * Math.PI / worldHeight)) - Math.PI / 2) * 180 / Math.PI;

      return [lon, lat];
    };
  }, []);

  const getTrajectoryColor = useMemo(() => {
    return (points) => {
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
  }, []);

  const getVisiblePoints = useCallback((points, cursor) => {
    if (cursor === 60) return points;
    
    const hourStart = new Date();
    hourStart.setHours(selectedHour, 0, 0, 0);
    const cursorTime = new Date(hourStart.getTime() + cursor * 60000);
    
    return points.filter(point => new Date(point.ts) <= cursorTime);
  }, [selectedHour]);

  // Renderizar solo tiles (canvas estático)
  const renderTiles = useCallback(() => {
    const tilesCanvas = tilesCanvasRef.current;
    const container = containerRef.current;
    if (!tilesCanvas || !container) return;

    const ctx = tilesCanvas.getContext('2d');
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    // Usar pixel ratio reducido para mejor rendimiento
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    tilesCanvas.width = width * devicePixelRatio;
    tilesCanvas.height = height * devicePixelRatio;
    tilesCanvas.style.width = width + 'px';
    tilesCanvas.style.height = height + 'px';
    
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Fondo oscuro
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, width, height);

    const tileSize = 256;
    const zoom = Math.floor(mapState.zoom);
    const scale = Math.pow(2, zoom);
    
    const centerTileX = Math.floor((mapState.center[1] + 180) / 360 * scale);
    const centerTileY = Math.floor((1 - Math.log(Math.tan(mapState.center[0] * Math.PI / 180) + 1 / Math.cos(mapState.center[0] * Math.PI / 180)) / Math.PI) / 2 * scale);
    
    const tilesX = Math.ceil(width / tileSize) + 1;
    const tilesY = Math.ceil(height / tileSize) + 1;
    
    const startTileX = centerTileX - Math.floor(tilesX / 2);
    const startTileY = centerTileY - Math.floor(tilesY / 2);

    let tilesDrawn = 0;
    const tilesToLoad = [];

    // Dibujar tiles existentes primero
    for (let x = 0; x < tilesX; x++) {
      for (let y = 0; y < tilesY; y++) {
        const tileX = startTileX + x;
        const tileY = startTileY + y;
        
        if (tileX < 0 || tileY < 0 || tileX >= scale || tileY >= scale) continue;
        
        const pixelX = (tileX - centerTileX) * tileSize + width / 2;
        const pixelY = (tileY - centerTileY) * tileSize + height / 2;
        
        const tileKey = `${zoom}/${tileX}/${tileY}`;
        const tileImage = mapState.tileImages.get(tileKey);
        
        if (tileImage) {
          try {
            ctx.drawImage(tileImage, pixelX, pixelY, tileSize, tileSize);
            tilesDrawn++;
          } catch (error) {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
          }
        } else {
          // Placeholder más simple
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(pixelX, pixelY, tileSize, tileSize);
          tilesToLoad.push({ x: tileX, y: tileY, zoom });
        }
      }
    }

    // Cargar tiles faltantes de forma asíncrona y limitada
    if (tilesToLoad.length > 0) {
      // Limitar cargas concurrentes para evitar saturar la red
      const maxConcurrent = 6;
      tilesToLoad.slice(0, maxConcurrent).forEach(({ x, y, zoom }) => {
        loadTile(x, y, zoom);
      });
    }
  }, [mapState.center, mapState.zoom, mapState.tileImages, loadTile]);

  // Renderizar elementos dinámicos (trayectorias, puntos)
  const renderDynamicElements = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Canvas transparente para superponer sobre tiles
    ctx.clearRect(0, 0, width, height);

    // Dibujar punto central
    const centerPixel = lonLatToPixel(
      mapState.center[1], mapState.center[0], 
      mapState.zoom, mapState.center[1], mapState.center[0], 
      width, height
    );
    
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(centerPixel[0], centerPixel[1], 6, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dibujar trayectorias solo si hay datos
    if (detections && detections.length > 0) {
      // Usar requestIdleCallback si está disponible para no bloquear UI
      const drawTrajectories = () => {
        detections.forEach(detection => {
          const visiblePoints = getVisiblePoints(detection.points, timelineCursor);
          if (visiblePoints.length < 2) return;

          const color = getTrajectoryColor(detection.points);
          const isHovered = hoveredTrajectory === detection.uid;
          
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 2;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          
          ctx.strokeStyle = color;
          ctx.lineWidth = isHovered ? 6 : 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          ctx.beginPath();
          let hasValidPath = false;
          visiblePoints.forEach((point, index) => {
            const pixel = lonLatToPixel(
              point.lng, point.lat, 
              mapState.zoom, mapState.center[1], mapState.center[0], 
              width, height
            );
            
            // Solo dibujar puntos que están en el viewport
            if (pixel[0] >= -50 && pixel[0] <= width + 50 && 
                pixel[1] >= -50 && pixel[1] <= height + 50) {
              if (!hasValidPath) {
                ctx.moveTo(pixel[0], pixel[1]);
                hasValidPath = true;
              } else {
                ctx.lineTo(pixel[0], pixel[1]);
              }
            }
          });
          
          if (hasValidPath) {
            ctx.stroke();
          }

          ctx.shadowBlur = 0;

          // Puntos de inicio y fin solo si están visibles
          const startPixel = lonLatToPixel(
            visiblePoints[0].lng, visiblePoints[0].lat,
            mapState.zoom, mapState.center[1], mapState.center[0],
            width, height
          );
          
          if (startPixel[0] >= 0 && startPixel[0] <= width && 
              startPixel[1] >= 0 && startPixel[1] <= height) {
            ctx.fillStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(startPixel[0], startPixel[1], 5, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          if (visiblePoints.length > 1) {
            const endPixel = lonLatToPixel(
              visiblePoints[visiblePoints.length - 1].lng, visiblePoints[visiblePoints.length - 1].lat,
              mapState.zoom, mapState.center[1], mapState.center[0],
              width, height
            );
            
            if (endPixel[0] >= 0 && endPixel[0] <= width && 
                endPixel[1] >= 0 && endPixel[1] <= height) {
              ctx.fillStyle = '#ef4444';
              ctx.beginPath();
              ctx.arc(endPixel[0], endPixel[1], 5, 0, 2 * Math.PI);
              ctx.fill();
              
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }
        });
      };

      // Usar requestIdleCallback para no bloquear la UI principal
      if (window.requestIdleCallback) {
        window.requestIdleCallback(drawTrajectories);
      } else {
        drawTrajectories();
      }
    }
  }, [detections, timelineCursor, mapState.center, mapState.zoom, hoveredTrajectory, 
      lonLatToPixel, getVisiblePoints, getTrajectoryColor]);

  // Animación de inercia optimizada
  const animateMovement = useCallback(() => {
    if (!mapState.isAnimating) return;

    const friction = 0.92;
    const minVelocity = 0.5;

    velocity.current.x *= friction;
    velocity.current.y *= friction;

    if (Math.abs(velocity.current.x) < minVelocity && Math.abs(velocity.current.y) < minVelocity) {
      setMapState(prev => ({ ...prev, isAnimating: false }));
      return;
    }

    const scale = Math.pow(2, mapState.zoom);
    const latDelta = -velocity.current.y * 180 / (256 * scale);
    const lonDelta = -velocity.current.x * 360 / (256 * scale);

    setMapState(prev => ({
      ...prev,
      center: [
        Math.max(-85, Math.min(85, prev.center[0] + latDelta)),
        ((prev.center[1] + lonDelta + 540) % 360) - 180
      ],
      tilesNeedRedraw: true
    }));

    animationFrameRef.current = requestAnimationFrame(animateMovement);
  }, [mapState.isAnimating, mapState.zoom]);

  // Effect para manejar animaciones
  useEffect(() => {
    if (mapState.isAnimating) {
      animationFrameRef.current = requestAnimationFrame(animateMovement);
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [mapState.isAnimating, animateMovement]);

  // Effect para renderizar tiles solo cuando sea necesario
  useEffect(() => {
    if (mapState.tilesNeedRedraw) {
      renderTiles();
      setMapState(prev => ({ ...prev, tilesNeedRedraw: false }));
    }
  }, [mapState.tilesNeedRedraw, renderTiles]);

  // Effect para renderizar elementos dinámicos
  useEffect(() => {
    renderDynamicElements();
  }, [renderDynamicElements]);

  // Limpiar cache optimizado
  useEffect(() => {
    if (mapState.tileImages.size > 150) {
      const entriesToKeep = Array.from(mapState.tileImages.entries()).slice(-100);
      setMapState(prev => ({
        ...prev,
        tileImages: new Map(entriesToKeep),
        tilesLoaded: new Set(),
        tilesNeedRedraw: true
      }));
    }
  }, [mapState.tileImages.size]);

  // Eventos optimizados

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setMapState(prev => ({ ...prev, isAnimating: false }));
    velocity.current = { x: 0, y: 0 };
    
    setMapState(prev => ({
      ...prev,
      dragging: true,
      dragStart: {
        x: x,
        y: y,
        centerLat: prev.center[0],
        centerLon: prev.center[1]
      }
    }));
    
    lastMousePos.current = { x, y };
    lastMoveTime.current = Date.now();
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!mapState.dragging || !mapState.dragStart) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const deltaX = x - mapState.dragStart.x;
    const deltaY = y - mapState.dragStart.y;

    const now = Date.now();
    const timeDelta = now - lastMoveTime.current;
    
    if (timeDelta > 0) {
      velocity.current.x = (x - lastMousePos.current.x) / timeDelta * 16;
      velocity.current.y = (y - lastMousePos.current.y) / timeDelta * 16;
    }
    
    lastMousePos.current = { x, y };
    lastMoveTime.current = now;


    const scale = Math.pow(2, mapState.zoom);
    const latDelta = -deltaY * 180 / (256 * scale);
    const lonDelta = -deltaX * 360 / (256 * scale);


    // Usar throttledSetMapState para reducir re-renders durante drag
    throttledSetMapState({
      center: [
        Math.max(-85, Math.min(85, mapState.dragStart.centerLat + latDelta)),
        ((mapState.dragStart.centerLon + lonDelta + 540) % 360) - 180
      ],
      tilesNeedRedraw: true
    });
  }, [mapState.dragging, mapState.dragStart, mapState.zoom, throttledSetMapState]);

  const handleMouseUp = useCallback(() => {
    if (mapState.dragging) {
      const velocityMagnitude = Math.sqrt(velocity.current.x ** 2 + velocity.current.y ** 2);
      setMapState(prev => ({ 
        ...prev, 
        dragging: false, 
        dragStart: null, 
        isAnimating: velocityMagnitude > 3
      }));
    }
  }, [mapState.dragging]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    
    const beforeZoom = mapState.zoom;
    const zoomDelta = e.deltaY > 0 ? -0.3 : 0.3;
    const newZoom = Math.max(1, Math.min(18, beforeZoom + zoomDelta));
    
    if (newZoom !== beforeZoom) {
      const [mouseLon, mouseLat] = pixelToLonLat(
        mouseX, mouseY, beforeZoom, 
        mapState.center[1], mapState.center[0], 
        width, height
      );
      
      const [newMouseX, newMouseY] = lonLatToPixel(
        mouseLon, mouseLat, newZoom,
        mapState.center[1], mapState.center[0],
        width, height
      );
      
      const centerDeltaX = mouseX - newMouseX;
      const centerDeltaY = mouseY - newMouseY;
      
      const scale = Math.pow(2, newZoom);
      const latDelta = -centerDeltaY * 180 / (256 * scale);
      const lonDelta = -centerDeltaX * 360 / (256 * scale);
      
      setMapState(prev => ({
        ...prev,
        zoom: newZoom,
        center: [
          Math.max(-85, Math.min(85, prev.center[0] + latDelta)),
          ((prev.center[1] + lonDelta + 540) % 360) - 180
        ],
        tilesNeedRedraw: true
      }));
    }
  }, [mapState.zoom, mapState.center, pixelToLonLat, lonLatToPixel]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative bg-gray-900 overflow-hidden select-none"
      style={{ cursor: mapState.dragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Canvas para tiles (fondo estático) */}
      <canvas
        ref={tilesCanvasRef}
        className="absolute top-0 left-0 w-full h-full block"
        style={{ zIndex: 1 }}
      />
      
      {/* Canvas para elementos dinámicos (trayectorias) */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full block"
        style={{ zIndex: 2 }}
      />
      
      {/* UI Controls */}
      {mapState.tilesLoaded.size > mapState.tileImages.size && (
        <div className="absolute top-4 right-4 bg-gray-900 bg-opacity-90 rounded-lg shadow-lg p-2 text-xs text-gray-300 z-10 border border-gray-700 flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
          <span>Cargando...</span>
        </div>
      )}

      <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-90 rounded-lg shadow-lg p-1 z-10 border border-gray-700">
        <button
          onClick={() => setMapState(prev => ({ ...prev, zoom: Math.min(18, prev.zoom + 1), tilesNeedRedraw: true }))}
          className="block w-8 h-8 bg-gray-800 hover:bg-gray-700 text-white rounded mb-1 text-lg font-bold transition-colors border border-gray-600"
        >
          +
        </button>
        <button
          onClick={() => setMapState(prev => ({ ...prev, zoom: Math.max(1, prev.zoom - 1), tilesNeedRedraw: true }))}
          className="block w-8 h-8 bg-gray-800 hover:bg-gray-700 text-white rounded text-lg font-bold transition-colors border border-gray-600"
        >
          -
        </button>
      </div>

      <div className="absolute bottom-4 left-4 bg-gray-900 bg-opacity-90 rounded-lg shadow-lg p-3 text-xs text-gray-300 z-10 border border-gray-700">
        <div className="text-white font-medium mb-1">CartoDB Dark Matter</div>
        <div>Zoom: {mapState.zoom.toFixed(1)}</div>
        <div>Centro: {mapState.center[0].toFixed(4)}, {mapState.center[1].toFixed(4)}</div>
        <div>Tiles: {mapState.tileImages.size}</div>
        <div className="text-xs text-gray-500 mt-2">
          Optimizado para rendimiento
        </div>
      </div>
    </div>
  );
};

export default OpenStreetMapCanvas;