import React, { useCallback } from 'react';
import { Upload, Feather, ShieldCheck, Github } from 'lucide-react';
import { version } from '../../package.json';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isLoading }) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const epubFile = files.find(file => file.name.endsWith('.epub'));
    if (epubFile) {
      onFileSelect(epubFile);
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.epub')) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4">
        <div className="bg-panel border border-line rounded-2xl p-12 max-w-2xl w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/10 rounded-2xl mb-4">
              <Feather className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-100 mb-2">EPUB3 Media Overlay Editor</h1>
            <p className="text-sm text-gray-400">Upload an EPUB file to start editing media overlays and timing fragments</p>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-700 rounded-xl p-12 text-center hover:border-blue-500/60 hover:bg-raised/40 transition-colors duration-200 cursor-pointer"
          >
            <Upload className="w-10 h-10 text-gray-500 mx-auto mb-4" />
            <p className="text-base font-medium text-gray-200 mb-1">
              Drop your EPUB file here, or click to browse
            </p>
            <p className="text-xs text-gray-500 mb-6">
              Supports EPUB3 files with media overlays
            </p>

            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-500 transition-colors duration-200 cursor-pointer">
              <Upload className="w-4 h-4" />
              {isLoading ? 'Processing...' : 'Choose File'}
              <input
                type="file"
                accept=".epub"
                onChange={handleFileInput}
                className="hidden"
                disabled={isLoading}
              />
            </label>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4 flex items-center justify-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            Your files stay private - all processing is done locally in your browser
          </p>

          {isLoading && (
            <div className="mt-8">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-700 border-t-blue-400 mr-3"></div>
                  <span className="text-sm text-blue-300">Processing EPUB file...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <a
            href="https://github.com/burninc0de/epub-moe"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-gray-300 transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub</span>
          </a>
          <span className="text-gray-700">|</span>
          <span>v{version}</span>
        </div>
      </div>
    </div>
  );
};
