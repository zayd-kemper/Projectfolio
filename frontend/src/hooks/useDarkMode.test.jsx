import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDarkMode } from './useDarkMode';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

describe('useDarkMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
  });

  it('suppresses transitions during the theme flip so every element repaints in the same frame', async () => {
    const { result } = renderHook(() => useDarkMode());

    await act(async () => {
      result.current[1](true);
    });

    // The flip itself must happen under the suppressor class…
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true);

    // …and the suppressor must clear once the switched frame has painted.
    await act(async () => {
      await nextFrame();
      await nextFrame();
      await nextFrame();
    });
    expect(document.documentElement.classList.contains('theme-switching')).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
