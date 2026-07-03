import { useEffect, useMemo, useState } from 'react';
import EngineeringIcon from './EngineeringIcon';

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

export default function ActiveProgress({
  stages = [],
  currentStep = '',
  label = 'Work in progress',
  note = '',
  compact = false,
  icon = 'ai-core',
}) {
  const reducedMotion = useReducedMotion();
  const messages = useMemo(() => {
    const ordered = [currentStep, ...stages].filter(Boolean);
    return [...new Set(ordered)];
  }, [currentStep, stages]);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [currentStep, messages.length]);

  useEffect(() => {
    if (reducedMotion || messages.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setIndex(value => (value + 1) % messages.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [messages.length, reducedMotion]);

  const message = messages[index] || label;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`${compact ? 'px-3 py-2.5' : 'px-5 py-5'} overflow-hidden rounded-xl border border-accent-border/70 bg-accent-surface/70`}
    >
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3">
        <div className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} relative flex-none rounded-lg bg-surface border border-accent-border grid place-items-center shadow-sm`}>
          <EngineeringIcon name={icon} size={compact ? 17 : 20} />
          <span className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-accent border-2 border-white animate-pulse motion-reduce:animate-none" />
        </div>
        <div className="min-w-0 flex-1">
          <p aria-hidden="true" className={`${compact ? 'text-xs' : 'text-sm'} min-h-[1.25rem] font-medium text-ink-secondary transition-opacity`}>
            {message}
          </p>
          <div aria-hidden="true" className="mt-2 flex items-center gap-1.5">
            {[0, 1, 2].map(node => (
              <span
                key={node}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${node <= (index % 3) ? 'bg-accent' : 'bg-accent-border'}`}
              />
            ))}
          </div>
        </div>
      </div>
      {note && !compact && <p className="text-xs text-ink-faint mt-3">{note}</p>}
    </div>
  );
}
