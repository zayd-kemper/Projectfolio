import { useEffect, useMemo } from 'react';

export const DEFAULT_PORTFOLIO_ANIMATIONS = {
  cardEntrance: 'none',
  cardHover: 'none',
  pageBackground: 'none',
};

const INTERACTION_TARGETS = new Set([
  '.pf-nav',
  '.pf-section',
  '.pf-header',
  '.pf-project-card',
  '.pf-feature-card',
  '.pf-proof-card',
  '.pf-stat-card',
  '.pf-skill-tag',
  '.pf-tech-tag',
  '.pf-contact-link',
  '.pf-contact-card',
  '.pf-hero-action',
  '.pf-hero-card',
  '.pf-cta-link',
  '.pf-cta-card',
  '.pf-credential-card',
  '.pf-endorsement-card',
  '.pf-project-block-card',
]);

const MOTION_IDS = [
  'pf-motion-style',
  'pf-motion-cursor-glow',
  'pf-motion-particles',
  'pf-motion-gradient-mesh',
];

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
};

const hexToRgba = (hex, alpha) => {
  const clean = String(hex || '').replace('#', '').trim();
  const expanded = clean.length === 3
    ? clean.split('').map((char) => char + char).join('')
    : clean.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return `rgba(37, 99, 235, ${alpha})`;
  const number = parseInt(expanded, 16);
  const r = (number >> 16) & 255;
  const g = (number >> 8) & 255;
  const b = number & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const motionReduced = () => (
  typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const safeTarget = (target, fallback = '.pf-project-card') => (
  INTERACTION_TARGETS.has(target) ? target : fallback
);

const cleanupMotionDom = (root) => {
  MOTION_IDS.forEach((id) => document.getElementById(id)?.remove());
  root.classList.remove(
    'pf-hover-lift',
    'pf-hover-glow',
    'pf-hover-scale',
    'pf-hover-tilt',
    'pf-bg-gradient-shift',
    'pf-page-enter',
    'pf-page-enter-fade',
    'pf-page-enter-slideUp',
    'pf-page-enter-scale'
  );
  root.querySelectorAll('.pf-nav-autohide, .pf-nav-hidden').forEach((node) => {
    node.classList.remove('pf-nav-autohide', 'pf-nav-hidden');
  });
  root.querySelectorAll('.pf-reveal, .pf-visible, .pf-motion-reveal, .pf-motion-visible').forEach((node) => {
    node.classList.remove(
      'pf-reveal',
      'pf-visible',
      'pf-reveal-fadeUp',
      'pf-reveal-slideIn',
      'pf-reveal-zoomIn',
      'pf-motion-reveal',
      'pf-motion-visible',
      'pf-motion-fadeUp',
      'pf-motion-slideIn',
      'pf-motion-zoomIn',
      'pf-motion-blurIn'
    );
    node.style.transitionDelay = '';
    node.style.transform = '';
  });
  root.querySelectorAll('.pf-motion-micro, .pf-motion-invert, .pf-motion-glow, .pf-motion-scale, .pf-motion-lift').forEach((node) => {
    node.classList.remove('pf-motion-micro', 'pf-motion-invert', 'pf-motion-glow', 'pf-motion-scale', 'pf-motion-lift');
  });
};

const createMotionStyle = (accentColor) => {
  const style = document.createElement('style');
  style.id = 'pf-motion-style';
  style.textContent = `
    #pf-root > * { position: relative; z-index: 1; }
    #pf-root .pf-motion-reveal {
      opacity: 0;
      transition:
        opacity var(--pf-motion-reveal-duration, 560ms) cubic-bezier(.22,1,.36,1),
        transform var(--pf-motion-reveal-duration, 560ms) cubic-bezier(.22,1,.36,1),
        filter var(--pf-motion-reveal-duration, 560ms) cubic-bezier(.22,1,.36,1);
      will-change: opacity, transform;
      backface-visibility: hidden;
    }
    #pf-root .pf-motion-fadeUp { transform: translate3d(0, 22px, 0); }
    #pf-root .pf-motion-slideIn { transform: translate3d(-22px, 0, 0); }
    #pf-root .pf-motion-zoomIn { transform: scale(.97); }
    #pf-root .pf-motion-blurIn { transform: translate3d(0, 14px, 0); filter: blur(8px); }
    #pf-root .pf-motion-visible { opacity: 1; transform: none; filter: none; }
    #pf-root.pf-hover-lift .pf-project-card:hover,
    #pf-root .pf-motion-lift:hover {
      transform: translate3d(0, -6px, 0);
      box-shadow: 0 16px 35px rgba(15,23,42,.18);
    }
    #pf-root.pf-hover-glow .pf-project-card:hover,
    #pf-root .pf-motion-glow:hover {
      box-shadow: 0 0 0 1px var(--pf-accent-30), 0 18px 45px var(--pf-accent-20);
    }
    #pf-root.pf-hover-scale .pf-project-card:hover,
    #pf-root .pf-motion-scale:hover {
      transform: scale(1.025);
    }
    #pf-root .pf-motion-invert:hover {
      background: var(--pf-text, #111827) !important;
      color: var(--pf-bg, #ffffff) !important;
      border-color: var(--pf-text, #111827) !important;
    }
    #pf-root.pf-hover-lift .pf-project-card,
    #pf-root.pf-hover-glow .pf-project-card,
    #pf-root.pf-hover-scale .pf-project-card,
    #pf-root.pf-hover-tilt .pf-project-card,
    #pf-root .pf-motion-micro {
      transition:
        transform 180ms cubic-bezier(.2,.8,.2,1),
        box-shadow 180ms cubic-bezier(.2,.8,.2,1),
        background-color 180ms ease,
        color 180ms ease,
        border-color 180ms ease,
        opacity 180ms ease;
      transform: translateZ(0);
      will-change: transform;
    }
    #pf-root.pf-bg-gradient-shift {
      background: linear-gradient(120deg, var(--pf-bg), var(--pf-accent-10), var(--pf-bg), var(--pf-accent-20));
      background-size: 400% 400%;
      animation: pfGradientShift 16s ease infinite;
    }
    #pf-root .pf-nav-autohide {
      position: sticky;
      top: 0;
      transform: translateY(0);
      transition: transform .24s cubic-bezier(.2,.8,.2,1), background-color .18s ease, backdrop-filter .18s ease;
      will-change: transform;
      backdrop-filter: blur(16px);
    }
    #pf-root .pf-nav-hidden { transform: translateY(-110%); }
    #pf-root.pf-page-enter { animation-duration: var(--pf-page-enter-duration, 260ms); animation-timing-function: cubic-bezier(.22,1,.36,1); animation-fill-mode: both; }
    #pf-root.pf-page-enter-fade { animation-name: pfPageEnterFade; }
    #pf-root.pf-page-enter-slideUp { animation-name: pfPageEnterSlideUp; }
    #pf-root.pf-page-enter-scale { animation-name: pfPageEnterScale; }
    #pf-motion-cursor-glow {
      position: fixed;
      left: 0;
      top: 0;
      width: var(--pf-cursor-size, 180px);
      height: var(--pf-cursor-size, 180px);
      border-radius: 999px;
      pointer-events: none;
      z-index: 2;
      opacity: var(--pf-cursor-opacity, .16);
      transform: translate3d(-50%, -50%, 0);
      background: radial-gradient(circle, ${hexToRgba(accentColor, 0.65)}, transparent 68%);
      mix-blend-mode: screen;
      will-change: left, top;
    }
    #pf-motion-gradient-mesh {
      position: fixed;
      inset: -20%;
      pointer-events: none;
      z-index: 0;
      opacity: var(--pf-mesh-opacity, .34);
      background:
        radial-gradient(circle at 16% 24%, ${hexToRgba(accentColor, 0.32)}, transparent 28%),
        radial-gradient(circle at 84% 18%, rgba(255,255,255,.14), transparent 26%),
        radial-gradient(circle at 56% 78%, ${hexToRgba(accentColor, 0.22)}, transparent 30%);
      filter: blur(34px);
      animation: pfGradientMesh 18s ease-in-out infinite alternate;
    }
    @keyframes pfGradientShift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes pfGradientMesh {
      0% { transform: translate3d(-2%, -1%, 0) scale(1); }
      100% { transform: translate3d(2%, 1%, 0) scale(1.04); }
    }
    @keyframes pfPageEnterFade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pfPageEnterSlideUp { from { opacity: 0; transform: translate3d(0, 14px, 0); } to { opacity: 1; transform: none; } }
    @keyframes pfPageEnterScale { from { opacity: 0; transform: scale(.985); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) {
      #pf-root,
      #pf-root *,
      #pf-motion-gradient-mesh {
        animation: none !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
      #pf-root .pf-motion-reveal { opacity: 1; transform: none; filter: none; }
      #pf-root .pf-nav-autohide { transform: none !important; transition: none; }
      #pf-motion-cursor-glow,
      #pf-motion-particles,
      #pf-motion-gradient-mesh { display: none; }
    }
  `;
  document.head.appendChild(style);
  return style;
};

const setupReveal = ({ root, target, effect, stagger, duration, cleanupFns }) => {
  const selector = safeTarget(target, '.pf-section');
  const revealEffect = ['fadeUp', 'slideIn', 'zoomIn', 'blurIn'].includes(effect) ? effect : 'fadeUp';
  const revealStagger = Math.round(clamp(stagger, 0, 240, 60));
  const revealDuration = Math.round(clamp(duration, 180, 900, 560));
  const observed = new WeakSet();
  let observer = null;
  let mutationRaf = null;

  const markNodes = () => {
    const nodes = [...root.querySelectorAll(selector)].filter((node) => !observed.has(node));
    nodes.forEach((node, index) => {
      observed.add(node);
      node.classList.add('pf-motion-reveal', `pf-motion-${revealEffect}`);
      node.style.setProperty('--pf-motion-reveal-duration', `${revealDuration}ms`);
      node.style.transitionDelay = `${Math.min(index * revealStagger, 520)}ms`;
      if (observer) observer.observe(node);
      else node.classList.add('pf-motion-visible');
    });
  };

  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('pf-motion-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  }

  markNodes();
  const mutationObserver = new MutationObserver(() => {
    if (mutationRaf) return;
    mutationRaf = window.requestAnimationFrame(() => {
      mutationRaf = null;
      markNodes();
    });
  });
  mutationObserver.observe(root, { childList: true, subtree: true });
  cleanupFns.push(() => {
    if (mutationRaf) window.cancelAnimationFrame(mutationRaf);
    mutationObserver.disconnect();
    observer?.disconnect();
  });
};

const setupCardTilt = ({ root, target, strength, cleanupFns }) => {
  const selector = safeTarget(target, '.pf-project-card');
  const strengthMap = { subtle: 5, medium: 8, strong: 10 };
  const tiltStrength = strengthMap[strength] || strengthMap.subtle;
  let activeNode = null;
  let tiltRaf = null;
  let latestEvent = null;

  const resetActive = () => {
    if (activeNode) activeNode.style.transform = '';
    activeNode = null;
  };
  const update = () => {
    tiltRaf = null;
    if (!latestEvent || !activeNode) return;
    const rect = activeNode.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = (latestEvent.clientX - rect.left) / rect.width - 0.5;
    const y = (latestEvent.clientY - rect.top) / rect.height - 0.5;
    activeNode.style.transform = `perspective(900px) rotateX(${(-y * tiltStrength).toFixed(2)}deg) rotateY(${(x * tiltStrength).toFixed(2)}deg) translate3d(0,-4px,0)`;
  };
  const onPointerMove = (event) => {
    const node = event.target.closest?.(selector);
    if (!node || !root.contains(node)) {
      resetActive();
      return;
    }
    if (node !== activeNode) resetActive();
    activeNode = node;
    latestEvent = event;
    if (!tiltRaf) tiltRaf = window.requestAnimationFrame(update);
  };
  const onPointerOut = (event) => {
    if (!activeNode) return;
    const next = event.relatedTarget;
    if (!next || !activeNode.contains(next)) resetActive();
  };

  root.classList.add('pf-hover-tilt');
  root.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('pointerout', onPointerOut, { passive: true });
  cleanupFns.push(() => {
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerout', onPointerOut);
    if (tiltRaf) window.cancelAnimationFrame(tiltRaf);
    resetActive();
  });
};

const setupMicroInteractions = ({ root, target, effect, cleanupFns }) => {
  const selector = safeTarget(target, '.pf-project-card');
  const effectClass = {
    invert: 'pf-motion-invert',
    glow: 'pf-motion-glow',
    scale: 'pf-motion-scale',
    lift: 'pf-motion-lift',
  }[effect] || 'pf-motion-lift';
  const apply = () => {
    root.querySelectorAll(selector).forEach((node) => {
      node.classList.add('pf-motion-micro', effectClass);
    });
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(root, { childList: true, subtree: true });
  cleanupFns.push(() => observer.disconnect());
};

const setupNavAutoHide = ({ root, threshold, cleanupFns }) => {
  const nav = root.querySelector('.pf-nav');
  if (!nav) return;
  const hideThreshold = Math.round(clamp(threshold, 8, 180, 24));
  if (!('IntersectionObserver' in window)) return;
  nav.classList.add('pf-nav-autohide');
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.setAttribute('data-pf-motion-sentinel', 'nav-autohide');
  sentinel.style.cssText = `height:${hideThreshold}px;margin-bottom:-${hideThreshold}px;pointer-events:none;`;
  root.insertBefore(sentinel, root.firstChild);

  const observer = new IntersectionObserver(([entry]) => {
    nav.classList.toggle('pf-nav-hidden', !entry.isIntersecting);
  }, { threshold: 0 });
  observer.observe(sentinel);

  cleanupFns.push(() => {
    observer.disconnect();
    sentinel.remove();
    nav.classList.remove('pf-nav-autohide', 'pf-nav-hidden');
  });
};

const setupCursorGlow = ({ size, opacity, cleanupFns }) => {
  if (document.getElementById('pf-motion-cursor-glow')) return;
  const glow = document.createElement('div');
  glow.id = 'pf-motion-cursor-glow';
  glow.setAttribute('data-pf-ai-artifact', 'true');
  glow.style.setProperty('--pf-cursor-size', `${Math.round(clamp(size, 80, 360, 180))}px`);
  glow.style.setProperty('--pf-cursor-opacity', String(clamp(opacity, 0.05, 0.35, 0.16)));
  document.body.appendChild(glow);
  let rafId = null;
  let latest = null;
  const update = () => {
    rafId = null;
    if (!latest) return;
    glow.style.left = `${latest.clientX}px`;
    glow.style.top = `${latest.clientY}px`;
  };
  const onMove = (event) => {
    latest = event;
    if (!rafId) rafId = window.requestAnimationFrame(update);
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  cleanupFns.push(() => {
    window.removeEventListener('pointermove', onMove);
    if (rafId) window.cancelAnimationFrame(rafId);
    glow.remove();
  });
};

const setupGradientMesh = ({ root, opacity, cleanupFns }) => {
  if (document.getElementById('pf-motion-gradient-mesh')) return;
  root.style.position = root.style.position || 'relative';
  const mesh = document.createElement('div');
  mesh.id = 'pf-motion-gradient-mesh';
  mesh.setAttribute('data-pf-ai-artifact', 'true');
  mesh.style.setProperty('--pf-mesh-opacity', String(clamp(opacity, 0.08, 0.45, 0.28)));
  root.prepend(mesh);
  cleanupFns.push(() => mesh.remove());
};

const setupParticles = ({ root, accentColor, density, cleanupFns }) => {
  if (document.getElementById('pf-motion-particles')) return;
  const densityMap = { low: 24, medium: 42, high: 58 };
  const count = densityMap[density] || densityMap.low;
  root.style.position = root.style.position || 'relative';
  const canvas = document.createElement('canvas');
  canvas.id = 'pf-motion-particles';
  canvas.setAttribute('data-pf-ai-artifact', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  root.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }

  let rafId = null;
  let running = true;
  let particles = [];
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(window.innerWidth * ratio));
    canvas.height = Math.max(1, Math.floor(window.innerHeight * ratio));
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.8 + 0.6,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
    }));
  };
  const draw = () => {
    if (!running) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = hexToRgba(accentColor, 0.34);
    particles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.x < -10) particle.x = window.innerWidth + 10;
      if (particle.x > window.innerWidth + 10) particle.x = -10;
      if (particle.y < -10) particle.y = window.innerHeight + 10;
      if (particle.y > window.innerHeight + 10) particle.y = -10;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fill();
    });
    rafId = window.requestAnimationFrame(draw);
  };
  const onVisibility = () => {
    running = document.visibilityState !== 'hidden';
    if (running && !rafId) draw();
    if (!running && rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  resize();
  draw();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  cleanupFns.push(() => {
    running = false;
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    if (rafId) window.cancelAnimationFrame(rafId);
    canvas.remove();
  });
};

const setupPageTransition = ({ root, effect, duration, cleanupFns }) => {
  const pageEffect = ['fade', 'slideUp', 'scale'].includes(effect) ? effect : 'fade';
  const pageDuration = Math.round(clamp(duration, 120, 450, 240));
  root.style.setProperty('--pf-page-enter-duration', `${pageDuration}ms`);
  root.classList.add('pf-page-enter', `pf-page-enter-${pageEffect}`);
  const timeout = window.setTimeout(() => {
    root.classList.remove('pf-page-enter', `pf-page-enter-${pageEffect}`);
  }, pageDuration + 80);
  cleanupFns.push(() => {
    window.clearTimeout(timeout);
    root.classList.remove('pf-page-enter', `pf-page-enter-${pageEffect}`);
  });
};

export function usePortfolioMotion({ animations, interactions, accentColor = '#2563eb', rootId = 'pf-root' }) {
  const signature = useMemo(() => JSON.stringify({
    animations: animations || {},
    interactions: interactions || [],
    accentColor,
  }), [animations, interactions, accentColor]);

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return undefined;

    const normalizedAnimations = { ...DEFAULT_PORTFOLIO_ANIMATIONS, ...(animations || {}) };
    const recipes = parseArray(interactions);
    const cleanupFns = [];
    const reduced = motionReduced();

    cleanupMotionDom(root);
    createMotionStyle(accentColor);

    if (reduced) {
      root.querySelectorAll('.pf-motion-reveal').forEach((node) => node.classList.add('pf-motion-visible'));
      return () => cleanupMotionDom(root);
    }

    if (normalizedAnimations.cardEntrance !== 'none') {
      setupReveal({
        root,
        target: '.pf-project-card',
        effect: normalizedAnimations.cardEntrance,
        stagger: 70,
        duration: 560,
        cleanupFns,
      });
    }

    if (['lift', 'glow', 'scale'].includes(normalizedAnimations.cardHover)) {
      root.classList.add(`pf-hover-${normalizedAnimations.cardHover}`);
    }
    if (normalizedAnimations.cardHover === 'tilt') {
      setupCardTilt({ root, target: '.pf-project-card', strength: 'medium', cleanupFns });
    }
    if (normalizedAnimations.pageBackground === 'gradient-shift') root.classList.add('pf-bg-gradient-shift');
    if (normalizedAnimations.pageBackground === 'particles') {
      setupParticles({ root, accentColor, density: 'medium', cleanupFns });
    }

    recipes.forEach((recipe) => {
      if (recipe?.type === 'scrollReveal') {
        setupReveal({
          root,
          target: recipe.target,
          effect: recipe.effect,
          stagger: recipe.stagger,
          duration: recipe.duration,
          cleanupFns,
        });
      }
      if (recipe?.type === 'cardTilt') {
        setupCardTilt({ root, target: recipe.target, strength: recipe.strength, cleanupFns });
      }
      if (recipe?.type === 'microInteractions') {
        setupMicroInteractions({ root, target: recipe.target, effect: recipe.effect, cleanupFns });
      }
      if (recipe?.type === 'navAutoHide') {
        setupNavAutoHide({ root, threshold: recipe.threshold, cleanupFns });
      }
      if (recipe?.type === 'cursorGlow') {
        setupCursorGlow({ size: recipe.size, opacity: recipe.opacity, cleanupFns });
      }
      if (recipe?.type === 'ambientParticles') {
        setupParticles({ root, accentColor, density: recipe.density, cleanupFns });
      }
      if (recipe?.type === 'gradientMesh') {
        setupGradientMesh({ root, opacity: recipe.opacity, cleanupFns });
      }
      if (recipe?.type === 'pageTransition') {
        setupPageTransition({ root, effect: recipe.effect, duration: recipe.duration, cleanupFns });
      }
    });

    return () => {
      cleanupFns.forEach((cleanup) => cleanup());
      cleanupMotionDom(root);
    };
  }, [signature, rootId]);
}
