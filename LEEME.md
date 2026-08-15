# cayo.bet — cambios de rendimiento

Repo: `juanlopezz102030-hue/verde`. Todo esto está verificado contra tu código real, no son sugerencias genéricas.

## Cómo aplicarlo

```bash
git checkout -b perf/assets

# copiar el contenido de esta carpeta sobre la raíz del repo
# (respeta la estructura: logos/, img/, fonts/, original/)

# opcional pero recomendado: bajar 18,6 MB de peso muerto
git rm panda.mp4 panda-loop.mp4
git rm santander.png itau.png mercadopago.png midinero.png prex.png \
       scotiabank.png brou.png cayo.png md.png whatsapp.png logo.png \
       WhatsApp.svg.png WhatsApp_logo.svg.png medios-de-pago.png convenio.png \
       gift.mp3 gift-sound.mp3 \
       bet30-preview.mp4 ganamos-preview.mp4 rhinoplay-preview.mp4 rhino-preview.mp4 \
       bet30-preview.png bet30-preview.jpg ganamos-preview.png ganamos-preview.jpg \
       rhinoplay-preview.png rhinoplay-preview.jpg
git rm img/opcion*.jpg

git add -A && git commit -m "perf: assets, fuentes y carga no bloqueante"
git push -u origin perf/assets
```

Vercel te genera la preview del PR. **Corré PageSpeed contra esa URL antes de mergear.**

Los `.png` y `.ttf` originales de `logos/` y `fonts/` los dejé en el repo: son la fuente para regenerar si algún día cambia el diseño. No se sirven, no pesan en la página.

---

## Qué cambié

### Imágenes: 1.258 KiB → 110 KiB (−91%)

`santander.png` medía 1024×1024 px y se muestra dentro de un contenedor de 46×46. Lo mismo el resto. Las regeneré en WebP a 3× del tamaño real de render.

| Archivo | Antes | Ahora |
|---|---|---|
| santander | 338,4 KiB | **2,5 KiB** |
| cayo-logo | 293,6 KiB | 24,6 KiB |
| mercadopago | 139,6 KiB | 5,9 KiB |
| itau | 98,4 KiB | 2,2 KiB |
| prex | 86,3 KiB | 2,7 KiB |
| scotiabank | 61,7 KiB | 1,3 KiB |
| midinero | 59,0 KiB | 1,4 KiB |
| brou | 36,3 KiB | 1,1 KiB |
| whatsapp (CTA) | 34,6 KiB | 3,2 KiB |
| uy-flag | 6,3 KiB | 1,1 KiB |

El fondo pasó a `fondo-casino-780.webp` (64 KiB). Dejé también la versión de 1170 px por si querés servirla en pantallas grandes.

### Fuentes: 2.495 KiB → 309 KiB (−88%)

`Sacrifice.ttf` pesaba **2,1 MB** y se usa en 9 lugares. Traía el juego de caracteres completo. La subseteé a latino + acentos castellanos:

| Fuente | Antes | Ahora |
|---|---|---|
| Sacrifice | 2.121,8 KiB | **174,4 KiB** |
| AlteixSans | 269,5 KiB | 109,8 KiB |
| AovelSansRounded | 103,9 KiB | 24,8 KiB |

> Se puede bajar otro ~30% pasándolas a `woff2`, pero necesita `brotli`, que no tengo disponible acá. Si querés: `pip install fonttools brotli` y volver a correr el subset con `--flavor=woff2`.

Poppins bajó de 4 pesos (500/700/800/900) a los 3 que la página realmente usa (400/700/800).

### `support.js` con `defer`

Estaba en el `<head>` sin `defer`, bloqueando el parseo. **Verifiqué que es seguro**: en `support.js:1903` el arranque ya contempla los dos casos (`document.readyState !== "loading"` → arranca ya; si no, espera `DOMContentLoaded`). Y `parseDcDocument` lee del DOM vivo, no del HTML crudo — con `defer` el DOM está completo, así que es más confiable, no menos.

Efecto secundario que tuve que cubrir: `support.js` inyectaba el CSS que oculta `<x-dc>`. Con `defer` eso pasa más tarde, así que la plantilla cruda (`{{ waHref }}` y demás) podía llegar a verse un instante. Agregué `x-dc { display: none !important; }` al `<style>` del head.

