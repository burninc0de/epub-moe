import JSZip from 'jszip';
import { parseString } from 'xml2js';
import { EPUBParser } from './epubParser';
import { buildSMIL, calculateTotalDuration, updateOPFWithDuration } from './smilBuilder';
import { EPUBData, ContainerXML } from '../types/epub';

export const exportEPUB = async (epubData: EPUBData, originalZip: JSZip): Promise<Blob> => {
  const newZip = originalZip;
  const parser = new EPUBParser(newZip);
  const basePath = await parser.getBasePath();

  const mediaDurations = new Map<string, number>();

  // Update SMIL files, filtering out orphaned fragments
  for (const [id, fragments] of epubData.smilFiles.entries()) {
    const chapter = epubData.chapters.find(c => c.mediaOverlay === id);
    const manifestItem = epubData.manifest.package.manifest[0].item.find(item => item.$.id === id);

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

  return newZip.generateAsync({ type: 'blob' });
};
