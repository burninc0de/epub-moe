import { useRef } from 'react';
import EditorModule from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import './HtmlEditor.css';
import { getCodeThemeCss } from '../utils/codeThemeCss';
import { useZoomWheel } from '../hooks/useZoomWheel';

const Editor = (EditorModule as unknown as { default: typeof EditorModule }).default;

const CODE_FONT_SCALE_KEY = 'codeFontScale';

interface HtmlEditorProps {
  value: string;
  onValueChange: (value: string) => void;
  codeThemeId?: string | null;
}

const HtmlEditor = ({ value, onValueChange, codeThemeId }: HtmlEditorProps) => {
  const themeCss = getCodeThemeCss(codeThemeId);
  const containerRef = useRef<HTMLDivElement>(null);
  const { fontScale } = useZoomWheel(containerRef, CODE_FONT_SCALE_KEY);

  return (
    <div ref={containerRef}>
      <style>{themeCss}</style>
      <Editor
        value={value}
        onValueChange={onValueChange}
        highlight={code => Prism.highlight(code, Prism.languages.markup, 'markup')}
        padding={12}
        className="html-editor"
        preClassName="language-html"
        style={{
          fontFamily: 'Fira Mono, Menlo, Monaco, Consolas, monospace',
          fontSize: 14 * fontScale,
          minHeight: 300,
          borderRadius: 8,
          marginBottom: 16,
        }}
        textareaId="html-editor"
        textareaClassName="w-full border border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
};

export default HtmlEditor;
