import React from 'react';

interface ResizerProps {
    onPointerDown: (e: React.PointerEvent) => void;
    direction?: 'horizontal' | 'vertical';
}

export const Resizer: React.FC<ResizerProps> = ({ onPointerDown, direction = 'horizontal' }) => {
    const directionClasses = direction === 'horizontal'
        ? "w-1 h-full cursor-col-resize -mx-[2px]"
        : "h-1 w-full cursor-ns-resize -my-[2px]";

    return (
        <div
            onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                onPointerDown(e);
            }}
            className={`${directionClasses} relative z-20 flex-shrink-0 bg-transparent hover:bg-blue-500 transition-colors duration-150`}
        />
    );
};
