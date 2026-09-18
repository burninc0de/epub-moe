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

describe('chapter titles', () => {
  /** A minimal EPUB whose single chapter has the given HTML. */
  const zipWithChapter = (chapterHtml: string) => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
    zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test Book</dc:title></metadata>
  <manifest><item id="ch1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="ch1"/></spine>
</package>`);
    zip.file('OEBPS/Text/ch1.xhtml', chapterHtml);
    return zip;
  };

  const titleOf = async (chapterHtml: string) => {
    const data = await new EPUBParser(zipWithChapter(chapterHtml)).parse();
    return data.chapters[0].title;
  };

  it('uses the first heading rather than the document title', async () => {
    const title = await titleOf(
      '<html><head><title>Test Book</title></head><body><h3>5. Frühstück</h3><p>Text</p></body></html>'
    );
    expect(title).toBe('5. Frühstück');
  });

  it('flattens nested markup in the heading', async () => {
    const title = await titleOf(
      '<html><body><h3 class="header"><span>5.</span> <span>Frühstück</span></h3></body></html>'
    );
    expect(title).toBe('5. Frühstück');
  });

  it('decodes entities in the heading', async () => {
    const title = await titleOf('<html><body><h1>1. &bdquo;Twittern&ldquo; &amp; mehr</h1></body></html>');
    expect(title).toBe('1. „Twittern“ & mehr');
  });

  it('picks the first heading when a chapter has several', async () => {
    const title = await titleOf('<html><body><h1>First</h1><h2>Second</h2></body></html>');
    expect(title).toBe('First');
  });

  it('accepts deeper headings, which these books use for exercises', async () => {
    const title = await titleOf('<html><body><h4>Übung</h4></body></html>');
    expect(title).toBe('Übung');
  });

  it('skips a decorative heading with no words in it', async () => {
    const title = await titleOf('<html><body><h5>~</h5><h3>Real Title</h3></body></html>');
    expect(title).toBe('Real Title');
  });

  it('ignores <title>, which holds the book name in these files', async () => {
    // The regression this guards: every chapter was labelled with the book
    // title, because <title> repeats it and differs from dc:title by an en dash.
    const title = await titleOf(
      '<html><head><title>Test Book</title></head><body><p>No heading here</p></body></html>'
    );
    expect(title).toBe('Text/ch1.xhtml');
  });

  it('falls back to the file path when there is no heading', async () => {
    const title = await titleOf('<html><body><h1>   </h1></body></html>');
    expect(title).toBe('Text/ch1.xhtml');
  });
});
