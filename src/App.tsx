import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { ChapterList } from './components/ChapterList';
import { ContentViewer } from './components/ContentViewer';
import { WaveformViewer, WaveformViewerHandles } from './components/WaveformViewer';
import { FragmentEditor } from './components/FragmentEditor';
import { SettingsPanel } from './components/SettingsPanel';
import { useEPUBEditor } from './hooks/useEPUBEditor';
import { Resizer } from './components/Resizer';
import { FragmentSpacing, isValidFragmentSpacing } from './types/epub';
import { Upload, Loader2, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose, Feather, Settings } from 'lucide-react';
import { Button, IconButton, Modal } from './components/ui';
import { DEFAULT_CODE_THEME_ID } from './utils/codeThemes';
import { RegionColorStyle } from './components/WaveformViewer';

declare const __AUTO_LOAD_EPUB__: string;

const WAVEFORM_HEIGHT_KEY = 'waveformHeight';
const AUTO_FOLLOW_KEY = 'autoFollow';
const FRAGMENT_SPACING_KEY = 'fragmentSpacing';
const ONLY_AUDIO_CHAPTERS_KEY = 'onlyAudioChapters';
const LEFT_PANEL_COLLAPSED_KEY = 'leftPanelCollapsed';
const RIGHT_PANEL_COLLAPSED_KEY = 'rightPanelCollapsed';
const CODE_THEME_KEY = 'codeTheme';
const REGION_COLOR_STYLE_KEY = 'regionColorStyle';
const STATUS_BAR_KEY = 'statusBar';
const MIN_WAVEFORM_HEIGHT = 192;
const MIN_TOP_SECTION_HEIGHT = 100;
const RESIZER_HEIGHT = 8;

const clampWaveformHeight = (desired: number) => {
  return Math.max(MIN_WAVEFORM_HEIGHT, Math.min(desired, window.innerHeight - RESIZER_HEIGHT - MIN_TOP_SECTION_HEIGHT));
};

