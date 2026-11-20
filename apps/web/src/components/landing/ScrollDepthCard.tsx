import { useEffect, useRef, type ReactNode } from 'react';
import { computeCardDepthTransform, dampValue } from '@/utils/scroll3dMath';

interface ScrollDepthCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Compositor-only, exponentially damped 3D perspective depth wrapper.
 * Updates DOM transforms directly via requestAnimationFrame (zero React re-renders
 * during scroll, sleeps automatically when settled) for silky physical inertia.
 */
export function ScrollDepthCard({ children, className = '' }: ScrollDepthCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    let rafId = 0;
    let lastTime = performance.now();
    let targetOffset = 0;
    let currentOffset = 0;

    const readTarget = () => {
      const rect = el.getBoundingClientRect();
      const vh = Math.max(1, window.innerHeight);
      const cardCenter = rect.top + rect.height / 2;
      targetOffset = Math.max(-1, Math.min(1, (cardCenter - vh / 2) / (vh * 0.8)));
    };

    const applyTransform = (offset: number) => {
      const t = computeCardDepthTransform(offset);
      el.style.transform = `perspective(1200px) rotateX(${t.rotateX}deg) translate3d(0px, ${t.translateY}px, 0px) scale(${t.scale})`;
      el.style.opacity = String(t.opacity);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      currentOffset = dampValue(currentOffset, targetOffset, 8.5, dt);
      applyTransform(currentOffset);

      if (Math.abs(targetOffset - currentOffset) > 0.0015) {
        rafId = requestAnimationFrame(tick);
      } else {
        currentOffset = targetOffset;
        applyTransform(currentOffset);
        rafId = 0;
      }
    };

    const onScroll = () => {
      readTarget();
      if (!rafId) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    readTarget();
    currentOffset = targetOffset;
    applyTransform(currentOffset);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        transform: 'perspective(1200px) rotateX(0deg) translate3d(0px, 0px, 0px) scale(1)',
        opacity: 1,
        willChange: 'transform, opacity',
      }}
      className={className}
    >
      {children}
    </div>
  );
}
