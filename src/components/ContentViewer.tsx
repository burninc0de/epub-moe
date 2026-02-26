import React, { useEffect, useState } from 'react';
import './ContentViewer.css';
import { Scissors, AlignJustify, Text, Code } from 'lucide-react';
import { EPUBChapter, SMILFragment } from '../types/epub';

import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-markup';

interface ContentViewerProps {
  chapter: EPUBChapter | null;
  fragments: SMILFragment[];
  selectedFragment: SMILFragment | null;
  onFragmentSelect: (fragment: SMILFragment) => void;
  isCutToolActive: boolean;
  setIsCutToolActive: (isActive: boolean) => void;
  onFragmentSplitByText: (fragmentId: string, splitIndex: number) => boolean;
  onHtmlUpdate?: (newHtml: string) => void;
  isHtmlEditMode: boolean;
  setIsHtmlEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  isBlockDisplay: boolean;
  setIsBlockDisplay: (isBlock: boolean) => void;
}

export const ContentViewer: React.FC<ContentViewerProps> = ({
  chapter,
  fragments,
  selectedFragment,
  onFragmentSelect,
  isCutToolActive,
  setIsCutToolActive,
  onFragmentSplitByText,
  onHtmlUpdate,
  isHtmlEditMode,
  setIsHtmlEditMode,
  isBlockDisplay,
  setIsBlockDisplay
}) => {
  const [editedHtml, setEditedHtml] = useState<string | null>(null);
  const [isCutToolSticky, setIsCutToolSticky] = useState<boolean>(false);
  const [cutPreviewPosition, setCutPreviewPosition] = useState<{ x: number; y: number; height: number } | null>(null);
  const [splitNotice, setSplitNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!splitNotice) return;
    const timeout = window.setTimeout(() => setSplitNotice(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [splitNotice]);

  if (!chapter) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center dark:bg-gray-800">
        <p className="text-gray-600 dark:text-gray-300">Select a chapter to view its content</p>
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
          let className = isSelected
            ? 'bg-blue-200 dark:bg-blue-800 border border-blue-400 dark:border-blue-600 rounded px-1'
            : `${isBlockDisplay ? 'block ' : ''}bg-gray-100 dark:bg-gray-800 border border-green-300 w-fit ${isBlockDisplay ? 'my-2 ' : ''}dark:border-gray-600 rounded px-1 hover:bg-green-200 dark:hover:bg-gray-700`;

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
      setCutPreviewPosition(null);
      return;
    }

    const target = e.target as HTMLElement;
    const fragmentWrapper = target.closest('[data-fragment-id]');
    if (!fragmentWrapper) {
      setCutPreviewPosition(null);
      return;
    }

    // Create a range at the mouse position
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range) {
      setCutPreviewPosition(null);
      return;
    }

    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(fragmentWrapper);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    let splitIndex = preCaretRange.toString().length;

    // Apply word boundary snapping
    const fullText = fragmentWrapper.textContent || '';
    const adjustedIndex = findNearestWordBoundary(fullText, splitIndex);
    
    // If invalid position (beginning/end of fragment), don't show preview
    if (adjustedIndex === -1) {
      setCutPreviewPosition(null);
      return;
    }
    
    splitIndex = adjustedIndex;

    // Create a range at the adjusted position
    const textNode = getTextNodeAtIndex(fragmentWrapper, splitIndex);
    if (textNode) {
      const adjustedRange = document.createRange();
      adjustedRange.setStart(textNode.node, textNode.offset);
      adjustedRange.setEnd(textNode.node, textNode.offset);
      const rect = adjustedRange.getBoundingClientRect();
      
      // Get the line height from the computed style or use the rect height
      const computedStyle = window.getComputedStyle(textNode.node.parentElement || fragmentWrapper as Element);
      const lineHeight = parseFloat(computedStyle.lineHeight) || rect.height || 20;
      
      setCutPreviewPosition({
        x: rect.left,
        y: rect.top,
        height: lineHeight
      });
    }
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

  const getTextNodeAtIndex = (element: Element, index: number): { node: Node; offset: number } | null => {
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
    <div className="content-viewer flex-1 bg-white flex flex-col dark:bg-gray-900">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 z-10 bg-white dark:bg-gray-900">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{chapter.title}</h2>
          <p className="text-sm text-gray-600 mt-1 dark:text-gray-300">{chapter.href}</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
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
            className={`p-2 rounded-md transition-colors ${
              isCutToolSticky
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : isCutToolActive 
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            title={isCutToolSticky ? 'Cut Tool (Sticky Mode) - Double-click to disable' : isCutToolActive ? 'Deactivate Cut Tool - Double-click for sticky mode' : 'Activate Cut Tool - Double-click for sticky mode'}
          >
            <Scissors className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsBlockDisplay(!isBlockDisplay)}
            className={`p-2 rounded-md transition-colors ${
              'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            title={isBlockDisplay ? 'Show fragments in flow text' : 'Show fragments as lines'}
          >
            {isBlockDisplay ? <AlignJustify className="w-5 h-5" /> : <Text className="w-5 h-5" />}
          </button>
          <button
            onClick={() => {
              if (!isHtmlEditMode) setEditedHtml(chapter.content);
              setIsHtmlEditMode((v) => !v);
            }}
            className={`p-2 rounded-md transition-colors ${
              isHtmlEditMode
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            title={isHtmlEditMode ? 'Exit HTML Edit Mode' : 'Edit HTML Source'}
          >
            <Code className="w-5 h-5" />
          </button>
          {isHtmlEditMode && (
            <>
              <button
                className="ml-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={() => {
                  if (editedHtml && onHtmlUpdate) {
                    onHtmlUpdate(editedHtml);
                  }
                  setIsHtmlEditMode(false);
                }}
              >Save</button>
              <button
                className="ml-1 px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500"
                onClick={() => {
                  setIsHtmlEditMode(false);
                  setEditedHtml(null);
                }}
              >Cancel</button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {splitNotice && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
            {splitNotice}
          </div>
        )}
        {isHtmlEditMode && editedHtml !== null ? (
          <Editor
            value={editedHtml}
            onValueChange={setEditedHtml}
            highlight={code => Prism.highlight(code, Prism.languages.markup, 'markup')}
            padding={12}
            style={{
              fontFamily: 'Fira Mono, Menlo, Monaco, Consolas, monospace',
              fontSize: 14,
              minHeight: 300,
              background: '#1a202c',
              color: '#f8f8f2',
              borderRadius: 8,
              marginBottom: 16
            }}
            textareaId="html-editor"
            textareaClassName="w-full border border-gray-300 dark:border-gray-700 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div className="relative">
            <div 
              className="prose max-w-none dark:prose-invert"
              onClick={handleContentClick}
              onMouseMove={handleContentMouseMove}
              onMouseLeave={() => setCutPreviewPosition(null)}
              dangerouslySetInnerHTML={{ __html: getHighlightedContent() }}
            />
            {cutPreviewPosition && (
              <div
                className="fixed w-0.5 bg-orange-500 pointer-events-none z-50 -mt-[1px] ml-[1px]"
                style={{
                  left: `${cutPreviewPosition.x}px`,
                  top: `${cutPreviewPosition.y}px`,
                  height: `${cutPreviewPosition.height}px`,
                  boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)'
                }}
              />
            )}
          </div>
        )}
      </div>

      {fragments.length > 0 && (
        <div className="border-t border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
            <span className="ml-auto">{fragments.length} fragments total</span>
          </div>
        </div>
      )}
    </div>
  );
};