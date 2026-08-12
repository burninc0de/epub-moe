import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { Play, Pause, Square, ZoomIn, ZoomOut, RotateCcw, Clock, Magnet, AlertTriangle, ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import { SMILFragment } from '../types/epub';
import { formatTime, parseTimeInput } from '../utils/time';

const REGION_EPSILON = 0.01; // 10ms tolerance for floating point imprecision
const VOLUME_KEY = 'waveformVolume';
const DEFAULT_VOLUME = 1;

interface WaveformViewerProps {
  audioBlob: Blob;
  fragments: SMILFragment[];
  onFragmentSelect: (fragment: SMILFragment | null) => void;
  selectedFragment: SMILFragment | null;
  onFragmentUpdate: (fragmentId: string, updates: Partial<SMILFragment>) => void;
  onApplyTimeOffset: (fromTime: number, offsetSeconds: number) => void;
  onForceNonOverlapping: (audioDuration: number) => void;
  viewerHeight: number;
}

const MIN_ZOOM = 10;
const DEFAULT_ZOOM = 20;
const MAX_ZOOM = 200;

export interface WaveformViewerHandles {
  togglePlayback: () => void;
  seekToFragment: (fragment: SMILFragment) => void;
  prevFragment: () => void;
  nextFragment: () => void;
}

export const WaveformViewer = forwardRef<WaveformViewerHandles, WaveformViewerProps>(({
  audioBlob,
  fragments,
  onFragmentSelect,
  selectedFragment,
  onFragmentUpdate,
  onApplyTimeOffset,
  onForceNonOverlapping,
}, ref) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const fragmentsRef = useRef<SMILFragment[]>(fragments);
  useEffect(() => { fragmentsRef.current = fragments; }, [fragments]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedRegionId, setDraggedRegionId] = useState<string | null>(null);
  const [showOffsetDialog, setShowOffsetDialog] = useState(false);
  const [offsetTime, setOffsetTime] = useState('');
  const [offsetValue, setOffsetValue] = useState('');
  const [isWaveformLoading, setIsWaveformLoading] = useState(true);
  const [isSnapEnabled, setIsSnapEnabled] = useState(true);
  const [showForceNonOverlapDialog, setShowForceNonOverlapDialog] = useState(false);
  const [volume, setVolume] = useState<number>(() => {
    const stored = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
    if (!Number.isFinite(stored)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, stored));
  });
  const lastVolumeRef = useRef<number>(DEFAULT_VOLUME);
  const audioUrlRef = useRef<string | null>(null);

  // Refs to hold the latest callbacks
  const onFragmentSelectRef = useRef(onFragmentSelect);
  const onFragmentUpdateRef = useRef(onFragmentUpdate);
  const isSnapEnabledRef = useRef(isSnapEnabled);
  useEffect(() => {
    onFragmentSelectRef.current = onFragmentSelect;
    onFragmentUpdateRef.current = onFragmentUpdate;
  });

  useEffect(() => {
    isSnapEnabledRef.current = isSnapEnabled;
  }, [isSnapEnabled]);

  useEffect(() => {
    wavesurfer.current?.setVolume(volume);
  }, [volume]);

  const handleVolumeChange = (value: number) => {
    setVolume(value);
    if (value > 0) lastVolumeRef.current = value;
    localStorage.setItem(VOLUME_KEY, String(value));
  };

  const toggleMute = () => {
    handleVolumeChange(volume > 0 ? 0 : (lastVolumeRef.current > 0 ? lastVolumeRef.current : DEFAULT_VOLUME));
  };

  const drawFragments = useCallback(() => {
    const regions = regionsPluginRef.current;
    if (!regions) return;

    const existingRegions = regions.getRegions();
    const fragmentIds = new Set(fragments.map(f => f.id));

    // Remove regions that no longer exist
    existingRegions.forEach(region => {
      if (!fragmentIds.has(region.id)) {
        region.remove();
      }
    });

    // Add or update regions
    fragments.forEach((fragment) => {
      const existingRegion = existingRegions.find(r => r.id === fragment.id);
      const isSelected = selectedFragment?.id === fragment.id;

      if (existingRegion) {
        // Update existing region
        existingRegion.setOptions({
          start: fragment.clipBegin,
          end: fragment.clipEnd,
          color: isSelected ? 'rgba(96, 165, 250, 0.3)' : 'rgba(16, 185, 129, 0.2)',
        });
      } else {
        // Add new region - create region options once
        regions.addRegion({
          start: fragment.clipBegin,
          end: fragment.clipEnd,
          color: isSelected ? 'rgba(96, 165, 250, 0.3)' : 'rgba(16, 185, 129, 0.2)',
          drag: true,
          resize: true,
          id: fragment.id,
        });
      }
    });
  }, [fragments, selectedFragment]);

  useEffect(() => {
    if (!waveformRef.current) return;

    // Cleanup previous instance
    if (wavesurfer.current) {
      wavesurfer.current.destroy();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      height: 'auto',
      waveColor: '#6B7280',
      progressColor: '#60A5FA',
      cursorColor: '#93C5FD',
      barWidth: 1,
      barRadius: 0,
      normalize: false,
      backend: 'WebAudio',
      plugins: [RegionsPlugin.create()],
    });

    wavesurfer.current = ws;
    regionsPluginRef.current = ws.getActivePlugins()[0] as RegionsPlugin;

    const audioUrl = URL.createObjectURL(audioBlob);
    audioUrlRef.current = audioUrl;
    ws.load(audioUrl).catch((err: any) => {
      // Suppress AbortError, log others
      if (err?.name !== 'AbortError') {
        // Optionally log or handle other errors
        console.error('WaveSurfer load error:', err);
      }
    });

    ws.on('ready', () => { 
      setIsWaveformLoading(false);
      ws.zoom(zoomLevel); 
      ws.setVolume(volume);
      drawFragments(); 
    });
    ws.on('play', () => setIsPlaying(true)); ws.on('pause', () => setIsPlaying(false)); ws.on('timeupdate', (time) => setCurrentTime(time));

    regionsPluginRef.current.on('region-updated', (region) => {
      // During drag, only update visually - don't trigger parent state updates
      if (isDragging && draggedRegionId === region.id) {
        return;
      }

      // This is for programmatic updates or clicks - handle normally
      // Find the index of the updated region
      const idx = fragmentsRef.current.findIndex(f => f.id === region.id);
      if (idx === -1) {
        onFragmentUpdateRef.current(region.id, { clipBegin: region.start, clipEnd: region.end });
        return;
      }

      // Get previous values for comparison
      const prevFragment = fragmentsRef.current[idx];
      const prevStart = prevFragment.clipBegin;
      const prevEnd = prevFragment.clipEnd;

      // Always update the current region in data
      onFragmentUpdateRef.current(region.id, { clipBegin: region.start, clipEnd: region.end });
      fragmentsRef.current[idx].clipBegin = region.start;
      fragmentsRef.current[idx].clipEnd = region.end;

      // Helper to update region visually
      const updateRegionVisual = (id: string, opts: { start?: number, end?: number }) => {
        const regions = regionsPluginRef.current?.getRegions();
        const r = regions?.find(r => r.id === id);
        if (r && typeof r.setOptions === 'function') {
          r.setOptions(opts);
        }
      };

      if (isSnapEnabledRef.current) {
        // If end changed, update next region's start (only)
        if (Math.abs(region.end - prevEnd) > REGION_EPSILON && idx < fragmentsRef.current.length - 1) {
          const next = fragmentsRef.current[idx + 1];
          if (next.clipBegin !== region.end) {
            next.clipBegin = region.end;
            onFragmentUpdateRef.current(next.id, { clipBegin: region.end });
            updateRegionVisual(next.id, { start: region.end });
          }
        }
        // If start changed, update previous region's end (only)
        if (Math.abs(region.start - prevStart) > REGION_EPSILON && idx > 0) {
          const prev = fragmentsRef.current[idx - 1];
          if (prev.clipEnd !== region.start) {
            prev.clipEnd = region.start;
            onFragmentUpdateRef.current(prev.id, { clipEnd: region.start });
            updateRegionVisual(prev.id, { end: region.start });
          }
        }
      }
    });
    regionsPluginRef.current.on('region-clicked', (region, e) => {
      e.stopPropagation();
      const fragment = fragmentsRef.current.find((f) => f.id === region.id);
      if (fragment) {
        suppressAutoSelectUntil.current = Date.now() + 300; // 300ms suppression
        selectAndSeekFragment(fragment);
      } else {
        console.warn('[region-clicked] No fragment found for region', region.id);
      }
    });

    // Track drag state using region-update event
    let dragStartPositions: { [key: string]: { start: number, end: number } } = {};
    let dragUpdateScheduled = false;
    regionsPluginRef.current.on('region-update', (region) => {
      if (!dragStartPositions[region.id]) {
        // Drag started
        dragStartPositions[region.id] = { start: region.start, end: region.end };
        setIsDragging(true);
        setDraggedRegionId(region.id);
      }
      // During drag, throttle visual updates using requestAnimationFrame
      if (!dragUpdateScheduled) {
        dragUpdateScheduled = true;
        requestAnimationFrame(() => {
          dragUpdateScheduled = false;
          // Visual update could be added here if needed, but WaveSurfer handles it automatically
        });
      }
    });

    regionsPluginRef.current.on('region-updated', (region) => {
      // Drag ended - now update parent state
      if (dragStartPositions[region.id]) {
        delete dragStartPositions[region.id];
        setIsDragging(false);
        setDraggedRegionId(null);

        // On drag end, update the parent state with final positions
        const idx = fragmentsRef.current.findIndex(f => f.id === region.id);
        if (idx !== -1) {
          const prevFragment = fragmentsRef.current[idx];
          const prevStart = prevFragment.clipBegin;
          const prevEnd = prevFragment.clipEnd;

          // Update current region data
          onFragmentUpdateRef.current(region.id, { clipBegin: region.start, clipEnd: region.end });
          fragmentsRef.current[idx].clipBegin = region.start;
          fragmentsRef.current[idx].clipEnd = region.end;

          // Helper to update region visually
          const updateRegionVisual = (id: string, opts: { start?: number, end?: number }) => {
            const regions = regionsPluginRef.current?.getRegions();
            const r = regions?.find(r => r.id === id);
            if (r && typeof r.setOptions === 'function') {
              r.setOptions(opts);
            }
          };

          if (isSnapEnabledRef.current) {
            // Handle adjacent region adjustments only on drag end
            if (Math.abs(region.end - prevEnd) > REGION_EPSILON && idx < fragmentsRef.current.length - 1) {
              const next = fragmentsRef.current[idx + 1];
              if (next.clipBegin !== region.end) {
                next.clipBegin = region.end;
                onFragmentUpdateRef.current(next.id, { clipBegin: region.end });
                updateRegionVisual(next.id, { start: region.end });
              }
            }
            if (Math.abs(region.start - prevStart) > REGION_EPSILON && idx > 0) {
              const prev = fragmentsRef.current[idx - 1];
              if (prev.clipEnd !== region.start) {
                prev.clipEnd = region.start;
                onFragmentUpdateRef.current(prev.id, { clipEnd: region.start });
                updateRegionVisual(prev.id, { end: region.start });
              }
            }
          }
        }
      }
    });

    return () => { ws.destroy(); if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBlob]);

  useEffect(() => {
    const container = waveformRef.current;
    const ws = wavesurfer.current;
    if (!container || !ws) return;

    let lastRedraw = 0;
    const resizeObserver = new ResizeObserver(() => {
      const now = performance.now();
      if (now - lastRedraw > 32) {
        lastRedraw = now;
        ws.setOptions({ height: 'auto' });
      }
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [audioBlob]);

  // Reset loading state when audio changes
  useEffect(() => {
    setIsWaveformLoading(true);
  }, [audioBlob]);

  //const lastAutomaticallySelectedFragmentId = useRef<string | null>(null);
  const suppressAutoSelectUntil = useRef<number>(0); // Suppress auto-selection after manual click

  useEffect(() => {
    drawFragments();
  }, [drawFragments]);

  useEffect(() => {
    const container = waveformRef.current;
    if (!container) return;

    let zoomLevelRef = zoomLevel; // Keep a ref for immediate updates
    const ZOOM_SENSITIVITY = 0.08; // Even more responsive
    let lastStateUpdate = 0;
    const STATE_UPDATE_THROTTLE = 16; // Update React state at ~60fps

    let lastZoomUpdate = 0;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      e.preventDefault();

      const now = performance.now();

      // Calculate new zoom level immediately
      const zoomDelta = -e.deltaY * ZOOM_SENSITIVITY;
      zoomLevelRef = Math.max(MIN_ZOOM, Math.min(zoomLevelRef + zoomDelta, MAX_ZOOM));

      // Update WaveSurfer zoom with smart throttling - more frequent during rapid scrolling
      const timeSinceLastZoom = now - lastZoomUpdate;
      const shouldUpdate = timeSinceLastZoom > 32 || // ~30fps minimum
                           (timeSinceLastZoom > 16 && Math.abs(zoomDelta) > 1); // Faster for large changes

      if (shouldUpdate) {
        wavesurfer.current?.zoom(zoomLevelRef);
        lastZoomUpdate = now;
      }

      // Throttle React state updates to prevent excessive re-renders
      if (now - lastStateUpdate > STATE_UPDATE_THROTTLE) {
        setZoomLevel(zoomLevelRef);
        lastStateUpdate = now;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Helper to highlight the selected region in the waveform
  const highlightFragmentRegion = (fragment: SMILFragment | null) => {
    const regions = regionsPluginRef.current;
    if (regions && typeof regions.getRegions === 'function') {
      const allRegions = regions.getRegions(); // array of regions
      allRegions.forEach(region => {
        if (region && typeof region.setOptions === 'function') {
          region.setOptions({ color: 'rgba(16, 185, 129, 0.2)' });
        }
      });
      if (fragment) {
        const selectedRegion = allRegions.find(region => region.id === fragment.id);
        if (selectedRegion && typeof selectedRegion.setOptions === 'function') {
          selectedRegion.setOptions({ color: 'rgba(96, 165, 250, 0.3)' });
        }
      }
    }
  };

  const selectAndSeekFragment = (fragment: SMILFragment) => {
    // Select and seek (used for region clicks, prev/next, etc)
    onFragmentSelect(fragment);
    setCurrentTime(fragment.clipBegin);
    if (wavesurfer.current) {
      const duration = wavesurfer.current.getDuration();
      if (duration > 0) {
        const current = wavesurfer.current.getCurrentTime();
        if (Math.abs(current - fragment.clipBegin) > REGION_EPSILON) {
          wavesurfer.current.seekTo(fragment.clipBegin / duration);
        }
      }
    }
    highlightFragmentRegion(fragment);
  };

  // Expose seekToFragment for external use (does NOT call onFragmentSelect)
  const seekToFragment = (fragment: SMILFragment) => {
    setCurrentTime(fragment.clipBegin);
    if (wavesurfer.current) {
      const duration = wavesurfer.current.getDuration();
      if (duration > 0) {
        const current = wavesurfer.current.getCurrentTime();
        if (Math.abs(current - fragment.clipBegin) > REGION_EPSILON) {
          wavesurfer.current.seekTo(fragment.clipBegin / duration);
        }
      }
    }
    highlightFragmentRegion(fragment);
  };

  const selectedFragmentIndex = selectedFragment
    ? fragments.findIndex(f => f.id === selectedFragment.id)
    : -1;

  const handlePrevFragment = () => {
    if (selectedFragmentIndex > 0) {
      selectAndSeekFragment(fragments[selectedFragmentIndex - 1]);
    }
  };

  const handleNextFragment = () => {
    if (selectedFragmentIndex !== -1 && selectedFragmentIndex < fragments.length - 1) {
      selectAndSeekFragment(fragments[selectedFragmentIndex + 1]);
    }
  };

  const handleZoom = (level: number) => {
    const newZoom = Math.max(MIN_ZOOM, Math.min(level, MAX_ZOOM));
    setZoomLevel(newZoom);
    wavesurfer.current?.zoom(newZoom);
  };

  const togglePlayback = () => wavesurfer.current?.playPause();
  const stopPlayback = () => wavesurfer.current?.stop();

  // Expose togglePlayback and seekToFragment via useImperativeHandle
  useImperativeHandle(ref, () => ({
    togglePlayback,
    seekToFragment,
    prevFragment: handlePrevFragment,
    nextFragment: handleNextFragment,
  }));

  const handleApplyOffset = () => {
    const fromTime = parseTimeInput(offsetTime);
    const offsetSeconds = parseFloat(offsetValue);
    
    if (!isNaN(fromTime) && !isNaN(offsetSeconds)) {
      onApplyTimeOffset(fromTime, offsetSeconds);
      setShowOffsetDialog(false);
      setOffsetTime('');
      setOffsetValue('');
    }
  };

  const handleOffsetFromCursor = () => {
    setOffsetTime(formatTime(currentTime));
    setShowOffsetDialog(true);
  };

  // In the auto-selection effect, also highlight the region
  useEffect(() => {
    // Suppress auto-selection if user just clicked a region
    if (Date.now() < suppressAutoSelectUntil.current) return;
    let foundFragment: SMILFragment | null = null;
    for (const fragment of fragments) {
      if (
        currentTime > fragment.clipBegin - REGION_EPSILON &&
        currentTime < fragment.clipEnd - REGION_EPSILON
      ) {
        foundFragment = fragment;
        break;
      }
    }
    if (foundFragment) {
      onFragmentSelect(foundFragment);
      highlightFragmentRegion(foundFragment);
    } else {
      onFragmentSelect(null);
      highlightFragmentRegion(null);
    }
  }, [currentTime, fragments]);

  return (
    <div className="h-full flex flex-col bg-white border rounded-lg p-4 dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
            title={volume === 0 ? 'Unmute' : 'Mute'}
          >
            {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="volume-slider w-28 h-1.5 cursor-pointer"
            title="Volume"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button onClick={() => handleZoom(zoomLevel * 1.2)} className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600" title="Zoom In">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => handleZoom(zoomLevel / 1.2)} className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600" title="Zoom Out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={() => handleZoom(DEFAULT_ZOOM)} className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600" title="Reset Zoom">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={handleOffsetFromCursor} className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600" title="Apply Time Offset">
              <Clock className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowForceNonOverlapDialog(true)}
              className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
              title="Force non-overlapping segments"
            >
              <AlertTriangle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsSnapEnabled((value) => !value)}
              className={`p-2 rounded-lg transition-colors ${
                isSnapEnabled
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
                  : 'bg-red-200 text-red-700 hover:bg-red-300 dark:bg-red-700 dark:text-white dark:hover:bg-red-600'
              }`}
              title={isSnapEnabled ? 'Disable boundary snap' : 'Enable boundary snap'}
            >
              <Magnet className="w-4 h-4" />
            </button>
          </div>
          {/* Next/Previous Fragment Buttons */}
          <div className="flex items-center gap-2">
            <button onClick={handlePrevFragment} className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600" title="Previous Fragment" disabled={selectedFragmentIndex <= 0}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={handleNextFragment} className="p-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600" title="Next Fragment" disabled={selectedFragmentIndex === -1 || selectedFragmentIndex >= fragments.length - 1}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-300 tabular-nums inline-block text-right min-w-[6rem]">
            {formatTime(currentTime)} / {formatTime(wavesurfer.current?.getDuration() || 0)}
          </span>
          <div className="flex gap-2">
            <button onClick={togglePlayback} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors dark:bg-blue-800 dark:hover:bg-blue-700" title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button onClick={stopPlayback} className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors dark:bg-gray-700 dark:hover:bg-gray-600" title="Stop">
              <Square className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative w-full flex-1 min-h-[50px]">
        <div 
          ref={waveformRef} 
          className="w-full h-full waveform-scroll" 
          style={{ 
            minHeight: '100%', 
            position: 'relative',
            overflowX: 'auto',
            overflowY: 'hidden'
          }}
        />
        {isWaveformLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded">
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin"></div>
              <span className="text-sm">Loading waveform...</span>
            </div>
          </div>
        )}
      </div>

      {/* Time Offset Dialog */}
      {showOffsetDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 dark:bg-gray-800">
            <h3 className="text-lg font-semibold mb-4 dark:text-white">Apply Time Offset</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  From Time (mm:ss)
                </label>
                <input
                  type="text"
                  value={offsetTime}
                  onChange={(e) => setOffsetTime(e.target.value)}
                  placeholder="1:23"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Offset (seconds, can be negative)
                </label>
                <input
                  type="text"
                  value={offsetValue}
                  onChange={(e) => setOffsetValue(e.target.value)}
                  placeholder="-2.5 or +1.2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                This will shift all fragments starting from the specified time by the offset amount.
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowOffsetDialog(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyOffset}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 dark:bg-blue-800 dark:hover:bg-blue-700"
                >
                  Apply Offset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForceNonOverlapDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 dark:bg-gray-800">
            <h3 className="text-lg font-semibold mb-3 dark:text-white">Force Align to Text Sequence</h3>
            <div className="text-sm text-gray-600 dark:text-gray-300 mb-5 space-y-2">
              <p>
                This rewrites all fragment timings to match the chapter text order exactly.
              </p>
              <p>
                It creates continuous coverage from 0:00 to the end of the audio with no gaps and no overlaps.
              </p>
              <p className="font-medium text-red-600 dark:text-red-400">
                Warning: existing manual timings will be replaced.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowForceNonOverlapDialog(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onForceNonOverlapping(wavesurfer.current?.getDuration() || 0);
                  setShowForceNonOverlapDialog(false);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
              >
                Force Align
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
});