(() => {
  'use strict';

  const root = document.documentElement;
  const scenes = Array.from(document.querySelectorAll('.scene'));
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
    [255, 255, 255],
  ];

  const sceneHues = [176, 210, 234, 196, 248, 334, 45, 186];
  const motionModes = ['axis', 'ink', 'signal', 'interface', 'portal', 'team', 'growth', 'contact'];

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
    active: false,
    near: false,
  }));

  const chapterEntries = chapters.map((chapter) => ({
    chapter,
    copy: chapter.querySelector('.chapter__copy'),
    active: false,
  }));

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

  const segmentText = (text, lang = 'ja') => {
    if (window.Intl && typeof window.Intl.Segmenter === 'function') {
      return Array.from(new Intl.Segmenter(lang, { granularity: 'grapheme' }).segment(text), (part) => part.segment);
    }
    return Array.from(text);
  };

  const getGlyphMotion = (mode, charIndex, lineIndex, charCount) => {
    const center = charCount > 1 ? (charIndex / (charCount - 1)) - .5 : 0;
    const seed = (((charIndex + 3) * 17 + (lineIndex + 5) * 29) % 23) / 22;
    const scatter = (seed - .5) * 2;
    const baseDelay = lineIndex * 78 + charIndex * 18;
    const motion = {
      x: `${scatter * .24}em`,
      y: '1.08em',
      z: '0px',
      rotateX: '58deg',
      rotateY: '0deg',
      rotateZ: `${scatter * 3}deg`,
      scale: '.98',
      blur: '5px',
      delay: `${baseDelay}ms`,
    };

    if (mode === 'ink') {
      return {
        ...motion,
        x: `${-.24 - Math.abs(scatter) * .2}em`,
        y: `${scatter * .08}em`,
        rotateX: '0deg',
        rotateY: `${-18 - Math.abs(scatter) * 10}deg`,
        rotateZ: `${scatter * -2}deg`,
        scale: '.94',
        blur: '8px',
        delay: `${lineIndex * 120 + charIndex * 24}ms`,
      };
    }

    if (mode === 'signal') {
      return {
        ...motion,
        x: `${scatter * .1}em`,
        y: `${Math.abs(scatter) * .18}em`,
        rotateX: '0deg',
        rotateY: '0deg',
        rotateZ: `${scatter * .8}deg`,
        scale: '.99',
        blur: '2px',
        delay: `${lineIndex * 44 + charIndex * 9}ms`,
      };
    }

    if (mode === 'interface') {
      return {
        ...motion,
        x: `${center * -1.2}em`,
        y: '0',
        z: '-44px',
        rotateX: '0deg',
        rotateY: `${center * 42}deg`,
        rotateZ: '0deg',
        scale: '.92',
        blur: '3px',
        delay: `${lineIndex * 62 + Math.abs(center) * 170}ms`,
      };
    }

    if (mode === 'portal') {
      return {
        ...motion,
        x: `${center * 1.7}em`,
        y: `${scatter * .26}em`,
        z: '-80px',
        rotateX: `${scatter * 18}deg`,
        rotateY: `${center * -70}deg`,
        rotateZ: `${center * 18}deg`,
        scale: '.72',
        blur: '7px',
        delay: `${lineIndex * 58 + Math.abs(center) * 210}ms`,
      };
    }

    if (mode === 'team') {
      return {
        ...motion,
        x: `${-.55 + charIndex * .01}em`,
        y: '.22em',
        rotateX: '0deg',
        rotateY: '-20deg',
        rotateZ: `${scatter * 1.2}deg`,
        scale: '.97',
        blur: '4px',
        delay: `${lineIndex * 88 + charIndex * 14}ms`,
      };
    }

    if (mode === 'growth') {
      return {
        ...motion,
        x: `${scatter * .12}em`,
        y: '1.36em',
        rotateX: '42deg',
        rotateY: `${scatter * 10}deg`,
        rotateZ: '0deg',
        scale: '.9',
        blur: '6px',
        delay: `${lineIndex * 70 + charIndex * 16}ms`,
      };
    }

    if (mode === 'contact') {
      return {
        ...motion,
        x: `${center * -1.45}em`,
        y: `${scatter * .18}em`,
        z: '-24px',
        rotateX: '0deg',
        rotateY: `${center * 56}deg`,
        rotateZ: `${scatter * 3.4}deg`,
        scale: '.86',
        blur: '5px',
        delay: `${lineIndex * 70 + charIndex * 13}ms`,
      };
    }

    return motion;
  };

  const splitTitle = (title, mode = 'axis') => {
    if (!title || title.dataset.typoReady === 'true') return;
    const lines = Array.from(title.children);
    const label = lines.map((line) => (line.textContent || '').trim()).filter(Boolean).join(' ');
    const useLineText = title.classList.contains('chapter__title--jp');

    if (label) title.setAttribute('aria-label', label);

    lines.forEach((line, lineIndex) => {
      const text = line.textContent || '';
      line.textContent = '';
      line.classList.add('typo-line');
      line.setAttribute('aria-hidden', 'true');
      line.style.setProperty('--line-index', lineIndex);

      if (useLineText) {
        const inner = document.createElement('span');
        inner.className = 'typo-line-text';
        inner.textContent = text;
        line.appendChild(inner);
        return;
      }

      const chars = segmentText(text);
      chars.forEach((char, charIndex) => {
        const motion = getGlyphMotion(mode, charIndex, lineIndex, chars.length);
        const glyph = document.createElement('span');
        glyph.className = char.trim() ? 'typo-char' : 'typo-char typo-char--space';
        glyph.textContent = char === ' ' ? '\u00a0' : char;
        glyph.dataset.glyph = char.trim() ? char : '';
        glyph.style.setProperty('--char-index', charIndex);
        glyph.style.setProperty('--char-x', motion.x);
        glyph.style.setProperty('--char-y', motion.y);
        glyph.style.setProperty('--char-z', motion.z);
        glyph.style.setProperty('--char-rotate-x', motion.rotateX);
        glyph.style.setProperty('--char-rotate-y', motion.rotateY);
        glyph.style.setProperty('--char-rotate-z', motion.rotateZ);
        glyph.style.setProperty('--char-scale', motion.scale);
        glyph.style.setProperty('--char-blur', motion.blur);
        glyph.style.setProperty('--char-delay', motion.delay);
        line.appendChild(glyph);
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

  const maskTextBlock = (element, delay = 0) => {
    if (!element || element.dataset.typoReady === 'true') return;
    const text = element.textContent || '';
    element.textContent = '';
    element.classList.add('typo-mask');
    element.style.setProperty('--text-delay', `${delay}ms`);

    const inner = document.createElement('span');
    inner.className = 'typo-mask__inner';
    inner.textContent = text;
    element.appendChild(inner);
    element.dataset.typoReady = 'true';
  };

  const prepareTypography = () => {
    chapters.forEach((chapter) => {
      const sceneIndex = Number(chapter.dataset.scene || 0);
      const mode = motionModes[sceneIndex] || 'axis';
      chapter.dataset.typoMode = mode;
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

  const applyKineticVars = () => {
    setRoot('--speed', fxState.speed.toFixed(3));
    setRoot('--velocity', fxState.velocity.toFixed(3));
    setRoot('--cut', fxState.cut.toFixed(3));
    setRoot('--burst', fxState.burst.toFixed(3));
    setRoot('--direction', String(fxState.direction));
    setRoot('--section-local', fxState.local.toFixed(3));
    setRoot('--scene-hue', String(fxState.hue));
    if (root.dataset.motion !== fxState.motion) root.dataset.motion = fxState.motion;
  };

  const syncVideo = (video, isActive, impact) => {
    if (!video) return;
    if (reduced) {
      if (!video.paused) video.pause();
      return;
    }

    if (isActive) {
      const nextRate = lerp(.82, 1.22, impact);
      if (Math.abs(video.playbackRate - nextRate) > .035) {
        video.playbackRate = nextRate;
      }
      if (video.dataset.playState !== 'active' || video.paused) {
        video.dataset.playState = 'active';
        const play = video.play();
        if (play && typeof play.catch === 'function') play.catch(() => {});
      }
    } else if (video.dataset.playState !== 'paused') {
      video.dataset.playState = 'paused';
      video.pause();
    }
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
    const activeLocal = activeMetric ? clamp((scrollY - activeMetric.top) / Math.max(1, activeMetric.height - vh)) : 0;
    const wipe = reduced ? 0 : transitionPulse(scrollY, vh);
    const impact = Math.pow(wipe, .72);
    previousVisualScrollY = scrollY;
    lastTime = now;
    fxState.velocity = lerp(fxState.velocity, rawVelocity, .42);
    fxState.speed = clamp(Math.abs(fxState.velocity) / 2.1 + impact * .14);
    fxState.direction = fxState.velocity >= 0 ? 1 : -1;
    if (activeScene !== fxState.active) {
      fxState.burst = 1;
    }

    fxState.progress = totalProgress;
    fxState.impact = impact;
    fxState.active = activeScene;
    fxState.local = activeLocal;
    fxState.scroll = scrollY;
    fxState.hue = sceneHues[activeScene] || sceneHues[0];
    fxState.motion = motionModes[activeScene] || motionModes[0];
    fxState.cut = clamp(Math.max(impact * .92, fxState.burst * .62));
    applyKineticVars();

    if (progressBar) {
      setStyle(progressBar, 'transform', `scaleX(${totalProgress.toFixed(4)})`);
    }

    setRoot('--wipe', wipe.toFixed(3));
    setRoot('--wipe-gap', `${((1 - wipe) * 50).toFixed(2)}%`);
    setRoot('--wipe-pct', `${(wipe * 100).toFixed(2)}%`);
    setRoot('--wipe-signal', `${(wipe * 38).toFixed(2)}%`);
    setRoot('--wipe-interface-x', `${(wipe * 48).toFixed(2)}%`);
    setRoot('--wipe-interface-y', `${(wipe * 20).toFixed(2)}%`);
    setRoot('--wipe-team', `${(wipe * 55).toFixed(2)}%`);
    setRoot('--impact', impact.toFixed(3));
    setRoot('--stage-x', `${lerp(0, -220, totalProgress).toFixed(2)}px`);
    setRoot('--stage-y', `${lerp(0, 140, totalProgress).toFixed(2)}px`);
    setRoot('--stage-scale', (1 + totalProgress * 0.12 + impact * .04 + fxState.burst * .025).toFixed(4));
    setRoot('--axis-scale', (0.64 + impact * 1.16).toFixed(3));

    sceneEntries.forEach((entry, index) => {
      const { scene, video } = entry;
      const distance = Math.abs(index - activeScene);
      const isActive = index === activeScene;
      const isAdjacent = distance === 1;
      const direction = index < activeScene ? -1 : 1;
      const visible = isActive ? 1 : (isAdjacent ? impact * .34 + fxState.speed * .08 : 0);
      const drift = direction * (210 + distance * 64);
      const velocityPush = fxState.velocity * (isActive ? -28 : 72);
      const burstPush = fxState.burst * direction * 48;
      const depth = isActive ? 1.06 + activeLocal * .14 + impact * .075 + fxState.speed * .035 + fxState.burst * .03 : 1.2 + distance * .07 + fxState.burst * .06;
      const y = isActive ? lerp(48, -86, activeLocal) - impact * 38 + fxState.velocity * 10 - fxState.burst * 18 : drift + burstPush * .35;
      const x = isActive ? lerp(34, -66, activeLocal) + impact * 26 + velocityPush : drift * -.76 + velocityPush + burstPush;
      const rotate = isActive ? lerp(.4, -1.35, activeLocal) + impact * 1.8 + fxState.velocity * .55 + fxState.burst * .8 : direction * (3.1 + fxState.burst * 2);
      const dim = isActive ? clamp(.34 - activeLocal * .1 - impact * .08 - fxState.speed * .04, .16, .36) : .62;
      const scan = isActive ? .16 + impact * .5 + fxState.speed * .22 + fxState.burst * .34 : .08;
      const isNear = isActive || isAdjacent;

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
      syncVideo(video, isActive, impact);
    });

    chapterEntries.forEach((entry, index) => {
      const { chapter, copy } = entry;
      const metric = metrics[index];
      const local = index === 0 ? 1 : (metric ? clamp((scrollY - (metric.top - vh * 0.5)) / (vh * 0.82)) : 0);
      const leaving = metric ? clamp((scrollY - (metric.top + metric.height - vh * 1.06)) / (vh * 0.58)) : 0;
      const localSmooth = smooth(local);
      const leavingSmooth = smooth(leaving);
      const isCurrentChapter = index === activeChapter;
      const opacity = isCurrentChapter ? 1 : 0;
      const copyLocal = isCurrentChapter ? Math.max(localSmooth, .64) : localSmooth;
      const y = lerp(40, -12, copyLocal);
      const revealLead = metric ? scrollY + vh * .95 >= metric.top : false;
      const shouldReveal = index === 0 || revealLead || local > .08 || isCurrentChapter;

      if (shouldReveal && chapter.dataset.revealed !== 'true') {
        chapter.dataset.revealed = 'true';
        chapter.classList.add('is-revealed');
      }

      setStyle(chapter, '--line-scale', (localSmooth * (1 - leavingSmooth * .74)).toFixed(3));
      if (copy) {
        setStyle(copy, '--copy-opacity', opacity.toFixed(3));
        setStyle(copy, '--copy-y', `${y.toFixed(2)}px`);
        setStyle(copy, '--copy-scale', lerp(.985, 1, copyLocal).toFixed(4));
      }
      if (entry.active !== isCurrentChapter) {
        chapter.classList.toggle('is-active', isCurrentChapter);
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
    fxState.cut = clamp(Math.max(fxState.impact * .92, fxState.burst * .62));
    applyKineticVars();
    const keepFxAlive = fxState.speed > .012 || Math.abs(fxState.velocity) > .012 || fxState.burst > .012 || fxState.cut > .012 || fxState.impact > .012;
    if (keepFxAlive) {
      requestUpdate();
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
