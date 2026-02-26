import { useRef, useEffect, useCallback } from 'react';
import { useSonimageStore } from './store/useSonimageStore';
import { AudioEngine } from './engine/AudioEngine';
import { AudioLayerNode } from './engine/AudioLayerNode';
import { startLoop, stopLoop, setLoopDeps } from './engine/animationLoop';
import { useImageUpload } from './hooks/useImageUpload';
import { Toolbar } from './components/layout/Toolbar';
import { Sidebar } from './components/layout/Sidebar';
import { CanvasStage } from './components/canvas/CanvasStage';
import type { LayerEffects, OscillatorType, RectLayer } from './types';

const audioEngine = new AudioEngine();
const audioNodeMap = new Map<string, AudioLayerNode>();

export default function App() {
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const { removeLayer, updateLayer, updateEffects } = useSonimageStore();

  useEffect(() => {
    const store = useSonimageStore;
    const initLoop = () => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) { requestAnimationFrame(initLoop); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      setLoopDeps(store, ctx, audioNodeMap);
      startLoop();
    };
    initLoop();
    return () => stopLoop();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { isPlaying, setPlaying, selectedLayerId, toggleMute } = useSonimageStore.getState();
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) { setPlaying(false); audioEngine.silenceAll(); }
        else { audioEngine.resume().then(() => { audioEngine.restoreVolume(useSonimageStore.getState().masterVolume); setPlaying(true); }); }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerId) {
        const node = audioNodeMap.get(selectedLayerId);
        node?.disconnect();
        audioNodeMap.delete(selectedLayerId);
        removeLayer(selectedLayerId);
      }
      if (e.key === 'm' || e.key === 'M') {
        if (selectedLayerId) toggleMute(selectedLayerId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [removeLayer]);

  const handleLayerCreated = useCallback((layer: RectLayer) => {
    const node = audioEngine.createLayerNode(layer);
    const { imageProfile } = useSonimageStore.getState();
    if (imageProfile) {
      node.setImageProfile(imageProfile);
      const firstMode = imageProfile.generatedModes[0];
      if (firstMode) node.setModeParams(firstMode.params);
    }
    audioNodeMap.set(layer.id, node);
  }, []);

  const handleSampleLoad = useCallback((id: string, buffer: AudioBuffer) => {
    const node = audioNodeMap.get(id);
    if (node) { node.setSampleBuffer(buffer); updateLayer(id, { soundSource: 'sample', sampleBuffer: buffer }); }
  }, [updateLayer]);

  const handleSampleClear = useCallback((id: string) => {
    const node = audioNodeMap.get(id);
    if (node) { node.clearSample(); updateLayer(id, { soundSource: 'synth', sampleBuffer: null }); }
  }, [updateLayer]);

  const handleOscillatorChange = useCallback((id: string, type: OscillatorType) => {
    audioNodeMap.get(id)?.setOscillatorType(type);
    updateLayer(id, { oscillatorType: type });
  }, [updateLayer]);

  const handleEffectsChange = useCallback((id: string, patch: Partial<LayerEffects>) => {
    updateEffects(id, patch);
    // Apply to live audio node — get fresh merged effects from store after update
    setTimeout(() => {
      const layer = useSonimageStore.getState().layers.find(l => l.id === id);
      if (layer) audioNodeMap.get(id)?.applyEffects(layer.effects);
    }, 0);
  }, [updateEffects]);

  // When a save file is loaded, rebuild all audio nodes
  const handleSaveLoaded = useCallback(() => {
    // Disconnect all existing nodes
    audioNodeMap.forEach(node => node.disconnect());
    audioNodeMap.clear();
    // Create fresh nodes for each loaded layer
    const { layers } = useSonimageStore.getState();
    const { imageProfile } = useSonimageStore.getState();
    layers.forEach(layer => {
      const node = audioEngine.createLayerNode(layer);
      node.applyEffects(layer.effects);
      if (imageProfile) {
        node.setImageProfile(imageProfile);
        const mode = imageProfile.generatedModes.find(m => m.id === layer.generatedModeId)
          ?? imageProfile.generatedModes[0];
        if (mode) node.setModeParams(mode.params);
      }
      audioNodeMap.set(layer.id, node);
    });
  }, []);

  const handleImageBeforeLoad = useCallback(() => {
    // Stop playback, silence all audio, disconnect and clear all layer nodes
    const { setPlaying } = useSonimageStore.getState();
    setPlaying(false);
    audioEngine.silenceAll();
    audioNodeMap.forEach(node => node.disconnect());
    audioNodeMap.clear();
  }, []);

  const { handleFileInput } = useImageUpload(handleImageBeforeLoad);

  return (
    <div className="flex flex-col w-full h-full">
      <Toolbar
        audioEngine={audioEngine}
        overlayCanvasRef={overlayCanvasRef}
        onImageLoad={handleFileInput}
        onSaveLoaded={handleSaveLoaded}
      />
      <div className="flex flex-1 overflow-hidden">
        <CanvasStage overlayCanvasRef={overlayCanvasRef} onLayerCreated={handleLayerCreated} />
        <Sidebar
          audioNodeMap={audioNodeMap}
          audioEngine={audioEngine}
          onSampleLoad={handleSampleLoad}
          onSampleClear={handleSampleClear}
          onOscillatorChange={handleOscillatorChange}
          onEffectsChange={handleEffectsChange}
        />
      </div>
    </div>
  );
}
