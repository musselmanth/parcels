import { $ } from './core/dom.js';
import { currentScreen } from './screens.js';
import { G } from './state.js';
import { PLAYTEST_API } from './config.js';
import { enabled, isMe, sendFeedback, track } from './telemetry.js';

// The playtest note (start screen and Settings) and the feedback form (#mFeedback). Entries go to the
// playtest collector (worker/), along with where the player was and their screen size. If no
// collector is set up (PLAYTEST_API in src/config.js is empty), the feedback links are hidden.

export function initFeedback() {
  const modal = $('#mFeedback'),
    status = $('#fbStatus'),
    msg = $('#fbMsg'),
    contact = $('#fbContact'),
    sendBtn = $('#bFbSend');
  let rating = null;

  document.querySelectorAll('.feedback-link').forEach((el) => (el.hidden = !enabled));
  document.querySelectorAll('.data-note').forEach((el) => (el.hidden = !enabled));
  // a browser marked as yours (?me): say so in Settings, so it's clear why there's no data or feedback
  const mine = $('#meNote');
  if (mine) mine.hidden = !(PLAYTEST_API && isMe);

  const paintRating = () =>
    modal.querySelectorAll('.fb-rating button').forEach((b) => {
      b.classList.toggle('on', +b.dataset.r === rating);
      b.setAttribute('aria-pressed', String(+b.dataset.r === rating));
    });
  modal.querySelectorAll('.fb-rating button').forEach(
    (b) =>
      (b.onclick = () => {
        rating = rating === +b.dataset.r ? null : +b.dataset.r;
        paintRating();
      }),
  );

  const open = () => {
    status.textContent = '';
    status.className = 'setnote';
    sendBtn.disabled = false;
    document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
    modal.classList.add('open');
    track('feedback_open', { screen: currentScreen() });
    setTimeout(() => msg.focus(), 50);
  };
  const close = () => modal.classList.remove('open');
  document.querySelectorAll('.feedback-link').forEach((b) => (b.onclick = open));
  $('#bFeedbackClose').onclick = close;
  modal.addEventListener('click', (e) => e.target === modal && close());

  sendBtn.onclick = async () => {
    const text = msg.value.trim();
    if (!text && !rating) {
      status.textContent = 'Write a few words or pick a face first.';
      status.className = 'setnote bad';
      return;
    }
    sendBtn.disabled = true;
    status.textContent = 'Sending…';
    status.className = 'setnote';
    const ok = await sendFeedback({
      rating,
      message: text,
      contact: contact.value.trim(),
      context: {
        screen: currentScreen(),
        level: G.level,
        board: G.cur || null,
        viewport: `${innerWidth}x${innerHeight}`,
        ua: navigator.userAgent.slice(0, 200),
      },
    });
    if (ok) {
      status.textContent = 'Thank you! Got it.';
      status.className = 'setnote ok';
      msg.value = '';
      rating = null;
      paintRating();
      setTimeout(close, 1400);
    } else {
      status.textContent = 'Couldn’t send it just now. Check your connection and try again.';
      status.className = 'setnote bad';
      sendBtn.disabled = false;
    }
  };
}
