/**
 * ResizeHandle.tsx — ZERØ ORDER BOOK v43
 * FIX: disabled=true on touch devices — mobile/tablet panels are NOT resizable.
 * Only desktop (hover+cursor) gets drag handles.
 * rgba() only ✓
 */

import React, { useEffect, useState } from 'react';
import { PanelResizeHandle } from 'react-resizable-panels';

interface ResizeHandleProps {
  direction?: 'horizontal' | 'vertical';
  id?: string;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ direction = 'horizontal', id }) => {
  const isH = direction === 'horizontal';
  // Disable on touch devices — prevents accidental panel drag on mobile/tablet
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  return (
    <PanelResizeHandle
      id={id}
      disabled={isTouch}
      style={{
        position:       'relative',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        width:          isH ? '4px' : '100%',
        height:         isH ? '100%' : '4px',
        background:     isTouch ? 'transparent' : 'rgba(255,255,255,0.025)',
        cursor:         isTouch ? 'default' : (isH ? 'col-resize' : 'row-resize'),
        zIndex:         20,
        transition:     'background 120ms ease',
        userSelect:     'none',
        // On touch: shrink to 0 so it doesn't eat tap area
        ...(isTouch ? { width: isH ? '1px' : '100%', height: isH ? '100%' : '1px', background: 'rgba(255,255,255,0.04)' } : {}),
        touchAction:    'none',
      }}
    >
      {!isTouch && (
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
      )}
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
