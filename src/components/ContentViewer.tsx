import React, { useEffect, useRef, useState, useLayoutEffect, useCallback, lazy, Suspense } from 'react';
import './ContentViewer.css';
import { Scissors, AlignJustify, Text, Code, List } from 'lucide-react';
import { EPUBChapter, SMILFragment, FragmentSpacing, FRAGMENT_SPACING_CLASSES } from '../types/epub';
import { Button, IconButton } from './ui';
import { useZoomWheel, MIN_FONT_SCALE, MAX_FONT_SCALE } from '../hooks/useZoomWheel';

const HtmlEditor = lazy(() => import('./HtmlEditor'));

const FONT_SCALE_KEY = 'fontScale';

interface ContentViewerProps {  chapter: EPUBChapter | null;
  fragments: SMILFragment[];
  selectedFragment: SMILFragment | null;
  onFragmentSelect: (fragment: SMILFragment) => void;
  isCutToolActive: boolean;
  setIsCutToolActive: (isActive: boolean) => void;
  isCutToolSticky: boolean;
  setIsCutToolSticky: (isSticky: boolean) => void;
  onFragmentSplitByText: (fragmentId: string, splitIndex: number) => boolean;
  onHtmlUpdate?: (newHtml: string) => void;
  isHtmlEditMode: boolean;
  setIsHtmlEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  isBlockDisplay: boolean;
  setIsBlockDisplay: (isBlock: boolean) => void;
  autoFollow?: boolean;
  fragmentSpacing: FragmentSpacing;
  codeThemeId?: string | null;
  showStatusBar?: boolean;
}

