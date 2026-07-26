'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Progressive-enhancement motion layer. Pages stay server components and just
 * annotate elements with data-attributes; this reads them once on mount:
 *
 *   data-reveal            fade + rise into view
 *   data-image-reveal      scale 1.05→1 + clip-path "curtain" reveal
 *   data-parallax="0.06"   gentle scroll parallax (translateY, rAF-throttled)
 *   data-magnetic="0.3"    cursor "magnetic pull" within a 30px halo
 *
 * Reveals use an IntersectionObserver for smooth on-enter transitions, backed
 * by a scroll/mount finalizer so nothing can stay hidden after being scrolled
 * past (fast flings, anchor jumps, short viewports). Everything is disabled
 * under prefers-reduced-motion (also enforced in CSS).
 *
 * This component lives in the root layout, which the App Router does NOT
 * remount on client-side <Link> navigation — only the page content under it
 * changes. Without `pathname` as a dependency, the effect would scan the DOM
 * exactly once (on the very first load) and every subsequent page's elements
 * would never get observed, staying invisible until a hard reload. Re-running
 * per pathname re-scans the fresh DOM after every route change.
 */
export function SiteEffects() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cleanups: Array<() => void> = [];

    // --- Reveal + image reveal --------------------------------------------
    const revealEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reveal], [data-image-reveal]'),
    );
    const pending = new Set(revealEls);
    const reveal = (el: HTMLElement) => {
      if (!pending.has(el)) return;
      el.classList.add('is-visible');
      pending.delete(el);
    };

    // Reveal anything whose top has reached the lower 90% of the viewport —
    // the safety net that IntersectionObserver's on-enter callback can miss
    // when an element teleports across the viewport between frames.
    const finalizeInView = () => {
      if (!pending.size) return;
      const limit = window.innerHeight * 0.9;
      pending.forEach((el) => {
        if (el.getBoundingClientRect().top < limit) reveal(el);
      });
    };

    if (reduce) {
      revealEls.forEach(reveal);
    } else if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) reveal(entry.target as HTMLElement);
          });
        },
        { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
      );
      revealEls.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
      requestAnimationFrame(finalizeInView); // above-the-fold, after first layout
    } else {
      revealEls.forEach(reveal);
    }

    // --- Parallax + shared scroll finalizer -------------------------------
    const parallaxEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-parallax]'),
    );
    if (!reduce && (parallaxEls.length || pending.size)) {
      let ticking = false;
      const update = () => {
        ticking = false;
        if (parallaxEls.length) {
          const vh = window.innerHeight;
          parallaxEls.forEach((el) => {
            const speed = parseFloat(el.dataset.parallax || '0.06');
            const rect = el.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            const offset = (center - vh / 2) * -speed;
            el.style.setProperty('--parallax-y', `${offset.toFixed(2)}px`);
          });
        }
        finalizeInView();
      };
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      update();
      cleanups.push(() => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      });
    }

    // --- Magnetic CTAs -----------------------------------------------------
    const magEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-magnetic]'),
    );
    const fine =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!reduce && fine && magEls.length) {
      const HALO = 30; // px around the element that starts the pull
      let raf = 0;
      let pendingEv: MouseEvent | null = null;
      const apply = () => {
        raf = 0;
        const ev = pendingEv;
        if (!ev) return;
        magEls.forEach((el) => {
          const strength = parseFloat(el.dataset.magnetic || '0.3');
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = ev.clientX - cx;
          const dy = ev.clientY - cy;
          const inHalo =
            Math.abs(dx) < rect.width / 2 + HALO &&
            Math.abs(dy) < rect.height / 2 + HALO;
          el.style.setProperty('--mag-x', inHalo ? `${(dx * strength).toFixed(2)}px` : '0px');
          el.style.setProperty('--mag-y', inHalo ? `${(dy * strength).toFixed(2)}px` : '0px');
        });
      };
      const onMove = (ev: MouseEvent) => {
        pendingEv = ev;
        if (!raf) raf = requestAnimationFrame(apply);
      };
      window.addEventListener('mousemove', onMove, { passive: true });
      cleanups.push(() => {
        window.removeEventListener('mousemove', onMove);
        if (raf) cancelAnimationFrame(raf);
        magEls.forEach((el) => {
          el.style.removeProperty('--mag-x');
          el.style.removeProperty('--mag-y');
        });
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, [pathname]);

  return null;
}