const App: React.FC = () => {
  const [leftPanelWidth, setLeftPanelWidth] = useState(250);
  const [rightPanelWidth, setRightPanelWidth] = useState(350);
  const [waveformHeight, setWaveformHeight] = useState(() => {
    const stored = localStorage.getItem(WAVEFORM_HEIGHT_KEY);
    return stored ? clampWaveformHeight(parseInt(stored, 10)) : clampWaveformHeight(245);
  });
  const [isCutToolActive, setIsCutToolActive] = useState(false);
  const [isCutToolSticky, setIsCutToolSticky] = useState(false);
  const [isHtmlEditMode, setIsHtmlEditMode] = useState(false);
  const [isBlockDisplay, setIsBlockDisplay] = useState(true);
  const [isLoadingExport, setIsLoadingExport] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(() => localStorage.getItem(RIGHT_PANEL_COLLAPSED_KEY) === 'true');
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(() => localStorage.getItem(LEFT_PANEL_COLLAPSED_KEY) === 'true');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showReloadWarning, setShowReloadWarning] = useState(false);
  const [autoFollow, setAutoFollow] = useState(() => localStorage.getItem(AUTO_FOLLOW_KEY) !== 'false');
  const [onlyAudioChapters, setOnlyAudioChapters] = useState(() => localStorage.getItem(ONLY_AUDIO_CHAPTERS_KEY) === 'true');
  const [fragmentSpacing, setFragmentSpacing] = useState<FragmentSpacing>(() => {
    const stored = localStorage.getItem(FRAGMENT_SPACING_KEY);
    return isValidFragmentSpacing(stored) ? stored : 'default';
  });
  const [codeThemeId, setCodeThemeId] = useState<string>(() => {
    const stored = localStorage.getItem(CODE_THEME_KEY);
    return stored || DEFAULT_CODE_THEME_ID;
  });
  const [regionColorStyle, setRegionColorStyle] = useState<RegionColorStyle>(() => {
    const stored = localStorage.getItem(REGION_COLOR_STYLE_KEY);
    return stored === 'classic' ? 'classic' : 'modern';
  });
  const [showStatusBar, setShowStatusBar] = useState(() => localStorage.getItem(STATUS_BAR_KEY) !== 'false');
  const savedRightPanelWidth = useRef(rightPanelWidth);
  const savedLeftPanelWidth = useRef(leftPanelWidth);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const startResizing = useCallback((
    e: React.PointerEvent,
    direction: 'horizontal' | 'vertical',
    side: 'left' | 'right' | 'bottom'
  ) => {
    e.preventDefault();

    const handlePointerMove = (event: PointerEvent) => {
      if (direction === 'horizontal') {
        if (side === 'left') {
          setLeftPanelWidth(Math.max(100, event.clientX));
        } else { // right
          setRightPanelWidth(Math.max(225, window.innerWidth - event.clientX));
        }
      } else { // vertical
        const newHeight = clampWaveformHeight(window.innerHeight - event.clientY);
        setWaveformHeight(newHeight);
        localStorage.setItem(WAVEFORM_HEIGHT_KEY, String(newHeight));
      }
    };

    const handlePointerUp = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, []);

  const waveformViewerRef = useRef<WaveformViewerHandles>(null);

  const toggleCutToolSticky = useCallback(() => {
    setIsCutToolSticky((prev) => {
      const next = !prev;
      if (next) {
        setIsCutToolActive(true);
      } else {
        setIsCutToolActive(false);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setWaveformHeight((prev) => clampWaveformHeight(prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const {
    epubData,
    selectedChapter,
    selectedFragment,
    isLoading,
    error,
    loadEPUB,
    setSelectedChapter,
    setSelectedFragment,
    updateFragment,
    deleteFragment,
    splitFragment,
    addFragment,
    splitFragmentByText,
    nudgeFragmentStart,
    nudgeFragmentEnd,
    applyTimeOffset,
    forceNonOverlappingFragments,
    getCurrentChapter,
    getCurrentFragments,
    currentAudioBlob,
    exportEPUB,
    setEpubData,
  } = useEPUBEditor();

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.epub')) {
      loadEPUB(file);
    }
  }, [loadEPUB]);

  const handleLoadNewFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleExportEPUB = useCallback(async () => {
    setIsLoadingExport(true);
    try {
      await exportEPUB();
    } finally {
      setIsLoadingExport(false);
    }
  }, [exportEPUB]);

  // Global hotkey for Spacebar, arrows, and other shortcuts
  useEffect(() => {
    const isInputField = (element: Element | null): boolean => {
      if (!element) return false;
      const tag = element.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (element as HTMLElement).isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'F5' || ((event.ctrlKey || event.metaKey) && event.code === 'KeyR')) {
        event.preventDefault();
        setShowReloadWarning(true);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
        event.preventDefault();
        if (!isLoadingExport) handleExportEPUB();
        return;
      }

      if (isHtmlEditMode) return;

      const active = document.activeElement;
      const isRangeInput = active instanceof HTMLInputElement && active.type === 'range';
      if (isInputField(active) && !isRangeInput) return;

      if (event.code === 'KeyX') {
        toggleCutToolSticky();
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault(); // Prevent default spacebar behavior (e.g., scrolling, slider activation)
        // Drop focus from a focused slider so it doesn't keep an ugly highlight
        if (isRangeInput) (active as HTMLInputElement).blur();
        if (waveformViewerRef.current) {
          waveformViewerRef.current.togglePlayback();
        }
      } else if (event.code === 'ArrowLeft') {
        if (event.ctrlKey && event.shiftKey) {
          event.preventDefault();
          if (isRangeInput) (active as HTMLInputElement).blur();
          if (selectedFragment) nudgeFragmentEnd(selectedFragment.id, -0.05);
          return;
        }
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (isRangeInput) (active as HTMLInputElement).blur();
          if (selectedFragment) nudgeFragmentStart(selectedFragment.id, -0.05);
          return;
        }
        if (isRangeInput) (active as HTMLInputElement).blur();
        waveformViewerRef.current?.prevFragment();
      } else if (event.code === 'ArrowRight') {
        if (event.ctrlKey && event.shiftKey) {
          event.preventDefault();
          if (isRangeInput) (active as HTMLInputElement).blur();
          if (selectedFragment) nudgeFragmentEnd(selectedFragment.id, 0.05);
          return;
        }
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          if (isRangeInput) (active as HTMLInputElement).blur();
          if (selectedFragment) nudgeFragmentStart(selectedFragment.id, 0.05);
          return;
        }
        if (isRangeInput) (active as HTMLInputElement).blur();
        waveformViewerRef.current?.nextFragment();
      } else if (event.code === 'KeyR') {
        waveformViewerRef.current?.replayFragment();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHtmlEditMode, toggleCutToolSticky, handleExportEPUB, isLoadingExport, nudgeFragmentStart, nudgeFragmentEnd, selectedFragment]);

  const handleAutoFollowChange = useCallback((value: boolean) => {
    setAutoFollow(value);
    localStorage.setItem(AUTO_FOLLOW_KEY, String(value));
  }, []);

  const handleFragmentSpacingChange = useCallback((value: FragmentSpacing) => {
    setFragmentSpacing(value);
    localStorage.setItem(FRAGMENT_SPACING_KEY, value);
  }, []);

  const handleOnlyAudioChaptersChange = useCallback((value: boolean) => {
    setOnlyAudioChapters(value);
    localStorage.setItem(ONLY_AUDIO_CHAPTERS_KEY, String(value));
  }, []);

  const handleCodeThemeChange = useCallback((value: string) => {
    setCodeThemeId(value);
    localStorage.setItem(CODE_THEME_KEY, value);
  }, []);

  const handleRegionColorStyleChange = useCallback((value: RegionColorStyle) => {
    setRegionColorStyle(value);
    localStorage.setItem(REGION_COLOR_STYLE_KEY, value);
  }, []);

  const handleShowStatusBarChange = useCallback((value: boolean) => {
    setShowStatusBar(value);
    localStorage.setItem(STATUS_BAR_KEY, String(value));
  }, []);

  useEffect(() => {
    const path = __AUTO_LOAD_EPUB__;
    if (!path || epubData) return;

    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(path, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const filename = path.split('/').pop() || 'auto.epub';
        const file = new File([blob], filename, { type: 'application/epub+zip' });
        loadEPUB(file);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('Auto-load failed:', err);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center p-8">
        <div className="bg-panel border border-line rounded-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-red-400">⚠</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-100 mb-2">Error Loading EPUB</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <Button variant="primary" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!epubData) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <FileUpload onFileSelect={loadEPUB} isLoading={isLoading} />
      </div>
    );
  }

  const currentChapter = getCurrentChapter();
  const fragments = getCurrentFragments();
  const audioBlob = currentAudioBlob;

  return (
    <div className="h-screen flex flex-col bg-base text-gray-100 overflow-hidden">
      {/* Loading overlay */}
      {isLoading && (
        <Modal title="Loading EPUB">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400 flex-shrink-0" />
            <p className="text-sm text-gray-400">Processing your file...</p>
          </div>
        </Modal>
      )}

      {/* Top bar: full width above all columns */}
      <div className="h-11 flex-shrink-0 flex items-center justify-between gap-2 px-3 bg-panel border-b border-line">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center justify-center w-6 h-6 bg-blue-500/15 rounded-md">
            <Feather className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-sm font-semibold text-gray-100">epub-moe</span>
          <IconButton
            onClick={() => {
              if (isLeftPanelCollapsed) {
                setLeftPanelWidth(savedLeftPanelWidth.current);
                setIsLeftPanelCollapsed(false);
                localStorage.setItem(LEFT_PANEL_COLLAPSED_KEY, 'false');
              } else {
                savedLeftPanelWidth.current = leftPanelWidth;
                setIsLeftPanelCollapsed(true);
                localStorage.setItem(LEFT_PANEL_COLLAPSED_KEY, 'true');
              }
            }}
            title={isLeftPanelCollapsed ? 'Expand Chapter List' : 'Collapse Chapter List'}
          >
            {isLeftPanelCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </IconButton>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            onClick={handleLoadNewFile}
            disabled={isLoading}
            title="Load new EPUB"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          </IconButton>
          <IconButton
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            active={isSettingsOpen}
            title="Settings"
          >
            <Settings size={16} />
          </IconButton>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportEPUB}
            disabled={isLoadingExport}
            className="ml-1"
            title="Export EPUB (Ctrl+S)"
          >
            {isLoadingExport ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <span>Export EPUB</span>
            )}
          </Button>
          <IconButton
            onClick={() => {
              if (isRightPanelCollapsed) {
                setRightPanelWidth(savedRightPanelWidth.current);
                setIsRightPanelCollapsed(false);
                localStorage.setItem(RIGHT_PANEL_COLLAPSED_KEY, 'false');
              } else {
                savedRightPanelWidth.current = rightPanelWidth;
                setIsRightPanelCollapsed(true);
                localStorage.setItem(RIGHT_PANEL_COLLAPSED_KEY, 'true');
              }
            }}
            title={isRightPanelCollapsed ? 'Expand Fragment Editor' : 'Collapse Fragment Editor'}
            className="ml-1"
          >
            {isRightPanelCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </IconButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      </div>

      {/* Top section: Three columns */}
      <div className="flex-1 flex min-h-0">
        {/* Left Column (ChapterList) */}
        {!isLeftPanelCollapsed && (
          <>
            <div style={{ width: leftPanelWidth }} className="flex-shrink-0 h-full flex flex-col">
              <ChapterList
                title={epubData.title}
                chapters={epubData.chapters}
                selectedChapter={selectedChapter}
                onChapterSelect={setSelectedChapter}
                onlyAudioChapters={onlyAudioChapters}
              />
            </div>

            <Resizer onPointerDown={(e) => startResizing(e, 'horizontal', 'left')} />
          </>
        )}

        {/* Middle Column (ContentViewer) */}
        <div className="flex-1 flex flex-col min-w-0">
          <ContentViewer
              chapter={currentChapter}
              fragments={fragments}
              selectedFragment={selectedFragment}
              onFragmentSelect={(fragment) => {
                setSelectedFragment(fragment);
                if (waveformViewerRef.current && fragment) {
                  waveformViewerRef.current.seekToFragment(fragment);
                }
              }}
              isCutToolActive={isCutToolActive}
              setIsCutToolActive={setIsCutToolActive}
              isCutToolSticky={isCutToolSticky}
              setIsCutToolSticky={setIsCutToolSticky}
              onFragmentSplitByText={splitFragmentByText}
              onHtmlUpdate={(newHtml: string) => {
                if (!currentChapter) return;
                setEpubData((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    chapters: prev.chapters.map((c) =>
                      c.id === currentChapter.id ? { ...c, content: newHtml } : c
                    )
                  };
                });
              }}
              isHtmlEditMode={isHtmlEditMode}
              setIsHtmlEditMode={setIsHtmlEditMode}
              isBlockDisplay={isBlockDisplay}
              setIsBlockDisplay={setIsBlockDisplay}
              autoFollow={autoFollow}
              fragmentSpacing={fragmentSpacing}
              codeThemeId={codeThemeId}
              showStatusBar={showStatusBar}
            />
        </div>

        {!isRightPanelCollapsed && (
          <>
            <Resizer onPointerDown={(e) => startResizing(e, 'horizontal', 'right')} />
            <div style={{ width: rightPanelWidth }} className="flex-shrink-0 h-full overflow-auto bg-panel">
              <FragmentEditor
                selectedFragment={selectedFragment}
                onFragmentUpdate={updateFragment}
                onFragmentDelete={deleteFragment}
                onFragmentSplit={splitFragment}
                onFragmentAdd={addFragment}
              />
            </div>
          </>
        )}
      </div>

      {/* Resizer and Bottom section */}
      {audioBlob && (
        <>
          <Resizer onPointerDown={(e) => startResizing(e, 'vertical', 'bottom')} direction="vertical" />
          <div style={{ height: waveformHeight }} className="w-full flex-shrink-0">
            <WaveformViewer
              ref={waveformViewerRef} // Attach the ref to WaveformViewer
              audioBlob={audioBlob}
              fragments={fragments}
              onFragmentSelect={setSelectedFragment}
              selectedFragment={selectedFragment}
              onFragmentUpdate={updateFragment}
              onApplyTimeOffset={applyTimeOffset}
              onForceNonOverlapping={(audioDuration) => forceNonOverlappingFragments(audioDuration)}
              regionColorStyle={regionColorStyle}
            />
          </div>
        </>
      )}

      {isSettingsOpen && (
        <Modal title="Settings" onClose={() => setIsSettingsOpen(false)} className="max-w-lg">
          <SettingsPanel
            autoFollow={autoFollow}
            onAutoFollowChange={handleAutoFollowChange}
            fragmentSpacing={fragmentSpacing}
            onFragmentSpacingChange={handleFragmentSpacingChange}
            onlyAudioChapters={onlyAudioChapters}
            onOnlyAudioChaptersChange={handleOnlyAudioChaptersChange}
            codeThemeId={codeThemeId}
            onCodeThemeChange={handleCodeThemeChange}
            regionColorStyle={regionColorStyle}
            onRegionColorStyleChange={handleRegionColorStyleChange}
            showStatusBar={showStatusBar}
            onShowStatusBarChange={handleShowStatusBarChange}
          />
        </Modal>
      )}

      {showReloadWarning && (
        <Modal title="Are you sure?" onClose={() => setShowReloadWarning(false)} className="max-w-sm">
          <div className="text-sm text-gray-400 mb-5">
            You may lose unexported work. Reload anyway?
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowReloadWarning(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default App;
