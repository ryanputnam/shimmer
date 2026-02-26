import { useEffect, useRef } from 'react';
import { VolumeX, Volume2, Trash2 } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  layerId: string;
  isMuted: boolean;
  onMuteToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, layerId, isMuted, onMuteToggle, onRemove, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl py-1 min-w-36"
      style={{ left: x, top: y }}
    >
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 text-left"
        onClick={() => { onMuteToggle(layerId); onClose(); }}
      >
        {isMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}
        {isMuted ? 'Unmute' : 'Mute'}
      </button>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 text-left"
        onClick={() => { onRemove(layerId); onClose(); }}
      >
        <Trash2 size={14} />
        Remove
      </button>
    </div>
  );
}
