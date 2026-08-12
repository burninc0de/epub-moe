import { SMILFragment } from '../types/epub';
import { create } from 'xmlbuilder2';

export const formatSMILDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
};

export const calculateTotalDuration = (fragments: SMILFragment[]): number => {
  if (fragments.length === 0) return 0;

  return Math.max(...fragments.map(f => f.clipEnd));
};

export const updateOPFWithDuration = async (opfContent: string, mediaDurations: Map<string, number>): Promise<string> => {
  let updatedContent = opfContent;

  updatedContent = updatedContent.replace(/<meta[^>]*property="media:duration"[^>]*>.*?<\/meta>/g, '');
  updatedContent = updatedContent.replace(/<meta[^>]*property="media:duration"[^>]*\/>/g, '');

  let totalDuration = 0;
  const mediaDurationEntries: string[] = [];

  for (const [overlayId, duration] of mediaDurations) {
    totalDuration += duration;

    mediaDurationEntries.push(
      `    <meta property="media:duration" refines="#${overlayId}">${formatSMILDuration(duration)}</meta>`
    );
  }

  mediaDurationEntries.push(
    `    <meta property="media:duration">${formatSMILDuration(totalDuration)}</meta>`
  );

  const metadataCloseIndex = updatedContent.lastIndexOf('</metadata>');
  if (metadataCloseIndex !== -1) {
    updatedContent =
      updatedContent.slice(0, metadataCloseIndex) +
      mediaDurationEntries.join('\n') + '\n  ' +
      updatedContent.slice(metadataCloseIndex);
  }

  return updatedContent;
};

const getExportParId = (fragmentId: string, smilId: string): string => {
  const prefix = `${smilId}::`;
  if (fragmentId.startsWith(prefix)) {
    return fragmentId.slice(prefix.length);
  }
  return fragmentId;
};

export const buildSMIL = (fragments: SMILFragment[], textRef: string, seqId: string, smilId: string): string => {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('smil', {
      xmlns: 'http://www.w3.org/ns/SMIL',
      'xmlns:epub': 'http://www.idpf.org/2007/ops',
      version: '3.0'
    })
    .ele('body')
    .ele('seq', {
      id: seqId,
      'epub:textref': textRef,
      'epub:type': 'chapter'
    });

  fragments
    .sort((a, b) => a.order - b.order)
    .forEach(fragment => {
      const textSrc = fragment.textSrc.split('#')[0];
      const textId = fragment.textSrc.split('#')[1] || '';
      const audioSrc = fragment.audioSrc.split('#')[0];
      const parId = fragment.id ? getExportParId(fragment.id, smilId) : `par${fragments.indexOf(fragment) + 1}`;

      const par = root.ele('par', {
        id: parId
      });

      par.ele('text', {
        src: `${textSrc}#${textId}`
      });

      par.ele('audio', {
        src: audioSrc,
        clipBegin: `${fragment.clipBegin.toFixed(3)}s`,
        clipEnd: `${fragment.clipEnd.toFixed(3)}s`
      });
    });

  return root.end({ prettyPrint: true, allowEmptyTags: true });
};
