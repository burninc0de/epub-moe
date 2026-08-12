import EditorModule from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-markup';

const Editor = (EditorModule as unknown as { default: typeof EditorModule }).default;

interface HtmlEditorProps {
  value: string;
  onValueChange: (value: string) => void;
}

const HtmlEditor = ({ value, onValueChange }: HtmlEditorProps) => (
  <Editor
    value={value}
    onValueChange={onValueChange}
    highlight={code => Prism.highlight(code, Prism.languages.markup, 'markup')}
    padding={12}
    style={{
      fontFamily: 'Fira Mono, Menlo, Monaco, Consolas, monospace',
      fontSize: 14,
      minHeight: 300,
      borderRadius: 8,
      marginBottom: 16,
    }}
    textareaId="html-editor"
    textareaClassName="w-full border border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
  />
);

export default HtmlEditor;