export const ContentViewer: React.FC<ContentViewerProps> = ({
  chapter,
  fragments,
  selectedFragment,
  onFragmentSelect,
  isCutToolActive,
  setIsCutToolActive,
  isCutToolSticky,
  setIsCutToolSticky,
  onFragmentSplitByText,
  onHtmlUpdate,
  isHtmlEditMode,
  setIsHtmlEditMode,
  isBlockDisplay,
  setIsBlockDisplay,
  autoFollow = true,
  fragmentSpacing,
  codeThemeId = null,
  showStatusBar = true,
}) => {
  const [editedHtml, setEditedHtml] = useState<string | null>(null);
  const [cutPreview, setCutPreview] = useState<{ fragmentId: string; splitIndex: number } | null>(null);
  const [cutPreviewPosition, setCutPreviewPosition] = useState<{ x: number; y: number; height: number } | null>(null);
  const [splitNotice, setSplitNotice] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { fontScale, setFontScale } = useZoomWheel(scrollContainerRef, FONT_SCALE_KEY, !isHtmlEditMode);
  const [isEditingZoom, setIsEditingZoom] = useState(false);
  const [zoomInput, setZoomInput] = useState('');

  const commitZoom = (raw: string) => {
    const value = parseFloat(raw);
    if (Number.isFinite(value)) {
      setFontScale(value / 100);
    }
    setIsEditingZoom(false);
  };

  useEffect(() => {
    const value = parseFloat(zoomInput);
    if (!Number.isFinite(value)) return;
    const timeout = window.setTimeout(() => {
      setFontScale(value / 100);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [zoomInput, setFontScale]);

  useEffect(() => {
    if (!splitNotice) return;
    const timeout = window.setTimeout(() => setSplitNotice(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [splitNotice]);

  useEffect(() => {
    if (!selectedFragment || !autoFollow) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-fragment-id="${selectedFragment.id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }, [selectedFragment, autoFollow]);

  useEffect(() => {
    if (!isCutToolActive) setCutPreview(null);
  }, [isCutToolActive]);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as Node;
      const container = scrollContainerRef.current;
      if (!container) return;
      if (target === container || target.contains(container)) {
        setCutPreview(null);
      }
    };
    document.addEventListener('scroll', handleScroll, true);
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, []);

  const getTextNodeAtIndex = useCallback((element: Element, index: number): { node: Node; offset: number } | null => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let currentIndex = 0;
    let node: Node | null;

    while ((node = walker.nextNode())) {
      const textLength = node.textContent?.length || 0;
      if (currentIndex + textLength >= index) {
        return { node, offset: index - currentIndex };
      }
      currentIndex += textLength;
    }

    return null;
  }, []);

  useLayoutEffect(() => {
    if (!cutPreview) {
      setCutPreviewPosition(null);
      return;
    }

    const wrapper = scrollContainerRef.current?.querySelector(`[data-fragment-id="${cutPreview.fragmentId}"]`);
    if (!wrapper) {
      setCutPreviewPosition(null);
      return;
    }

    const textNode = getTextNodeAtIndex(wrapper, cutPreview.splitIndex);
    if (!textNode) {
      setCutPreviewPosition(null);
      return;
    }

    const range = document.createRange();
    range.setStart(textNode.node, textNode.offset);
    range.setEnd(textNode.node, textNode.offset);
    const rect = range.getBoundingClientRect();

    const computedStyle = window.getComputedStyle(textNode.node.parentElement || (wrapper as Element));
    const lineHeight = parseFloat(computedStyle.lineHeight) || rect.height || 20;

    setCutPreviewPosition({
      x: rect.left,
      y: rect.top,
      height: lineHeight,
    });
  }, [cutPreview, fontScale, getTextNodeAtIndex]);

  if (!chapter) {
    return (
      <div className="flex-1 bg-base flex items-center justify-center">
        <p className="text-sm text-gray-500">Select a chapter to view its content</p>
      </div>
    );
  }

  const getHighlightedContent = () => {
    if (!chapter.content) return '';

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(chapter.content, 'text/html');

      fragments.forEach((fragment) => {
        const textSrc = fragment.textSrc;
        if (!textSrc || !textSrc.includes('#')) return;

        const id = textSrc.split('#')[1];
        if (!id) return;

        const element = doc.getElementById(id);
        if (element) {
          const isSelected = selectedFragment?.id === fragment.id;
          const wrapper = doc.createElement('span');
          wrapper.setAttribute('data-fragment-id', fragment.id);
          const spacingClass = FRAGMENT_SPACING_CLASSES[fragmentSpacing];
          const marginClass = isBlockDisplay ? spacingClass : '';
          let className = isSelected
            ? `${isBlockDisplay ? 'block ' : ''}${marginClass ? marginClass + ' ' : ''}bg-blue-500/25 border border-blue-500/70 w-fit rounded px-1`
            : `${isBlockDisplay ? 'block ' : ''}bg-raised border border-gray-700 w-fit ${marginClass ? marginClass + ' ' : ''}rounded px-1 hover:bg-gray-700 hover:border-gray-500`;

          if (isCutToolActive) {
            className += ' cursor-crosshair';
          } else {
            className += ' cursor-pointer';
          }

          wrapper.className = className;
          
          // Move children from original element to wrapper
          while (element.firstChild) {
            wrapper.appendChild(element.firstChild);
          }
          // Append wrapper to the now-empty element
          element.appendChild(wrapper);
        }
      });

      return doc.body.innerHTML;
    } catch (error) {
      console.error("Error parsing or modifying chapter content:", error);
      return chapter.content; // Fallback to original content on error
    }
  };

  const findNearestWordBoundary = (text: string, index: number): number => {
    // Don't allow snapping to the very beginning or end of the fragment
    if (index <= 0 || index >= text.length) return -1;
    
    const char = text[index];
    const prevChar = text[index - 1];
    
    // Helper function to check if a character is a word boundary
    const isBoundary = (c: string) => c === ' ' || c === '-' || c === '\n' || c === '\r' || c === '\t';
    
    // Special handling for hyphens: always snap after them
    if (isBoundary(prevChar) && prevChar === '-') {
      // We're right after a hyphen, stay here (after the hyphen)
      return index;
    }
    
    if (isBoundary(char) && char === '-') {
      // We're right before a hyphen, snap after it
      const snapIndex = index + 1;
      if (snapIndex >= text.length - 1) return -1;
      return snapIndex;
    }
    
    // If we're right after a boundary, snap to before the boundary (good typography)
    if (isBoundary(prevChar)) {
      const snapIndex = index - 1;
      // Make sure this isn't at the beginning
      if (snapIndex <= 0) return -1;
      return snapIndex;
    }
    
    // If we're right before a boundary, stay here (this is the correct position)
    if (isBoundary(char)) {
      // Make sure this isn't at the end
      if (index >= text.length - 1) return -1;
      return index;
    }
    
    // We're in the middle of a word - find the nearest boundary
    let leftIndex = -1;
    let rightIndex = -1;
    
    // Search left for a boundary
    for (let i = index - 1; i >= 0; i--) {
      if (isBoundary(text[i])) {
        leftIndex = i;
        break;
      }
    }
    
    // Search right for a boundary
    for (let i = index; i < text.length; i++) {
      if (isBoundary(text[i])) {
        rightIndex = i;
        break;
      }
    }
    
    // Calculate distances
    const leftDist = leftIndex === -1 ? Infinity : index - leftIndex;
    const rightDist = rightIndex === -1 ? Infinity : rightIndex - index;
    
    // No boundaries found - don't allow the cut
    if (leftDist === Infinity && rightDist === Infinity) return -1;
    
    // Choose the nearest boundary
    let chosenBoundaryIndex: number;
    if (leftDist <= rightDist) {
      chosenBoundaryIndex = leftIndex;
    } else {
      chosenBoundaryIndex = rightIndex;
    }
    
    // Snap to before the boundary, except for hyphens where we snap after
    let snapIndex: number;
    if (text[chosenBoundaryIndex] === '-') {
      snapIndex = chosenBoundaryIndex + 1;
    } else {
      snapIndex = chosenBoundaryIndex;
    }
    
    // Don't allow snapping to the very beginning or end
    // Beginning: snapIndex must be > 0
    // End: snapIndex must be < text.length - 1 (to ensure there's content after the cut)
    if (snapIndex <= 0 || snapIndex >= text.length - 1) return -1;
    
    return snapIndex;
  };

  const handleContentMouseMove = (e: React.MouseEvent) => {
    if (!isCutToolActive) {
      setCutPreview(null);
      return;
    }

    const target = e.target as HTMLElement;
    const fragmentWrapper = target.closest('[data-fragment-id]');
    if (!fragmentWrapper) {
      setCutPreview(null);
      return;
    }

    // Create a range at the mouse position
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range) {
      setCutPreview(null);
      return;
    }

    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(fragmentWrapper);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const splitIndex = preCaretRange.toString().length;

    // Apply word boundary snapping
    const fullText = fragmentWrapper.textContent || '';
    const adjustedIndex = findNearestWordBoundary(fullText, splitIndex);

    // If invalid position (beginning/end of fragment), don't show preview
    if (adjustedIndex === -1) {
      setCutPreview(null);
      return;
    }

    const fragmentId = fragmentWrapper.getAttribute('data-fragment-id');
    if (!fragmentId) {
      setCutPreview(null);
      return;
    }

    setCutPreview({ fragmentId, splitIndex: adjustedIndex });
  };

  const getSplitIndexFromPointer = (fragmentWrapper: Element, clientX: number, clientY: number): number => {
    const range = document.caretRangeFromPoint(clientX, clientY);
    if (!range) return -1;

    if (!fragmentWrapper.contains(range.endContainer)) {
      return -1;
    }

    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(fragmentWrapper);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    const splitIndex = preCaretRange.toString().length;

    const fullText = fragmentWrapper.textContent || '';
    return findNearestWordBoundary(fullText, splitIndex);
  };

  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const fragmentWrapper = target.closest('[data-fragment-id]');
    if (!fragmentWrapper) return;

    const fragmentId = fragmentWrapper.getAttribute('data-fragment-id');
    if (!fragmentId) return;

    if (isCutToolActive) {
      const splitIndex = getSplitIndexFromPointer(fragmentWrapper, e.clientX, e.clientY);

      // If invalid position (beginning/end of fragment), don't perform the cut
      if (splitIndex === -1) {
        setSplitNotice('Split ignored: pick a valid boundary inside the fragment.');
        return;
      }

      const splitApplied = onFragmentSplitByText(fragmentId, splitIndex);
      if (!splitApplied) {
        setSplitNotice('Split ignored: fragment is too short or split point is invalid.');
        return;
      }

      // Only deactivate tool if not in sticky mode
      if (!isCutToolSticky) {
        setIsCutToolActive(false);
      }
    } else {
      const fragment = fragments.find(f => f.id === fragmentId);
      if (fragment) {
        onFragmentSelect(fragment);
      }
    }
  };

  return (
    <div className="content-viewer flex-1 min-h-0 bg-base flex flex-col">
      <div className="h-11 flex-shrink-0 px-3 border-b border-line flex justify-between items-center gap-2 sticky top-0 z-10 bg-panel">
        <p className="text-xs text-gray-500 truncate">{chapter.href}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <IconButton
            onClick={() => setIsCutToolActive(!isCutToolActive)}
            onDoubleClick={() => {
              if (isCutToolSticky) {
                // If sticky is active, deactivate both sticky and cut tool
                setIsCutToolSticky(false);
                setIsCutToolActive(false);
              } else {
                // If not sticky, activate sticky mode
                setIsCutToolSticky(true);
                if (!isCutToolActive) setIsCutToolActive(true);
              }
            }}
            active={isCutToolActive}
            activeClassName={isCutToolSticky
              ? 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/25'
              : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25'
            }
            title={isCutToolSticky ? 'Cut Tool (Sticky Mode) - Double-click or X to disable' : isCutToolActive ? 'Deactivate Cut Tool - Double-click or X for sticky mode' : 'Activate Cut Tool - Double-click or X for sticky mode'}
          >
            <Scissors className="w-4 h-4" />
          </IconButton>
          <IconButton
            onClick={() => setIsBlockDisplay(!isBlockDisplay)}
            title={isBlockDisplay ? 'Show fragments in flow text' : 'Show fragments as lines'}
          >
            {isBlockDisplay ? <AlignJustify className="w-4 h-4" /> : <Text className="w-4 h-4" />}
          </IconButton>
          {isHtmlEditMode ? (
            <span
              className="p-1.5 rounded-md bg-amber-500/15 text-amber-400 cursor-default"
              title="HTML edit mode active - save or cancel to leave"
            >
              <Code className="w-4 h-4" />
            </span>
          ) : (
            <IconButton
              onClick={() => {
                setEditedHtml(chapter.content);
                setIsHtmlEditMode(true);
              }}
              title="Edit HTML Source"
            >
              <Code className="w-4 h-4" />
            </IconButton>
          )}
            {isHtmlEditMode && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  className="ml-1.5"
                  onClick={() => {
                    if (editedHtml && onHtmlUpdate) {
                      onHtmlUpdate(editedHtml);
                    }
                    setIsHtmlEditMode(false);
                  }}
                >Save</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1"
                  onClick={() => {
                    setIsHtmlEditMode(false);
                    setEditedHtml(null);
                  }}
                >Cancel</Button>
              </>
            )}
            {!isHtmlEditMode && (
              isEditingZoom ? (
                <input
                  autoFocus
                  type="number"
                  min={MIN_FONT_SCALE * 100}
                  max={MAX_FONT_SCALE * 100}
                  value={zoomInput}
                  onChange={(e) => setZoomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitZoom(zoomInput);
                    if (e.key === 'Escape') setIsEditingZoom(false);
                  }}
                  onBlur={() => commitZoom(zoomInput)}
                  className="w-14 text-center py-1 rounded-md text-xs font-medium bg-base border border-gray-700 text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  title="Zoom (Ctrl/Cmd+scroll to zoom, Ctrl/Cmd+0 to reset)"
                />
              ) : (
                <button
                  onClick={() => {
                    setZoomInput(String(Math.round(fontScale * 100)));
                    setIsEditingZoom(true);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setFontScale(1);
                  }}
                  className="h-7 px-2 rounded-md text-xs font-medium tabular-nums text-gray-400 hover:text-gray-100 hover:bg-raised transition-colors"
                  title="Click to set a custom zoom value, right-click to reset to 100% (Ctrl/Cmd+scroll to zoom, Ctrl/Cmd+0 to reset)"
                >
                  {Math.round(fontScale * 100)}%
                </button>
              )
            )}
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
        {splitNotice && (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            {splitNotice}
          </div>
        )}
        {isHtmlEditMode && editedHtml !== null ? (
          <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading editor...</div>}>
            <HtmlEditor value={editedHtml} onValueChange={setEditedHtml} codeThemeId={codeThemeId} />
          </Suspense>
        ) : (
          <div className="relative">
            <div 
              style={{ fontSize: `${fontScale}rem` }}
              onClick={handleContentClick}
              onMouseMove={handleContentMouseMove}
              onMouseLeave={() => setCutPreview(null)}
              dangerouslySetInnerHTML={{ __html: getHighlightedContent() }}
            />
            {cutPreviewPosition && (
              <div
                className="fixed w-0.5 bg-orange-500 pointer-events-none z-50"
                style={{
                  left: `${cutPreviewPosition.x}px`,
                  top: `${cutPreviewPosition.y}px`,
                  height: `${cutPreviewPosition.height}px`,
                  marginTop: `${-2 * fontScale}px`,
                  marginLeft: `${fontScale}px`,
                  boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)'
                }}
              />
            )}
          </div>
        )}
      </div>

      {fragments.length > 0 && showStatusBar && (
        <div className="h-7 flex-shrink-0 border-t border-line px-3 flex items-center gap-1.5 text-xs text-gray-500 bg-panel">
          {selectedFragment && (
            <>
              <Code className="w-3.5 h-3.5" />
              <span>{selectedFragment.id.split('::')[1] ?? selectedFragment.id}</span>
            </>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <List className="w-3.5 h-3.5" />
            <span>{fragments.length} fragments total</span>
          </span>
        </div>
      )}
    </div>
  );
};
