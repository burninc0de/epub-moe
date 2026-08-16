import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { Play, Pause, Square, ZoomIn, ZoomOut, RotateCcw, Clock, Magnet, AlertTriangle, ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import { SMILFragment } from '../types/epub';
import { formatTime, parseTimeInput } from '../utils/time';
import { Button, IconButton, FieldLabel, TextInput, ToolbarDivider, Modal } from './ui';

const REGION_EPSILON = 0.01; // 10ms tolerance for floating point imprecision
const VOLUME_KEY = 'waveformVolume';
const ZOOM_LEVEL_KEY = 'waveformZoom';
const DEFAULT_VOLUME = 1;

export type RegionColorStyle = 'modern' | 'classic';

const REGION_COLORS: Record<RegionColorStyle, { unselected: string; selected: string }> = {
  modern: { unselected: 'rgba(96, 165, 250, 0.12)', selected: 'rgba(59, 130, 246, 0.3)' },
  classic: { unselected: 'rgba(16, 185, 129, 0.2)', selected: 'rgba(96, 165, 250, 0.3)' },
};

interface WaveformViewerProps {
  audioBlob: Blob;
  fragments: SMILFragment[];
  onFragmentSelect: (fragment: SMILFragment | null) => void;
  selectedFragment: SMILFragment | null;
  onFragmentUpdate: (fragmentId: string, updates: Partial<SMILFragment>) => void;
  onApplyTimeOffset: (fromTime: number, offsetSeconds: number) => void;
  onForceNonOverlapping: (audioDuration: number) => void;
  regionColorStyle?: RegionColorStyle;
}

const MIN_ZOOM = 10;
const DEFAULT_ZOOM = 20;
const MAX_ZOOM = 200;

const EQ_BAR_COUNT = 13;

const useEqLevels = (count: number, intervalMs: number, active: boolean) => {
  const [levels, setLevels] = useState(() => new Array(count).fill(0.08));

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const freqs = [1 + Math.random() * 2, 2 + Math.random() * 3];
      const phases = [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2];
      setLevels(
        Array.from({ length: count }, (_, i) => {
          const t = i / (count - 1);
          const envelope = Math.sin(t * Math.PI);
          let v = 0;
          freqs.forEach((f, k) => { v += Math.sin(t * f * Math.PI + phases[k]); });
          v = Math.abs(v) / freqs.length;
          return 0.08 + v * envelope * 0.9;
        })
      );
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [count, intervalMs, active]);

  return levels;
};

export interface WaveformViewerHandles {
  togglePlayback: () => void;
  seekToFragment: (fragment: SMILFragment) => void;
  prevFragment: () => void;
  nextFragment: () => void;
  replayFragment: () => void;
}

