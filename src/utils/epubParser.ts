import JSZip from 'jszip';
import { parseString } from 'xml2js';
import { EPUBData, EPUBChapter, SMILFragment, AudioFile } from '../types/epub';

export const resolvePath = (from: string, to: string): string => {
  const fromParts = from.split('/').slice(0, -1);
  const toParts = to.split('/');

  for (const part of toParts) {
    if (part === '..') {
      fromParts.pop();
    } else if (part !== '.') {
      fromParts.push(part);
    }
  }

  return fromParts.join('/');
};

export class EPUBParser {
  private zip: JSZip;
  private containerXml: any;
  private opfPath: string = '';
  private opfData: any;

  constructor(zip: JSZip) {
    this.zip = zip;
  }

  async parse(): Promise<EPUBData> {
    await this.parseContainer();
    await this.parseOPF();
    const chapters = await this.parseChapters();
    const smilFiles = await this.parseSMILFiles();
    const audioFiles = await this.parseAudioFiles();
    
    return {
      title: this.extractStringFromXMLJS(this.opfData?.package?.metadata?.[0]?.['dc:title']?.[0]) || 'Untitled',
      chapters,
      smilFiles,
      audioFiles,
      manifest: this.opfData
    };
  }

  private async parseContainer(): Promise<void> {
    const containerFile = this.zip.file('META-INF/container.xml');
    if (!containerFile) throw new Error('Invalid EPUB: Missing container.xml');
    
    const containerContent = await containerFile.async('text');
    this.containerXml = await this.parseXML(containerContent);
    this.opfPath = this.containerXml.container.rootfiles[0].rootfile[0].$['full-path'];
  }

  private async parseOPF(): Promise<void> {
    const opfFile = this.zip.file(this.opfPath);
    if (!opfFile) throw new Error('Invalid EPUB: Missing OPF file');
    
    const opfContent = await opfFile.async('text');
    this.opfData = await this.parseXML(opfContent);
  }

  private async parseChapters(): Promise<EPUBChapter[]> {
    const chapters: EPUBChapter[] = [];
    const spine = this.opfData.package.spine[0].itemref;
    const manifest = this.opfData.package.manifest[0].item;
    
    for (const spineItem of spine) {
      const idref = spineItem.$.idref;
      const manifestItem = manifest.find((item: any) => item.$.id === idref);
      
      if (manifestItem && manifestItem.$['media-type'] === 'application/xhtml+xml') {
        const chapterPath = this.calculateBasePath() + manifestItem.$.href;
        const chapterFile = this.zip.file(chapterPath);
        
        if (chapterFile) {
          const content = await chapterFile.async('text');
          chapters.push({
            id: idref,
            title: this.extractTitle(content) || manifestItem.$.href,
            href: manifestItem.$.href,
            content,
            mediaOverlay: manifestItem.$['media-overlay']
          });
        }
      }
    }
    
    return chapters;
  }

  private async parseSMILFiles(): Promise<Map<string, SMILFragment[]>> {
    const smilFiles = new Map<string, SMILFragment[]>();
    const manifest = this.opfData.package.manifest[0].item;
    
    for (const item of manifest) {
      if (item.$ && item.$['media-type'] === 'application/smil+xml') {
        const smilPath = this.calculateBasePath() + item.$.href;
        const smilFile = this.zip.file(smilPath);
        
        if (smilFile) {
          const content = await smilFile.async('text');
          const fragments = await this.parseSMILContent(content);
          smilFiles.set(item.$.id, fragments);
        }
      }
    }
    
    return smilFiles;
  }

  private async parseSMILContent(content: string): Promise<SMILFragment[]> {
    const smilData = await this.parseXML(content);
    const fragments: SMILFragment[] = [];
    
    let pars: any[] = [];
    if (smilData.smil?.body?.[0]?.seq) {
        for (const seq of smilData.smil.body[0].seq) {
            if (seq.par) {
                pars = pars.concat(seq.par);
            }
        }
    } else if (smilData.smil?.body?.[0]?.par) {
        pars = smilData.smil.body[0].par;
    }
    
    pars.forEach((par: any, index: number) => {
      const text = par.text?.[0];
      const audio = par.audio?.[0];
      
      if (text && audio) {
        fragments.push({
          id: (par.$ && par.$.id) || `fragment-${index}`,
          textSrc: text.$.src,
          audioSrc: audio.$.src,
          clipBegin: this.parseTime(audio.$['clipBegin'] || '0s'),
          clipEnd: this.parseTime(audio.$['clipEnd'] || '0s'),
          text: '',
          order: index
        });
      }
    });
    
    return fragments;
  }

  private async parseAudioFiles(): Promise<Map<string, AudioFile>> {
    const audioFiles = new Map<string, AudioFile>();
    const manifest = this.opfData.package.manifest[0].item;
    const basePath = this.calculateBasePath();

    for (const item of manifest) {
      if (item.$ && item.$['media-type']?.startsWith('audio/')) {
        const audioPath = basePath + item.$.href;
        const audioFile = this.zip.file(audioPath);

        if (audioFile) {
          const blob = await audioFile.async('blob');
          audioFiles.set(item.$.href, {
            src: item.$.href,
            blob,
            duration: 0 // Will be set when audio loads
          });
        }
      }
    }
    
    return audioFiles;
  }

  private parseTime(timeStr: string): number {
    if (timeStr.endsWith('s')) {
      return parseFloat(timeStr.slice(0, -1));
    }
    if (timeStr.includes(':')) {
      const parts = timeStr.split(':').map(p => parseFloat(p));
      return parts.reduce((acc, curr, idx) => acc + curr * Math.pow(60, parts.length - idx - 1), 0);
    }
    return parseFloat(timeStr) || 0;
  }

  private extractTitle(htmlContent: string): string | null {
    const titleMatch = htmlContent.match(/<title[^>]*>([^<]*)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : null;
  }

  private calculateBasePath(): string {
    const parts = this.opfPath.split('/');
    if (parts.length > 1) {
      parts.pop();
      return parts.join('/') + '/';
    }
    return '';
  }

  public async getBasePath(): Promise<string> {
    if (!this.opfPath) {
        await this.parseContainer();
    }
    return this.calculateBasePath();
  }

  private parseXML(content: string): Promise<any> {
    return new Promise((resolve, reject) => {
      parseString(content, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  // Helper method to extract string content from xml2js parsed objects
  private extractStringFromXMLJS(xmlObj: any): string {
    if (typeof xmlObj === 'string') {
      return xmlObj;
    }
    if (xmlObj && typeof xmlObj === 'object') {
      // xml2js creates objects with _ property for text content
      if (xmlObj._ !== undefined) {
        return String(xmlObj._);
      }
      // If it's an object but no _ property, try to convert to string
      if (xmlObj.toString && typeof xmlObj.toString === 'function') {
        return xmlObj.toString();
      }
    }
    return '';
  }
}