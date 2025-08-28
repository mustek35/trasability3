import React from 'react';
import { CONFIG } from '../utils/config';

const Legend = () => {
  return (
    <div className="absolute bottom-20 right-4 bg-gray-800 rounded-lg shadow-lg p-3 z-10 border border-gray-600 text-white">
      <h4 className="text-sm font-semibold text-white mb-2">Duración de Trayectorias</h4>
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-1 rounded" style={{ backgroundColor: CONFIG.COLORS.SHORT }}></div>
          <span className="text-gray-300">Corta (&lt;{CONFIG.SHORT_MAX_SECONDS}s)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-1 rounded" style={{ backgroundColor: CONFIG.COLORS.MEDIUM }}></div>
          <span className="text-gray-300">Media ({CONFIG.SHORT_MAX_SECONDS}-{CONFIG.LONG_MIN_SECONDS}s)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-1 rounded" style={{ backgroundColor: CONFIG.COLORS.LONG }}></div>
          <span className="text-gray-300">Larga (&gt;{CONFIG.LONG_MIN_SECONDS}s)</span>
        </div>
      </div>
    </div>
  );
};

export default Legend;