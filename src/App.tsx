import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { ChapterList } from './components/ChapterList';
import { ContentViewer } from './components/ContentViewer';
import { WaveformViewer, WaveformViewerHandles } from './components/WaveformViewer';
import { FragmentEditor } from './components/FragmentEditor';
import { SettingsPanel } from './components/SettingsPanel';
import { useEPUBEditor } from './hooks/useEPUBEditor';
import { Resizer } from './components/Resizer';
import { Upload, Loader2, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose, Feather, Settings } from 'lucide-react';

declare const __AUTO_LOAD_EPUB__: string;

const WAVEFORM_HEIGHT_KEY = 'waveformHeight';
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
  const [isHtmlEditMode, setIsHtmlEditMode] = useState(false);
  const [isBlockDisplay, setIsBlockDisplay] = useState(true);
  const [isLoadingExport, setIsLoadingExport] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const savedRightPanelWidth = useRef(rightPanelWidth);
  const savedLeftPanelWidth = useRef(leftPanelWidth);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const startResizing = useCallback((
    e: React.MouseEvent,
    direction: 'horizontal' | 'vertical',
    side: 'left' | 'right' | 'bottom'
  ) => {
    e.preventDefault();

    const handleMouseMove = (event: MouseEvent) => {
      if (direction === 'horizontal') {
        if (side === 'left') {
          setLeftPanelWidth(Math.max(100, event.clientX));
        } else { // right
          setRightPanelWidth(Math.max(100, window.innerWidth - event.clientX));
        }
      } else { // vertical
        const newHeight = clampWaveformHeight(window.innerHeight - event.clientY);
        setWaveformHeight(newHeight);
        localStorage.setItem(WAVEFORM_HEIGHT_KEY, String(newHeight));
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const waveformViewerRef = useRef<WaveformViewerHandles>(null);

  // Global hotkey for Spacebar and arrow keys
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
      if (isHtmlEditMode) return;
      if (isInputField(document.activeElement)) return;

      if (event.code === 'Space') {
        event.preventDefault(); // Prevent default spacebar behavior (e.g., scrolling)
        if (waveformViewerRef.current) {
          waveformViewerRef.current.togglePlayback();
        }
      } else if (event.code === 'ArrowLeft') {
        waveformViewerRef.current?.prevFragment();
      } else if (event.code === 'ArrowRight') {
        waveformViewerRef.current?.nextFragment();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHtmlEditMode]);

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
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-8 dark:bg-gray-900">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center dark:bg-gray-800">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-red-900">
            <span className="text-2xl text-red-600 dark:text-red-400">⚠</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2 dark:text-white">Error Loading EPUB</h2>
          <p className="text-gray-600 mb-4 dark:text-gray-300">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors dark:bg-blue-800 dark:hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!epubData) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center dark:bg-gray-900">
        <FileUpload onFileSelect={loadEPUB} isLoading={isLoading} />
      </div>
    );
  }

  const currentChapter = getCurrentChapter();
  const fragments = getCurrentFragments();
  const audioBlob = currentAudioBlob;

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 dark:text-white overflow-hidden">
      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-sm w-full mx-4 text-center shadow-xl">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold mb-2 dark:text-white">Loading EPUB</h3>
            <p className="text-gray-600 dark:text-gray-300">Processing your file...</p>
          </div>
        </div>
      )}

      {/* Top bar: full width above all columns */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-2 py-1 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center justify-center w-7 h-7 bg-blue-100 rounded-full dark:bg-blue-900">
            <Feather className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="font-semibold text-gray-900 dark:text-white">epub-moe</span>
          <button
            onClick={() => {
              if (isLeftPanelCollapsed) {
                setLeftPanelWidth(savedLeftPanelWidth.current);
                setIsLeftPanelCollapsed(false);
              } else {
                savedLeftPanelWidth.current = leftPanelWidth;
                setIsLeftPanelCollapsed(true);
              }
            }}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title={isLeftPanelCollapsed ? 'Expand Chapter List' : 'Collapse Chapter List'}
          >
            {isLeftPanelCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLoadNewFile}
            disabled={isLoading}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Load new EPUB"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
          </button>
          <button
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            className={`p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors ${isSettingsOpen ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
            title="Settings"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={handleExportEPUB}
            disabled={isLoadingExport}
            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 dark:bg-blue-800 dark:hover:bg-blue-700"
          >
            {isLoadingExport ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Exporting...</span>
              </>
            ) : (
              <span>Export EPUB</span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epub"
            onChange={handleFileInput}
            className="hidden"
          />
          <button
            onClick={() => {
              if (isRightPanelCollapsed) {
                setRightPanelWidth(savedRightPanelWidth.current);
                setIsRightPanelCollapsed(false);
              } else {
                savedRightPanelWidth.current = rightPanelWidth;
                setIsRightPanelCollapsed(true);
              }
            }}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title={isRightPanelCollapsed ? 'Expand Fragment Editor' : 'Collapse Fragment Editor'}
          >
            {isRightPanelCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
          </button>
        </div>
      </div>

      {/* Top section: Three columns */}
      <div className="flex-1 flex min-h-0">
        {/* Left Column (ChapterList) */}
        {!isLeftPanelCollapsed && (
          <>
            <div style={{ width: leftPanelWidth }} className="flex-shrink-0 h-full flex flex-col">
              <ChapterList
                chapters={epubData.chapters}
                selectedChapter={selectedChapter}
                onChapterSelect={setSelectedChapter}
              />
            </div>

            <Resizer onMouseDown={(e) => startResizing(e, 'horizontal', 'left')} />
          </>
        )}

        {/* Middle Column (ContentViewer or Settings) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto">
            {isSettingsOpen ? (
              <SettingsPanel onClose={() => setIsSettingsOpen(false)} />
            ) : (
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
            />
            )}
          </div>
        </div>

        {!isRightPanelCollapsed && (
          <>
            <Resizer onMouseDown={(e) => startResizing(e, 'horizontal', 'right')} />
            <div style={{ width: rightPanelWidth }} className="flex-shrink-0 h-full overflow-auto dark:bg-gray-800">
              <FragmentEditor
                fragments={fragments}
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
          <Resizer onMouseDown={(e) => startResizing(e, 'vertical', 'bottom')} direction="vertical" />
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
              viewerHeight={waveformHeight}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
