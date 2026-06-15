(() => {
  'use strict';

  const root = document.documentElement;
  const scenes = Array.from(document.querySelectorAll('.scene'));
  const chapters = Array.from(document.querySelectorAll('.chapter'));
  const navItems = Array.from(document.querySelectorAll('.nav a'));
  const progressBar = document.querySelector('.progress__bar');
  const canvas = document.querySelector('.fx-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: true }) : null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  let metrics = [];
  let ticking = false;
  let canvasW = 0;
  let canvasH = 0;
  let dpr = 1;
  const fxState = {
    progress: 0,
    impact: 0,
    active: 0,
    scroll: 0,
  };

  const particleCount = window.innerWidth < 860 ? 86 : 148;
  const particles = Array.from({ length: particleCount }, (_, i) => ({
    x: (Math.sin(i * 17.11) + 1) / 2,
    y: (Math.cos(i * 9.73) + 1) / 2,
    speed: .12 + (i % 9) * .032,
    size: .65 + (i % 5) * .23,
    phase: i * 0.63,
  }));

  const measure = () => {
    metrics = chapters.map((chapter) => ({
      id: chapter.id,
      scene: Number(chapter.dataset.scene || 0),
      top: chapter.offsetTop,
      height: chapter.offsetHeight,
    }));
  };

  const resizeCanvas = () => {
    if (!canvas || !ctx) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
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
    let active = 0;
    metrics.forEach((m, i) => {
      if (probe >= m.top) active = i;
    });
    return active;
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

  const syncVideo = (video, visible, isActive, impact) => {
    if (!video) return;
    if (reduced) {
      video.pause();
      return;
    }

    if (visible > .04 || isActive) {
      video.playbackRate = isActive ? lerp(.82, 1.22, impact) : .62;
      if (video.paused) {
        const play = video.play();
        if (play && typeof play.catch === 'function') play.catch(() => {});
      }
    } else {
      video.pause();
    }
  };

  const update = () => {
    ticking = false;
    const scrollY = window.scrollY || window.pageYOffset;
    const vh = window.innerHeight || 1;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    const totalProgress = clamp(scrollY / maxScroll);
    const activeChapter = currentSceneIndex(scrollY, vh);
    const activeMetric = metrics[activeChapter] || metrics[0];
    const activeScene = activeMetric ? activeMetric.scene : 0;
    const activeLocal = activeMetric ? clamp((scrollY - activeMetric.top) / Math.max(1, activeMetric.height - vh)) : 0;
    const wipe = reduced ? 0 : transitionPulse(scrollY, vh);
    const impact = Math.pow(wipe, .72);

    fxState.progress = totalProgress;
    fxState.impact = impact;
    fxState.active = activeScene;
    fxState.scroll = scrollY;

    if (progressBar) {
      progressBar.style.transform = `scaleX(${totalProgress.toFixed(4)})`;
    }

    root.style.setProperty('--wipe', wipe.toFixed(3));
    root.style.setProperty('--wipe-gap', `${((1 - wipe) * 50).toFixed(2)}%`);
    root.style.setProperty('--impact', impact.toFixed(3));
    root.style.setProperty('--stage-x', `${lerp(0, -220, totalProgress).toFixed(2)}px`);
    root.style.setProperty('--stage-y', `${lerp(0, 140, totalProgress).toFixed(2)}px`);
    root.style.setProperty('--stage-scale', (1 + totalProgress * 0.12 + impact * .04).toFixed(4));
    root.style.setProperty('--axis-scale', (0.64 + impact * 1.16).toFixed(3));

    scenes.forEach((scene, index) => {
      const distance = Math.abs(index - activeScene);
      const isActive = index === activeScene;
      const isAdjacent = distance === 1;
      const direction = index < activeScene ? -1 : 1;
      const visible = isActive ? 1 : (isAdjacent ? impact * .24 : 0);
      const drift = direction * (180 + distance * 54);
      const depth = isActive ? 1.06 + activeLocal * .12 + impact * .055 : 1.18 + distance * .06;
      const y = isActive ? lerp(46, -78, activeLocal) - impact * 32 : drift;
      const x = isActive ? lerp(32, -58, activeLocal) + impact * 22 : drift * -.74;
      const rotate = isActive ? lerp(.4, -1.2, activeLocal) + impact * 1.4 : direction * 2.8;
      const bright = isActive ? lerp(.78, 1.05, activeLocal) + impact * .1 : .48;
      const blur = isActive ? impact * 1.4 : 14;
      const sat = isActive ? lerp(1.02, 1.12, activeLocal) : .9;
      const scan = isActive ? .14 + impact * .46 : .08;
      const video = scene.querySelector('video');

      scene.style.opacity = visible.toFixed(3);
      scene.style.setProperty('--scene-x', `${x.toFixed(2)}px`);
      scene.style.setProperty('--scene-y', `${y.toFixed(2)}px`);
      scene.style.setProperty('--scene-scale', depth.toFixed(4));
      scene.style.setProperty('--scene-rotate', `${rotate.toFixed(3)}deg`);
      scene.style.setProperty('--scene-bright', bright.toFixed(3));
      scene.style.setProperty('--scene-blur', `${blur.toFixed(2)}px`);
      scene.style.setProperty('--scene-sat', sat.toFixed(3));
      scene.style.setProperty('--scene-scan', scan.toFixed(3));
      scene.classList.toggle('is-active', isActive);
      syncVideo(video, visible, isActive, impact);
    });

    chapters.forEach((chapter, index) => {
      const metric = metrics[index];
      const local = index === 0 ? 1 : (metric ? clamp((scrollY - (metric.top - vh * 0.5)) / (vh * 0.82)) : 0);
      const leaving = metric ? clamp((scrollY - (metric.top + metric.height - vh * 1.06)) / (vh * 0.58)) : 0;
      const localSmooth = smooth(local);
      const leavingSmooth = smooth(leaving);
      const opacity = clamp(localSmooth * (1 - leavingSmooth), 0, 1);
      const y = lerp(72, -12, localSmooth) - leavingSmooth * 72;
      const copy = chapter.querySelector('.chapter__copy');

      chapter.style.setProperty('--line-scale', (localSmooth * (1 - leavingSmooth * .74)).toFixed(3));
      if (copy) {
        copy.style.setProperty('--copy-opacity', opacity.toFixed(3));
        copy.style.setProperty('--copy-y', `${y.toFixed(2)}px`);
        copy.style.setProperty('--copy-scale', (lerp(.985, 1, localSmooth) + leavingSmooth * .035).toFixed(4));
      }
      chapter.classList.toggle('is-active', index === activeChapter);
    });

    navItems.forEach((link) => {
      const href = link.getAttribute('href') || '';
      link.classList.toggle('is-current', href === `#${metrics[activeChapter]?.id}`);
    });
  };

  const renderFx = (time = 0) => {
    if (!ctx || reduced) return;

    const [r, g, b] = palettes[fxState.active] || palettes[0];
    const impact = fxState.impact;
    const progress = fxState.progress;
    const t = time * .001;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.globalCompositeOperation = 'lighter';

    const axisY = canvasH * (.54 - impact * .08);
    ctx.save();
    ctx.translate(canvasW * .5, axisY);
    ctx.rotate(-0.22 + impact * .18);
    const gradient = ctx.createLinearGradient(-canvasW * .52, 0, canvasW * .52, 0);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
    gradient.addColorStop(.45, `rgba(255, 255, 255, ${.16 + impact * .46})`);
    gradient.addColorStop(.58, `rgba(${r}, ${g}, ${b}, ${.2 + impact * .48})`);
    gradient.addColorStop(1, 'rgba(255, 61, 113, 0)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.2 + impact * 5.5;
    ctx.beginPath();
    ctx.moveTo(-canvasW * .54, Math.sin(t) * 14);
    ctx.bezierCurveTo(-canvasW * .2, -58 - impact * 40, canvasW * .18, 72 + impact * 32, canvasW * .56, Math.cos(t) * 18);
    ctx.stroke();
    ctx.restore();

    particles.forEach((p, i) => {
      const travel = (t * p.speed + progress * (1.6 + p.speed) + p.x) % 1;
      const wave = Math.sin(t * (0.6 + p.speed) + p.phase);
      const x = travel * canvasW + wave * (28 + impact * 88);
      const y = ((p.y + Math.cos(t * .4 + p.phase) * .08 + progress * .18) % 1) * canvasH;
      const alpha = .13 + impact * .42 + (i % 7 === 0 ? .18 : 0);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size + impact * 1.8, 0, Math.PI * 2);
      ctx.fill();

      if (i % 9 === 0) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${.05 + impact * .18})`;
        ctx.lineWidth = .6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 90 - impact * 140, y + wave * 28);
        ctx.stroke();
      }
    });

    if (impact > .04) {
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

    requestAnimationFrame(renderFx);
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('resize', () => {
    measure();
    resizeCanvas();
    requestUpdate();
  }, { passive: true });

  window.addEventListener('scroll', requestUpdate, { passive: true });

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

  measure();
  resizeCanvas();
  update();
  if (!reduced) requestAnimationFrame(renderFx);
})();
