import { useRef, useEffect, useState } from 'react';
import { useSonimageStore } from '../../store/useSonimageStore';
import { TransportControls } from '../controls/TransportControls';
import { MasterVolume } from '../controls/MasterVolume';
import { ExportPanel } from '../controls/ExportPanel';
import { KeyControl } from '../controls/KeyControl';
import { serializeComposition, saveToFile, loadFromFile } from '../../engine/saveLoad';
import type { AudioEngine } from '../../engine/AudioEngine';

interface ToolbarProps {
  audioEngine: AudioEngine | null;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onImageLoad: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveLoaded: () => void;
}

export function Toolbar({ audioEngine, overlayCanvasRef, onImageLoad, onSaveLoaded }: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { imageDataUrl, clearImage, layers } = useSonimageStore();
  const [light, setLight] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle('light', light);
  }, [light]);

  const handleSave = () => {
    if (!imageDataUrl) return;
    saveToFile(serializeComposition(imageDataUrl, layers));
  };

  const handleLoad = async () => {
    try {
      const save = await loadFromFile();
      useSonimageStore.getState().loadSaveFile(save);
      onSaveLoaded();
    } catch (_) {}
  };

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '0 12px',
      background: 'var(--bg-2)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      height: 46,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', marginRight: 6, flexShrink: 0, height: 20 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 277.51 59.07"
          style={{ height: 26, width: 'auto', fill: 'var(--text)' }}>
          <path d="M88.5,34.18h6.57c.29,2.29,1.41,3.6,4.48,3.6,2.73,0,3.99-1.02,3.99-2.77s-1.51-2.48-5.16-3.02c-6.77-1.02-9.39-2.97-9.39-7.93,0-5.31,4.87-7.93,10.08-7.93,5.65,0,9.88,2.04,10.51,7.88h-6.47c-.39-2.09-1.56-3.07-3.99-3.07-2.29,0-3.6,1.07-3.6,2.63s1.22,2.24,4.92,2.77c6.38.92,9.88,2.53,9.88,7.98s-3.99,8.37-10.71,8.37-10.85-3.02-11.1-8.52Z"/>
          <path d="M112.35,5.17h7.06v15.58c1.27-2.53,4.04-4.62,8.28-4.62,5.01,0,8.57,3.02,8.57,9.83v16.21h-7.06v-15.19c0-3.46-1.36-5.11-4.48-5.11s-5.31,1.85-5.31,5.6v14.7h-7.06V5.17Z"/>
          <path d="M139.51,9.4c0-2.19,1.75-3.84,3.99-3.84s4.04,1.65,4.04,3.84-1.75,3.85-4.04,3.85-3.99-1.66-3.99-3.85ZM140.05,16.7h7.01v25.46h-7.01v-25.46Z"/>
          <path d="M151.1,16.7h7.06v3.89c1.27-2.38,3.99-4.48,7.79-4.48,3.36,0,5.89,1.41,7.11,4.43,2.04-3.07,5.35-4.43,8.57-4.43,4.72,0,8.37,2.97,8.37,9.73v16.31h-7.01v-15.53c0-3.26-1.46-4.72-3.99-4.72-2.73,0-4.92,1.75-4.92,5.21v15.04h-7.01v-15.53c0-3.26-1.51-4.72-3.99-4.72-2.73,0-4.92,1.75-4.92,5.21v15.04h-7.06v-25.46Z"/>
          <path d="M193.59,16.7h7.06v3.89c1.27-2.38,3.99-4.48,7.79-4.48,3.36,0,5.89,1.41,7.11,4.43,2.04-3.07,5.35-4.43,8.57-4.43,4.72,0,8.37,2.97,8.37,9.73v16.31h-7.01v-15.53c0-3.26-1.46-4.72-3.99-4.72-2.73,0-4.92,1.75-4.92,5.21v15.04h-7.01v-15.53c0-3.26-1.51-4.72-3.99-4.72-2.73,0-4.92,1.75-4.92,5.21v15.04h-7.06v-25.46Z"/>
          <path d="M234.53,29.75v-.39c0-8.03,5.7-13.24,13.09-13.24,6.57,0,12.41,3.84,12.41,12.95v1.95h-18.35c.19,4.23,2.48,6.67,6.33,6.67,3.26,0,4.87-1.41,5.31-3.55h6.67c-.83,5.5-5.21,8.57-12.17,8.57-7.69,0-13.29-4.82-13.29-12.95ZM253.17,26.68c-.24-3.85-2.19-5.7-5.55-5.7-3.16,0-5.31,2.09-5.84,5.7h11.39Z"/>
          <path d="M262.23,16.7h7.06v4.87c1.61-3.41,4.09-5.21,8.23-5.26v6.57c-5.21-.05-8.23,1.66-8.23,6.52v12.75h-7.06v-25.46Z"/>
          <path d="M71.15,14.2c-1.22,0-2.26,4.29-2.65,10.27-.48-9.15-2.22-15.93-4.29-15.93-1.73,0-3.23,4.73-3.95,11.61-1.1-10.02-3.89-17.15-7.16-17.15-2.47,0-4.67,4.07-6.07,10.37-1.62-8.04-4.42-13.36-7.59-13.36s-5.97,5.32-7.59,13.36c-1.4-6.31-3.6-10.37-6.07-10.37-3.28,0-6.07,7.13-7.16,17.15-.73-6.88-2.22-11.61-3.95-11.61-2.07,0-3.81,6.78-4.29,15.93-.38-5.97-1.42-10.27-2.65-10.27-1.55,0-2.81,6.87-2.81,15.34s1.26,15.34,2.81,15.34c1.22,0,2.26-4.29,2.65-10.27.48,9.15,2.22,15.93,4.29,15.93,1.73,0,3.23-4.73,3.95-11.61,1.1,10.02,3.89,17.15,7.16,17.15,2.47,0,4.67-4.07,6.07-10.37,1.62,8.04,4.42,13.36,7.59,13.36s5.97-5.32,7.59-13.36c1.4,6.31,3.6,10.37,6.07,10.37,3.28,0,6.07-7.13,7.16-17.15.73,6.88,2.22,11.61,3.95,11.61,2.07,0,3.81-6.78,4.29-15.93.38,5.97,1.42,10.27,2.65,10.27,1.55,0,2.81-6.87,2.81-15.34s-1.26-15.34-2.81-15.34ZM59.65,30.88c-1.93,2.21-6.23,6.63-11.74,9.23-.57.27-1.15.52-1.74.75-2.12.81-4.38,1.31-6.74,1.31s-4.62-.5-6.74-1.31c-.59-.23-1.17-.48-1.74-.75-5.51-2.61-9.81-7.02-11.74-9.23-.06-.07-.11-.14-.15-.21-.46-.68-.46-1.57,0-2.26.05-.07.09-.14.15-.21,1.93-2.21,6.23-6.63,11.74-9.23.57-.27,1.15-.52,1.74-.75,2.12-.81,4.38-1.31,6.74-1.31s4.62.5,6.74,1.31c.59.23,1.17.48,1.74.75,5.51,2.61,9.81,7.02,11.74,9.23.06.07.11.14.15.21.46.68.46,1.57,0,2.26-.05.07-.09.14-.15.21Z"/>
          <path d="M77.18,21.87c-.93,0-1.68,3.43-1.68,7.67s.75,7.67,1.68,7.67,1.68-3.43,1.68-7.67-.75-7.67-1.68-7.67Z"/>
          <path d="M1.68,21.87c-.93,0-1.68,3.43-1.68,7.67s.75,7.67,1.68,7.67,1.68-3.43,1.68-7.67-.75-7.67-1.68-7.67Z"/>
          <path d="M39.43,22.1c-2.53,0-4.76,1.27-6.11,3.19-.84,1.2-1.33,2.67-1.33,4.24s.5,3.04,1.33,4.24c1.34,1.93,3.58,3.2,6.11,3.2s4.76-1.27,6.11-3.2c.84-1.2,1.33-2.67,1.33-4.24s-.5-3.04-1.33-4.24c-1.34-1.93-3.58-3.19-6.11-3.19Z"/>
        </svg>
      </div>

      <div className="divider-v" />

      {/* Image */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          {imageDataUrl ? 'Change Image' : '+ Image'}
        </button>
        {imageDataUrl && (
          <button className="btn danger" onClick={clearImage} title="Remove image" style={{ padding: '5px 8px' }}>✕</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onImageLoad} />
      </div>

      <div className="divider-v" />

      {/* Save / Load */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button className="btn" onClick={handleSave} disabled={!imageDataUrl}>Save</button>
        <button className="btn" onClick={handleLoad}>Load</button>
      </div>

      <div className="divider-v" />

      <KeyControl />

      <div className="divider-v" />

      <TransportControls audioEngine={audioEngine} />

      <div className="divider-v" />

      <MasterVolume audioEngine={audioEngine} />

      <div style={{ flex: 1 }} />

      {/* Theme toggle */}
      <button
        className="btn"
        onClick={() => setLight(l => !l)}
        title="Toggle light/dark"
        style={{ padding: '5px 10px' }}
      >
        {light ? '🌙' : '☀︎'}
      </button>

      <div className="divider-v" />

      <ExportPanel audioEngine={audioEngine} overlayCanvasRef={overlayCanvasRef} />
    </header>
  );
}
