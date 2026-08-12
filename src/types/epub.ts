export interface EPUBChapter {
  id: string;
  title: string;
  href: string;
  content: string;
  mediaOverlay?: string;
}

export interface SMILFragment {
  id: string;
  textSrc: string;
  audioSrc: string;
  clipBegin: number;
  clipEnd: number;
  text: string;
  order: number;
}

export interface AudioFile {
  src: string;
  blob: Blob;
  duration: number;
}

export interface OPFManifestItem {
  $: {
    id: string;
    href: string;
    'media-type': string;
    'media-overlay'?: string;
  };
}

export interface OPFPackage {
  package: {
    metadata?: Array<{ 'dc:title'?: Array<string | { _?: string }> }>;
    manifest: Array<{ item: OPFManifestItem[] }>;
    spine: Array<{ itemref: Array<{ $: { idref: string } }> }>;
  };
}

export interface ContainerXML {
  container: {
    rootfiles: Array<{
      rootfile: Array<{ $: { 'full-path': string } }>;
    }>;
  };
}

export interface SMILPar {
  $?: { id?: string };
  text?: Array<{ $: { src: string } }>;
  audio?: Array<{ $: { src: string; clipBegin?: string; clipEnd?: string } }>;
}

export interface SMILFile {
  smil?: {
    body?: Array<{
      seq?: Array<{ par?: SMILPar[] }>;
      par?: SMILPar[];
    }>;
  };
}

export interface EPUBData {
  title: string;
  chapters: EPUBChapter[];
  smilFiles: Map<string, SMILFragment[]>;
  audioFiles: Map<string, AudioFile>;
  manifest: OPFPackage;
}

export type FragmentSpacing = 'default' | 'wide' | 'spaced';

export const FRAGMENT_SPACING_CLASSES: Record<FragmentSpacing, string> = {
  default: 'my-2',
  wide: 'my-5',
  spaced: 'my-8',
};

export const FRAGMENT_SPACING_OPTIONS: { value: FragmentSpacing; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'wide', label: 'Wide' },
  { value: 'spaced', label: 'Spaced' },
];

export const isValidFragmentSpacing = (value: string | null): value is FragmentSpacing =>
  value === 'default' || value === 'wide' || value === 'spaced';