export const WaveformViewer = forwardRef<WaveformViewerHandles, WaveformViewerProps>(({
  audioBlob,
  fragments,
  onFragmentSelect,
  selectedFragment,
  onFragmentUpdate,
  onApplyTimeOffset,
  onForceNonOverlapping,
  regionColorStyle = 'modern',
}, ref) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const fragmentsRef = useRef<SMILFragment[]>(fragments);
  useEffect(() => { fragmentsRef.current = fragments; }, [fragments]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(() => {
    const stored = parseInt(localStorage.getItem(ZOOM_LEVEL_KEY) ?? '', 10);
    if (!Number.isFinite(stored)) return DEFAULT_ZOOM;
    return Math.max(MIN_ZOOM, Math.min(stored, MAX_ZOOM));
  });
  const [isDragging, setIsDragging] = useState(false);
  const [draggedRegionId, setDraggedRegionId] = useState<string | null>(null);
  const [showOffsetDialog, setShowOffsetDialog] = useState(false);
  const [offsetTime, setOffsetTime] = useState('');
  const [offsetValue, setOffsetValue] = useState('');
  const [isWaveformLoading, setIsWaveformLoading] = useState(true);
  const eqLevels = useEqLevels(EQ_BAR_COUNT, 120, isWaveformLoading);
  const [isSnapEnabled, setIsSnapEnabled] = useState(true);
  const [showForceNonOverlapDialog, setShowForceNonOverlapDialog] = useState(false);
  const [volume, setVolume] = useState<number>(() => {
    const stored = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
    if (!Number.isFinite(stored)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, stored));
  });
  const lastVolumeRef = useRef<number>(DEFAULT_VOLUME);
  const audioUrlRef = useRef<string | null>(null);
  const zoomLevelRef = useRef(zoomLevel);
  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  useEffect(() => {
    localStorage.setItem(ZOOM_LEVEL_KEY, String(zoomLevel));
  }, [zoomLevel]);

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
      const colors = REGION_COLORS[regionColorStyle];

      if (existingRegion) {
        // Update existing region
        existingRegion.setOptions({
          start: fragment.clipBegin,
          end: fragment.clipEnd,
          color: isSelected ? colors.selected : colors.unselected,
        });
      } else {
        // Add new region - create region options once
        regions.addRegion({
          start: fragment.clipBegin,
          end: fragment.clipEnd,
          color: isSelected ? colors.selected : colors.unselected,
          drag: true,
          resize: true,
          id: fragment.id,
        });
      }
    });
  }, [fragments, selectedFragment, regionColorStyle]);

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
    ws.load(audioUrl).catch((err: Error) => {
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

    const updateRegionVisual = (id: string, opts: { start?: number, end?: number }) => {
      const regions = regionsPluginRef.current?.getRegions();
      const r = regions?.find(r => r.id === id);
      if (r && typeof r.setOptions === 'function') {
        r.setOptions(opts);
      }
    };

    // Sync a region's data into state, keeping neighbor boundaries contiguous when snap is on
    const syncRegionUpdate = (region: { id: string; start: number; end: number }) => {
      const idx = fragmentsRef.current.findIndex(f => f.id === region.id);
      if (idx === -1) return false;

      const prevFragment = fragmentsRef.current[idx];
      const prevStart = prevFragment.clipBegin;
      const prevEnd = prevFragment.clipEnd;

      onFragmentUpdateRef.current(region.id, { clipBegin: region.start, clipEnd: region.end });
      fragmentsRef.current[idx].clipBegin = region.start;
      fragmentsRef.current[idx].clipEnd = region.end;

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

      return true;
    };

    regionsPluginRef.current.on('region-updated', (region) => {
      // During drag, only update visually - don't trigger parent state updates
      if (isDragging && draggedRegionId === region.id) {
        return;
      }

      // This is for programmatic updates or clicks - handle normally
      if (!syncRegionUpdate(region)) {
        onFragmentUpdateRef.current(region.id, { clipBegin: region.start, clipEnd: region.end });
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
    const dragStartPositions: { [key: string]: { start: number, end: number } } = {};
    regionsPluginRef.current.on('region-update', (region) => {
      if (!dragStartPositions[region.id]) {
        // Drag started
        dragStartPositions[region.id] = { start: region.start, end: region.end };
        setIsDragging(true);
        setDraggedRegionId(region.id);
      }
    });

    regionsPluginRef.current.on('region-updated', (region) => {
      // Drag ended - now update parent state
      if (dragStartPositions[region.id]) {
        delete dragStartPositions[region.id];
        setIsDragging(false);
        setDraggedRegionId(null);

        // On drag end, update the parent state with final positions
        syncRegionUpdate(region);
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

  const suppressAutoSelectUntil = useRef<number>(0); // Suppress auto-selection after manual click

  useEffect(() => {
    drawFragments();
  }, [drawFragments]);

  useEffect(() => {
    const container = waveformRef.current;
    if (!container) return;

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
      zoomLevelRef.current = Math.max(MIN_ZOOM, Math.min(zoomLevelRef.current + zoomDelta, MAX_ZOOM));

      // Update WaveSurfer zoom with smart throttling - more frequent during rapid scrolling
      const timeSinceLastZoom = now - lastZoomUpdate;
      const shouldUpdate = timeSinceLastZoom > 32 || // ~30fps minimum
                           (timeSinceLastZoom > 16 && Math.abs(zoomDelta) > 1); // Faster for large changes

      if (shouldUpdate) {
        wavesurfer.current?.zoom(zoomLevelRef.current);
        lastZoomUpdate = now;
      }

      // Throttle React state updates to prevent excessive re-renders
      if (now - lastStateUpdate > STATE_UPDATE_THROTTLE) {
        setZoomLevel(zoomLevelRef.current);
        lastStateUpdate = now;
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Helper to highlight the selected region in the waveform
  const highlightFragmentRegion = useCallback((fragment: SMILFragment | null) => {
    const regions = regionsPluginRef.current;
    if (regions && typeof regions.getRegions === 'function') {
      const allRegions = regions.getRegions(); // array of regions
      const colors = REGION_COLORS[regionColorStyle];
      allRegions.forEach(region => {
        if (region && typeof region.setOptions === 'function') {
          region.setOptions({ color: colors.unselected });
        }
      });
      if (fragment) {
        const selectedRegion = allRegions.find(region => region.id === fragment.id);
        if (selectedRegion && typeof selectedRegion.setOptions === 'function') {
          selectedRegion.setOptions({ color: colors.selected });
        }
      }
    }
  }, [regionColorStyle]);

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

  const handleReplayFragment = () => {
    if (!selectedFragment) return;
    seekToFragment(selectedFragment);
    wavesurfer.current?.play();
  };

  // Expose togglePlayback and seekToFragment via useImperativeHandle
  useImperativeHandle(ref, () => ({
    togglePlayback,
    seekToFragment,
    prevFragment: handlePrevFragment,
    nextFragment: handleNextFragment,
    replayFragment: handleReplayFragment,
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
    for (const fragment of fragmentsRef.current) {
      if (
        currentTime > fragment.clipBegin - REGION_EPSILON &&
        currentTime < fragment.clipEnd - REGION_EPSILON
      ) {
        foundFragment = fragment;
        break;
      }
    }
    if (foundFragment) {
      onFragmentSelectRef.current(foundFragment);
      highlightFragmentRegion(foundFragment);
    } else {
      onFragmentSelectRef.current(null);
      highlightFragmentRegion(null);
    }
  }, [currentTime, highlightFragmentRegion]);

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="h-11 flex-shrink-0 flex items-center justify-between gap-2 px-3 border-t border-b border-line">
        <div className="flex items-center gap-2">
          <IconButton
            onClick={toggleMute}
            title={volume === 0 ? 'Unmute' : 'Mute'}
          >
            {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </IconButton>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            onPointerUp={(e) => e.currentTarget.blur()}
            className="volume-slider w-24 cursor-pointer"
            title="Volume"
          />
        </div>
        <div className="flex items-center">
          <div className="flex items-center gap-1">
            <IconButton onClick={() => handleZoom(zoomLevel * 1.2)} title="Zoom In">
              <ZoomIn className="w-4 h-4" />
            </IconButton>
            <IconButton onClick={() => handleZoom(zoomLevel / 1.2)} title="Zoom Out">
              <ZoomOut className="w-4 h-4" />
            </IconButton>
            <IconButton onClick={() => handleZoom(DEFAULT_ZOOM)} title="Reset Zoom">
              <RotateCcw className="w-4 h-4" />
            </IconButton>
          </div>
          <ToolbarDivider />
          <div className="flex items-center gap-1">
            <IconButton onClick={handleOffsetFromCursor} title="Apply Time Offset">
              <Clock className="w-4 h-4" />
            </IconButton>
            <IconButton
              onClick={() => setShowForceNonOverlapDialog(true)}
              title="Force non-overlapping segments"
            >
              <AlertTriangle className="w-4 h-4" />
            </IconButton>
            <IconButton
              onClick={() => setIsSnapEnabled((value) => !value)}
              active={!isSnapEnabled}
              activeClassName="bg-red-500/15 text-red-400 hover:bg-red-500/25"
              title={isSnapEnabled ? 'Disable boundary snap' : 'Enable boundary snap'}
            >
              <Magnet className="w-4 h-4" />
            </IconButton>
          </div>
          <ToolbarDivider />
          <div className="flex items-center gap-1">
            <IconButton onClick={handlePrevFragment} title="Previous Fragment" disabled={selectedFragmentIndex <= 0}>
              <ChevronLeft className="w-4 h-4" />
            </IconButton>
            <IconButton onClick={handleNextFragment} title="Next Fragment" disabled={selectedFragmentIndex === -1 || selectedFragmentIndex >= fragments.length - 1}>
              <ChevronRight className="w-4 h-4" />
            </IconButton>
          </div>
          <span className="text-xs text-gray-400 tabular-nums inline-block text-right min-w-[5.5rem] mx-2">
            {formatTime(currentTime)} / {formatTime(wavesurfer.current?.getDuration() || 0)}
          </span>
          <div className="flex items-center gap-1">
            <IconButton variant="primary" onClick={togglePlayback} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </IconButton>
            <IconButton onClick={stopPlayback} title="Stop">
              <Square className="w-4 h-4" />
            </IconButton>
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-panel">
            <div className="flex h-5 items-center gap-1">
              {eqLevels.map((level, i) => {
                const isEdge = i === 0 || i === eqLevels.length - 1;
                return (
                  <div
                    key={i}
                    className={isEdge ? 'eq-bar eq-bar-dot' : 'eq-bar'}
                    style={{ height: isEdge ? '3px' : `${4 + 16 * level}px` }}
                  />
                );
              })}
            </div>
            <span className="text-xs text-gray-500">Loading waveform...</span>
          </div>
        )}
      </div>

      {/* Time Offset Dialog */}
      {showOffsetDialog && (
        <Modal title="Apply Time Offset" onClose={() => setShowOffsetDialog(false)} className="max-w-sm">
          <div className="space-y-4">
            <div>
              <FieldLabel>From Time (mm:ss)</FieldLabel>
              <TextInput
                type="text"
                value={offsetTime}
                onChange={(e) => setOffsetTime(e.target.value)}
                placeholder="1:23"
              />
            </div>
            <div>
              <FieldLabel>Offset (seconds, can be negative)</FieldLabel>
              <TextInput
                type="text"
                value={offsetValue}
                onChange={(e) => setOffsetValue(e.target.value)}
                placeholder="-2.5 or +1.2"
              />
            </div>
            <div className="text-xs text-gray-500">
              This will shift all fragments starting from the specified time by the offset amount.
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowOffsetDialog(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleApplyOffset}>
                Apply Offset
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showForceNonOverlapDialog && (
        <Modal title="Force Align to Text Sequence" onClose={() => setShowForceNonOverlapDialog(false)} className="max-w-sm">
          <div className="text-sm text-gray-400 mb-5 space-y-2">
            <p>
              This rewrites all fragment timings to match the chapter text order exactly.
            </p>
            <p>
              It creates continuous coverage from 0:00 to the end of the audio with no gaps and no overlaps.
            </p>
            <p className="font-medium text-red-400">
              Warning: existing manual timings will be replaced.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowForceNonOverlapDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onForceNonOverlapping(wavesurfer.current?.getDuration() || 0);
                setShowForceNonOverlapDialog(false);
              }}
            >
              Force Align
            </Button>
          </div>
        </Modal>
      )}

    </div>
  );
});
