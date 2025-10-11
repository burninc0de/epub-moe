import React, { useCallback } from 'react';
import { Upload, Feather, ShieldCheck } from 'lucide-react';

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
      <div className="bg-white rounded-2xl shadow-xl p-12 max-w-2xl w-full dark:bg-gray-700 dark:text-white">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4 dark:bg-blue-900">
            <Feather className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">EPUB3 Media Overlay Editor</h1>
          <p className="text-gray-600 dark:text-gray-300">Upload an EPUB file to start editing media overlays and timing fragments</p>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors duration-200 cursor-pointer dark:border-gray-500 dark:hover:border-blue-600"
        >
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4 dark:text-gray-300" />
          <p className="text-lg font-medium text-gray-700 mb-2 dark:text-white">
            Drop your EPUB file here, or click to browse
          </p>
          <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">
            Supports EPUB3 files with media overlays
          </p>
          
          <label className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 cursor-pointer dark:bg-blue-800 dark:hover:bg-blue-700">
            <Upload className="w-5 h-5 mr-2" />
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

        <p className="text-sm text-gray-500 text-center mt-4 dark:text-gray-400 flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-500" />
          Your files stay private - all processing is done locally in your browser  
        </p>

        {isLoading && (
          <div className="mt-8">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-900 dark:border-blue-700">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3 dark:border-blue-400"></div>
                <span className="text-blue-800 dark:text-blue-200">Processing EPUB file...</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};