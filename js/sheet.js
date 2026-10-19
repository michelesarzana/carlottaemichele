// Bottom sheet stile Apple Maps: tre posizioni, trascinamento 1:1,
// lancio con proiezione del momento e molla interrompibile.

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function project(v, d = 0.998) {
  return (v / 1000) * d / (1 - d);
}

export class Sheet {
  constructor(el, { grab, scroll, onChange }) {
    this.el = el;
    this.grab = grab;
    this.scroll = scroll;
    this.onChange = onChange || (() => {});
    this.y = 0;
    this.v = 0;
    this.target = 0;
    this.detent = 'medium';
    this.raf = 0;
    this.enabled = false;

    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this._resize = this._resize.bind(this);

    grab.addEventListener('pointerdown', this._down);
    window.addEventListener('resize', this._resize);
    this.mq = window.matchMedia('(min-width: 900px)');
    this.mq.addEventListener('change', this._resize);
    this._resize();
  }

  get positions() {
    const h = window.innerHeight;
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
    return {
      large: Math.round(top + 56),
      medium: Math.round(h * 0.52),
      small: Math.round(h - 150)
    };
  }

  _resize() {
    this.enabled = !this.mq.matches;
    if (!this.enabled) {
      cancelAnimationFrame(this.raf);
      this.el.style.transform = '';
      this.scroll.style.height = '';
      this.onChange('desktop', 0);
      return;
    }
    this.snap(this.detent, false);
  }

  visibleHeight() {
    return this.enabled ? window.innerHeight - this.y : 0;
  }

  snap(detent, animate = true, velocity = 0) {
    if (!this.enabled) return;
    this.detent = detent;
    this.target = this.positions[detent];
    this.onChange(detent, window.innerHeight - this.target);
    if (!animate || reduceMotion()) {
      cancelAnimationFrame(this.raf);
      this.y = this.target;
      this.v = 0;
      this._apply();
      return;
    }
    this.v = velocity;
    this._animate();
  }

  _apply() {
    this.el.style.transform = `translate3d(0, ${this.y}px, 0)`;
    const gh = this.grab.offsetHeight;
    this.scroll.style.height = Math.max(0, window.innerHeight - this.y - gh) + 'px';
  }

  _animate() {
    cancelAnimationFrame(this.raf);
    // Molla: risposta 0.32 s, smorzamento 0.86 (un filo di rimbalzo solo se lanciato)
    const response = 0.32;
    const zeta = Math.abs(this.v) > 600 ? 0.82 : 1;
    const w = (2 * Math.PI) / response;
    const k = w * w;
    const c = 2 * zeta * w;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const a = -k * (this.y - this.target) - c * this.v;
      this.v += a * dt;
      this.y += this.v * dt;
      if (Math.abs(this.y - this.target) < 0.4 && Math.abs(this.v) < 8) {
        this.y = this.target;
        this.v = 0;
        this._apply();
        return;
      }
      this._apply();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  _down(e) {
    if (!this.enabled) return;
    if (e.target.closest('button, a, input, textarea, select, label')) return;
    cancelAnimationFrame(this.raf);
    this.grab.setPointerCapture(e.pointerId);
    this.startPointer = e.clientY;
    this.startY = this.y;
    this.moved = false;
    this.samples = [{ t: performance.now(), y: e.clientY }];
    this.grab.addEventListener('pointermove', this._move);
    this.grab.addEventListener('pointerup', this._up);
    this.grab.addEventListener('pointercancel', this._up);
  }

  _move(e) {
    const dy = e.clientY - this.startPointer;
    if (!this.moved && Math.abs(dy) < 6) return;
    this.moved = true;
    const { large, small } = this.positions;
    let y = this.startY + dy;
    // Resistenza elastica oltre i bordi
    if (y < large) y = large - this._rubber(large - y);
    if (y > small) y = small + this._rubber(y - small);
    this.y = y;
    this._apply();
    this.samples.push({ t: performance.now(), y: e.clientY });
    if (this.samples.length > 6) this.samples.shift();
  }

  _rubber(over, dim = 300, c = 0.55) {
    return (over * dim * c) / (dim + c * over);
  }

  _up() {
    this.grab.removeEventListener('pointermove', this._move);
    this.grab.removeEventListener('pointerup', this._up);
    this.grab.removeEventListener('pointercancel', this._up);
    if (!this.moved) {
      // tap sulla maniglia: alterna tra media e grande
      this.snap(this.detent === 'large' ? 'medium' : 'large');
      return;
    }
    const s = this.samples;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = Math.max(1, b.t - a.t);
    const v = ((b.y - a.y) / dt) * 1000;
    const projected = this.y + project(v);
    const pos = this.positions;
    let best = 'medium';
    let dist = Infinity;
    for (const [name, py] of Object.entries(pos)) {
      const d = Math.abs(projected - py);
      if (d < dist) { dist = d; best = name; }
    }
    this.snap(best, true, v);
  }
}
