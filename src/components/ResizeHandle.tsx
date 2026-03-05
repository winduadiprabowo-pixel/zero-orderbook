/**
 * ResizeHandle.tsx — ZERØ ORDER BOOK
 * Custom drag handle for react-resizable-panels.
 * Gold accent on hover/drag. rgba() only.
 */

import React from 'react';
import { PanelResizeHandle } from 'react-resizable-panels';

interface ResizeHandleProps {
  direction?: 'horizontal' | 'vertical';
  id?: string;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ direction = 'horizontal', id }) => {
  const isH = direction === 'horizontal';

  return (
    <PanelResizeHandle
      id={id}
      style={{
        position:       'relative',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        width:          isH ? '4px' : '100%',
        height:         isH ? '100%' : '4px',
        background:     'rgba(255,255,255,0.025)',
        cursor:         isH ? 'col-resize' : 'row-resize',
        zIndex:         20,
        transition:     'background 120ms ease',
        userSelect:     'none',
        touchAction:    'none',
      }}
    >
      <div
        className="resize-pip"
        style={{
          position:     'absolute',
          background:   'rgba(242,142,44,0.18)',
          borderRadius: '2px',
          transition:   'background 120ms ease, opacity 120ms ease',
          pointerEvents:'none',
          ...(isH
            ? { width: '2px', height: '32px', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
            : { height: '2px', width: '32px', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }
          ),
        }}
      />
      <style>{`
        [data-resize-handle-active] .resize-pip,
        [data-panel-resize-handle-id]:hover .resize-pip {
          background: rgba(242,142,44,0.75) !important;
        }
        [data-resize-handle-active] {
          background: rgba(242,142,44,0.06) !important;
        }
      `}</style>
    </PanelResizeHandle>
  );
};

ResizeHandle.displayName = 'ResizeHandle';
export default ResizeHandle;
