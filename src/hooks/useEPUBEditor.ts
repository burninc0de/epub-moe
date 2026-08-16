import { useState, useCallback, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { EPUBParser } from '../utils/epubParser';
import { exportEPUB as buildExportEPUB } from '../utils/exportEPUB';
import { snapFragmentBoundaries } from '../utils/fragmentSnap';
import { EPUBData, EPUBChapter, SMILFragment } from '../types/epub';
import { useEditorHistory, cloneEPUBData, HistoryContext } from './useEditorHistory';

const LAST_CHAPTER_KEY = 'nuTobi:lastSelectedChapter';
const MIN_FRAGMENT_DURATION = 0.01;
const MIN_FORCE_ALIGN_SEGMENT_DURATION = 0.12;
const MIN_TEXT_SPLIT_DURATION = 0.12;

interface ChapterFragments {
  chapter: EPUBChapter;
  smilId: string;
  fragments: SMILFragment[];
}

const getChapterFragments = (
  epubData: EPUBData,
  selectedChapter: string
): ChapterFragments | null => {
  const chapter = epubData.chapters.find((c) => c.id === selectedChapter);
  if (!chapter?.mediaOverlay) return null;

  const smilId = chapter.mediaOverlay;
  const fragments = epubData.smilFiles.get(smilId);
  if (!fragments) return null;

  return { chapter, smilId, fragments };
};

const normalizeOrder = (fragments: SMILFragment[]): SMILFragment[] =>
  [...fragments]
    .sort((a, b) => a.clipBegin - b.clipBegin)
    .map((frag, index) => ({ ...frag, order: index }));

const findFragment = (
  data: EPUBData | null,
  chapterId: string | null,
  fragmentId: string | null
): SMILFragment | null => {
  if (!data || !chapterId || !fragmentId) return null;
  const chapterData = getChapterFragments(data, chapterId);
  return chapterData?.fragments.find((f) => f.id === fragmentId) ?? null;
};

export const useEPUBEditor = () => {
  const [epubData, _setEpubData] = useState<EPUBData | null>(null);
  const [originalZip, setOriginalZip] = useState<JSZip | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [selectedFragment, setSelectedFragment] = useState<SMILFragment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAudioBlob, setCurrentAudioBlob] = useState<Blob | null>(null);

  const epubDataRef = useRef<EPUBData | null>(null);
  const selectedChapterRef = useRef<string | null>(null);
  const selectedFragmentRef = useRef<SMILFragment | null>(null);
  const lastAudioFileBlobRef = useRef<Blob | null>(null);

  const {
    history,
    historyIndex,
    canUndo,
    canRedo,
    record,
    undo: historyUndo,
    redo: historyRedo,
    goTo: historyGoTo,
    clear,
  } = useEditorHistory();

  useEffect(() => {
    epubDataRef.current = epubData;
  }, [epubData]);

  useEffect(() => {
    selectedChapterRef.current = selectedChapter;
  }, [selectedChapter]);

  useEffect(() => {
    selectedFragmentRef.current = selectedFragment;
  }, [selectedFragment]);

  const recordChange = useCallback(
    (
      data: EPUBData,
      beforeContext: HistoryContext,
      afterContext: HistoryContext,
      label: string
    ) => {
      record(data, beforeContext, afterContext, label);
    },
    [record]
  );

  const setEpubData = useCallback(
    (value: React.SetStateAction<EPUBData | null>) => {
      const current = epubDataRef.current;
      const next =
        typeof value === 'function'
          ? (value as (prev: EPUBData | null) => EPUBData | null)(current)
          : value;

      if (next && next !== current) {
        const context: HistoryContext = {
          chapterId: selectedChapterRef.current,
          fragmentId: selectedFragmentRef.current?.id ?? null,
        };
        epubDataRef.current = next;
        _setEpubData(next);
        recordChange(next, context, context, 'Edit HTML');
      } else if (next !== current) {
        _setEpubData(next);
      }
    },
    [recordChange]
  );

  const restoreHistoryEntry = useCallback(
    (result: ReturnType<typeof historyUndo>, context: HistoryContext | null) => {
      if (!result || !context) return;

      _setEpubData(cloneEPUBData(result.entry.snapshot));

      if (
        context.chapterId &&
        result.entry.snapshot.chapters.some((c) => c.id === context.chapterId)
      ) {
        setSelectedChapter(context.chapterId);
      }

      setSelectedFragment(
        findFragment(result.entry.snapshot, context.chapterId, context.fragmentId)
      );
    },
    []
  );

  const undo = useCallback(() => {
    const result = historyUndo();
    restoreHistoryEntry(result, result?.selectionContext ?? null);
  }, [historyUndo, restoreHistoryEntry]);

  const redo = useCallback(() => {
    const result = historyRedo();
    restoreHistoryEntry(result, result?.selectionContext ?? null);
  }, [historyRedo, restoreHistoryEntry]);

  const goToHistory = useCallback(
    (index: number) => {
      const result = historyGoTo(index);
      restoreHistoryEntry(result, result?.selectionContext ?? null);
    },
    [historyGoTo, restoreHistoryEntry]
  );

  const loadEPUB = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setError(null);
      try {
        const zip = await JSZip.loadAsync(file);
        setOriginalZip(zip);
        const parser = new EPUBParser(zip);
        const data = await parser.parse();

        clear();
        epubDataRef.current = data;
        _setEpubData(data);

        const lastSelected = localStorage.getItem(LAST_CHAPTER_KEY);
        const validChapter = lastSelected && data.chapters.find((c) => c.id === lastSelected);
        const initialChapter = validChapter
          ? validChapter.id
          : data.chapters.find((c) => c.mediaOverlay)?.id ||
            (data.chapters.length > 0 ? data.chapters[0].id : null);

        if (initialChapter) {
          selectedChapterRef.current = initialChapter;
          setSelectedChapter(initialChapter);
        }

        record(
          data,
          { chapterId: null, fragmentId: null },
          { chapterId: initialChapter, fragmentId: null },
          'Load EPUB'
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse EPUB file');
      } finally {
        setIsLoading(false);
      }
    },
    [clear, record]
  );

  useEffect(() => {
    if (selectedChapter) {
      localStorage.setItem(LAST_CHAPTER_KEY, selectedChapter);
    }
  }, [selectedChapter]);

  const updateFragment = useCallback(
    (fragmentId: string, updates: Partial<SMILFragment>) => {
      const data = epubDataRef.current;
      const chapterId = selectedChapterRef.current;
      if (!data || !chapterId) return;

      const beforeContext: HistoryContext = {
        chapterId,
        fragmentId: selectedFragmentRef.current?.id ?? null,
      };

      const chapterData = getChapterFragments(data, chapterId);
      if (!chapterData) return;

      const { smilId, fragments } = chapterData;
      const fragmentIndex = fragments.findIndex((f) => f.id === fragmentId);
      if (fragmentIndex === -1) return;

      const updatedFragments = [...fragments];
      updatedFragments[fragmentIndex] = { ...updatedFragments[fragmentIndex], ...updates };

      const newSmilFiles = new Map(data.smilFiles);

      if (updates.clipBegin !== undefined || updates.clipEnd !== undefined) {
        newSmilFiles.set(smilId, normalizeOrder(updatedFragments));
      } else {
        newSmilFiles.set(smilId, updatedFragments);
      }

      const newData = { ...data, smilFiles: newSmilFiles };
      epubDataRef.current = newData;
      _setEpubData(newData);
      recordChange(newData, beforeContext, beforeContext, 'Update timing');

      if (selectedFragmentRef.current?.id === fragmentId) {
        setSelectedFragment({ ...selectedFragmentRef.current, ...updates });
      }
    },
    [recordChange]
  );

  const nudgeFragmentStart = useCallback(
    (fragmentId: string, deltaSeconds: number) => {
      const data = epubDataRef.current;
      const chapterId = selectedChapterRef.current;
      if (!data || !chapterId) return;

      const beforeContext: HistoryContext = {
        chapterId,
        fragmentId: selectedFragmentRef.current?.id ?? null,
      };

      const chapterData = getChapterFragments(data, chapterId);
      if (!chapterData) return;

      const { smilId, fragments } = chapterData;
      const fragmentIndex = fragments.findIndex((f) => f.id === fragmentId);
      if (fragmentIndex === -1) return;

      const fragment = fragments[fragmentIndex];
      const newStart = Math.max(0, Math.min(fragment.clipBegin + deltaSeconds, fragment.clipEnd - 0.01));
      if (newStart === fragment.clipBegin) return;

      const newSmilFiles = new Map(data.smilFiles);
      newSmilFiles.set(
        smilId,
        normalizeOrder(snapFragmentBoundaries(fragments, fragmentIndex, newStart, fragment.clipEnd))
      );

      const newData = { ...data, smilFiles: newSmilFiles };
      epubDataRef.current = newData;
      _setEpubData(newData);
      recordChange(newData, beforeContext, beforeContext, 'Nudge start');

      if (selectedFragmentRef.current?.id === fragmentId) {
        setSelectedFragment({ ...selectedFragmentRef.current, clipBegin: newStart });
      }
    },
    [recordChange]
  );

  const nudgeFragmentEnd = useCallback(
    (fragmentId: string, deltaSeconds: number) => {
      const data = epubDataRef.current;
      const chapterId = selectedChapterRef.current;
      if (!data || !chapterId) return;

      const beforeContext: HistoryContext = {
        chapterId,
        fragmentId: selectedFragmentRef.current?.id ?? null,
      };

      const chapterData = getChapterFragments(data, chapterId);
      if (!chapterData) return;

      const { smilId, fragments } = chapterData;
      const fragmentIndex = fragments.findIndex((f) => f.id === fragmentId);
      if (fragmentIndex === -1) return;

      const fragment = fragments[fragmentIndex];
      const newEnd = Math.max(fragment.clipBegin + 0.01, fragment.clipEnd + deltaSeconds);
      if (newEnd === fragment.clipEnd) return;

      const newSmilFiles = new Map(data.smilFiles);
      newSmilFiles.set(
        smilId,
        normalizeOrder(snapFragmentBoundaries(fragments, fragmentIndex, fragment.clipBegin, newEnd))
      );

      const newData = { ...data, smilFiles: newSmilFiles };
      epubDataRef.current = newData;
      _setEpubData(newData);
      recordChange(newData, beforeContext, beforeContext, 'Nudge end');

      if (selectedFragmentRef.current?.id === fragmentId) {
        setSelectedFragment({ ...selectedFragmentRef.current, clipEnd: newEnd });
      }
    },
    [recordChange]
  );

  const deleteFragment = useCallback(
    (fragmentId: string) => {
      const data = epubDataRef.current;
      const chapterId = selectedChapterRef.current;
      if (!data || !chapterId) return;

      const beforeContext: HistoryContext = {
        chapterId,
        fragmentId: selectedFragmentRef.current?.id ?? null,
      };

      const chapterData = getChapterFragments(data, chapterId);
      if (!chapterData) return;

      const { smilId, fragments } = chapterData;
      const fragmentIndex = fragments.findIndex((f) => f.id === fragmentId);
      if (fragmentIndex === -1) return;

      const updatedFragments = fragments.filter((f) => f.id !== fragmentId);

      const newSmilFiles = new Map(data.smilFiles);
      newSmilFiles.set(smilId, normalizeOrder(updatedFragments));

      const newData = { ...data, smilFiles: newSmilFiles };
      const afterContext: HistoryContext = {
        chapterId,
        fragmentId: beforeContext.fragmentId === fragmentId ? null : beforeContext.fragmentId,
      };

      epubDataRef.current = newData;
      _setEpubData(newData);
      recordChange(newData, beforeContext, afterContext, 'Delete fragment');

      if (selectedFragmentRef.current?.id === fragmentId) {
        setSelectedFragment(null);
      }
    },
    [recordChange]
  );

  const splitFragmentByText = useCallback(
    (fragmentId: string, splitIndex: number): boolean => {
      const data = epubDataRef.current;
      const chapterId = selectedChapterRef.current;
      if (!data || !chapterId) return false;

      const beforeContext: HistoryContext = {
        chapterId,
        fragmentId: selectedFragmentRef.current?.id ?? null,
      };

      const chapterData = getChapterFragments(data, chapterId);
      if (!chapterData) return false;

      const { chapter, smilId: smilFileId, fragments } = chapterData;

      const fragmentIndex = fragments.findIndex((f) => f.id === fragmentId);
      if (fragmentIndex === -1) return false;

      const originalFragment = fragments[fragmentIndex];
      const originalDuration = originalFragment.clipEnd - originalFragment.clipBegin;
      if (!Number.isFinite(originalDuration) || originalDuration < MIN_TEXT_SPLIT_DURATION * 2) {
        return false;
      }

      const textSrcId = originalFragment.textSrc.split('#')[1];
      if (!textSrcId) return false;

      const parser = new DOMParser();
      const doc = parser.parseFromString(chapter.content, 'application/xhtml+xml');
      const originalElement = doc.getElementById(textSrcId);

      if (!originalElement) return false;

      let charCount = 0;
      const nodes1: ChildNode[] = [];
      const nodes2: ChildNode[] = [];
      let foundSplit = false;
      let text1 = '';
      let text2 = '';
      let originalText = '';

      for (const node of Array.from(originalElement.childNodes)) {
        originalText += node.textContent || '';
        if (foundSplit) {
          nodes2.push(node.cloneNode(true) as ChildNode);
          text2 += node.textContent || '';
          continue;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          if (charCount + text.length <= splitIndex) {
            nodes1.push(node.cloneNode(true) as ChildNode);
            text1 += text;
            charCount += text.length;
          } else {
            const splitAt = splitIndex - charCount;
            if (splitAt > 0) {
              nodes1.push(doc.createTextNode(text.slice(0, splitAt)));
              text1 += text.slice(0, splitAt);
            }
            nodes2.push(doc.createTextNode(text.slice(splitAt)));
            text2 += text.slice(splitAt);
            foundSplit = true;
          }
        } else {
          const text = node.textContent || '';
          if (charCount + text.length <= splitIndex) {
            nodes1.push(node.cloneNode(true) as ChildNode);
            text1 += text;
            charCount += text.length;
          } else {
            const splitAt = splitIndex - charCount;
            const clone1 = node.cloneNode(false) as Element;
            const clone2 = node.cloneNode(false) as Element;
            let innerCharCount = 0;
            for (const child of Array.from(node.childNodes)) {
              const childText = child.textContent || '';
              if (innerCharCount + childText.length <= splitAt) {
                clone1.appendChild(child.cloneNode(true));
                text1 += childText;
                innerCharCount += childText.length;
              } else {
                const childSplitAt = splitAt - innerCharCount;
                if (child.nodeType === Node.TEXT_NODE) {
                  if (childSplitAt > 0) {
                    clone1.appendChild(doc.createTextNode(child.textContent!.slice(0, childSplitAt)));
                    text1 += child.textContent!.slice(0, childSplitAt);
                  }
                  clone2.appendChild(doc.createTextNode(child.textContent!.slice(childSplitAt)));
                  text2 += child.textContent!.slice(childSplitAt);
                } else {
                  clone2.appendChild(child.cloneNode(true));
                  text2 += childText;
                }
                innerCharCount = splitAt;
              }
            }
            if (clone1.childNodes.length) nodes1.push(clone1);
            if (clone2.childNodes.length) nodes2.push(clone2);
            foundSplit = true;
          }
        }
      }

      if (!foundSplit || !text1.trim() || !text2.trim()) {
        return false;
      }

      const id1 = `frag-split-${Date.now()}-1`;
      const id2 = `frag-split-${Date.now()}-2`;

      const span1 = doc.createElement('span');
      span1.id = id1;
      nodes1.forEach((n) => span1.appendChild(n));

      const span2 = doc.createElement('span');
      span2.id = id2;
      nodes2.forEach((n) => span2.appendChild(n));

      const parent = originalElement.parentNode;
      if (parent) {
        parent.replaceChild(span1, originalElement);
        parent.insertBefore(span2, span1.nextSibling);
      } else {
        originalElement.textContent = '';
        originalElement.appendChild(span1);
        originalElement.appendChild(span2);
      }

      const updatedContent = new XMLSerializer().serializeToString(doc);

      const duration = originalFragment.clipEnd - originalFragment.clipBegin;
      const splitRatio = Math.min(1, Math.max(0, text1.length / (originalText.length || 1)));
      let splitTime = originalFragment.clipBegin + duration * splitRatio;
      const minSplitTime = originalFragment.clipBegin + MIN_TEXT_SPLIT_DURATION;
      const maxSplitTime = originalFragment.clipEnd - MIN_TEXT_SPLIT_DURATION;

      if (minSplitTime >= maxSplitTime) {
        return false;
      }

      splitTime = Math.min(maxSplitTime, Math.max(minSplitTime, splitTime));

      const firstFragment: SMILFragment = {
        ...originalFragment,
        id: `${originalFragment.id}_part1`,
        text: text1,
        textSrc: `${originalFragment.textSrc.split('#')[0]}#${id1}`,
        clipEnd: splitTime,
      };

      const secondFragment: SMILFragment = {
        ...originalFragment,
        id: `${originalFragment.id}_part2`,
        text: text2,
        textSrc: `${originalFragment.textSrc.split('#')[0]}#${id2}`,
        clipBegin: splitTime,
        order: originalFragment.order + 0.1,
      };

      const newChapters = data.chapters.map((c) =>
        c.id === chapter.id ? { ...c, content: updatedContent } : c
      );
      const newSmilFiles = new Map(data.smilFiles);
      const updatedFragments = [
        ...fragments.slice(0, fragmentIndex),
        firstFragment,
        secondFragment,
        ...fragments.slice(fragmentIndex + 1),
      ];

      newSmilFiles.set(smilFileId, normalizeOrder(updatedFragments));

      const newData = {
        ...data,
        chapters: newChapters,
        smilFiles: newSmilFiles,
      };

      const afterContext: HistoryContext = {
        chapterId,
        fragmentId: firstFragment.id,
      };

      epubDataRef.current = newData;
      _setEpubData(newData);
      recordChange(newData, beforeContext, afterContext, 'Split fragment');
      setSelectedFragment(firstFragment);

      return true;
    },
    [recordChange]
  );

  const applyTimeOffset = useCallback(
    (fromTime: number, offsetSeconds: number) => {
      const data = epubDataRef.current;
      const chapterId = selectedChapterRef.current;
      if (!data || !chapterId) return;

      const beforeContext: HistoryContext = {
        chapterId,
        fragmentId: selectedFragmentRef.current?.id ?? null,
      };

      const chapterData = getChapterFragments(data, chapterId);
      if (!chapterData) return;

      const { smilId: smilFileId, fragments } = chapterData;

      const updatedFragments = fragments.map((fragment) => {
        if (fragment.clipBegin >= fromTime) {
          return {
            ...fragment,
            clipBegin: Math.max(0, fragment.clipBegin + offsetSeconds),
            clipEnd: Math.max(fragment.clipBegin + offsetSeconds + 0.1, fragment.clipEnd + offsetSeconds),
          };
        } else if (fragment.clipEnd > fromTime) {
          return {
            ...fragment,
            clipEnd: Math.max(fragment.clipBegin + 0.1, fragment.clipEnd + offsetSeconds),
          };
        }
        return fragment;
      });

      const fragmentsWithCorrectOrder = normalizeOrder(updatedFragments);
      const newSmilFiles = new Map(data.smilFiles);
      newSmilFiles.set(smilFileId, fragmentsWithCorrectOrder);

      const newData = { ...data, smilFiles: newSmilFiles };
      epubDataRef.current = newData;
      _setEpubData(newData);
      recordChange(newData, beforeContext, beforeContext, 'Apply time offset');

      if (selectedFragmentRef.current && selectedFragmentRef.current.clipBegin >= fromTime) {
        const updatedSelected = fragmentsWithCorrectOrder.find(
          (f) => f.id === selectedFragmentRef.current!.id
        );
        if (updatedSelected) {
          setSelectedFragment(updatedSelected);
        }
      }
    },
    [recordChange]
  );

  const forceNonOverlappingFragments = useCallback(
    (audioDuration?: number) => {
      const data = epubDataRef.current;
      const chapterId = selectedChapterRef.current;
      if (!data || !chapterId) return;

      const beforeContext: HistoryContext = {
        chapterId,
        fragmentId: selectedFragmentRef.current?.id ?? null,
      };

      const chapterData = getChapterFragments(data, chapterId);
      if (!chapterData || chapterData.fragments.length === 0) return;

      const { chapter, smilId: smilFileId, fragments } = chapterData;

      const parser = new DOMParser();
      const chapterDoc = parser.parseFromString(chapter.content, 'application/xhtml+xml');
      const textIdOrder = new Map<string, number>();
      chapterDoc.querySelectorAll('[id]').forEach((element, index) => {
        textIdOrder.set(element.id, index);
      });

      const getTextOrderIndex = (fragment: SMILFragment, fallbackIndex: number): number => {
        const textId = fragment.textSrc.split('#')[1] || '';
        const domIndex = textIdOrder.get(textId);
        if (domIndex !== undefined) return domIndex;
        return Number.isFinite(fragment.order) ? fragment.order : fallbackIndex;
      };

      const ordered = [...fragments]
        .map((fragment, originalIndex) => ({ fragment, originalIndex }))
        .sort((a, b) => {
          const aTextOrder = getTextOrderIndex(a.fragment, a.originalIndex);
          const bTextOrder = getTextOrderIndex(b.fragment, b.originalIndex);
          if (aTextOrder !== bTextOrder) {
            return aTextOrder - bTextOrder;
          }

          if (a.fragment.order !== b.fragment.order) {
            return a.fragment.order - b.fragment.order;
          }

          return a.originalIndex - b.originalIndex;
        })
        .map(({ fragment }) => fragment);

      const targetDuration =
        Number.isFinite(audioDuration) && (audioDuration || 0) > 0
          ? (audioDuration as number)
          : ordered.reduce((maxEnd, fragment) => {
              const end = Number.isFinite(fragment.clipEnd) ? fragment.clipEnd : 0;
              return Math.max(maxEnd, end);
            }, 0);

      const segmentCount = ordered.length;
      const minDuration = segmentCount > 0
        ? Math.min(MIN_FORCE_ALIGN_SEGMENT_DURATION, targetDuration / segmentCount)
        : 0;
      const reservedDuration = minDuration * segmentCount;
      const distributableDuration = Math.max(0, targetDuration - reservedDuration);

      const weights = ordered.map((fragment) => {
        const textId = fragment.textSrc.split('#')[1] || '';
        const element = textId ? chapterDoc.getElementById(textId) : null;
        const textLength = (element?.textContent || '').replace(/\s+/g, ' ').trim().length;
        return Math.max(1, textLength);
      });
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

      const scaledDurations = weights.map((weight) => {
        if (totalWeight <= 0) return minDuration;
        return minDuration + (weight / totalWeight) * distributableDuration;
      });

      let cursor = 0;
      const normalized = ordered.map((fragment, index) => {
        const clipBegin = cursor;
        const clipEnd =
          index === ordered.length - 1
            ? targetDuration
            : Math.min(targetDuration, cursor + Math.max(MIN_FRAGMENT_DURATION, scaledDurations[index]));
        cursor = clipEnd;

        return {
          ...fragment,
          clipBegin,
          clipEnd,
          order: index,
        };
      });

      const newSmilFiles = new Map(data.smilFiles);
      newSmilFiles.set(smilFileId, normalized);

      const newData = { ...data, smilFiles: newSmilFiles };
      epubDataRef.current = newData;
      _setEpubData(newData);
      recordChange(newData, beforeContext, beforeContext, 'Force align');

      if (selectedFragmentRef.current) {
        const updatedSelected = normalized.find((f) => f.id === selectedFragmentRef.current!.id);
        if (updatedSelected) {
          setSelectedFragment(updatedSelected);
        }
      }
    },
    [recordChange]
  );

  const getCurrentChapter = useCallback((): EPUBChapter | null => {
    if (!epubData || !selectedChapter) return null;
    return epubData.chapters.find((c) => c.id === selectedChapter) || null;
  }, [epubData, selectedChapter]);

  const getCurrentFragments = useCallback((): SMILFragment[] => {
    if (!epubData || !selectedChapter) return [];

    const chapterData = getChapterFragments(epubData, selectedChapter);
    return chapterData ? chapterData.fragments : [];
  }, [epubData, selectedChapter]);

  useEffect(() => {
    const data = epubDataRef.current;
    const chapterId = selectedChapterRef.current;
    if (!data || !chapterId) return;

    const chapterData = getChapterFragments(data, chapterId);
    if (!chapterData || chapterData.fragments.length === 0) {
      setCurrentAudioBlob(null);
      return;
    }

    const { smilId, fragments } = chapterData;
    const audioSrc = fragments[0].audioSrc;
    const smilItem = data.manifest.package.manifest[0].item.find(
      (item) => item.$ && item.$.id === smilId
    );
    const smilPath = smilItem && smilItem.$ ? smilItem.$.href : '';

    const smilUrl = new URL(smilPath, 'https://example.com');
    const resolvedAudioUrl = new URL(audioSrc, smilUrl);
    const resolvedAudioSrc = resolvedAudioUrl.pathname.substring(1);

    const audioFile = data.audioFiles.get(resolvedAudioSrc) || data.audioFiles.get(audioSrc);

    if (audioFile) {
      if (lastAudioFileBlobRef.current !== audioFile.blob) {
        setCurrentAudioBlob(new Blob([audioFile.blob], { type: 'audio/mpeg' }));
        lastAudioFileBlobRef.current = audioFile.blob;
      }
    } else {
      console.warn(`Audio file not found: ${resolvedAudioSrc} or ${audioSrc}`);
      setCurrentAudioBlob(null);
      lastAudioFileBlobRef.current = null;
    }
  }, [epubData, selectedChapter]);

  const exportEPUB = useCallback(async () => {
    if (!epubDataRef.current || !originalZip) return;

    const blob = await buildExportEPUB(epubDataRef.current, originalZip);
    saveAs(blob, 'exported.epub');
  }, [originalZip]);

  return {
    epubData,
    setEpubData,
    selectedChapter,
    selectedFragment,
    isLoading,
    error,
    loadEPUB,
    setSelectedChapter,
    setSelectedFragment,
    updateFragment,
    deleteFragment,
    splitFragmentByText,
    nudgeFragmentStart,
    nudgeFragmentEnd,
    applyTimeOffset,
    forceNonOverlappingFragments,
    getCurrentChapter,
    getCurrentFragments,
    currentAudioBlob,
    exportEPUB,
    history,
    historyIndex,
    canUndo,
    canRedo,
    undo,
    redo,
    goToHistory,
  };
};
