import React, { useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { CONFIG } from '../utils/config';

const Timeline = ({ timelineCursor, isPlaying, playSpeed, onCursorChange, onPlayToggle, onSpeedChange, onReset }) => {
  const timelineRef = useRef();
  
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        onCursorChange(prev => {
          if (prev >= 60) {
            onPlayToggle();
            return 60;
          }
          return Math.min(60, prev + (playSpeed * 0.5));
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playSpeed, onCursorChange, onPlayToggle]);
  
  const formatTimeLabel = (minutes) => {
    const totalMinutes = Math.floor(minutes);
    const seconds = Math.floor((minutes - totalMinutes) * 60);
    return `${totalMinutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="bg-gray-900 border-t border-gray-700 p-4 text-white">
      <div className="flex items-center gap-4 mb-3">
        <button
          onClick={onPlayToggle}
          className="flex items-center justify-center w-10 h-10 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
        </button>
        
        <button
          onClick={() => onReset()}
          className="flex items-center justify-center w-10 h-10 bg-gray-600 text-white rounded-full hover:bg-gray-500 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        
        <select
          value={playSpeed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
        >
          {CONFIG.TIMELINE.PLAY_SPEEDS.map(speed => (
            <option key={speed} value={speed}>{speed}x</option>
          ))}
        </select>
        
        <div className="text-sm text-gray-300">
          {formatTimeLabel(timelineCursor)} / 60:00
        </div>
      </div>
      
      <div className="relative">
        <input
          ref={timelineRef}
          type="range"
          min="0"
          max="60"
          step="0.5"
          value={timelineCursor}
          onChange={(e) => onCursorChange(Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
        
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>00:00</span>
          <span>15:00</span>
          <span>30:00</span>
          <span>45:00</span>
          <span>60:00</span>
        </div>
      </div>
    </div>
  );
};

export default Timeline;