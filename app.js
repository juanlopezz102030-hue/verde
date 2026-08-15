/**
 * app.js — comportamiento de la landing sin React.
 *
 * Reemplaza al runtime de <x-dc> + support.js una vez que el HTML viene
 * prerenderizado. La lógica del carrusel es la misma que tenía la clase
 * Component: no dependía de React, sólo de document.querySelector y .style.
 *
 * Pesa ~4 KB contra los ~337 KB de React + support.js.
 */
(() => {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Configuración. Es lo único que cambia entre cayo.bet y las demás.
  // ─────────────────────────────────────────────────────────────
  const CONFIG = {
    // Número por defecto (Brasil). Se usa si la URL no trae override.
    whatsappNumber: '5527992691977',
    // Rotación horaria: números separados por coma. Vacío = desactivada.
    whatsappPool: '',
    whatsappMessage: 'Hola! Quiero activar el bonus 25% ✅',
  };

  // ─────────────────────────────────────────────────────────────
  // 1. Número de WhatsApp
  //    Mismo orden de prioridad que tenía renderVals(): query → pool → default.
  // ─────────────────────────────────────────────────────────────
  function numberFromQuery() {
    try {
      const u = new URL(location.href);
      for (const k of ['wa', 'phone', 'wpp', 'to', 'n']) {
        const v = u.searchParams.get(k);
        if (v && String(v).replace(/\D/g, '').length >= 8) return String(v).replace(/\D/g, '');
      }
    } catch (e) {}
    return '';
  }

  function numberFromPool() {
    const pool = String(CONFIG.whatsappPool || '')
      .split(',')
      .map((s) => s.replace(/\D/g, ''))
      .filter((s) => s.length >= 8);
    if (!pool.length) return '';
    return pool[Math.floor(Date.now() / 3600000) % pool.length];
  }

  const numero = numberFromQuery() || numberFromPool() || String(CONFIG.whatsappNumber).replace(/\D/g, '');
  const href = `https://wa.me/${numero}?text=${encodeURIComponent(CONFIG.whatsappMessage)}`;

  const ctas = document.querySelectorAll('a[href*="wa.me"]');

  // Se corrige el href antes de que nadie llegue a tocar el botón.
  // El prerender dejó el número por defecto; acá se aplica el override si lo hay.
  ctas.forEach((a) => {
    a.href = href;
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Tracking. No hace preventDefault: la navegación no espera al pixel.
  // ─────────────────────────────────────────────────────────────
  ctas.forEach((a) => {
    a.addEventListener('click', () => {
      try {
        if (window.fbq) {
          window.fbq('track', 'Contact', {
            content_name: 'WhatsAppClick',
            value: 1,
            currency: 'UYU',
          });
        }
      } catch (e) {}
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Carrusel de plataformas
  //    Copiado de la clase original. Cambian dos cosas: `this` pasa a ser
  //    el objeto `carrusel`, y los onClick de los puntos son addEventListener.
  // ─────────────────────────────────────────────────────────────
  const PLATFORMS = [
    { name: 'Bet30', tag: 'Casino + Deportiva' },
    { name: 'Ganamos', tag: 'Slots en vivo' },
    { name: 'RhinoPlay', tag: 'Fútbol' },
  ];
  const HOLD_MS = 5200;

  const carrusel = {
    index: 0,
    pauseTimers: {},
    labelTimer: null,
    rotator: null,
    keepAlive: null,
    cycleDone: false,
    visible: false,
    io: null,

    vids() {
      return Array.from(document.querySelectorAll('video[data-lazyvid]'));
    },

    warm(i) {
      const v = this.vids()[i];
      if (!v) return;
      if (v.preload !== 'auto') {
        v.preload = 'auto';
        v.load();
      }
    },

    // Único lugar que decide qué se ve y qué se reproduce.
    apply() {
      this.vids().forEach((v, k) => {
        const on = k === this.index;
        v.style.opacity = on ? '1' : '0';
        clearTimeout(this.pauseTimers[k]);
        if (on) {
          if (v.preload !== 'auto') {
            v.preload = 'auto';
            v.load();
          }
          if (v.paused) {
            const p = v.play();
            if (p && p.catch) p.catch(() => {});
          }
        } else if (!v.paused) {
          // se pausa recién cuando terminó el fundido, y sólo si sigue oculto
          this.pauseTimers[k] = setTimeout(() => {
            if (k !== this.index && !v.paused) v.pause();
          }, 1000);
        }
      });
      [0, 1, 2].forEach((k) => {
        const d = document.querySelector(`[data-dot="${k}"]`);
        if (d) d.style.opacity = k === this.index ? '1' : '0.3';
      });
    },

    goTo(i, manual) {
      if (i === this.index) return;
      this.index = i;
      this.apply();
      // el rótulo se desvanece y su texto cambia a mitad del cruce
      const name = document.getElementById('platformName');
      const tag = document.getElementById('platformTag');
      const p = PLATFORMS[i];
      clearTimeout(this.labelTimer);
      if (name) name.style.opacity = '0';
      if (tag) tag.style.opacity = '0';
      this.labelTimer = setTimeout(() => {
        const cur = PLATFORMS[this.index] || p;
        if (name) {
          name.textContent = cur.name;
          name.style.opacity = '1';
        }
        if (tag) {
          tag.textContent = cur.tag;
          tag.style.opacity = '1';
        }
      }, 450);
      if (manual) {
        this.cycleDone = true;
        clearInterval(this.rotator);
      }
    },

    schedule() {
      clearInterval(this.rotator);
      clearInterval(this.keepAlive);
      if (!this.visible) return;
      // red de seguridad: el video visible nunca queda congelado
      this.keepAlive = setInterval(() => {
        const v = this.vids()[this.index];
        if (v && v.paused && v.readyState >= 2) {
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        }
      }, 1500);
      if (this.cycleDone) return;
      this.rotator = setInterval(() => {
        const next = (this.index + 1) % PLATFORMS.length;
        this.warm(next);
        setTimeout(() => this.goTo(next), 700);
        // una vuelta completa y se detiene: los puntos siguen para elegir a mano
        if (next === 0) {
          this.cycleDone = true;
          clearInterval(this.rotator);
        }
      }, HOLD_MS);
    },

    // Nada se descarga hasta que el bloque entra en pantalla.
    setupLazyVideos() {
      const stage = document.getElementById('platformStage');
      if (!stage || !('IntersectionObserver' in window)) {
        this.visible = true;
        this.apply();
        this.schedule();
        return;
      }
      this.io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            this.visible = en.isIntersecting;
            if (en.isIntersecting) {
              this.apply();
              this.schedule();
            } else {
              clearInterval(this.rotator);
              clearInterval(this.keepAlive);
              this.vids().forEach((v) => {
                if (!v.paused) v.pause();
              });
            }
          });
        },
        { threshold: 0.35 }
      );
      this.io.observe(stage);
    },
  };

  // Los puntos: antes eran onClick={{ go0 }}, ahora listeners.
  document.querySelectorAll('[data-dot]').forEach((d) => {
    const i = Number(d.getAttribute('data-dot'));
    d.addEventListener('click', () => carrusel.goTo(i, true));
  });

  carrusel.setupLazyVideos();
})();
