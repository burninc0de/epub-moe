// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { EPUBParser } from './epubParser';
import { exportEPUB } from './exportEPUB';
import { buildSMIL } from './smilBuilder';
import { SMILFragment } from '../types/epub';

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
    <meta property="media:duration">00:00:00.00</meta>
  </metadata>
  <manifest>
    <item id="ch1" href="Text/ch1.xhtml" media-type="application/xhtml+xml" media-overlay="smil1"/>
    <item id="smil1" href="smil1.smil" media-type="application/smil+xml"/>
    <item id="audio" href="Audio/a.mp3" media-type="audio/mpeg"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`);
  zip.file('OEBPS/Text/ch1.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title></head><body><span id="t1">One</span><span id="t2">Two</span></body></html>`);
  zip.file('OEBPS/smil1.smil', buildSMIL([
    { id: 'smil1::p1', textSrc: 'Text/ch1.xhtml#t1', audioSrc: 'Audio/a.mp3', clipBegin: 0, clipEnd: 1, text: '', order: 0 },
    { id: 'smil1::p2', textSrc: 'Text/ch1.xhtml#t2', audioSrc: 'Audio/a.mp3', clipBegin: 1, clipEnd: 2, text: '', order: 1 },
  ] as SMILFragment[], '../Text/ch1.xhtml', 'ch1_overlay', 'smil1'));
  zip.file('OEBPS/Audio/a.mp3', new Uint8Array([1, 2, 3]));
  return zip;
};

describe('exportEPUB', () => {
  it('writes updated SMIL, chapter HTML, and OPF duration', async () => {
    const zip = buildZip();
    const data = await new EPUBParser(zip).parse();

    // Simulate an edit: retime the first fragment
    const fragments = data.smilFiles.get('smil1')!;
    fragments[0] = { ...fragments[0], clipEnd: 1.5 };
    data.smilFiles.set('smil1', fragments);

    const blob = await exportEPUB(data, zip);
    const exported = await JSZip.loadAsync(await blob.arrayBuffer());

    const smil = await exported.file('OEBPS/smil1.smil')!.async('text');
    expect(smil).toContain('clipEnd="1.500s"');

    const opf = await exported.file('OEBPS/content.opf')!.async('text');
    expect(opf).toContain('refines="#smil1"');
    expect(opf).toContain('00:00:02.00');
  });

  it('drops orphaned fragments whose text id no longer exists in the HTML', async () => {
    const zip = buildZip();
    const data = await new EPUBParser(zip).parse();

    // Drop t1 from the chapter HTML and keep a fragment referencing it
    data.chapters[0] = { ...data.chapters[0], content: data.chapters[0].content.replace('<span id="t1">One</span>', '') };

    const blob = await exportEPUB(data, zip);
    const exported = await JSZip.loadAsync(await blob.arrayBuffer());
    const smil = await exported.file('OEBPS/smil1.smil')!.async('text');

    expect(smil).not.toContain('#t1');
    expect(smil).toContain('#t2');
  });
});
