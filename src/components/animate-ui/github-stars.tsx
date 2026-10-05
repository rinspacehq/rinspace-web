import * as React from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';

import { cn } from '@/components/ui/cn';
import { useIsInView, type UseIsInViewOptions } from './use-is-in-view';

export type AnimateGithubStarsProps = React.HTMLAttributes<HTMLDivElement> &
  UseIsInViewOptions & {
    value: number;
    loading?: boolean;
    label: string;
  };

/**
 * Rinspace-owned adaptation of Animate UI's pinned Github Stars primitive.
 * The value is supplied by the product so the display can represent an
 * approved set of repositories instead of one hard-coded repository.
 */
export function AnimateGithubStars({
  value,
  loading = false,
  label,
  inView = false,
  inViewMargin = '0px',
  inViewOnce = true,
  className,
  ...props
}: AnimateGithubStarsProps) {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const { ref, isInView } = useIsInView(outerRef, {
    inView,
    inViewMargin,
    inViewOnce,
  });
  const reducedMotion = useReducedMotion();
  const target = Math.max(0, Math.round(value));
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    stiffness: 90,
    damping: 28,
    mass: 0.5,
  });
  const [displayValue, setDisplayValue] = React.useState(0);
  const [completed, setCompleted] = React.useState(false);

  React.useEffect(() => springValue.on('change', (latest) => {
    const next = Math.max(0, Math.round(latest));
    setDisplayValue(next);
    setCompleted(next === target);
  }), [springValue, target]);

  React.useEffect(() => {
    if (loading || !isInView) {
      setCompleted(false);
      return;
    }
    if (reducedMotion || target === 0) {
      motionValue.jump(target);
      setDisplayValue(target);
      setCompleted(true);
      return;
    }
    motionValue.jump(0);
    setDisplayValue(0);
    setCompleted(false);
    motionValue.set(target);
  }, [isInView, loading, motionValue, reducedMotion, target]);

  return (
    <div
      ref={ref}
      className={cn('rin-animate-github-stars', className)}
      aria-busy={loading}
      {...props}
    >
      <span className="rin-visually-hidden">
        {label}: {loading ? '…' : target}
      </span>
      <svg
        className="rin-animate-github-stars__github"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
      <span className="rin-animate-github-stars__number" aria-hidden="true">
        {loading ? '—' : displayValue}
      </span>
      <span className="rin-animate-github-stars__star" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="m12 2.7 2.84 5.75 6.35.92-4.6 4.48 1.09 6.32L12 17.19l-5.68 2.98 1.09-6.32-4.6-4.48 6.35-.92L12 2.7Z" />
        </svg>
        <AnimatePresence>
          {completed && target > 0 && !reducedMotion
            ? Array.from({ length: 6 }, (_, index) => {
                const angle = (index / 6) * Math.PI * 2;
                return (
                  <motion.i
                    key={`${target}-${index}`}
                    initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0],
                      x: Math.cos(angle) * 18,
                      y: Math.sin(angle) * 18,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.65, delay: index * 0.04 }}
                  />
                );
              })
            : null}
        </AnimatePresence>
      </span>
    </div>
  );
}
