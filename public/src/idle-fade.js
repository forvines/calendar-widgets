// Fades the calendar after a period of inactivity so the DAKboard background
// photo shows through more, and restores full opacity on any interaction.
// Timing and faded opacity are configured in config.js (config.idle).

const INTERACTION_EVENTS = [
  'pointerdown', 'pointermove', 'touchstart', 'touchmove',
  'click', 'wheel', 'keydown', 'scroll',
];

export function installIdleFade(root, idleConfig = {}) {
  const seconds = Number(idleConfig.idleFadeSeconds) || 0;
  if (seconds <= 0) return { destroy() {} }; // disabled

  const fadedOpacity = idleConfig.fadedOpacity ?? 0.5;
  root.style.setProperty('--idle-faded-opacity', String(fadedOpacity));

  let timer = null;

  function goIdle() {
    root.classList.add('is-idle');
  }

  function wake() {
    if (root.classList.contains('is-idle')) root.classList.remove('is-idle');
    if (timer) clearTimeout(timer);
    timer = setTimeout(goIdle, seconds * 1000);
  }

  // Passive listeners on the document so any interaction anywhere resets the
  // timer. scroll must be captured (it does not bubble to document from the
  // scrolling accordion).
  for (const type of INTERACTION_EVENTS) {
    document.addEventListener(type, wake, { passive: true, capture: type === 'scroll' });
  }

  wake(); // start the idle countdown

  return {
    destroy() {
      if (timer) clearTimeout(timer);
      for (const type of INTERACTION_EVENTS) {
        document.removeEventListener(type, wake, { capture: type === 'scroll' });
      }
    },
  };
}
