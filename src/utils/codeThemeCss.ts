import prismDark from 'prismjs/themes/prism-dark.css?raw';
import prismFunky from 'prismjs/themes/prism-funky.css?raw';
import prismOkaidia from 'prismjs/themes/prism-okaidia.css?raw';
import prismSolarizedlight from 'prismjs/themes/prism-solarizedlight.css?raw';
import prismTomorrow from 'prismjs/themes/prism-tomorrow.css?raw';
import prismTwilight from 'prismjs/themes/prism-twilight.css?raw';

import a11yDark from 'prism-themes/themes/prism-a11y-dark.css?raw';
import atomDark from 'prism-themes/themes/prism-atom-dark.css?raw';
import coldarkDark from 'prism-themes/themes/prism-coldark-dark.css?raw';
import dracula from 'prism-themes/themes/prism-dracula.css?raw';
import duotoneDark from 'prism-themes/themes/prism-duotone-dark.css?raw';
import gruvboxDark from 'prism-themes/themes/prism-gruvbox-dark.css?raw';
import hopscotch from 'prism-themes/themes/prism-hopscotch.css?raw';
import lucario from 'prism-themes/themes/prism-lucario.css?raw';
import materialDark from 'prism-themes/themes/prism-material-dark.css?raw';
import materialOceanic from 'prism-themes/themes/prism-material-oceanic.css?raw';
import nightOwl from 'prism-themes/themes/prism-night-owl.css?raw';
import nord from 'prism-themes/themes/prism-nord.css?raw';
import oneDark from 'prism-themes/themes/prism-one-dark.css?raw';
import oneLight from 'prism-themes/themes/prism-one-light.css?raw';
import shadesOfPurple from 'prism-themes/themes/prism-shades-of-purple.css?raw';
import solarizedDarkAtom from 'prism-themes/themes/prism-solarized-dark-atom.css?raw';
import synthwave84 from 'prism-themes/themes/prism-synthwave84.css?raw';
import vscDarkPlus from 'prism-themes/themes/prism-vsc-dark-plus.css?raw';
import { DEFAULT_CODE_THEME_ID } from './codeThemes';

const CODE_THEME_CSS: Record<string, string> = {
  'one-dark': oneDark,
  dracula,
  'night-owl': nightOwl,
  'vsc-dark-plus': vscDarkPlus,
  nord,
  'material-dark': materialDark,
  'material-oceanic': materialOceanic,
  'atom-dark': atomDark,
  lucario,
  'gruvbox-dark': gruvboxDark,
  'coldark-dark': coldarkDark,
  'solarized-dark-atom': solarizedDarkAtom,
  'shades-of-purple': shadesOfPurple,
  synthwave84,
  hopscotch,
  'a11y-dark': a11yDark,
  'duotone-dark': duotoneDark,
  'prism-okaidia': prismOkaidia,
  'prism-tomorrow': prismTomorrow,
  'prism-dark': prismDark,
  'prism-twilight': prismTwilight,
  'prism-funky': prismFunky,
  'one-light': oneLight,
  'prism-solarizedlight': prismSolarizedlight,
};

export const getCodeThemeCss = (id: string | null | undefined): string =>
  CODE_THEME_CSS[id ?? ''] ?? CODE_THEME_CSS[DEFAULT_CODE_THEME_ID];
