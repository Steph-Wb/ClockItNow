interface Props { message: string; onRetry?: () => void; }

export default function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div className="bg-red-900/30 border border-danger rounded-lg px-4 py-3 flex items-center gap-3 text-sm text-red-300">
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-accent hover:underline">Retry</button>
      )}
    </div>
  );
}
