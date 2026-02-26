import { useCallback } from 'react';
import { useSonimageStore } from '../store/useSonimageStore';

export function useImageUpload(onBeforeLoad?: () => void) {
  const setImage = useSonimageStore((s) => s.setImage);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    // Stop audio and clear nodes before loading new image
    onBeforeLoad?.();
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const offscreen = document.createElement('canvas');
        offscreen.width = img.naturalWidth;
        offscreen.height = img.naturalHeight;
        const offCtx = offscreen.getContext('2d')!;
        offCtx.drawImage(img, 0, 0);
        const imageData = offCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
        setImage(dataUrl, img.naturalWidth, img.naturalHeight, imageData.data);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, [setImage, onBeforeLoad]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  }, [loadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }, [loadFile]);

  return { handleFileInput, handleDrop };
}
