import { SMILFragment, SMILAttributes } from '../types/epub';
import { create } from 'xmlbuilder2';
import { formatSMILDuration } from './time';

export const toXmlId = (raw: string): string => {
  const cleaned = raw.replace(/[^\p{L}\p{N}._-]/gu, '_');
  if (!cleaned) return 'overlay';
  return /^[\p{L}_]/u.test(cleaned) ? cleaned : `id_${cleaned}`;
};

export const calculateTotalDuration = (fragments: SMILFragment[]): number =>
  fragments.reduce((sum, f) => sum + (f.clipEnd - f.clipBegin), 0);

export const clipSignature = (fragments: SMILFragment[]): string =>
  [...fragments]
    .sort((a, b) => a.order - b.order)
    .map(f => `${f.clipBegin}:${f.clipEnd}`)
    .join('|');

const isDurationMetaStart = (line: string) =>
  /^\s*<meta\b/.test(line) && line.includes('property="media:duration"');

/** Removes whole meta lines, so a second export does not leave blank lines behind. */
const stripDurationMetas = (content: string, eol: string): string => {
  const kept: string[] = [];
  let insideMeta = false;

  for (const line of content.split(/\r?\n/)) {
    if (insideMeta) {
      insideMeta = !line.includes('</meta>');
      continue;
    }

    if (isDurationMetaStart(line)) {
      insideMeta = !line.includes('</meta>') && !line.trimEnd().endsWith('/>');
      continue;
    }

    kept.push(line);
  }

  return kept.join(eol);
};

export const updateOPFWithDuration = async (opfContent: string, mediaDurations: Map<string, number>): Promise<string> => {
  const eol = opfContent.includes('\r\n') ? '\r\n' : '\n';
  const withoutDurations = stripDurationMetas(opfContent, eol);

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

  const metadataCloseIndex = withoutDurations.lastIndexOf('</metadata>');
  if (metadataCloseIndex === -1) return withoutDurations;

  return (
    withoutDurations.slice(0, metadataCloseIndex) +
    mediaDurationEntries.join(eol) + eol + '  ' +
    withoutDurations.slice(metadataCloseIndex)
  );
};

const getExportParId = (fragmentId: string, smilId: string): string => {
  const prefix = `${smilId}::`;
  if (fragmentId.startsWith(prefix)) {
    return fragmentId.slice(prefix.length);
  }
  return fragmentId;
};

export const buildSMIL = (
  fragments: SMILFragment[],
  textRef: string,
  seqId: string,
  smilId: string,
  attrs?: SMILAttributes
): string => {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('smil', {
      xmlns: 'http://www.w3.org/ns/SMIL',
      'xmlns:epub': 'http://www.idpf.org/2007/ops',
      version: '3.0',
      ...attrs?.smil
    })
    .ele('body')
    .ele('seq', {
      id: seqId,
      'epub:textref': textRef,
      'epub:type': 'chapter',
      ...attrs?.seq
    });

  fragments
    .sort((a, b) => a.order - b.order)
    .forEach(fragment => {
      const textSrc = fragment.textSrc.split('#')[0];
      const textId = fragment.textSrc.split('#')[1] || '';
      const audioSrc = fragment.audioSrc.split('#')[0];
      const parId = fragment.id ? getExportParId(fragment.id, smilId) : `par${fragments.indexOf(fragment) + 1}`;

      const par = root.ele('par', {
        ...fragment.attrs,
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
