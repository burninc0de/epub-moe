import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { EPUBParser, resolvePath } from './epubParser';

describe('resolvePath', () => {
  it('joins relative paths', () => {
    expect(resolvePath('Text/ch1.xhtml', 'audio.mp3')).toBe('Text/audio.mp3');
  });

  it('resolves ../ from a base file path', () => {
    expect(resolvePath('OEBPS/Text/ch1.xhtml', '../Audio/a.mp3')).toBe('OEBPS/Audio/a.mp3');
  });

  it('ignores ./ segments', () => {
    expect(resolvePath('Text/ch1.xhtml', './audio.mp3')).toBe('Text/audio.mp3');
  });
});

describe('EPUBParser.parse', () => {
  const buildZip = () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
    zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
  </metadata>
  <manifest>
    <item id="ch1" href="Text/ch1.xhtml" media-type="application/xhtml+xml" media-overlay="smil1"/>
    <item id="smil1" href="smil1.smil" media-type="application/smil+xml"/>
    <item id="audio" href="Audio/a.mp3" media-type="audio/mpeg"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`);
    zip.file('OEBPS/Text/ch1.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title></head><body/></html>');
    zip.file('OEBPS/smil1.smil', `<?xml version="1.0"?>
<smil xmlns="http://www.w3.org/ns/SMIL" version="3.0">
  <body><seq id="seq1">
    <par id="p1"><text src="Text/ch1.xhtml#t1"/><audio src="Audio/a.mp3" clipBegin="1:02.5" clipEnd="2s"/></par>
    <par id="p2"><text src="Text/ch1.xhtml#t2"/><audio src="Audio/a.mp3" clipBegin="00:00:03" clipEnd="00:00:03.500"/></par>
  </seq></body>
</smil>`);
    zip.file('OEBPS/Audio/a.mp3', new Uint8Array([1, 2, 3]));
    return zip;
  };

  it('parses chapters, smil fragments, and audio files', async () => {
    const parser = new EPUBParser(buildZip());
    const data = await parser.parse();

    expect(data.title).toBe('Test Book');
    expect(data.chapters).toHaveLength(1);
    expect(data.chapters[0].mediaOverlay).toBe('smil1');

    const fragments = data.smilFiles.get('smil1');
    expect(fragments).toHaveLength(2);
    expect(fragments![0]).toMatchObject({
      id: 'smil1::p1',
      textSrc: 'Text/ch1.xhtml#t1',
      audioSrc: 'Audio/a.mp3',
    });

    expect(data.audioFiles.size).toBe(1);
  });

  it('parses SMIL clock times in both formats', async () => {
    const parser = new EPUBParser(buildZip());
    const data = await parser.parse();
    const fragments = data.smilFiles.get('smil1')!;

    expect(fragments[0].clipBegin).toBeCloseTo(62.5);
    expect(fragments[0].clipEnd).toBeCloseTo(2);
    expect(fragments[1].clipBegin).toBeCloseTo(3);
    expect(fragments[1].clipEnd).toBeCloseTo(3.5);
  });
});
