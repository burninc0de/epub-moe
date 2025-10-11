import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { ChapterList } from './components/ChapterList';
import { ContentViewer } from './components/ContentViewer';
import { WaveformViewer, WaveformViewerHandles } from './components/WaveformViewer';
import { FragmentEditor } from './components/FragmentEditor';
import { useEPUBEditor } from './hooks/useEPUBEditor';
import { Resizer } from './components/Resizer';
import { Upload, Loader2 } from 'lucide-react';

const WAVEFORM_HEIGHT_KEY = 'waveformHeight';
const App: React.FC = () => {
  const [leftPanelWidth, setLeftPanelWidth] = useState(250);
  const [rightPanelWidth, setRightPanelWidth] = useState(350);
  const [waveformHeight, setWaveformHeight] = useState(() => {
    const stored = localStorage.getItem(WAVEFORM_HEIGHT_KEY);
    return stored ? parseInt(stored, 10) : 200;
  });
  const [isCutToolActive, setIsCutToolActive] = useState(false);
  const [isHtmlEditMode, setIsHtmlEditMode] = useState(false);
  const [isBlockDisplay, setIsBlockDisplay] = useState(true);
  const [isLoadingExport, setIsLoadingExport] = useState(false); // Export loading state

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
        const newHeight = Math.max(100, window.innerHeight - event.clientY);
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

  // Global hotkey for Spacebar
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isHtmlEditMode) {
        event.preventDefault(); // Prevent default spacebar behavior (e.g., scrolling)
        if (waveformViewerRef.current) {
          waveformViewerRef.current.togglePlayback();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHtmlEditMode]);

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

      {/* Top section: Three columns */}
      <div className="flex-1 flex min-h-0">
        {/* Left Column (ChapterList) */}
        <div style={{ width: leftPanelWidth }} className="flex-shrink-0 h-full flex flex-col">
  
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex gap-2">
              <button 
                onClick={handleLoadNewFile}
                disabled={isLoading}
                className="w-10 h-10 flex items-center justify-center bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-600 dark:hover:bg-gray-500"
                title="Load new EPUB"
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
              </button>
              <button 
                onClick={handleExportEPUB}
                disabled={isLoadingExport}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 dark:bg-blue-800 dark:hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                {isLoadingExport ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <span>Export EPUB</span>
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
          <ChapterList
            chapters={epubData.chapters}
            selectedChapter={selectedChapter}
            onChapterSelect={setSelectedChapter}
          />
        </div>
        
        <Resizer onMouseDown={(e) => startResizing(e, 'horizontal', 'left')} />

        {/* Middle Column (ContentViewer) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto">
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
          </div>
        </div>

        <Resizer onMouseDown={(e) => startResizing(e, 'horizontal', 'right')} />

        {/* Right Column (FragmentEditor) */}
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
              viewerHeight={waveformHeight}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;