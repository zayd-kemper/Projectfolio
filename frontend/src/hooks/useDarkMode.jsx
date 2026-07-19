import { useState, useEffect } from 'react';

export function useDarkMode() {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    const root = document.documentElement;

    // Flip the theme under a transition suppressor so every element repaints in
    // the same frame. Without it, controls with hover transitions (buttons,
    // inputs, nav items) lag ~150-200ms behind untransitioned surfaces.
    root.classList.add('theme-switching');
    root.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);

    // Two frames: the first is queued before the flipped theme paints; removing
    // on the second guarantees the suppressed frame has been committed.
    let secondFrame = null;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        root.classList.remove('theme-switching');
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
      root.classList.remove('theme-switching');
    };
  }, [darkMode]);

  return [darkMode, setDarkMode];
}
