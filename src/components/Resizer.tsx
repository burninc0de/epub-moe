import React from 'react';

interface ResizerProps {
    onMouseDown: (e: React.MouseEvent) => void;
    direction?: 'horizontal' | 'vertical';
}

export const Resizer: React.FC<ResizerProps> = ({ onMouseDown, direction = 'horizontal' }) => {
    const directionClasses = direction === 'horizontal'
        ? "w-1.5 h-full cursor-col-resize -mx-[3px]"
        : "h-1.5 w-full cursor-ns-resize -my-[3px]";

    return (
        <div
            onMouseDown={onMouseDown}
            className={`${directionClasses} relative z-20 flex-shrink-0 bg-transparent hover:bg-blue-500 transition-colors duration-150`}
        />
    );
};
