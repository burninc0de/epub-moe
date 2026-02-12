# AGENTS.md - Development Guidelines for epub-moe

This file contains development guidelines and commands for agentic coding assistants working on the epub-moe project.

## Project Overview

epub-moe is a React-based tool for fine-tuning synchronized text and audio in EPUB files with media overlays. It uses TypeScript, Vite, and Tailwind CSS.

## Build Commands

### Development Server
```bash
npm run dev
```
Starts the Vite development server on `http://localhost:5173`.

### Production Build
```bash
npm run build
```
Creates a production build in the `dist/` directory.

### Preview Production Build
```bash
npm run preview
```
Serves the production build locally for testing.

### Linting
```bash
npm run lint
```
Runs ESLint on all TypeScript/JavaScript files. This command should pass before committing changes.

**Note**: There is currently a compatibility issue between ESLint 9 and @typescript-eslint 8 that causes the lint command to fail with a "no-unused-expressions" rule error. The build still works correctly, but the lint command needs to be fixed.

## Testing Commands

**Note**: The project currently has limited test coverage. There is a VS Code task configured for Vitest, but no test scripts in package.json.

### Run Tests (VS Code Task)
```bash
vitest run
```
This is configured as a VS Code task. If you add test files, ensure this command works and consider adding it to package.json scripts.

### Single Test File
```bash
vitest run path/to/test/file.test.ts
```
Run a specific test file (when tests are added).

## Code Style Guidelines

### TypeScript Configuration

- **Strict Mode**: All TypeScript strict checks are enabled (`strict: true`)
- **Unused Variables**: `noUnusedLocals: true` and `noUnusedParameters: true` - remove or prefix with `_` if intentionally unused
- **Target**: ES2020 with DOM libraries
- **Module Resolution**: Use bundler resolution for modern import handling
- **JSX**: React JSX transform (`react-jsx`)

### Import Style

- Use named imports from React: `import React, { useState, useEffect } from 'react';`
- Group imports by category:
  1. React/React-related imports
  2. Third-party libraries
  3. Local components/utilities/types
- Sort imports alphabetically within each group
- Use absolute imports for local files (relative to `src/`)

Example:
```typescript
import React, { useCallback, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';

import { FileUpload } from './components/FileUpload';
import { useEPUBEditor } from './hooks/useEPUBEditor';
```

### Component Patterns

- **Functional Components**: Use functional components with hooks, not class components
- **TypeScript Interfaces**: Define prop interfaces for all components
- **Event Handlers**: Use `useCallback` for event handlers to prevent unnecessary re-renders
- **Ref Usage**: Use `useRef` for DOM references and imperative handles

Example:
```typescript
interface ComponentProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export const Component: React.FC<ComponentProps> = ({ onFileSelect, isLoading }) => {
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);

  return (
    // JSX
  );
};
```

### Naming Conventions

- **Components**: PascalCase (e.g., `FileUpload`, `WaveformViewer`)
- **Hooks**: camelCase with `use` prefix (e.g., `useEPUBEditor`, `useCallback`)
- **Functions**: camelCase (e.g., `parseEPUB`, `handleFileInput`)
- **Classes**: PascalCase (e.g., `EPUBParser`)
- **Interfaces**: PascalCase with descriptive names (e.g., `EPUBData`, `FileUploadProps`)
- **Types**: PascalCase (e.g., `AudioFile`, `SMILFragment`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `WAVEFORM_HEIGHT_KEY`)

### Error Handling

- Use try-catch blocks for async operations
- Display user-friendly error messages in the UI
- Log technical details to console for debugging
- Handle loading states appropriately

Example:
```typescript
const handleExport = useCallback(async () => {
  setIsLoading(true);
  try {
    await exportEPUB();
  } catch (error) {
    console.error('Export failed:', error);
    // Show user-friendly error message
  } finally {
    setIsLoading(false);
  }
}, [exportEPUB]);
```

### Styling Guidelines

- **Tailwind CSS**: Use Tailwind utility classes for styling
- **Dark Mode**: Support dark mode with `dark:` prefixes
- **Responsive Design**: Use responsive utilities (`sm:`, `md:`, `lg:`)
- **Component-specific CSS**: Use CSS modules or scoped styles when Tailwind isn't sufficient
- **Consistent Spacing**: Use Tailwind's spacing scale (`p-4`, `m-2`, etc.)

Example:
```jsx
<div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
  <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-800 dark:hover:bg-blue-700 text-white rounded-lg transition-colors">
    Action
  </button>
</div>
```

### File Structure

- **Components**: `src/components/` - React components
- **Hooks**: `src/hooks/` - Custom React hooks
- **Utils**: `src/utils/` - Utility functions and classes
- **Types**: `src/types/` - TypeScript type definitions
- **Assets**: `src/` root for non-component files

### Async/Await Patterns

- Use `async/await` instead of Promise chains
- Handle errors with try-catch blocks
- Use `Promise.all()` for concurrent operations when appropriate

### State Management

- Use React hooks (`useState`, `useReducer`) for component state
- Lift state up when multiple components need access
- Use `useCallback` for functions passed as props to prevent unnecessary re-renders
- Consider custom hooks for complex state logic

### Performance Considerations

- Memoize expensive calculations with `useMemo`
- Use `useCallback` for event handlers
- Avoid unnecessary re-renders by properly structuring component dependencies
- Lazy load components when appropriate

### Accessibility

- Use semantic HTML elements
- Provide alt text for images
- Ensure keyboard navigation works
- Use ARIA attributes when needed
- Test with screen readers

### Git Workflow

- Run `npm run lint` before committing
- Write descriptive commit messages
- Keep commits focused on single changes
- Use feature branches for new work

### Code Comments

- **NO comments** unless absolutely necessary for complex business logic
- Prefer self-documenting code with clear variable/function names
- Use TypeScript types to document expected data structures

## Security Best Practices

- Validate file uploads (only accept .epub files)
- Sanitize user inputs
- Use HTTPS for production deployments
- Avoid exposing sensitive data in client-side code

## Browser Compatibility

- Target modern browsers (ES2020+)
- Test on Chrome, Firefox, Safari, and Edge
- Use progressive enhancement where appropriate

## Deployment

- Build command: `npm run build`
- Output directory: `dist/`
- Static hosting compatible (no server-side rendering required)

## Contributing

- Follow the established code style
- Add TypeScript types for new features
- Test changes in multiple browsers
- Update this document if conventions change

## Additional Resources

- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vite Documentation](https://vitejs.dev/)
- [ESLint Documentation](https://eslint.org/docs/user-guide/)

---

*This document should be updated as the project evolves. Last updated: 2026-01-27*</content>
<parameter name="filePath">/home/zeno/Dev/epub-moe/AGENTS.md