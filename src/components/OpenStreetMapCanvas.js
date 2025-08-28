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

  // Shapes drawn by the user
  const [shapes, setShapes] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('mapShapes');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('mapShapes', JSON.stringify(shapes));
    }
  }, [shapes]);

  const [drawMode, setDrawMode] = useState(null); // 'polygon' | 'rectangle' | 'circle' | 'text'
  const [currentShape, setCurrentShape] = useState(null);

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

    const drawShape = (shape) => {
      ctx.fillStyle = 'rgba(125,211,252,0.3)';
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2;

      if (shape.type === 'polygon') {
        const pts = shape.points ? [...shape.points] : [];
        if (shape.tempPoint) pts.push(shape.tempPoint);
        if (pts.length >= 2) {
          ctx.beginPath();
          pts.forEach(([lon, lat], idx) => {
            const [px, py] = lonLatToPixel(
              lon, lat,
              mapState.zoom, mapState.center[1], mapState.center[0],
              width, height
            );
            if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          if (!shape.tempPoint && pts.length > 2) {
            ctx.closePath();
            ctx.fill();
          }
          ctx.stroke();
        }
        if (shape.title) {
          const centroid = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
          const count = pts.length;
          const [clon, clat] = [centroid[0] / count, centroid[1] / count];
          const [tx, ty] = lonLatToPixel(
            clon, clat,
            mapState.zoom, mapState.center[1], mapState.center[0],
            width, height
          );
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(shape.title, tx, ty);
        }
      } else if (shape.type === 'rectangle' && shape.points.length === 2) {
        const [p1, p2] = shape.points;
        const [p1x, p1y] = lonLatToPixel(p1[0], p1[1], mapState.zoom, mapState.center[1], mapState.center[0], width, height);
        const [p2x, p2y] = lonLatToPixel(p2[0], p2[1], mapState.zoom, mapState.center[1], mapState.center[0], width, height);
        const left = Math.min(p1x, p2x);
        const top = Math.min(p1y, p2y);
        const w = Math.abs(p2x - p1x);
        const h = Math.abs(p2y - p1y);
        ctx.beginPath();
        ctx.rect(left, top, w, h);
        ctx.fill();
        ctx.stroke();
        if (shape.title) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(shape.title, left + w / 2, top + h / 2);
        }
      } else if (shape.type === 'circle' && shape.points.length === 2) {
        const [centerPoint, edgePoint] = shape.points;
        const [cx, cy] = lonLatToPixel(centerPoint[0], centerPoint[1], mapState.zoom, mapState.center[1], mapState.center[0], width, height);
        const [ex, ey] = lonLatToPixel(edgePoint[0], edgePoint[1], mapState.zoom, mapState.center[1], mapState.center[0], width, height);
        const radius = Math.sqrt((ex - cx) ** 2 + (ey - cy) ** 2);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        if (shape.title) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(shape.title, cx, cy);
        }
      } else if (shape.type === 'text' && shape.points.length === 1) {
        const [lon, lat] = shape.points[0];
        const [tx, ty] = lonLatToPixel(
          lon, lat,
          mapState.zoom, mapState.center[1], mapState.center[0],
          width, height
        );
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(shape.title, tx, ty);
      }
    };

    shapes.forEach(drawShape);
    if (currentShape) drawShape(currentShape);

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
      lonLatToPixel, getVisiblePoints, getTrajectoryColor, shapes, currentShape]);

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

    if (drawMode) {
      const [lon, lat] = pixelToLonLat(
        x, y, mapState.zoom,
        mapState.center[1], mapState.center[0],
        rect.width, rect.height
      );

      if (drawMode === 'polygon') {
        setCurrentShape(prev => prev ? { ...prev, points: [...prev.points, [lon, lat]], tempPoint: undefined } : { type: 'polygon', points: [[lon, lat]] });
      } else if (drawMode === 'rectangle') {
        setCurrentShape({ type: 'rectangle', points: [[lon, lat], [lon, lat]] });
      } else if (drawMode === 'circle') {
        setCurrentShape({ type: 'circle', points: [[lon, lat], [lon, lat]] });
      } else if (drawMode === 'text') {
        const title = prompt('Título:');
        if (title) {
          setShapes(prev => [...prev, { type: 'text', points: [[lon, lat]], title }]);
        }
        setDrawMode(null);
      }
      return;
    }

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
  }, [drawMode, mapState.zoom, mapState.center, pixelToLonLat]);

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drawMode && currentShape) {
      const [lon, lat] = pixelToLonLat(
        x, y, mapState.zoom,
        mapState.center[1], mapState.center[0],
        rect.width, rect.height
      );
      if (drawMode === 'polygon') {
        setCurrentShape(prev => prev ? { ...prev, tempPoint: [lon, lat] } : prev);
      } else if (drawMode === 'rectangle' || drawMode === 'circle') {
        setCurrentShape(prev => ({ ...prev, points: [prev.points[0], [lon, lat]] }));
      }
      return;
    }

    if (!mapState.dragging || !mapState.dragStart) return;

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
  }, [drawMode, currentShape, mapState.dragging, mapState.dragStart, mapState.zoom, mapState.center, throttledSetMapState, pixelToLonLat]);

  const handleMouseUp = useCallback(() => {
    if (drawMode && currentShape) {
      if (drawMode === 'rectangle' || drawMode === 'circle') {
        const title = prompt('Título:');
        const shape = { ...currentShape };
        if (title) shape.title = title;
        setShapes(prev => [...prev, shape]);
        setCurrentShape(null);
        setDrawMode(null);
      }
      return;
    }

    if (mapState.dragging) {
      const velocityMagnitude = Math.sqrt(velocity.current.x ** 2 + velocity.current.y ** 2);
      setMapState(prev => ({
        ...prev,
        dragging: false,
        dragStart: null,
        isAnimating: velocityMagnitude > 3
      }));
    }
  }, [drawMode, currentShape, mapState.dragging]);

  const handleDoubleClick = useCallback((e) => {
    if (drawMode === 'polygon' && currentShape && currentShape.points.length > 2) {
      e.preventDefault();
      const title = prompt('Título:');
      const points = currentShape.points.slice(0, -1);
      setShapes(prev => [...prev, { type: 'polygon', points, title }]);
      setCurrentShape(null);
      setDrawMode(null);
    }
  }, [drawMode, currentShape]);

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

  const toggleMode = useCallback((mode) => {
    setCurrentShape(null);
    setDrawMode(prev => (prev === mode ? null : mode));
  }, []);

  const downloadJSON = useCallback(() => {
    const data = JSON.stringify(shapes, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shapes.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [shapes]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative bg-gray-900 overflow-hidden select-none"
      style={{ cursor: mapState.dragging ? 'grabbing' : drawMode ? 'crosshair' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
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

      <div className="absolute top-20 right-4 bg-gray-900 bg-opacity-90 rounded-lg shadow-lg p-2 z-10 border border-gray-700 flex flex-col gap-1">
        <button
          onClick={() => toggleMode('polygon')}
          className={`w-24 px-2 py-1 rounded text-xs text-white ${drawMode === 'polygon' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
        >
          Polígono
        </button>
        <button
          onClick={() => toggleMode('rectangle')}
          className={`w-24 px-2 py-1 rounded text-xs text-white ${drawMode === 'rectangle' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
        >
          Cuadrado
        </button>
        <button
          onClick={() => toggleMode('circle')}
          className={`w-24 px-2 py-1 rounded text-xs text-white ${drawMode === 'circle' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
        >
          Círculo
        </button>
        <button
          onClick={() => toggleMode('text')}
          className={`w-24 px-2 py-1 rounded text-xs text-white ${drawMode === 'text' ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-700'}`}
        >
          Título
        </button>
        <button
          onClick={downloadJSON}
          className="w-24 px-2 py-1 rounded text-xs text-white bg-gray-800 hover:bg-gray-700"
        >
          Guardar
        </button>
      </div>

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