### Área táctil de los puntos del carrusel

Los botones `Bet30` / `Ganamos` / `RhinoPlay` medían **7×7 px**. Los dejé visualmente iguales y agrandé solo el área de toque a 24×24 px con un pseudo-elemento, y separé los puntos de 5 a 17 px para que las áreas no se pisen (centros a 24 px exactos).

24×24 cumple WCAG 2.2 AA. **No alcanza el umbral de 48×48 que usa el audit legacy de Lighthouse** — para eso habría que separarlos mucho más y se nota en el diseño. Te lo dejo como decisión tuya.

También agregué `touch-action: manipulation` al CTA de WhatsApp: elimina el retardo de ~300 ms del doble-tap en varios Android. Es de lo más barato que hay contra el INP.

### Otros

- `<html lang="es-UY">`
- `<meta name="description">`
- `vercel.json` con caché de un año para imágenes, fuentes y videos.
  **Sin `immutable` en `.css`/`.js`**, porque tus archivos no llevan hash en el nombre: si lo pusiera, quien ya visitó el sitio se quedaría con el `support.js` viejo hasta un año.

---

## Lo que encontré y NO toqué

### La página entera depende de que unpkg.com esté funcionando

`support.js` descarga React y ReactDOM en runtime desde un CDN de terceros:

```js
// support.js:1143
var REACT_URL     = "https://unpkg.com/react@18.3.1/umd/react.production.min.js";
var REACT_DOM_URL = "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js";
```

Y recién después arranca el render:

```js
loadReactUmd().then(init).catch(err => { console.error("[dc] failed to load React or boot:", err); throw err; });
```

Esto significa tres cosas:

1. **Nada se ve hasta que bajan ~270 KiB de React desde un dominio ajeno.** Ahí está buena parte de tu LCP de 7,2 s.
2. **Si unpkg está caído o lento, tu landing muestra una pantalla vacía.** Con la pauta que tenés corriendo, es un punto único de falla que no controlás.
3. Es una landing estática renderizada del lado del cliente con React. El costo no se justifica.

Le puse `preconnect` a unpkg, que ayuda algo, pero es un parche.

**El arreglo real, por orden de esfuerzo:**

```bash
# 1. Self-hostear React (30 min, bajo riesgo)
npm pack react@18.3.1 react-dom@18.3.1
# extraer umd/react.production.min.js y umd/react-dom.production.min.js a ./vendor/
# y cambiar REACT_URL / REACT_DOM_URL en support.js (borrando también los SRI,
# que son para el CDN)
```

Eso te saca la dependencia externa y te deja cachear React un año con `immutable`.

**2. Prerenderizar el HTML.** El paso grande: que el HTML llegue ya armado y React solo hidrate (o directamente no exista). Elimina los 270 KiB y el render en cliente. Es rehacer la landing, pero es lo que te llevaría el LCP de 7,2 s a menos de 2 s.

No pude verificar el render localmente porque este entorno no llega a unpkg — la página no arranca acá, ni con mis cambios ni sin ellos. Por eso **verificá en la preview de Vercel antes de mergear**.

### El INP de 610 ms no está en este repo

Ese dato es de **ganauruguay.com**, que es otro repo. Acá el CTA es un `<a href="wa.me/...">` con un `onClick` que solo dispara `fbq` — **no bloquea la navegación**. Así que la hipótesis que te di antes no aplica a cayo.bet; me corrijo.

En cayo.bet, lo que sí puede empujar el INP hacia arriba es el carrusel: al tocar un punto, `goTo()` → `apply()` pone `preload="auto"`, llama `v.load()` y `v.play()` sobre los `<video>`. Eso es trabajo pesado en el hilo principal justo en el tap. Además hay un `setInterval` cada 1500 ms de "keepAlive" corriendo todo el tiempo.

No lo toqué porque cambia comportamiento y prefiero que lo decidas vos. Si querés, lo ataco en un segundo PR.

---

## Para ganauruguay.com

Necesito ese repo. Es el que tiene el problema medido con usuarios reales (Core Web Vitals **FAILED**, INP 610 ms) y el `fondo-casino.png` de 2,8 MB.
