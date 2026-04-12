import { useEffect, useRef } from 'react';

/** Traps focus within a container; returns ref to attach. */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(enabled = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;

    const getFocusables = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

    // Focus first element
    const firsts = getFocusables();
    if (firsts.length) firsts[0].focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = getFocusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', handler);
    return () => {
      el.removeEventListener('keydown', handler);
      prev?.focus?.();
    };
  }, [enabled]);

  return ref;
}
