(() => {
  'use strict';

  const root = document.documentElement;
  const scenes = Array.from(document.querySelectorAll('.scene'));
  const bridges = Array.from(document.querySelectorAll('.bridge'));
  const chapters = Array.from(document.querySelectorAll('.chapter'));
  const navItems = Array.from(document.querySelectorAll('.nav a'));
  const progressBar = document.querySelector('.progress__bar');
  const readoutNum = document.querySelector('.scene-readout__num');
  const readoutLabel = document.querySelector('.scene-readout__label');
  const canvas = document.querySelector('.fx-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reducedData = window.matchMedia('(prefers-reduced-data: reduce)').matches;
  const lowPower = reducedData || window.innerWidth < 760;

  const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
  const smooth = (n) => n * n * (3 - 2 * n);
  const lerp = (a, b, t) => a + (b - a) * t;

  const palettes = [
    [0, 229, 194],
    [245, 247, 250],
    [106, 124, 255],
    [0, 229, 194],
    [106, 124, 255],
    [255, 61, 113],
    [255, 196, 0],
    [255, 61, 113],
    [0, 229, 194],
    [255, 255, 255],
  ];

  const sceneHues = [176, 248, 234, 196, 248, 334, 45, 286, 186, 210];
  const motionModes = ['axis', 'ink', 'signal', 'interface', 'portal', 'team', 'growth', 'recruit', 'contact', 'foundation'];

  let metrics = [];
  let ticking = false;
  let canvasW = 0;
  let canvasH = 0;
  let dpr = 1;
  let targetScrollY = window.scrollY || window.pageYOffset || 0;
  let visualScrollY = targetScrollY;
  let previousVisualScrollY = visualScrollY;
  let lastTime = performance.now();
  let lastFxDraw = 0;
  let fxRunning = false;
  let stableChapterIndex = 0;
  let lastActiveChapter = -1;
  let lastActiveScene = -1;
  const styleCache = new WeakMap();
  const fxState = {
    progress: 0,
    impact: 0,
    active: 0,
    local: 0,
    scroll: 0,
    velocity: 0,
    speed: 0,
    cut: 0,
    burst: 0,
    direction: 1,
    hue: sceneHues[0],
    motion: motionModes[0],
  };

  const sceneEntries = scenes.map((scene) => ({
    scene,
    video: scene.querySelector('video'),
    duration: 5,
    lastTime: -1,
    active: false,
    near: false,
  }));

  const bridgeEntries = bridges.map((bridge) => ({
    bridge,
    boundary: Number(bridge.dataset.boundary || 0),
    visible: false,
  }));

  const chapterEntries = chapters.map((chapter) => ({
    chapter,
    copy: chapter.querySelector('.chapter__copy'),
    active: false,
  }));

  let videoHydrationQueue = Promise.resolve();

  sceneEntries.forEach((entry) => {
    const { video } = entry;
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    video.pause();
    entry.sourceReady = false;
    const applyDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > .1) {
        entry.duration = video.duration;
      }
    };
    video.addEventListener('loadedmetadata', applyDuration, { once: false });
    if (video.readyState >= 1) applyDuration();

    if (reduced) {
      entry.sourceReady = true;
      return;
    }

    const sourcePath = video.dataset.src || video.currentSrc || video.src;
    const originalSrc = new URL(sourcePath, window.location.href).href;
    video.dataset.originalSrc = originalSrc;
    entry.sourcePromise = videoHydrationQueue
      .then(() => fetch(originalSrc))
      .then((response) => {
        if (!response.ok) throw new Error(`Video fetch failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => new Promise((resolve) => {
        const blobUrl = URL.createObjectURL(blob);
        entry.blobUrl = blobUrl;
        const ready = () => {
          entry.sourceReady = true;
          applyDuration();
          resolve();
          if (typeof requestUpdate === 'function') requestUpdate();
        };
        video.src = blobUrl;
        video.load();
        if (video.readyState >= 1) ready();
        else video.addEventListener('loadedmetadata', ready, { once: true });
      }))
      .catch(() => {
        entry.sourceReady = true;
        video.dataset.sourceFallback = 'network';
      });
    videoHydrationQueue = entry.sourcePromise;
  });

  const setStyle = (element, prop, value) => {
    if (!element) return;
    let cache = styleCache.get(element);
    if (!cache) {
      cache = new Map();
      styleCache.set(element, cache);
    }
    if (cache.get(prop) === value) return;
    cache.set(prop, value);
    if (prop.startsWith('--')) element.style.setProperty(prop, value);
    else element.style[prop] = value;
  };

  const setRoot = (prop, value) => setStyle(root, prop, value);

  const particleCount = lowPower ? 24 : (window.innerWidth < 860 ? 32 : 52);
  const particles = Array.from({ length: particleCount }, (_, i) => ({
    x: (Math.sin(i * 17.11) + 1) / 2,
    y: (Math.cos(i * 9.73) + 1) / 2,
    speed: .12 + (i % 9) * .032,
    size: .65 + (i % 5) * .23,
    phase: i * 0.63,
  }));

  const pseudoRandom = (a, b, c = 0) => {
    const x = Math.sin((a + 1) * 12.9898 + (b + 1) * 78.233 + (c + 1) * 37.719) * 43758.5453;
    return x - Math.floor(x);
  };

  const splitJapaneseTitle = (text) => {
    const normalized = text.replace(/\s+/g, '');
    const matches = normalized.match(/.{1,4}[、。,.!?]?/g);
    return matches && matches.length ? matches : [normalized];
  };

  const splitEnglishTitle = (text) => text.split(/(\s+)/).filter(Boolean);

  const getWordMotion = (mode, wordIndex, lineIndex) => {
    const source = [
      { x: '0%', y: '-150%', rotate: '-2deg', scale: '.04' },
      { x: '12%', y: '75%', rotate: '2.5deg', scale: '.04' },
      { x: '-14%', y: '-75%', rotate: '-4deg', scale: '.06' },
      { x: '6%', y: '150%', rotate: '3deg', scale: '.04' },
    ][(wordIndex + lineIndex) % 4];
    const seed = pseudoRandom(wordIndex, lineIndex, mode.length);
    const delay = Math.round(lineIndex * 90 + wordIndex * 34 + seed * 120);
    const motion = { ...source, delay };

    if (mode === 'ink') {
      return {
        ...motion,
        x: `${-18 - seed * 18}%`,
        y: `${seed > .5 ? 68 : -68}%`,
        rotate: `${-4 + seed * 8}deg`,
        scale: '.72',
      };
    }

    if (mode === 'signal') {
      return {
        ...motion,
        x: `${-42 + seed * 84}%`,
        y: `${-26 + seed * 52}%`,
        rotate: `${-1 + seed * 2}deg`,
        scale: '.2',
        delay: Math.round(lineIndex * 54 + wordIndex * 18 + seed * 70),
      };
    }

    if (mode === 'interface') {
      return {
        ...motion,
        x: `${(wordIndex % 2 ? 1 : -1) * (38 + seed * 24)}%`,
        y: `${-12 + seed * 24}%`,
        rotate: '0deg',
        scale: '.84',
      };
    }

    if (mode === 'portal') {
      return {
        ...motion,
        x: `${-70 + seed * 140}%`,
        y: `${-120 + seed * 240}%`,
        rotate: `${-12 + seed * 24}deg`,
        scale: '.28',
      };
    }

    if (mode === 'team') {
      return {
        ...motion,
        x: `${wordIndex % 2 ? 46 : -46}%`,
        y: `${lineIndex % 2 ? 38 : -38}%`,
        rotate: `${wordIndex % 2 ? 4 : -4}deg`,
        scale: '.64',
      };
    }

    if (mode === 'growth') {
      return {
        ...motion,
        x: `${-8 + seed * 16}%`,
        y: `${130 + seed * 70}%`,
        rotate: `${-3 + seed * 6}deg`,
        scale: '.52',
      };
    }

    if (mode === 'contact') {
      return {
        ...motion,
        x: `${wordIndex % 2 ? 74 : -74}%`,
        y: `${-20 + seed * 40}%`,
        rotate: `${wordIndex % 2 ? -8 : 8}deg`,
        scale: '.36',
      };
    }

    if (mode === 'recruit') {
      return {
        ...motion,
        x: `${wordIndex % 2 ? 86 : -86}%`,
        y: `${-60 + seed * 120}%`,
        rotate: `${wordIndex % 2 ? -10 : 10}deg`,
        scale: '.32',
      };
    }

    if (mode === 'foundation') {
      return {
        ...motion,
        x: `${-10 + seed * 20}%`,
        y: `${-18 + seed * 36}%`,
        rotate: '0deg',
        scale: '.82',
        delay: Math.round(lineIndex * 70 + wordIndex * 28 + seed * 90),
      };
    }

    return motion;
  };

  const splitTitle = (title, mode = 'axis') => {
    if (!title || title.dataset.typoReady === 'true') return;
    const lines = Array.from(title.children);
    const label = lines.map((line) => (line.textContent || '').trim()).filter(Boolean).join(' ');
    const isJapanese = title.classList.contains('chapter__title--jp');

    if (label) title.setAttribute('aria-label', label);
    title.setAttribute('data-scroll-reveal', 'h');
    title.setAttribute('data-prevent-flicker', 'true');

    lines.forEach((line, lineIndex) => {
      const text = line.textContent || '';
      line.textContent = '';
      line.classList.add('typo-line');
      line.setAttribute('aria-hidden', 'true');
      line.style.setProperty('--line-index', lineIndex);

      const words = isJapanese ? splitJapaneseTitle(text) : splitEnglishTitle(text);
      words.forEach((word, wordIndex) => {
        const isSpace = /^\s+$/.test(word);
        const span = document.createElement('span');
        span.className = isSpace ? 'split-space' : 'split-word';
        span.textContent = isSpace ? '\u00a0' : word;

        if (!isSpace) {
          const motion = getWordMotion(mode, wordIndex, lineIndex);
          span.style.setProperty('--word-index', wordIndex);
          span.style.setProperty('--word-x', motion.x);
          span.style.setProperty('--word-y', motion.y);
          span.style.setProperty('--word-rotate', motion.rotate);
          span.style.setProperty('--word-scale', motion.scale);
          span.style.setProperty('--word-delay', `${motion.delay}ms`);
        }

        line.appendChild(span);
      });
    });

    title.dataset.typoReady = 'true';
  };

  const splitTokens = (element) => {
    if (!element || element.dataset.typoReady === 'true') return;
    const tokens = (element.textContent || '').split(/(\s+|\/)/).filter(Boolean);
    element.textContent = '';
    element.classList.add('typo-token-list');
    tokens.forEach((token, tokenIndex) => {
      const span = document.createElement('span');
      span.className = token.trim() ? 'typo-token' : 'typo-token typo-token--space';
      span.textContent = token.replace(/\s+/g, '\u00a0');
      span.style.setProperty('--token-index', tokenIndex);
      element.appendChild(span);
    });
    element.dataset.typoReady = 'true';
  };

  const splitCopyLines = (text) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const sentences = clean.match(/[^。.!?]+[。.!?]?/g) || [clean];
    const lines = [];
    let buffer = '';

    sentences.forEach((sentence) => {
      const next = `${buffer}${sentence}`.trim();
      if (buffer && next.length > 36) {
        lines.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer = next;
      }
    });

    if (buffer.trim()) lines.push(buffer.trim());

    return lines.flatMap((line) => {
      if (line.length <= 48) return [line];
      const parts = line.split(/(?<=、|,)/).filter(Boolean);
      if (parts.length <= 1) return [line];
      const compact = [];
      let current = '';
      parts.forEach((part) => {
        const next = `${current}${part}`.trim();
        if (current && next.length > 34) {
          compact.push(current.trim());
          current = part;
        } else {
          current = next;
        }
      });
      if (current.trim()) compact.push(current.trim());
      return compact;
    });
  };

  const maskTextBlock = (element, delay = 0) => {
    if (!element || element.dataset.typoReady === 'true') return;
    const text = element.textContent || '';
    element.textContent = '';
    element.classList.add('typo-mask', 'split-lines');
    element.setAttribute('data-scroll-reveal', 'p');
    element.setAttribute('data-prevent-flicker', 'true');

    splitCopyLines(text).forEach((line, index) => {
      const outer = document.createElement('span');
      const inner = document.createElement('span');
      outer.className = 'split-line';
      inner.className = 'split-line__inner';
      inner.textContent = line;
      outer.style.setProperty('--line-delay', `${delay + index * 96}ms`);
      outer.style.setProperty('--line-x', index % 2 ? '26px' : '-18px');
      outer.appendChild(inner);
      element.appendChild(outer);
    });

    element.dataset.typoReady = 'true';
  };

  const prepareTypography = () => {
    chapters.forEach((chapter) => {
      const sceneIndex = Number(chapter.dataset.scene || 0);
      const mode = motionModes[sceneIndex] || 'axis';
      chapter.dataset.typoMode = mode;
      chapter.querySelector('.chapter__copy')?.setAttribute('data-prevent-flicker', 'true');
      splitTokens(chapter.querySelector('.chapter__eyebrow'));
      splitTitle(chapter.querySelector('.chapter__title'), mode);
      maskTextBlock(chapter.querySelector('.chapter__lead'), 120);
      maskTextBlock(chapter.querySelector('.chapter__body'), 180);
      chapter.querySelectorAll('.chapter__meta span').forEach((item, index) => {
        item.style.setProperty('--token-index', index);
        item.classList.add('typo-chip');
      });
      const button = chapter.querySelector('.chapter__button');
      if (button) {
        button.classList.add('typo-button');
        button.setAttribute('data-scroll-reveal', 'ctn');
        button.setAttribute('data-prevent-flicker', 'true');
      }
    });
  };

  const measure = () => {
    metrics = chapters.map((chapter) => ({
      id: chapter.id,
      scene: Number(chapter.dataset.scene || 0),
      top: chapter.offsetTop,
      height: chapter.offsetHeight,
    }));
    stableChapterIndex = Math.min(stableChapterIndex, Math.max(0, metrics.length - 1));
  };

  const resizeCanvas = () => {
    if (!canvas || !ctx) return;
    dpr = Math.min(lowPower ? .82 : 1, window.devicePixelRatio || 1);
    canvasW = window.innerWidth;
    canvasH = window.innerHeight;
    canvas.width = Math.floor(canvasW * dpr);
    canvas.height = Math.floor(canvasH * dpr);
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const currentSceneIndex = (scrollY, vh) => {
    const probe = scrollY + vh * 0.5;
    if (!metrics.length) return 0;
    stableChapterIndex = Math.min(stableChapterIndex, metrics.length - 1);
    const band = vh * 0.14;

    while (stableChapterIndex > 0 && probe < metrics[stableChapterIndex].top - band) {
      stableChapterIndex -= 1;
    }

    while (stableChapterIndex < metrics.length - 1 && probe >= metrics[stableChapterIndex + 1].top + band) {
      stableChapterIndex += 1;
    }

    return stableChapterIndex;
  };

  const transitionPulse = (scrollY, vh) => {
    const probe = scrollY + vh * 0.5;
    let pulse = 0;
    for (let i = 1; i < metrics.length; i += 1) {
      const distance = Math.abs(probe - metrics[i].top);
      pulse = Math.max(pulse, 1 - clamp(distance / (vh * 0.38)));
    }
    return smooth(pulse);
  };

  const applySceneVars = () => {
    setRoot('--scene-hue', String(fxState.hue));
    if (root.dataset.motion !== fxState.motion) root.dataset.motion = fxState.motion;
  };

  const scrubVideo = (entry, progress) => {
    const { video } = entry;
    if (!video) return;
    if (reduced) {
      if (!video.paused) video.pause();
      return;
    }
    entry.pendingProgress = clamp(progress);
    if (!entry.sourceReady) return;

    if (!video.paused) video.pause();
    if (video.readyState < 1) {
      if (video.dataset.playState !== 'loading') {
        video.dataset.playState = 'loading';
        video.load();
      }
      return;
    }

    const duration = Math.max(.1, entry.duration || video.duration || 5);
    const fpsStep = 1 / 24;
    const target = clamp(progress) * Math.max(.1, duration - .05);
    const quantized = Math.round(target / fpsStep) * fpsStep;

    if (Math.abs(video.currentTime - quantized) > fpsStep * .65) {
      try {
        entry.targetTime = quantized;
        video.currentTime = quantized;
        video.dataset.targetTime = quantized.toFixed(3);
        entry.lastTime = quantized;
        video.dataset.playState = 'scrub';
      } catch (error) {
        video.dataset.playState = 'blocked';
      }
    }
  };

  const settleVideo = (entry, progress, force = false) => {
    const { video } = entry;
    if (!video) return;
    if (!video.paused) video.pause();
    if (force || video.dataset.playState !== 'paused') {
      scrubVideo(entry, progress);
      video.dataset.playState = 'paused';
    }
  };

  const cameraMove = (mode, local, impact, velocity) => {
    const p = smooth(clamp(local));
    const v = clamp(velocity, -1, 1);
    const base = { x: 0, y: 0, scale: 1.018, rotate: 0, dim: .28, scan: .1, roll: 0 };

    if (mode === 'axis') {
      return { x: lerp(12, -8, p) - v * 4, y: lerp(8, -6, p), scale: lerp(1.055, 1.01, p) + impact * .006, rotate: lerp(-.12, .08, p), dim: lerp(.34, .22, p), scan: .1 + impact * .08, roll: lerp(-.025, .018, p) };
    }
    if (mode === 'ink') {
      return { x: lerp(10, -12, p), y: lerp(-6, 8, p), scale: lerp(1.045, 1.012, p), rotate: lerp(-.1, .08, p), dim: lerp(.32, .24, p), scan: .08 + impact * .07, roll: lerp(.018, -.022, p) };
    }
    if (mode === 'signal') {
      return { x: lerp(20, -24, p) - v * 5, y: lerp(3, -3, p), scale: lerp(1.04, 1.018, p), rotate: lerp(.06, -.06, p), dim: .24, scan: .16 + impact * .08, roll: lerp(.012, -.012, p) };
    }
    if (mode === 'interface') {
      return { x: lerp(4, -4, p), y: lerp(16, -10, p), scale: lerp(1.048, 1.01, p), rotate: lerp(.03, -.025, p), dim: .24, scan: .15 + impact * .07, roll: lerp(.008, -.008, p) };
    }
    if (mode === 'portal') {
      const orbit = Math.sin(p * Math.PI * 1.3);
      return { x: lerp(12, -8, p) + orbit * 5, y: lerp(4, -6, p) - Math.cos(p * Math.PI) * 4, scale: lerp(1.04, 1.014, p), rotate: lerp(-.14, .16, p), dim: .24, scan: .11 + impact * .08, roll: lerp(-.025, .025, p) };
    }
    if (mode === 'team') {
      return { x: lerp(-10, 8, p), y: lerp(-12, 8, p), scale: lerp(1.036, 1.014, p), rotate: lerp(.08, -.08, p), dim: .3, scan: .09 + impact * .06, roll: lerp(.018, -.018, p) };
    }
    if (mode === 'growth') {
      return { x: lerp(3, -3, p), y: lerp(18, -22, p), scale: lerp(1.04, 1.01, p), rotate: lerp(.035, -.03, p), dim: .26, scan: .11 + impact * .07, roll: lerp(.01, -.012, p) };
    }
    if (mode === 'recruit') {
      return { x: lerp(-16, 14, p), y: lerp(8, -6, p), scale: lerp(1.035, 1.014, p), rotate: lerp(-.12, .12, p), dim: .28, scan: .1 + impact * .06, roll: lerp(-.018, .02, p) };
    }
    if (mode === 'contact') {
      return { x: lerp(8, -8, p), y: lerp(10, -8, p), scale: lerp(1.045, 1.0, p), rotate: lerp(-.045, .035, p), dim: lerp(.3, .22, p), scan: .13 + impact * .07, roll: lerp(-.01, .012, p) };
    }
    if (mode === 'foundation') {
      return { x: lerp(4, -4, p), y: lerp(4, -3, p), scale: lerp(1.02, 1.0, p), rotate: 0, dim: .3, scan: .08 + impact * .05, roll: 0 };
    }

    return base;
  };

  const copyMove = (mode, local) => {
    const p = smooth(clamp(local));
    const easeOut = 1 - Math.pow(1 - clamp(local), 3);
    if (mode === 'axis') return { x: lerp(-8, 10, p), y: lerp(8, -8, p), scale: lerp(1.004, .998, p), rotate: lerp(-.035, .02, p) };
    if (mode === 'ink') return { x: lerp(14, -8, p), y: lerp(-5, 8, p), scale: lerp(.998, 1.004, p), rotate: lerp(.035, -.025, p) };
    if (mode === 'signal') return { x: lerp(-16, 14, p), y: lerp(-6, 4, p), scale: 1, rotate: lerp(-.035, .03, p) };
    if (mode === 'interface') return { x: 0, y: lerp(12, -12, p), scale: lerp(.998, 1.004, p), rotate: 0 };
    if (mode === 'portal') return { x: Math.sin(easeOut * Math.PI) * 10, y: lerp(8, -8, p), scale: lerp(1.004, .998, p), rotate: lerp(.04, -.035, p) };
    if (mode === 'team') return { x: lerp(-10, 10, p), y: lerp(-8, 8, p), scale: 1, rotate: lerp(-.03, .03, p) };
    if (mode === 'growth') return { x: 0, y: lerp(14, -16, p), scale: lerp(.998, 1.003, p), rotate: 0 };
    if (mode === 'recruit') return { x: lerp(12, -12, p), y: lerp(10, -8, p), scale: lerp(.998, 1.003, p), rotate: lerp(.035, -.035, p) };
    if (mode === 'contact') return { x: lerp(-10, 10, p), y: lerp(12, -10, p), scale: lerp(.998, 1.004, p), rotate: lerp(-.03, .025, p) };
    if (mode === 'foundation') return { x: lerp(0, 6, p), y: lerp(6, -6, p), scale: 1, rotate: 0 };
    return { x: 0, y: 0, scale: 1, rotate: 0 };
  };

  const updateBridges = (scrollY, vh) => {
    if (!bridgeEntries.length) return;
    const probe = scrollY + vh * .5;
    bridgeEntries.forEach((entry) => {
      const metric = metrics[entry.boundary];
      const { bridge } = entry;
      if (!metric || !bridge) return;
      const range = vh * (entry.boundary === 4 ? 1.08 : entry.boundary === 6 ? 1 : .92);
      const raw = 1 - Math.abs(probe - metric.top) / range;
      const pulse = smooth(clamp(raw));
      const after = clamp((probe - (metric.top - range)) / (range * 2));
      const visible = pulse > .015;

      if (entry.visible !== visible) {
        bridge.classList.toggle('is-visible', visible);
        entry.visible = visible;
      }

      if (!visible) {
        setStyle(bridge, '--bridge-opacity', '0');
        return;
      }

      const orbit = Math.sin(after * Math.PI);
      let x = lerp(18, -16, after);
      let y = lerp(8, -10, after);
      let scale = lerp(1.08, .995, after) + pulse * .018;
      let rotate = lerp(-.28, .22, after);
      let opacity = pulse * .66;

      if (entry.boundary === 1) {
        x = lerp(10, -8, after);
        y = lerp(6, -8, after);
        scale = lerp(1.11, .995, after) + pulse * .018;
        rotate = lerp(-.16, .08, after);
        opacity = pulse * .78;
      } else if (entry.boundary === 4) {
        x = lerp(24, -22, after) + orbit * 8;
        y = lerp(12, -14, after) - orbit * 6;
        scale = lerp(1.09, .995, after) + pulse * .018;
        rotate = lerp(-.55, .62, after);
        opacity = pulse * .7;
      } else if (entry.boundary === 6) {
        x = lerp(-8, 8, after);
        y = lerp(34, -38, after);
        scale = lerp(1.08, .995, after) + pulse * .014;
        rotate = lerp(.12, -.1, after);
        opacity = pulse * .66;
      } else if (entry.boundary === 8) {
        x = lerp(-22, 18, after);
        y = lerp(16, -14, after);
        scale = lerp(1.1, .995, after) + pulse * .018;
        rotate = lerp(.55, -.34, after);
        opacity = pulse * .74;
      }

      setStyle(bridge, '--bridge-opacity', opacity.toFixed(3));
      setStyle(bridge, '--bridge-x', `${x.toFixed(2)}px`);
      setStyle(bridge, '--bridge-y', `${y.toFixed(2)}px`);
      setStyle(bridge, '--bridge-scale', scale.toFixed(4));
      setStyle(bridge, '--bridge-rotate', `${rotate.toFixed(3)}deg`);
    });
  };

  const requestFx = () => {
    if (reduced || !ctx || fxRunning) return;
    fxRunning = true;
    requestAnimationFrame(renderFx);
  };

  const update = () => {
    ticking = false;
    const now = performance.now();
    targetScrollY = window.scrollY || window.pageYOffset || 0;
    const vh = window.innerHeight || 1;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    const dt = Math.max(16, Math.min(64, now - lastTime));
    const scrollEase = reduced ? 1 : clamp(1 - Math.pow(1 - .16, dt / 16.667), .08, .5);

    if (reduced) {
      visualScrollY = targetScrollY;
    } else {
      const delta = targetScrollY - visualScrollY;
      visualScrollY += delta * scrollEase;
      if (Math.abs(delta) < .12) visualScrollY = targetScrollY;
    }

    const scrollY = visualScrollY;
    const rawVelocity = reduced ? 0 : clamp((scrollY - previousVisualScrollY) / dt, -1.8, 1.8);
    const totalProgress = clamp(scrollY / maxScroll);
    const activeChapter = currentSceneIndex(scrollY, vh);
    const activeMetric = metrics[activeChapter] || metrics[0];
    const activeScene = activeMetric ? activeMetric.scene : 0;
    const sceneChanged = activeScene !== fxState.active;
    const activeProbe = scrollY + vh * .5;
    const activeLocal = activeMetric ? clamp((activeProbe - activeMetric.top) / Math.max(1, activeMetric.height)) : 0;
    const wipe = reduced ? 0 : transitionPulse(scrollY, vh);
    const impact = Math.pow(wipe, .72);
    previousVisualScrollY = scrollY;
    lastTime = now;
    fxState.velocity = lerp(fxState.velocity, rawVelocity, .42);
    fxState.speed = clamp(Math.abs(fxState.velocity) / 2.1 + impact * .14);
    fxState.direction = fxState.velocity >= 0 ? 1 : -1;
    fxState.progress = totalProgress;
    fxState.impact = impact;
    fxState.active = activeScene;
    fxState.local = activeLocal;
    fxState.scroll = scrollY;
    fxState.hue = sceneHues[activeScene] || sceneHues[0];
    fxState.motion = motionModes[activeScene] || motionModes[0];
    fxState.cut = clamp(Math.max(impact * .92, fxState.burst * .62));
    if (window.location.search.includes('debug')) {
      window.__axisCameraState = {
        scrollY,
        targetScrollY,
        activeChapter,
        activeScene,
        activeLocal,
      };
    }
    applySceneVars();
    const activeCamera = cameraMove(fxState.motion, activeLocal, impact, fxState.velocity);
    setRoot('--camera-x', `${activeCamera.x.toFixed(2)}px`);
    setRoot('--camera-y', `${activeCamera.y.toFixed(2)}px`);
    setRoot('--camera-z', activeCamera.scale.toFixed(4));
    setRoot('--camera-roll', `${(activeCamera.roll || 0).toFixed(3)}deg`);
    setRoot('--camera-progress', activeLocal.toFixed(4));

    if (sceneChanged) {
      fxState.burst = 1;
    }

    if (progressBar) {
      setStyle(progressBar, 'transform', `scaleX(${totalProgress.toFixed(4)})`);
    }

    updateBridges(scrollY, vh);

    sceneEntries.forEach((entry, index) => {
      const { scene, video } = entry;
      const distance = Math.abs(index - activeScene);
      const isActive = index === activeScene;
      const towardScene = activeScene + (fxState.direction >= 0 ? 1 : -1);
      const isAdjacent = index === towardScene && distance === 1 && impact > .08;
      const direction = index < activeScene ? -1 : 1;
      const isNear = isActive || isAdjacent;

      if (!isNear) {
        if (entry.near || entry.active) {
          setStyle(scene, 'opacity', '0');
          setStyle(scene, '--scene-x', '0px');
          setStyle(scene, '--scene-y', '0px');
          setStyle(scene, '--scene-scale', '1.08');
          setStyle(scene, '--scene-rotate', '0deg');
          setStyle(scene, '--scene-dim', '.62');
          setStyle(scene, '--scene-scan', '.08');
          scene.classList.remove('is-active', 'is-near');
          entry.active = false;
          entry.near = false;
        }
        settleVideo(entry, index < activeScene ? 1 : 0);
        return;
      }

      const mode = motionModes[index] || 'axis';
      const camera = cameraMove(mode, isActive ? activeLocal : (index < activeScene ? 1 : 0), impact, fxState.velocity);
      const adjacentProgress = direction > 0 ? 0 : 1;
      const visible = isActive ? 1 : impact * .32;
      const drift = direction * (92 + distance * 18);
      const velocityPush = fxState.velocity * (isActive ? -5 : 20);
      const burstPush = fxState.burst * direction * 12;
      const depth = isActive ? camera.scale : 1.075 + distance * .015 + impact * .012;
      const y = isActive ? camera.y : drift * .12 + burstPush * .12;
      const x = isActive ? camera.x + velocityPush * .12 : drift * -.34 + velocityPush * .16 + burstPush * .18;
      const rotate = isActive ? camera.rotate + impact * .035 : direction * .28;
      const dim = isActive ? camera.dim : .6;
      const scan = isActive ? camera.scan : .06;

      setStyle(scene, 'opacity', visible.toFixed(3));
      setStyle(scene, '--scene-x', `${x.toFixed(2)}px`);
      setStyle(scene, '--scene-y', `${y.toFixed(2)}px`);
      setStyle(scene, '--scene-scale', depth.toFixed(4));
      setStyle(scene, '--scene-rotate', `${rotate.toFixed(3)}deg`);
      setStyle(scene, '--scene-dim', dim.toFixed(3));
      setStyle(scene, '--scene-scan', scan.toFixed(3));
      if (entry.active !== isActive) {
        scene.classList.toggle('is-active', isActive);
        entry.active = isActive;
      }
      if (entry.near !== isNear) {
        scene.classList.toggle('is-near', isNear);
        entry.near = isNear;
      }
      if (isActive) {
        scrubVideo(entry, activeLocal);
      } else {
        settleVideo(entry, adjacentProgress, true);
      }
    });

    chapterEntries.forEach((entry, index) => {
      const { chapter, copy } = entry;
      const metric = metrics[index];
      const local = index === 0 ? 1 : (metric ? clamp((scrollY - (metric.top - vh * 0.5)) / (vh * 0.82)) : 0);
      const isCurrentChapter = index === activeChapter;
      const sceneIndex = Number(chapter.dataset.scene || 0);
      const sectionLocal = metric ? clamp((scrollY + vh * .5 - metric.top) / Math.max(1, metric.height)) : 0;
      const revealLead = metric ? scrollY + vh * .95 >= metric.top : false;
      const shouldReveal = index === 0 || revealLead || local > .08 || isCurrentChapter;

      if (shouldReveal && chapter.dataset.revealed !== 'true') {
        chapter.dataset.revealed = 'true';
        chapter.classList.add('is-revealed');
      }

      if (copy) {
        const mode = motionModes[sceneIndex] || 'axis';
        const move = copyMove(mode, isCurrentChapter ? sectionLocal : (index < activeChapter ? 1 : 0));
        setStyle(copy, '--copy-track-x', `${move.x.toFixed(2)}px`);
        setStyle(copy, '--copy-track-y', `${move.y.toFixed(2)}px`);
        setStyle(copy, '--copy-track-scale', move.scale.toFixed(4));
        setStyle(copy, '--copy-track-rotate', `${move.rotate.toFixed(3)}deg`);
      }

      if (entry.active !== isCurrentChapter) {
        chapter.classList.toggle('is-active', isCurrentChapter);
        setStyle(chapter, '--line-scale', isCurrentChapter ? '1' : '.16');
        entry.active = isCurrentChapter;
      }
    });

    if (activeChapter !== lastActiveChapter) {
      const currentHref = `#${metrics[activeChapter]?.id}`;
      navItems.forEach((link) => {
        const href = link.getAttribute('href') || '';
        link.classList.toggle('is-current', href === currentHref);
      });
      if (readoutLabel) readoutLabel.textContent = chapters[activeChapter]?.dataset.label || '';
      lastActiveChapter = activeChapter;
    }

    if (activeScene !== lastActiveScene) {
      if (readoutNum) readoutNum.textContent = String(activeScene + 1).padStart(2, '0');
      lastActiveScene = activeScene;
    }

    if (Math.abs(targetScrollY - visualScrollY) > .14) {
      requestUpdate();
    }
  };

  const renderFx = (time = 0) => {
    if (!ctx || reduced) return;

    const [r, g, b] = palettes[fxState.active] || palettes[0];
    const impact = fxState.impact;
    const speed = fxState.speed;
    const velocity = fxState.velocity;
    const cut = fxState.cut;
    const burst = fxState.burst;
    const progress = fxState.progress;
    const mode = fxState.motion;
    const t = time * .001;
    const idle = impact < .025 && speed < .016 && burst < .016 && Math.abs(velocity) < .016;
    const frameGap = idle ? 120 : 42;

    if (time - lastFxDraw < frameGap) {
      requestAnimationFrame(renderFx);
      return;
    }
    const fxElapsed = Math.max(16, time - lastFxDraw);
    const decayStep = clamp(fxElapsed / 42, .5, 6);
    lastFxDraw = time;

    window.__axisFxFrames = (window.__axisFxFrames || 0) + 1;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.globalCompositeOperation = 'lighter';

    ctx.save();
    if (mode === 'axis') {
      const axisY = canvasH * (.54 - impact * .08);
      ctx.translate(canvasW * .56, axisY);
      ctx.rotate(-0.22 + impact * .18 + velocity * .035 + burst * .035);
      const gradient = ctx.createLinearGradient(-canvasW * .52, 0, canvasW * .52, 0);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      gradient.addColorStop(.45, `rgba(255, 255, 255, ${.16 + impact * .46})`);
      gradient.addColorStop(.58, `rgba(${r}, ${g}, ${b}, ${.2 + impact * .48})`);
      gradient.addColorStop(1, 'rgba(255, 61, 113, 0)');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.2 + impact * 5.5 + speed * 3.4 + burst * 3.2;
      ctx.beginPath();
      ctx.moveTo(-canvasW * .54, Math.sin(t) * 14);
      ctx.bezierCurveTo(-canvasW * .2, -58 - impact * 40 - speed * 28, canvasW * .18, 72 + impact * 32 + speed * 22, canvasW * .56, Math.cos(t) * 18);
      ctx.stroke();
    } else if (mode === 'signal') {
      ctx.translate(canvasW * .5, canvasH * .42);
      const beam = ctx.createLinearGradient(-canvasW * .42, 0, canvasW * .52, 0);
      beam.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      beam.addColorStop(.78, `rgba(255,255,255,${.18 + cut * .5})`);
      beam.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.strokeStyle = beam;
      ctx.lineWidth = 2 + speed * 5 + burst * 6;
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        const y = Math.sin(t * 2 + i) * (18 + speed * 32) + i * 6;
        ctx.moveTo(-canvasW * .46, y);
        ctx.bezierCurveTo(-canvasW * .16, y - 46 - cut * 50, canvasW * .16, y + 44 + cut * 40, canvasW * .5, y - 4);
        ctx.stroke();
      }
    } else if (mode === 'interface') {
      ctx.translate(canvasW * .58, canvasH * .42);
      ctx.strokeStyle = `rgba(0, 229, 194, ${.14 + cut * .32})`;
      ctx.lineWidth = 1 + cut * 2;
      for (let i = 0; i < 7; i += 1) {
        const w = canvasW * (.1 + i * .018 + cut * .04);
        const h = canvasH * (.04 + (i % 3) * .018);
        ctx.strokeRect(-w * .5 + Math.sin(t + i) * 18, -h * .5 + (i - 3) * 34, w, h);
      }
    } else if (mode === 'portal') {
      ctx.translate(canvasW * .64, canvasH * .5);
      ctx.rotate(t * .18 + velocity * .05);
      ctx.strokeStyle = `rgba(255,255,255,${.12 + cut * .38})`;
      for (let i = 0; i < 5; i += 1) {
        ctx.lineWidth = .8 + i * .28 + cut * 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, canvasH * (.14 + i * .06 + cut * .08), canvasH * (.23 + i * .075 + burst * .04), i * .34, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (mode === 'team') {
      ctx.translate(canvasW * .5, canvasH * .5);
      ctx.strokeStyle = `rgba(255, 61, 113, ${.1 + cut * .26})`;
      ctx.lineWidth = 1 + cut * 3;
      for (let i = -4; i <= 4; i += 1) {
        const x = i * canvasW * .09 + Math.sin(t + i) * 20;
        ctx.beginPath();
        ctx.moveTo(x, -canvasH * .55);
        ctx.lineTo(x + velocity * 18 + burst * i * 3, canvasH * .55);
        ctx.stroke();
      }
    } else if (mode === 'growth') {
      ctx.translate(0, 0);
      const growth = ctx.createLinearGradient(canvasW * .16, canvasH * .78, canvasW * .82, canvasH * .28);
      growth.addColorStop(0, 'rgba(255,196,0,0)');
      growth.addColorStop(.62, `rgba(255,196,0,${.18 + cut * .45})`);
      growth.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = growth;
      ctx.lineWidth = 2 + cut * 5;
      ctx.beginPath();
      ctx.moveTo(canvasW * .15, canvasH * .74);
      ctx.bezierCurveTo(canvasW * .34, canvasH * (.72 - cut * .1), canvasW * .58, canvasH * (.42 - cut * .08), canvasW * .82, canvasH * .28);
      ctx.stroke();
    } else if (mode === 'contact') {
      ctx.translate(canvasW * .5, canvasH * .5);
      ctx.rotate(-0.42 + velocity * .05);
      const beam = ctx.createLinearGradient(-canvasW * .42, 0, canvasW * .46, 0);
      beam.addColorStop(0, 'rgba(0,229,194,0)');
      beam.addColorStop(.48, `rgba(255,255,255,${.16 + cut * .38})`);
      beam.addColorStop(1, 'rgba(0,229,194,0)');
      ctx.strokeStyle = beam;
      ctx.lineWidth = 3 + cut * 9;
      ctx.beginPath();
      ctx.moveTo(-canvasW * .42, 0);
      ctx.lineTo(canvasW * .46, 0);
      ctx.stroke();
    } else if (mode === 'recruit') {
      ctx.translate(canvasW * .5, canvasH * .5);
      ctx.strokeStyle = `rgba(255, 61, 113, ${.1 + cut * .3})`;
      ctx.lineWidth = 1 + cut * 3.2;
      for (let i = -5; i <= 5; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-canvasW * .54, i * canvasH * .08 + Math.sin(t + i) * 16);
        ctx.lineTo(canvasW * .54, -i * canvasH * .06 + velocity * 30);
        ctx.stroke();
      }
    } else if (mode === 'foundation') {
      ctx.translate(canvasW * .5, canvasH * .5);
      ctx.strokeStyle = `rgba(255, 255, 255, ${.08 + cut * .18})`;
      ctx.lineWidth = 1 + cut * 2;
      for (let i = -3; i <= 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * canvasW * .09, -canvasH * .44);
        ctx.lineTo(i * canvasW * .09 + velocity * 8, canvasH * .44);
        ctx.stroke();
      }
    } else if (mode === 'ink') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(245, 247, 250, ${.06 + cut * .12})`;
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.ellipse(canvasW * (.26 + i * .14), canvasH * (.42 + Math.sin(t + i) * .08), canvasH * (.16 + i * .04), canvasH * (.08 + i * .025), -0.28 + i * .09, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    particles.forEach((p, i) => {
      const travel = (t * (p.speed + speed * .62) + progress * (1.6 + p.speed) + p.x) % 1;
      const wave = Math.sin(t * (0.6 + p.speed) + p.phase);
      const x = travel * canvasW + wave * (28 + impact * 88) + velocity * 92;
      const y = ((p.y + Math.cos(t * .4 + p.phase) * .08 + progress * .18 + speed * .035) % 1) * canvasH;
      const alpha = .13 + impact * .42 + speed * .18 + (i % 7 === 0 ? .18 : 0);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size + impact * 1.8, 0, Math.PI * 2);
      ctx.fill();

      if (i % 9 === 0) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${.05 + impact * .18})`;
        ctx.lineWidth = .6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 90 - impact * 140 - speed * 220, y + wave * (28 + speed * 40));
        ctx.stroke();
      }
    });

    if (speed > .025 || burst > .04) {
      ctx.save();
      ctx.globalAlpha = Math.min(.82, speed * 1.1 + impact * .2 + burst * .34);
      ctx.translate(canvasW * .5, canvasH * .5);
      ctx.rotate(-0.28 + velocity * .08 + burst * .08);
      for (let i = 0; i < 12; i += 1) {
        const y = (i - 4) * canvasH * .095 + Math.sin(t * 1.4 + i) * 14;
        const length = canvasW * (.18 + speed * .36 + burst * .16 + (i % 3) * .035);
        const start = -canvasW * .42 + ((t * (90 + burst * 220) + i * 87) % (canvasW * .84));
        const streak = ctx.createLinearGradient(start, y, start + length, y);
        streak.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        streak.addColorStop(.46, `rgba(255, 255, 255, ${.12 + speed * .28 + burst * .22})`);
        streak.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.strokeStyle = streak;
        ctx.lineWidth = 1 + speed * 3 + burst * 2;
        ctx.beginPath();
        ctx.moveTo(start, y);
        ctx.lineTo(start + length, y + velocity * 20);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (impact > .04 && (mode === 'axis' || mode === 'portal')) {
      ctx.globalAlpha = impact;
      ctx.strokeStyle = `rgba(255, 255, 255, ${.24 + impact * .32})`;
      ctx.lineWidth = 1 + impact * 3;
      for (let i = 0; i < 3; i += 1) {
        const radius = (canvasH * (.18 + i * .12)) * (.72 + impact * 1.2);
        ctx.beginPath();
        ctx.arc(canvasW * .5, canvasH * .5, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (cut > .04) {
      ctx.save();
      ctx.globalAlpha = Math.min(.76, cut * .62 + burst * .18);
      ctx.lineWidth = 1 + cut * 2.4;

      if (mode === 'ink') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(245, 247, 250, ${.08 + cut * .2})`;
        for (let i = 0; i < 5; i += 1) {
          const radius = canvasH * (.18 + i * .08 + burst * .05);
          ctx.beginPath();
          ctx.ellipse(canvasW * (.38 + i * .08), canvasH * (.38 + Math.sin(t + i) * .08), radius * 1.45, radius * .52, -0.32, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (mode === 'signal') {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${.2 + cut * .38})`;
        for (let i = 0; i < 16; i += 1) {
          const x1 = ((i * 97 + t * 34) % canvasW);
          const y1 = canvasH * (.16 + ((i * 37) % 68) / 100);
          const x2 = x1 + Math.sin(i) * 220;
          const y2 = y1 + Math.cos(i * 1.7) * 140;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x1, y1, 2 + cut * 4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${.18 + cut * .35})`;
          ctx.fill();
        }
      } else if (mode === 'interface') {
        ctx.strokeStyle = `rgba(255, 255, 255, ${.08 + cut * .22})`;
        for (let i = 0; i < 11; i += 1) {
          const w = canvasW * (.12 + (i % 4) * .035);
          const h = canvasH * (.06 + (i % 3) * .02);
          const x = ((i * 173 + t * 55) % (canvasW + w)) - w;
          const y = canvasH * (.14 + i * .072);
          ctx.strokeRect(x, y, w, h);
        }
      } else if (mode === 'portal') {
        ctx.strokeStyle = `rgba(255, 255, 255, ${.15 + cut * .3})`;
        for (let i = 0; i < 6; i += 1) {
          ctx.beginPath();
          ctx.ellipse(canvasW * .64, canvasH * .48, canvasH * (.13 + i * .055 + cut * .06), canvasH * (.2 + i * .08 + burst * .06), t + i * .3, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (mode === 'team') {
        ctx.strokeStyle = `rgba(255, 61, 113, ${.13 + cut * .3})`;
        for (let i = 0; i < 9; i += 1) {
          const x = canvasW * (.18 + i * .08);
          ctx.beginPath();
          ctx.moveTo(x, canvasH * .16);
          ctx.lineTo(x + Math.sin(t + i) * 46, canvasH * .82);
          ctx.stroke();
        }
      } else if (mode === 'growth') {
        ctx.strokeStyle = `rgba(255, 196, 0, ${.2 + cut * .44})`;
        ctx.beginPath();
        for (let i = 0; i <= 80; i += 1) {
          const x = canvasW * (.12 + i / 100);
          const y = canvasH * (.72 - Math.pow(i / 80, 1.5) * .34 + Math.sin(i * .2 + t) * .018);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (mode === 'contact') {
        const beam = ctx.createLinearGradient(canvasW * .2, canvasH * .2, canvasW * .92, canvasH * .78);
        beam.addColorStop(0, 'rgba(255,255,255,0)');
        beam.addColorStop(.48, `rgba(255,255,255,${.16 + cut * .34})`);
        beam.addColorStop(1, 'rgba(0,229,194,0)');
        ctx.strokeStyle = beam;
        ctx.lineWidth = 4 + cut * 8;
        ctx.beginPath();
        ctx.moveTo(canvasW * .2, canvasH * .2);
        ctx.lineTo(canvasW * .92, canvasH * .78);
        ctx.stroke();
      } else if (mode === 'recruit') {
        ctx.strokeStyle = `rgba(255, 61, 113, ${.14 + cut * .28})`;
        for (let i = 0; i < 8; i += 1) {
          const y = canvasH * (.18 + i * .08);
          ctx.beginPath();
          ctx.moveTo(canvasW * .1, y + Math.sin(t + i) * 18);
          ctx.lineTo(canvasW * .9, canvasH - y + Math.cos(t + i) * 18);
          ctx.stroke();
        }
      } else if (mode === 'foundation') {
        ctx.strokeStyle = `rgba(255, 255, 255, ${.1 + cut * .2})`;
        ctx.beginPath();
        ctx.moveTo(canvasW * .18, canvasH * .62);
        ctx.lineTo(canvasW * .82, canvasH * .62 - cut * canvasH * .08);
        ctx.stroke();
      }

      ctx.restore();
    }

    if (cut > .05) {
      ctx.save();
      ctx.globalAlpha = Math.min(.72, cut * .58 + burst * .2);
      ctx.translate(canvasW * .5, canvasH * .5);
      ctx.rotate(velocity * .05);
      for (let i = 0; i < 7; i += 1) {
        const angle = -0.95 + i * .31 + Math.sin(t * 1.7 + i) * .05;
        const near = canvasW * (.08 + (i % 3) * .035);
        const far = canvasW * (.42 + cut * .22 + (i % 2) * .04);
        const sx = Math.cos(angle) * near;
        const sy = Math.sin(angle) * near;
        const ex = Math.cos(angle + velocity * .03) * far;
        const ey = Math.sin(angle + velocity * .03) * far;
        const fracture = ctx.createLinearGradient(sx, sy, ex, ey);
        fracture.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        fracture.addColorStop(.5, `rgba(255, 255, 255, ${.16 + cut * .34})`);
        fracture.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.strokeStyle = fracture;
        ctx.lineWidth = .7 + cut * 2.8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.restore();
    }

    fxState.velocity = lerp(fxState.velocity, 0, clamp(.12 * decayStep));
    fxState.speed = lerp(fxState.speed, 0, clamp(.14 * decayStep));
    fxState.burst = lerp(fxState.burst, 0, clamp(.28 * decayStep));
    fxState.impact = lerp(fxState.impact, 0, clamp(.18 * decayStep));
    fxState.cut = clamp(Math.max(fxState.impact * .92, fxState.burst * .62));
    const keepFxAlive = fxState.speed > .012 || Math.abs(fxState.velocity) > .012 || fxState.burst > .012 || fxState.cut > .012 || fxState.impact > .012;
    if (keepFxAlive) {
      requestAnimationFrame(renderFx);
    } else {
      fxRunning = false;
      lastFxDraw = 0;
    }
  };

  const requestUpdate = () => {
    requestFx();
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  const syncTargetScroll = () => {
    targetScrollY = window.scrollY || window.pageYOffset || 0;
    requestUpdate();
  };

  const markReady = () => {
    root.classList.add('is-ready');
  };

  window.addEventListener('resize', () => {
    measure();
    resizeCanvas();
    requestUpdate();
  }, { passive: true });

  window.addEventListener('scroll', syncTargetScroll, { passive: true });

  window.addEventListener('pointermove', (event) => {
    setRoot('--pointer-x', `${event.clientX}px`);
    setRoot('--pointer-y', `${event.clientY}px`);
    requestFx();
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      scenes.forEach((scene) => scene.querySelector('video')?.pause());
    } else {
      requestUpdate();
    }
  });

  window.addEventListener('load', () => {
    measure();
    resizeCanvas();
    requestUpdate();
  });

  prepareTypography();
  measure();
  resizeCanvas();
  update();
  requestFx();

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([
    fontsReady,
    new Promise((resolve) => window.setTimeout(resolve, 900)),
  ]).then(() => {
    measure();
    resizeCanvas();
    syncTargetScroll();
    markReady();
  }).catch(markReady);
})();
