import { useState, useCallback, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { EPUBParser } from '../utils/epubParser';
import { buildSMIL } from '../utils/smilBuilder';
import { EPUBData, EPUBChapter, SMILFragment } from '../types/epub';

const LAST_CHAPTER_KEY = 'nuTobi:lastSelectedChapter';

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
    if (!epubData) return;

    const newSmilFiles = new Map(epubData.smilFiles);
    
    for (const [smilId, fragments] of newSmilFiles) {
      const fragmentIndex = fragments.findIndex(f => f.id === fragmentId);
      if (fragmentIndex !== -1) {
        const updatedFragments = [...fragments];
        updatedFragments[fragmentIndex] = { ...updatedFragments[fragmentIndex], ...updates };
        
        // If timing was updated, recalculate order to maintain chronological order
        if (updates.clipBegin !== undefined || updates.clipEnd !== undefined) {
          const fragmentsWithCorrectOrder = updatedFragments
            .sort((a, b) => a.clipBegin - b.clipBegin)
            .map((frag, index) => ({
              ...frag,
              order: index
            }));
          newSmilFiles.set(smilId, fragmentsWithCorrectOrder);
        } else {
          newSmilFiles.set(smilId, updatedFragments);
        }
        break;
      }
    }

    setEpubData({ ...epubData, smilFiles: newSmilFiles });

    // Update selected fragment if it's the one being edited
    if (selectedFragment?.id === fragmentId) {
      setSelectedFragment({ ...selectedFragment, ...updates });
    }
  }, [epubData, selectedFragment]);

  const deleteFragment = useCallback((fragmentId: string) => {
    if (!epubData) return;

    const newSmilFiles = new Map(epubData.smilFiles);
    
    for (const [smilId, fragments] of newSmilFiles) {
      const fragmentIndex = fragments.findIndex(f => f.id === fragmentId);
      if (fragmentIndex !== -1) {
        const updatedFragments = fragments.filter(f => f.id !== fragmentId);
        
        // Recalculate order values to maintain sequential order after deletion
        const fragmentsWithCorrectOrder = updatedFragments
          .sort((a, b) => a.clipBegin - b.clipBegin)
          .map((frag, index) => ({
            ...frag,
            order: index
          }));
        
        newSmilFiles.set(smilId, fragmentsWithCorrectOrder);
        break;
      }
    }

    setEpubData({ ...epubData, smilFiles: newSmilFiles });
    
    if (selectedFragment?.id === fragmentId) {
      setSelectedFragment(null);
    }
  }, [epubData, selectedFragment]);

  const splitFragment = useCallback((fragmentId: string, splitTime: number) => {
    if (!epubData) return;

    const newSmilFiles = new Map(epubData.smilFiles);
    
    for (const [smilId, fragments] of newSmilFiles) {
      const fragmentIndex = fragments.findIndex(f => f.id === fragmentId);
      if (fragmentIndex !== -1) {
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
        
        // Recalculate order values for all fragments to ensure chronological order
        const fragmentsWithCorrectOrder = updatedFragments
          .sort((a, b) => a.clipBegin - b.clipBegin)
          .map((fragment, index) => ({
            ...fragment,
            order: index
          }));
        
        newSmilFiles.set(smilId, fragmentsWithCorrectOrder);
        break;
      }
    }

    setEpubData({ ...epubData, smilFiles: newSmilFiles });
  }, [epubData]);

  const splitFragmentByText = useCallback((fragmentId: string, splitIndex: number) => {
    if (!epubData || !selectedChapter) return;

    const chapter = epubData.chapters.find(c => c.id === selectedChapter);
    if (!chapter || !chapter.mediaOverlay) return;

    const smilFileId = chapter.mediaOverlay;
    const fragments = epubData.smilFiles.get(smilFileId);
    if (!fragments) return;

    const fragmentIndex = fragments.findIndex(f => f.id === fragmentId);
    if (fragmentIndex === -1) return;

    const originalFragment = fragments[fragmentIndex];
    const textSrcId = originalFragment.textSrc.split('#')[1];
    if (!textSrcId) return;

    // 1. Modify chapter HTML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(chapter.content, 'application/xhtml+xml');
    const originalElement = doc.getElementById(textSrcId);

    if (!originalElement) return;
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
    const splitTime = originalFragment.clipBegin + (duration * (splitIndex / (originalText.length || 1)));

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
      
      // Recalculate order values for all fragments after the split to ensure chronological order
      const fragmentsWithCorrectOrder = updatedFragments
        .sort((a, b) => a.clipBegin - b.clipBegin)
        .map((fragment, index) => ({
          ...fragment,
          order: index
        }));
      
      newSmilFiles.set(smilFileId, fragmentsWithCorrectOrder);


      return {
        ...prevData,
        chapters: newChapters,
        smilFiles: newSmilFiles,
      };
    });

    setSelectedFragment(firstFragment); // Select the first new fragment

  }, [epubData, selectedChapter]);

  const addFragment = useCallback((afterId: string, newFragment: Partial<SMILFragment>) => {
    if (!epubData) return;

    const newSmilFiles = new Map(epubData.smilFiles);
    
    for (const [smilId, fragments] of newSmilFiles) {
      const fragmentIndex = fragments.findIndex(f => f.id === afterId);
      if (fragmentIndex !== -1) {
        const fragment: SMILFragment = {
          id: `fragment_${Date.now()}`,
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
        
        // Recalculate order values to ensure chronological order
        const fragmentsWithCorrectOrder = updatedFragments
          .sort((a, b) => a.clipBegin - b.clipBegin)
          .map((frag, index) => ({
            ...frag,
            order: index
          }));
        
        newSmilFiles.set(smilId, fragmentsWithCorrectOrder);
        break;
      }
    }

    setEpubData({ ...epubData, smilFiles: newSmilFiles });
  }, [epubData]);

  const applyTimeOffset = useCallback((fromTime: number, offsetSeconds: number) => {
    if (!epubData || !selectedChapter) return;

    const chapter = epubData.chapters.find(c => c.id === selectedChapter);
    if (!chapter?.mediaOverlay) return;

    const smilFileId = chapter.mediaOverlay;
    const fragments = epubData.smilFiles.get(smilFileId);
    if (!fragments) return;

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

    // Recalculate order values to maintain chronological order after time changes
    const fragmentsWithCorrectOrder = updatedFragments
      .sort((a, b) => a.clipBegin - b.clipBegin)
      .map((frag, index) => ({
        ...frag,
        order: index
      }));

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

  const getCurrentChapter = useCallback((): EPUBChapter | null => {
    if (!epubData || !selectedChapter) return null;
    return epubData.chapters.find(c => c.id === selectedChapter) || null;
  }, [epubData, selectedChapter]);

  const getCurrentFragments = useCallback((): SMILFragment[] => {
    if (!epubData || !selectedChapter) return [];
    
    const chapter = getCurrentChapter();
    if (!chapter?.mediaOverlay) return [];
    
    return epubData.smilFiles.get(chapter.mediaOverlay) || [];
  }, [epubData, selectedChapter, getCurrentChapter]);

  useEffect(() => {
    if (epubData && selectedChapter) {
      const chapter = epubData.chapters.find(c => c.id === selectedChapter);
      if (chapter && chapter.mediaOverlay) {
        const fragments = epubData.smilFiles.get(chapter.mediaOverlay) || [];
        if (fragments.length > 0) {
          const audioSrc = fragments[0].audioSrc;
          // Find the SMIL file path from the manifest
          const smilItem = Array.from(epubData.manifest.package.manifest[0].item).find(
            (item: any) => item.$ && item.$.id === chapter.mediaOverlay
          ) as any;
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
              lastAudioFileBlobRef.current = audioFile.blob; // Update the ref
            }
          } else {
            console.warn(`Audio file not found: ${resolvedAudioSrc} or ${audioSrc}`);
            setCurrentAudioBlob(null);
            lastAudioFileBlobRef.current = null; // Clear ref if no audio file
          }
        } else {
          setCurrentAudioBlob(null);
        }
      } else {
        setCurrentAudioBlob(null);
      }
    }
  }, [epubData, selectedChapter]);

  // Helper function to format duration as SMIL3 clock value (HH:MM:SS.mmm)
  const formatSMILDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
  };

  // Helper function to calculate total duration from SMIL fragments
  const calculateTotalDuration = (fragments: SMILFragment[]): number => {
    if (fragments.length === 0) return 0;
    
    // Find the maximum clipEnd time across all fragments
    return Math.max(...fragments.map(f => f.clipEnd));
  };

  // Helper function to update OPF metadata with media:duration
  const updateOPFWithDuration = async (opfContent: string, mediaDurations: Map<string, number>): Promise<string> => {
    // Use string replacement instead of DOM manipulation to avoid namespace issues
    let updatedContent = opfContent;
    
    // Remove existing media:duration elements
    updatedContent = updatedContent.replace(/<meta[^>]*property="media:duration"[^>]*>.*?<\/meta>/g, '');
    updatedContent = updatedContent.replace(/<meta[^>]*property="media:duration"[^>]*\/>/g, '');
    
    // Calculate total duration across all chapters
    let totalDuration = 0;
    const mediaDurationEntries: string[] = [];
    
    for (const [overlayId, duration] of mediaDurations) {
      totalDuration += duration;
      
      // Add individual chapter duration
      mediaDurationEntries.push(
        `    <meta property="media:duration" refines="#${overlayId}">${formatSMILDuration(duration)}</meta>`
      );
    }
    
    // Add total duration
    mediaDurationEntries.push(
      `    <meta property="media:duration">${formatSMILDuration(totalDuration)}</meta>`
    );
    
    // Find the closing metadata tag and insert before it
    const metadataCloseIndex = updatedContent.lastIndexOf('</metadata>');
    if (metadataCloseIndex !== -1) {
      updatedContent = 
        updatedContent.slice(0, metadataCloseIndex) +
        mediaDurationEntries.join('\n') + '\n  ' +
        updatedContent.slice(metadataCloseIndex);
    }
    
    return updatedContent;
  };

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
      const manifestItem = epubData.manifest.package.manifest[0].item.find((item: any) => item.$.id === id);

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

        const newSmilContent = buildSMIL(validFragments, textRef, seqId);
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
      const parseString = (await import('xml2js')).parseString;
      
      const containerXml = await new Promise<any>((resolve, reject) => {
        parseString(containerContent, (err: any, result: any) => {
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
    applyTimeOffset,
    getCurrentChapter,
    getCurrentFragments,
    currentAudioBlob,
    exportEPUB
  };
};