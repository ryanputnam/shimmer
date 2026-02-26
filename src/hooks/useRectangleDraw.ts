import { useCallback, useRef } from 'react';
import { useSonimageStore } from '../store/useSonimageStore';
import type { Scale, RectLayer } from '../types';

interface UseRectangleDrawProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  scaleRef: React.RefObject<Scale>;
  offsetRef: React.RefObject<{ x: number; y: number }>;
  onLayerCreated?: (layer: RectLayer) => void;
  onContextMenu?: (e: MouseEvent, layer: RectLayer) => void;
}

function canvasToImageCoords(
  e: React.MouseEvent,
  canvas: HTMLCanvasElement,
  scale: Scale,
  offset: { x: number; y: number },
) {
  const rect = canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;
  return {
    x: (canvasX - offset.x) / scale.x,
    y: (canvasY - offset.y) / scale.y,
  };
}

function isInsideLayer(pos: { x: number; y: number }, layer: RectLayer): boolean {
  return (
    pos.x >= layer.x && pos.x <= layer.x + layer.width &&
    pos.y >= layer.y && pos.y <= layer.y + layer.height
  );
}

export function useRectangleDraw({
  canvasRef,
  scaleRef,
  offsetRef,
  onLayerCreated,
  onContextMenu,
}: UseRectangleDrawProps) {
  const { setDrawingRect, addLayer, selectLayer } = useSonimageStore();
  const isDrawing = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    if (e.button === 2) return;

    const pos = canvasToImageCoords(e, canvasRef.current, scaleRef.current, offsetRef.current);
    const hit = useSonimageStore.getState().layers.find((l) => isInsideLayer(pos, l));

    if (hit) {
      selectLayer(hit.id);
      return;
    }

    isDrawing.current = true;
    setDrawingRect({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
  }, [canvasRef, scaleRef, offsetRef, selectLayer, setDrawingRect]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !canvasRef.current) return;
    const pos = canvasToImageCoords(e, canvasRef.current, scaleRef.current, offsetRef.current);
    const current = useSonimageStore.getState().drawingRect;
    if (current) {
      setDrawingRect({ ...current, currentX: pos.x, currentY: pos.y });
    }
  }, [canvasRef, scaleRef, offsetRef, setDrawingRect]);

  const onMouseUp = useCallback((_e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const drawing = useSonimageStore.getState().drawingRect;
    setDrawingRect(null);

    if (!drawing) return;
    const x = Math.min(drawing.startX, drawing.currentX);
    const y = Math.min(drawing.startY, drawing.currentY);
    const width = Math.abs(drawing.currentX - drawing.startX);
    const height = Math.abs(drawing.currentY - drawing.startY);

    if (width > 5 && height > 5) {
      const layer = addLayer({ x, y, width, height });
      onLayerCreated?.(layer);
    }
  }, [addLayer, setDrawingRect, onLayerCreated]);

  const onContextMenuEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const pos = canvasToImageCoords(e, canvasRef.current, scaleRef.current, offsetRef.current);
    const hit = useSonimageStore.getState().layers.find((l) => isInsideLayer(pos, l));
    if (hit && onContextMenu) {
      onContextMenu(e.nativeEvent, hit);
    }
  }, [canvasRef, scaleRef, offsetRef, onContextMenu]);

  return { onMouseDown, onMouseMove, onMouseUp, onContextMenuEvent };
}
