(() => {
  'use strict';

  const root = document.documentElement;
  const scenes = Array.from(document.querySelectorAll('.scene'));
  const chapters = Array.from(document.querySelectorAll('.chapter'));
  const navItems = Array.from(document.querySelectorAll('.nav a'));
  const progressBar = document.querySelector('.progress__bar');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, n));
  const smooth = (n) => n * n * (3 - 2 * n);
  const lerp = (a, b, t) => a + (b - a) * t;

  let metrics = [];
  let ticking = false;

  const measure = () => {
    metrics = chapters.map((chapter) => ({
      id: chapter.id,
      scene: Number(chapter.dataset.scene || 0),
      top: chapter.offsetTop,
      height: chapter.offsetHeight,
    }));
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
      pulse = Math.max(pulse, 1 - clamp(distance / (vh * 0.52)));
    }
    return smooth(pulse);
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

    if (progressBar) {
      progressBar.style.transform = `scaleX(${totalProgress.toFixed(4)})`;
    }

    root.style.setProperty('--wipe', wipe.toFixed(3));
    root.style.setProperty('--wipe-gap', `${((1 - wipe) * 50).toFixed(2)}%`);
    root.style.setProperty('--stage-x', `${lerp(0, -120, totalProgress).toFixed(2)}px`);
    root.style.setProperty('--stage-y', `${lerp(0, 80, totalProgress).toFixed(2)}px`);
    root.style.setProperty('--stage-scale', (1 + totalProgress * 0.08).toFixed(4));
    root.style.setProperty('--axis-scale', (0.72 + wipe * 0.9).toFixed(3));

    scenes.forEach((scene, index) => {
      const distance = Math.abs(index - activeScene);
      const near = clamp(1 - distance);
      const previous = index === activeScene - 1 ? 1 - activeLocal : 0;
      const next = index === activeScene + 1 ? activeLocal : 0;
      const visible = clamp(Math.max(near, previous * 0.82, next * 0.82));
      const drift = (index - activeScene) * 80;
      const depth = index === activeScene ? 1 + activeLocal * 0.08 : 1.1 + distance * 0.04;
      const y = index === activeScene ? lerp(18, -46, activeLocal) : drift;
      const x = index === activeScene ? lerp(0, -42, activeLocal) : drift * -0.6;
      const bright = index === activeScene ? lerp(.78, 1.04, activeLocal) : .58;
      const blur = index === activeScene ? 0 : 10;

      scene.style.opacity = visible.toFixed(3);
      scene.style.setProperty('--scene-x', `${x.toFixed(2)}px`);
      scene.style.setProperty('--scene-y', `${y.toFixed(2)}px`);
      scene.style.setProperty('--scene-scale', depth.toFixed(4));
      scene.style.setProperty('--scene-bright', bright.toFixed(3));
      scene.style.setProperty('--scene-blur', `${blur}px`);
      scene.classList.toggle('is-active', index === activeScene);
    });

    chapters.forEach((chapter, index) => {
      const metric = metrics[index];
      const local = metric ? clamp((scrollY - (metric.top - vh * 0.55)) / (vh * 0.75)) : 0;
      const leaving = metric ? clamp((scrollY - (metric.top + metric.height - vh * 1.12)) / (vh * 0.72)) : 0;
      const opacity = clamp(smooth(local) * (1 - leaving * 0.78), 0, 1);
      const y = lerp(44, -18, smooth(local)) - leaving * 24;
      const copy = chapter.querySelector('.chapter__copy');
      if (copy) {
        copy.style.setProperty('--copy-opacity', opacity.toFixed(3));
        copy.style.setProperty('--copy-y', `${y.toFixed(2)}px`);
      }
      chapter.classList.toggle('is-active', index === activeChapter);
    });

    navItems.forEach((link) => {
      const href = link.getAttribute('href') || '';
      link.classList.toggle('is-current', href === `#${metrics[activeChapter]?.id}`);
    });
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('resize', () => {
    measure();
    requestUpdate();
  }, { passive: true });
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('load', () => {
    measure();
    requestUpdate();
  });

  measure();
  update();
})();
