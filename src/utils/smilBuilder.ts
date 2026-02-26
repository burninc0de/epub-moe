import { SMILFragment } from '../types/epub';
import { create } from 'xmlbuilder2';

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
