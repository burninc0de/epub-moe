export interface CodeThemeMeta {
  id: string;
  label: string;
}

export const CODE_THEMES: CodeThemeMeta[] = [
  { id: 'one-dark', label: 'One Dark' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'night-owl', label: 'Night Owl' },
  { id: 'vsc-dark-plus', label: 'Default' },
  { id: 'nord', label: 'Nord' },
  { id: 'material-dark', label: 'Material Dark' },
  { id: 'material-oceanic', label: 'Material Oceanic' },
  { id: 'atom-dark', label: 'Atom Dark' },
  { id: 'lucario', label: 'Lucario' },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark' },
  { id: 'coldark-dark', label: 'Coldark Dark' },
  { id: 'solarized-dark-atom', label: 'Solarized Dark' },
  { id: 'shades-of-purple', label: 'Shades of Purple' },
  { id: 'synthwave84', label: 'Synthwave 84' },
  { id: 'hopscotch', label: 'Hopscotch' },
  { id: 'a11y-dark', label: 'A11y Dark' },
  { id: 'duotone-dark', label: 'Duotone Dark' },
  { id: 'prism-okaidia', label: 'Okaidia' },
  { id: 'prism-tomorrow', label: 'Tomorrow Night' },
  { id: 'prism-dark', label: 'Prism Dark' },
  { id: 'prism-twilight', label: 'Twilight' },
  { id: 'prism-funky', label: 'Funky' },
  { id: 'one-light', label: 'One Light' },
  { id: 'prism-solarizedlight', label: 'Solarized Light' },
];

export const DEFAULT_CODE_THEME_ID = 'vsc-dark-plus';
