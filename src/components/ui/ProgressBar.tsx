interface ProgressBarProps {
  value: number; // 0–100
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  return (
    <div className="w-full">
      {label && <div className="text-xs text-zinc-400 mb-1">{label}</div>}
      <div className="w-full bg-zinc-700 rounded-full h-1.5">
        <div
          className="bg-sky-400 h-1.5 rounded-full transition-all duration-200"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
