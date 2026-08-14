import { useState, useCallback, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { parseString } from 'xml2js';
import { EPUBParser } from '../utils/epubParser';
import { buildSMIL, calculateTotalDuration, updateOPFWithDuration } from '../utils/smilBuilder';
import { EPUBData, EPUBChapter, SMILFragment, ContainerXML, OPFManifestItem } from '../types/epub';

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
  const chapter = epubData.chapters.find(c => c.id === selectedChapter);
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

export const useEPUBEditor = () => {
  const [epubData, setEpubData] = useState<EPUBData | null>(null);
  const [originalZip, setOriginalZip] = useState<JSZip | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [selectedFragment, setSelectedFragment] = useState<SMILFragment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAudioBlob, setCurrentAudioBlob] = useState<Blob | null>(null);
  const lastAudioFileBlobRef = useRef<Blob | null>(null);

  const loadEPUB = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    try {
      const zip = await JSZip.loadAsync(file);
      setOriginalZip(zip);
      const parser = new EPUBParser(zip);
      const data = await parser.parse();
      setEpubData(data);

      // Try to restore last selected chapter from localStorage
      const lastSelected = localStorage.getItem(LAST_CHAPTER_KEY);
      const validChapter = lastSelected && data.chapters.find(c => c.id === lastSelected);
      if (validChapter) {
        setSelectedChapter(validChapter.id);
      } else {
        // Auto-select first chapter with media overlay
        const firstChapterWithOverlay = data.chapters.find(c => c.mediaOverlay);
        if (firstChapterWithOverlay) {
          setSelectedChapter(firstChapterWithOverlay.id);
        } else if (data.chapters.length > 0) {
          setSelectedChapter(data.chapters[0].id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse EPUB file');
    } finally {
      setIsLoading(false);
    }
  }, []);
  // Persist selectedChapter to localStorage whenever it changes
  useEffect(() => {
    if (selectedChapter) {
      localStorage.setItem(LAST_CHAPTER_KEY, selectedChapter);
    }
  }, [selectedChapter]);

  const updateFragment = useCallback((fragmentId: string, updates: Partial<SMILFragment>) => {
    if (!epubData || !selectedChapter) return;

    const chapterData = getChapterFragments(epubData, selectedChapter);
    if (!chapterData) return;

    const { smilId, fragments } = chapterData;
    const fragmentIndex = fragments.findIndex(f => f.id === fragmentId);
    if (fragmentIndex === -1) return;

    const updatedFragments = [...fragments];
    updatedFragments[fragmentIndex] = { ...updatedFragments[fragmentIndex], ...updates };

    const newSmilFiles = new Map(epubData.smilFiles);

    if (updates.clipBegin !== undefined || updates.clipEnd !== undefined) {
      newSmilFiles.set(smilId, normalizeOrder(updatedFragments));
    } else {
      newSmilFiles.set(smilId, updatedFragments);
    }

    setEpubData({ ...epubData, smilFiles: newSmilFiles });

    if (selectedFragment?.id === fragmentId) {
      setSelectedFragment({ ...selectedFragment, ...updates });
    }
  }, [epubData, selectedChapter, selectedFragment]);

  const nudgeFragmentStart = useCallback((fragmentId: string, deltaSeconds: number) => {
    if (!epubData || !selectedChapter) return;

    const chapterData = getChapterFragments(epubData, selectedChapter);
    if (!chapterData) return;

    const { smilId, fragments } = chapterData;
    const fragmentIndex = fragments.findIndex(f => f.id === fragmentId);
    if (fragmentIndex === -1) return;

    const fragment = fragments[fragmentIndex];
    const newStart = Math.max(0, Math.min(fragment.clipBegin + deltaSeconds, fragment.clipEnd - 0.01));
    if (newStart === fragment.clipBegin) return;

    const updatedFragments = [...fragments];
    updatedFragments[fragmentIndex] = { ...fragment, clipBegin: newStart };

    // Keep the previous fragment's end contiguous (end of prev = start of next)
    if (fragmentIndex > 0) {
      updatedFragments[fragmentIndex - 1] = {
        ...updatedFragments[fragmentIndex - 1],
        clipEnd: newStart,
      };
    }

    const newSmilFiles = new Map(epubData.smilFiles);
    newSmilFiles.set(smilId, normalizeOrder(updatedFragments));

    setEpubData({ ...epubData, smilFiles: newSmilFiles });

    if (selectedFragment?.id === fragmentId) {
      setSelectedFragment({ ...selectedFragment, clipBegin: newStart });
    }
  }, [epubData, selectedChapter, selectedFragment]);

  const nudgeFragmentEnd = useCallback((fragmentId: string, deltaSeconds: number) => {
    if (!epubData || !selectedChapter) return;

    const chapterData = getChapterFragments(epubData, selectedChapter);
    if (!chapterData) return;

    const { smilId, fragments } = chapterData;
    const fragmentIndex = fragments.findIndex(f => f.id === fragmentId);
    if (fragmentIndex === -1) return;

    const fragment = fragments[fragmentIndex];
    const newEnd = Math.max(fragment.clipBegin + 0.01, fragment.clipEnd + deltaSeconds);
    if (newEnd === fragment.clipEnd) return;

    const updatedFragments = [...fragments];
    updatedFragments[fragmentIndex] = { ...fragment, clipEnd: newEnd };

    // Keep the next fragment's start contiguous (start of next = end of current)
    if (fragmentIndex < updatedFragments.length - 1) {
      updatedFragments[fragmentIndex + 1] = {
        ...updatedFragments[fragmentIndex + 1],
        clipBegin: newEnd,
      };
    }

    const newSmilFiles = new Map(epubData.smilFiles);
    newSmilFiles.set(smilId, normalizeOrder(updatedFragments));

    setEpubData({ ...epubData, smilFiles: newSmilFiles });

    if (selectedFragment?.id === fragmentId) {
      setSelectedFragment({ ...selectedFragment, clipEnd: newEnd });
    }
  }, [epubData, selectedChapter, selectedFragment]);

  const deleteFragment = useCallback((fragmentId: string) => {
    if (!epubData || !selectedChapter) return;

    const chapterData = getChapterFragments(epubData, selectedChapter);
    if (!chapterData) return;

    const { smilId, fragments } = chapterData;
    const fragmentIndex = fragments.findIndex(f => f.id === fragmentId);
    if (fragmentIndex === -1) return;

    const updatedFragments = fragments.filter(f => f.id !== fragmentId);

    const newSmilFiles = new Map(epubData.smilFiles);
    newSmilFiles.set(smilId, normalizeOrder(updatedFragments));

    setEpubData({ ...epubData, smilFiles: newSmilFiles });

    if (selectedFragment?.id === fragmentId) {
      setSelectedFragment(null);
    }
  }, [epubData, selectedChapter, selectedFragment]);

  const splitFragment = useCallback((fragmentId: string, splitTime: number) => {
    if (!epubData || !selectedChapter) return;

    const chapterData = getChapterFragments(epubData, selectedChapter);
    if (!chapterData) return;

    const { smilId, fragments } = chapterData;
    const fragmentIndex = fragments.findIndex(f => f.id === fragmentId);
    if (fragmentIndex === -1) return;

    const originalFragment = fragments[fragmentIndex];
    const firstFragment = {
      ...originalFragment,
      clipEnd: splitTime,
      id: `${originalFragment.id}_part1`
    };
    const secondFragment = {
      ...originalFragment,
      clipBegin: splitTime,
      id: `${originalFragment.id}_part2`,
      order: originalFragment.order + 0.1
    };

    const updatedFragments = [
      ...fragments.slice(0, fragmentIndex),
      firstFragment,
      secondFragment,
      ...fragments.slice(fragmentIndex + 1)
    ];

    const newSmilFiles = new Map(epubData.smilFiles);
    newSmilFiles.set(smilId, normalizeOrder(updatedFragments));

    setEpubData({ ...epubData, smilFiles: newSmilFiles });
  }, [epubData, selectedChapter]);

  const splitFragmentByText = useCallback((fragmentId: string, splitIndex: number): boolean => {
    if (!epubData || !selectedChapter) return false;

    const chapterData = getChapterFragments(epubData, selectedChapter);
    if (!chapterData) return false;

    const { chapter, smilId: smilFileId, fragments } = chapterData;

    const fragmentIndex = fragments.findIndex(f => f.id === fragmentId);
    if (fragmentIndex === -1) return false;

    const originalFragment = fragments[fragmentIndex];
    const originalDuration = originalFragment.clipEnd - originalFragment.clipBegin;
    if (!Number.isFinite(originalDuration) || originalDuration < MIN_TEXT_SPLIT_DURATION * 2) {
      return false;
    }

    const textSrcId = originalFragment.textSrc.split('#')[1];
    if (!textSrcId) return false;

    // 1. Modify chapter HTML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter.content, 'application/xhtml+xml');
    const originalElement = doc.getElementById(textSrcId);

    if (!originalElement) return false;
    // Instead of splitting by textContent, split by child nodes to preserve all HTML elements
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
      // For text nodes, split if needed
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (charCount + text.length <= splitIndex) {
          nodes1.push(node.cloneNode(true) as ChildNode);
          text1 += text;
          charCount += text.length;
        } else {
          // Split this text node
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
        // For element nodes, count their textContent length
        const text = node.textContent || '';
        if (charCount + text.length <= splitIndex) {
          nodes1.push(node.cloneNode(true) as ChildNode);
          text1 += text;
          charCount += text.length;
        } else {
          // Need to split inside this element
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
              // Split here
              const childSplitAt = splitAt - innerCharCount;
              if (child.nodeType === Node.TEXT_NODE) {
                if (childSplitAt > 0) {
                  clone1.appendChild(doc.createTextNode(child.textContent!.slice(0, childSplitAt)));
                  text1 += child.textContent!.slice(0, childSplitAt);
                }
                clone2.appendChild(doc.createTextNode(child.textContent!.slice(childSplitAt)));
                text2 += child.textContent!.slice(childSplitAt);
              } else {
                // For nested elements, just put the whole thing in clone2
                clone2.appendChild(child.cloneNode(true));
                text2 += childText;
              }
              innerCharCount = splitAt; // Done
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
    nodes1.forEach(n => span1.appendChild(n));

    const span2 = doc.createElement('span');
    span2.id = id2;
    nodes2.forEach(n => span2.appendChild(n));

    // Replace original element with a new element containing the two spans
    const parent = originalElement.parentNode;
    if (parent) {
      parent.replaceChild(span1, originalElement);
      parent.insertBefore(span2, span1.nextSibling);
    } else {
      // Fallback if parent is null, though this is unlikely
      originalElement.textContent = '';
      originalElement.appendChild(span1);
      originalElement.appendChild(span2);
    }

    const updatedContent = new XMLSerializer().serializeToString(doc);

    // 2. Modify SMIL fragments
    const duration = originalFragment.clipEnd - originalFragment.clipBegin;
    const splitRatio = Math.min(1, Math.max(0, text1.length / (originalText.length || 1)));
    let splitTime = originalFragment.clipBegin + (duration * splitRatio);
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
      order: originalFragment.order + 0.1, // Small increment to maintain order
    };


    setEpubData(prevData => {
      if (!prevData) return null;

      const newChapters = prevData.chapters.map(c => c.id === chapter.id ? { ...c, content: updatedContent } : c);
      const newSmilFiles = new Map(prevData.smilFiles);
      
      // Create new fragments array with proper ordering
      const updatedFragments = [
        ...fragments.slice(0, fragmentIndex),
        firstFragment,
        secondFragment,
        ...fragments.slice(fragmentIndex + 1)
      ];
      
      newSmilFiles.set(smilFileId, normalizeOrder(updatedFragments));


      return {
        ...prevData,
        chapters: newChapters,
        smilFiles: newSmilFiles,
      };
    });

    setSelectedFragment(firstFragment); // Select the first new fragment
    return true;

  }, [epubData, selectedChapter]);

  const addFragment = useCallback((afterId: string, newFragment: Partial<SMILFragment>) => {
    if (!epubData || !selectedChapter) return;

    const chapterData = getChapterFragments(epubData, selectedChapter);
    if (!chapterData) return;

    const { smilId, fragments } = chapterData;
    const fragmentIndex = fragments.findIndex(f => f.id === afterId);
    if (fragmentIndex === -1) return;

    const fragment: SMILFragment = {
      id: `${smilId}::fragment_${Date.now()}`,
      textSrc: '',
      audioSrc: '',
      clipBegin: 0,
      clipEnd: 1,
      text: '',
      order: fragments[fragmentIndex].order + 0.1,
      ...newFragment
    };

    const updatedFragments = [
      ...fragments.slice(0, fragmentIndex + 1),
      fragment,
      ...fragments.slice(fragmentIndex + 1)
    ];

    const newSmilFiles = new Map(epubData.smilFiles);
    newSmilFiles.set(smilId, normalizeOrder(updatedFragments));

    setEpubData({ ...epubData, smilFiles: newSmilFiles });
  }, [epubData, selectedChapter]);

  const applyTimeOffset = useCallback((fromTime: number, offsetSeconds: number) => {
    if (!epubData || !selectedChapter) return;

    const chapterData = getChapterFragments(epubData, selectedChapter);
    if (!chapterData) return;

    const { smilId: smilFileId, fragments } = chapterData;

    const newSmilFiles = new Map(epubData.smilFiles);
    
    // Update fragments that start at or after the fromTime
    const updatedFragments = fragments.map(fragment => {
      if (fragment.clipBegin >= fromTime) {
        return {
          ...fragment,
          clipBegin: Math.max(0, fragment.clipBegin + offsetSeconds),
          clipEnd: Math.max(fragment.clipBegin + offsetSeconds + 0.1, fragment.clipEnd + offsetSeconds)
        };
      } else if (fragment.clipEnd > fromTime) {
        // Fragment spans across the fromTime - only adjust the end
        return {
          ...fragment,
          clipEnd: Math.max(fragment.clipBegin + 0.1, fragment.clipEnd + offsetSeconds)
        };
      }
      return fragment;
    });

    const fragmentsWithCorrectOrder = normalizeOrder(updatedFragments);

    newSmilFiles.set(smilFileId, fragmentsWithCorrectOrder);
    setEpubData({ ...epubData, smilFiles: newSmilFiles });

    // Update selected fragment if it was affected
    if (selectedFragment && selectedFragment.clipBegin >= fromTime) {
      const updatedSelected = fragmentsWithCorrectOrder.find(f => f.id === selectedFragment.id);
      if (updatedSelected) {
        setSelectedFragment(updatedSelected);
      }
    }
  }, [epubData, selectedChapter, selectedFragment]);

  const forceNonOverlappingFragments = useCallback((audioDuration?: number) => {
    if (!epubData || !selectedChapter) return;

    const chapterData = getChapterFragments(epubData, selectedChapter);
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

    const targetDuration = Number.isFinite(audioDuration) && (audioDuration || 0) > 0
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

    const weights = ordered.map(fragment => {
      const textId = fragment.textSrc.split('#')[1] || '';
      const element = textId ? chapterDoc.getElementById(textId) : null;
      const textLength = (element?.textContent || '').replace(/\s+/g, ' ').trim().length;
      return Math.max(1, textLength);
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    const scaledDurations = weights.map(weight => {
      if (totalWeight <= 0) return minDuration;
      return minDuration + (weight / totalWeight) * distributableDuration;
    });

    let cursor = 0;
    const normalized = ordered.map((fragment, index) => {
      const clipBegin = cursor;
      const clipEnd = index === ordered.length - 1
        ? targetDuration
        : Math.min(targetDuration, cursor + Math.max(MIN_FRAGMENT_DURATION, scaledDurations[index]));
      cursor = clipEnd;

      return {
        ...fragment,
        clipBegin,
        clipEnd,
        order: index
      };
    });

    const newSmilFiles = new Map(epubData.smilFiles);
    newSmilFiles.set(smilFileId, normalized);
    setEpubData({ ...epubData, smilFiles: newSmilFiles });

    if (selectedFragment) {
      const updatedSelected = normalized.find(f => f.id === selectedFragment.id);
      if (updatedSelected) {
        setSelectedFragment(updatedSelected);
      }
    }
  }, [epubData, selectedChapter, selectedFragment]);

  const getCurrentChapter = useCallback((): EPUBChapter | null => {
    if (!epubData || !selectedChapter) return null;
    return epubData.chapters.find(c => c.id === selectedChapter) || null;
  }, [epubData, selectedChapter]);

  const getCurrentFragments = useCallback((): SMILFragment[] => {
    if (!epubData || !selectedChapter) return [];

    const chapterData = getChapterFragments(epubData, selectedChapter);
    return chapterData ? chapterData.fragments : [];
  }, [epubData, selectedChapter]);

  useEffect(() => {
    if (!epubData || !selectedChapter) return;

    const chapterData = getChapterFragments(epubData, selectedChapter);
    if (!chapterData || chapterData.fragments.length === 0) {
      setCurrentAudioBlob(null);
      return;
    }

    const { smilId, fragments } = chapterData;
    const audioSrc = fragments[0].audioSrc;
    // Find the SMIL file path from the manifest
    const smilItem = epubData.manifest.package.manifest[0].item.find(
      (item: OPFManifestItem) => item.$ && item.$.id === smilId
    );
    const smilPath = (smilItem && smilItem.$) ? smilItem.$.href : '';

    // The audioSrc might be relative to the SMIL file, so we need to resolve it
    const smilUrl = new URL(smilPath, 'https://example.com');
    const resolvedAudioUrl = new URL(audioSrc, smilUrl);
    const resolvedAudioSrc = resolvedAudioUrl.pathname.substring(1);

    const audioFile = epubData.audioFiles.get(resolvedAudioSrc) || epubData.audioFiles.get(audioSrc);

    if (audioFile) {
      // Only create a new Blob and update state if the underlying audio data has changed
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
    if (!epubData || !originalZip) return;

    const newZip = originalZip;
    const parser = new EPUBParser(newZip);
    const basePath = await parser.getBasePath();

    // Track media durations for OPF update
    const mediaDurations = new Map<string, number>();

    // Update SMIL files, filtering out orphaned fragments
    for (const [id, fragments] of epubData.smilFiles.entries()) {
      const chapter = epubData.chapters.find(c => c.mediaOverlay === id);
      const manifestItem = epubData.manifest.package.manifest[0].item.find((item: OPFManifestItem) => item.$.id === id);

      if (chapter && manifestItem) {
        const smilPath = basePath + manifestItem.$.href;
        const smilParts = manifestItem.$.href.split('/');
        const textRef = smilParts.length > 1 ? `../Text/${chapter.href.split('/').pop()}` : chapter.href;
        const seqId = `${chapter.href.split('/').pop()}_overlay`;

        // Parse chapter HTML and collect all element IDs
        const parserDOM = new DOMParser();
        const doc = parserDOM.parseFromString(chapter.content, 'application/xhtml+xml');
        const allIds = new Set();
        const allElements = doc.querySelectorAll('[id]');
        allElements.forEach(el => allIds.add(el.id));

        // Only keep fragments whose textSrc id exists in the HTML
        const validFragments = fragments.filter(frag => {
          const textId = frag.textSrc.split('#')[1];
          return textId && allIds.has(textId);
        });

        // Calculate duration for this chapter
        const chapterDuration = calculateTotalDuration(validFragments);
        mediaDurations.set(id, chapterDuration);

        const newSmilContent = buildSMIL(validFragments, textRef, seqId, id);
        newZip.file(smilPath, newSmilContent);
      }
    }

    // Update chapter files
    for (const chapter of epubData.chapters) {
      const chapterPath = basePath + chapter.href;
      newZip.file(chapterPath, chapter.content);
    }

    // Update OPF file with corrected media:duration values
    const containerFile = newZip.file('META-INF/container.xml');
    if (containerFile) {
      const containerContent = await containerFile.async('text');

      const containerXml = await new Promise<ContainerXML>((resolve, reject) => {
        parseString(containerContent, (err: Error | null, result: ContainerXML) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
      const opfPath = containerXml.container.rootfiles[0].rootfile[0].$['full-path'];
      const opfFile = newZip.file(opfPath);
      
      if (opfFile) {
        const opfContent = await opfFile.async('text');
        const updatedOPFContent = await updateOPFWithDuration(opfContent, mediaDurations);
        newZip.file(opfPath, updatedOPFContent);
      }
    }

    const blob = await newZip.generateAsync({ type: 'blob' });
    saveAs(blob, 'exported.epub');
  }, [epubData, originalZip]);

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
    splitFragment,
    splitFragmentByText,
    addFragment,
    nudgeFragmentStart,
    nudgeFragmentEnd,
    applyTimeOffset,
    forceNonOverlappingFragments,
    getCurrentChapter,
    getCurrentFragments,
    currentAudioBlob,
    exportEPUB
  };
};