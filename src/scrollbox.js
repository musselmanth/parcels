// A scrolling area with a slim custom scroll bar instead of the browser's, and a soft fade at an
// edge that has more beyond it. Used for the Settings and How to play sheets (their header stays
// put; only the body scrolls) and the start screen's level list on short screens.
//
// scrollbox(el): el becomes the scroller (class sbox-body); it's wrapped in a .sbox that holds the
// bar. Returns update(), to call when el's size or content may have changed (it also watches for
// that itself).
export function scrollbox(el) {
  const wrap = document.createElement('div');
  wrap.className = 'sbox';
  el.parentNode.insertBefore(wrap, el);
  wrap.appendChild(el);
  el.classList.add('sbox-body');
  const bar = document.createElement('div');
  bar.className = 'sbar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<i></i>';
  wrap.appendChild(bar);
  const thumb = bar.firstChild;
  let queued = false;
  const update = () => {
    queued = false;
    const ch = el.clientHeight,
      sh = el.scrollHeight,
      over = sh > ch + 1;
    wrap.classList.toggle('scrolls', over);
    wrap.classList.toggle('more-above', over && el.scrollTop > 2);
    wrap.classList.toggle('more-below', over && el.scrollTop < sh - ch - 2);
    if (!over) return;
    bar.style.top = el.offsetTop + 'px';
    bar.style.height = ch + 'px';
    const th = Math.max(28, (ch * ch) / sh);
    thumb.style.height = th + 'px';
    thumb.style.transform = `translateY(${((el.scrollTop / (sh - ch)) * (ch - th)).toFixed(1)}px)`;
  };
  const soon = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };
  el.addEventListener('scroll', update, { passive: true });
  addEventListener('resize', soon);
  const ro = new ResizeObserver(soon);
  ro.observe(el);
  // content changes size too (examples, sync box, level buttons filled in)
  new MutationObserver(() => {
    [...el.children].forEach((c) => ro.observe(c));
    soon();
  }).observe(el, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class'],
  });
  [...el.children].forEach((c) => ro.observe(c));
  soon();
  return update;
}
