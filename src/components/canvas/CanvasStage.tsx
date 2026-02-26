import { useRef, useEffect, useCallback, useState } from 'react';
import { useSonimageStore } from '../../store/useSonimageStore';
import { useRectangleDraw } from '../../hooks/useRectangleDraw';
import { ContextMenu } from '../ui/ContextMenu';
import { drawImageToCanvas, computeImageScale } from '../../canvas/drawImage';
import { setLoopScale } from '../../engine/animationLoop';
import type { Scale, RectLayer } from '../../types';

interface CanvasStageProps {
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onLayerCreated: (layer: RectLayer) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  layerId: string;
  isMuted: boolean;
}

export function CanvasStage({ overlayCanvasRef, onLayerCreated }: CanvasStageProps) {
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Use refs for scale/offset so mouse handlers always have the latest values
  // without needing to re-create callbacks on every image load/resize
  const scaleRef = useRef<Scale>({ x: 1, y: 1 });
  const offsetRef = useRef({ x: 0, y: 0 });

  const { imageDataUrl, imageNaturalWidth, imageNaturalHeight, toggleMute, removeLayer } = useSonimageStore();

  const updateCanvasAndScale = useCallback(() => {
    const imageCanvas = imageCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!imageCanvas || !overlayCanvas) return;

    const dpr = window.devicePixelRatio || 1;
    const displayW = imageCanvas.clientWidth;
    const displayH = imageCanvas.clientHeight;

    // Size overlay canvas to match container
    overlayCanvas.width = displayW * dpr;
    overlayCanvas.height = displayH * dpr;
    overlayCanvas.style.width = `${displayW}px`;
    overlayCanvas.style.height = `${displayH}px`;
    const ctx = overlayCanvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }

    if (imageDataUrl && imageNaturalWidth > 0) {
      const img = new Image();
      img.onload = () => {
        drawImageToCanvas(imageCanvas, img);
        const { scale, offsetX, offsetY } = computeImageScale(imageCanvas, imageNaturalWidth, imageNaturalHeight);
        const s = { x: scale, y: scale };
        // Update refs immediately — available to mouse handlers on next event
        scaleRef.current = s;
        offsetRef.current = { x: offsetX, y: offsetY };
        setLoopScale(s, { x: offsetX, y: offsetY });
      };
      img.src = imageDataUrl;
    } else {
      const ctx2 = imageCanvas.getContext('2d');
      if (ctx2) {
        imageCanvas.width = displayW * dpr;
        imageCanvas.height = displayH * dpr;
        ctx2.scale(dpr, dpr);
        ctx2.clearRect(0, 0, displayW, displayH);
      }
      scaleRef.current = { x: 1, y: 1 };
      offsetRef.current = { x: 0, y: 0 };
    }
  }, [imageDataUrl, imageNaturalWidth, imageNaturalHeight, overlayCanvasRef]);

  useEffect(() => {
    updateCanvasAndScale();
    const observer = new ResizeObserver(updateCanvasAndScale);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateCanvasAndScale]);

  const handleContextMenu = useCallback((e: MouseEvent, layer: RectLayer) => {
    setContextMenu({ x: e.clientX, y: e.clientY, layerId: layer.id, isMuted: layer.muted });
  }, []);

  const { onMouseDown, onMouseMove, onMouseUp, onContextMenuEvent } = useRectangleDraw({
    canvasRef: overlayCanvasRef,
    scaleRef,
    offsetRef,
    onLayerCreated,
    onContextMenu: handleContextMenu,
  });

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden"
      style={{ background: 'var(--canvas-bg)' }}
      onDragOver={(e) => e.preventDefault()}
    >
      <canvas
        ref={imageCanvasRef}
        className="absolute inset-0 w-full h-full"
      />
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onContextMenu={onContextMenuEvent}
      />

      {!imageDataUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <div style={{ marginBottom: 16 }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 78.86 59.07"
              style={{ width: 56, height: 'auto', fill: 'var(--text-3)' }}>
              <path d="M71.15,14.2c-1.22,0-2.26,4.29-2.65,10.27-.48-9.15-2.22-15.93-4.29-15.93-1.73,0-3.23,4.73-3.95,11.61-1.1-10.02-3.89-17.15-7.16-17.15-2.47,0-4.67,4.07-6.07,10.37-1.62-8.04-4.42-13.36-7.59-13.36s-5.97,5.32-7.59,13.36c-1.4-6.31-3.6-10.37-6.07-10.37-3.28,0-6.07,7.13-7.16,17.15-.73-6.88-2.22-11.61-3.95-11.61-2.07,0-3.81,6.78-4.29,15.93-.38-5.97-1.42-10.27-2.65-10.27-1.55,0-2.81,6.87-2.81,15.34s1.26,15.34,2.81,15.34c1.22,0,2.26-4.29,2.65-10.27.48,9.15,2.22,15.93,4.29,15.93,1.73,0,3.23-4.73,3.95-11.61,1.1,10.02,3.89,17.15,7.16,17.15,2.47,0,4.67-4.07,6.07-10.37,1.62,8.04,4.42,13.36,7.59,13.36s5.97-5.32,7.59-13.36c1.4,6.31,3.6,10.37,6.07,10.37,3.28,0,6.07-7.13,7.16-17.15.73,6.88,2.22,11.61,3.95,11.61,2.07,0,3.81-6.78,4.29-15.93.38,5.97,1.42,10.27,2.65,10.27,1.55,0,2.81-6.87,2.81-15.34s-1.26-15.34-2.81-15.34ZM59.65,30.88c-1.93,2.21-6.23,6.63-11.74,9.23-.57.27-1.15.52-1.74.75-2.12.81-4.38,1.31-6.74,1.31s-4.62-.5-6.74-1.31c-.59-.23-1.17-.48-1.74-.75-5.51-2.61-9.81-7.02-11.74-9.23-.06-.07-.11-.14-.15-.21-.46-.68-.46-1.57,0-2.26.05-.07.09-.14.15-.21,1.93-2.21,6.23-6.63,11.74-9.23.57-.27,1.15-.52,1.74-.75,2.12-.81,4.38-1.31,6.74-1.31s4.62.5,6.74,1.31c.59.23,1.17.48,1.74.75,5.51,2.61,9.81,7.02,11.74,9.23.06.07.11.14.15.21.46.68.46,1.57,0,2.26-.05.07-.09.14-.15.21Z"/>
              <path d="M77.18,21.87c-.93,0-1.68,3.43-1.68,7.67s.75,7.67,1.68,7.67,1.68-3.43,1.68-7.67-.75-7.67-1.68-7.67Z"/>
              <path d="M1.68,21.87c-.93,0-1.68,3.43-1.68,7.67s.75,7.67,1.68,7.67,1.68-3.43,1.68-7.67-.75-7.67-1.68-7.67Z"/>
              <path d="M39.43,22.1c-2.53,0-4.76,1.27-6.11,3.19-.84,1.2-1.33,2.67-1.33,4.24s.5,3.04,1.33,4.24c1.34,1.93,3.58,3.2,6.11,3.2s4.76-1.27,6.11-3.2c.84-1.2,1.33-2.67,1.33-4.24s-.5-3.04-1.33-4.24c-1.34-1.93-3.58-3.19-6.11-3.19Z"/>
            </svg>
          </div>
          <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>Upload an image to get started</p>
          <p style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 4 }}>Then draw rectangles to create sound layers</p>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          layerId={contextMenu.layerId}
          isMuted={contextMenu.isMuted}
          onMuteToggle={toggleMute}
          onRemove={removeLayer}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
