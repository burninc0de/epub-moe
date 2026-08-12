import React from 'react';
import { ChevronDown } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500',
  secondary: 'bg-raised text-gray-200 border border-gray-700 hover:bg-gray-700 hover:text-white',
  ghost: 'text-gray-300 hover:bg-raised hover:text-white',
  danger: 'bg-red-600 text-white hover:bg-red-500',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs gap-1.5 rounded-md',
  md: 'px-3 py-1.5 text-sm gap-2 rounded-md',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'secondary', size = 'md', className = '', ...props }) => (
  <button
    className={`inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`}
    {...props}
  />
);

type IconButtonVariant = 'ghost' | 'primary' | 'danger';

const iconButtonVariants: Record<IconButtonVariant, string> = {
  ghost: 'text-gray-400 hover:text-gray-100 hover:bg-raised',
  primary: 'bg-blue-600 text-white hover:bg-blue-500',
  danger: 'text-gray-400 hover:text-red-400 hover:bg-red-500/10',
};

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  active?: boolean;
  activeClassName?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  variant = 'ghost',
  active = false,
  activeClassName = 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25',
  className = '',
  ...props
}) => (
  <button
    className={`inline-flex items-center justify-center p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? activeClassName : iconButtonVariants[variant]} ${className}`}
    {...props}
  />
);

export const PanelHeader: React.FC<{ title: React.ReactNode; children?: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`h-11 flex-shrink-0 flex items-center justify-between gap-2 px-3 border-b border-line ${className}`}>
    <div className="flex-1 min-w-0 text-sm font-semibold text-gray-100 truncate" title={typeof title === 'string' ? title : undefined}>
      {title}
    </div>
    {children && <div className="flex items-center gap-1 flex-shrink-0">{children}</div>}
  </div>
);

export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h3 className={`text-xs font-semibold uppercase tracking-wider text-gray-500 ${className}`}>
    {children}
  </h3>
);

export const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-xs font-medium text-gray-400 mb-1.5">
    {children}
  </label>
);

export const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
  <input
    className={`w-full px-2.5 py-1.5 bg-base border border-gray-700 rounded-md text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${className}`}
    {...props}
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...props }) => (
  <div className="relative">
    <select
      className={`w-full appearance-none px-2.5 py-1.5 pr-8 bg-base border border-gray-700 rounded-md text-sm text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="w-4 h-4 text-gray-500 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
  </div>
);

export const ToolbarDivider: React.FC = () => (
  <div className="w-px h-5 bg-gray-700 mx-1.5 flex-shrink-0" />
);

interface ModalProps {
  title?: React.ReactNode;
  onClose?: () => void;
  className?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ title, onClose, className = 'max-w-sm', children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
    <div
      className={`w-full ${className} bg-panel border border-line rounded-lg shadow-2xl p-5`}
      onClick={(e) => e.stopPropagation()}
    >
      {title && <h3 className="text-base font-semibold text-gray-100 mb-4">{title}</h3>}
      {children}
    </div>
  </div>
);
