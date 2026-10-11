'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Optional motion: content is visible before JavaScript runs or if it fails. */
export function SiteEffects() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        observer.unobserve(el);
        // Never delay content already on screen. Only animate below-fold content
        // as it enters; the underlying styles always keep it visible.
        if (el.getBoundingClientRect().top < 100 || typeof el.animate !== 'function') return;
        el.animate(
          [{ opacity: 0.65, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
          { duration: 320, easing: 'ease-out' },
        );
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('[data-reveal], [data-image-reveal]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
