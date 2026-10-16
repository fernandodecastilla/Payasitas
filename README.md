# 🏐 Payasitas · Control de minutos

Aplicación web táctil (PWA) para **medir los minutos que juega cada jugadora, con qué
compañeras, y los parciales del marcador** mientras cada una está en pista. Pensada para
usarse desde el banquillo en **móvil y tablet Android** (también funciona en iPhone/iPad y
ordenador).

Equipo: 18 jugadoras · **5 en pista** y **13 en banquillo**, siempre.

---

## ✨ Qué hace

### Pantalla **Partido**
- **Marcador tipo pabellón** en el centro con goles LOCAL (a favor), VISITANTE (en contra) y cronómetro.
- **Cronómetro** con un único botón que alterna **Iniciar → Pausar → Reanudar**.
- Botones **+ / −** para sumar y restar goles local y visitante.
- **Iniciar partido**: pone a cero tiempo y marcador (mantiene el alineado actual). Pide confirmación si ya hay datos.
- **Finalizar**: pide confirmación, detiene el crono y **guarda el partido en el historial**.
- **Fichas circulares** (chapas): a la izquierda las 5 en pista, a la derecha las 13 del banquillo.
  - **Tocar** una ficha y luego otra = **intercambiar**.
  - **Arrastrar** una ficha sobre otra = **intercambiar**.
  - Siempre quedan exactamente **5 en pista**: al meter una, sale otra.

### Pantalla **Análisis**
- **Resumen por jugadora**: minutos jugados, goles a favor y en contra mientras ella estaba en pista, y el +/−.
- **Filtro incluir / excluir**: toca cada jugadora para marcarla como
  - 🟢 **incluir** (debe estar en pista),
  - 🔴 **excluir** (no debe estar),
  - gris = indiferente.

  Devuelve **tiempo (mm:ss)** y **marcador parcial** (a favor / en contra / diferencia) de los
  tramos que cumplen el filtro.

  > Ejemplo: incluir **MOSKITA** y **MERCEDES**, excluir **ELENA** y **JULIA** → te dice los
  > minutos que estuvieron Moskita y Mercedes en pista **sin** Elena ni Julia, y los goles a
  > favor y en contra durante ese tiempo.

### Pantalla **Historial**
- Lista de partidos guardados (marcador, fecha, duración).
- **Ver análisis** de cualquier partido pasado · **Borrar** · **Exportar** / **Importar** (copia de seguridad en JSON).

---

## 📲 Instalar en Android (y iPhone)

Es una PWA: se instala como una app normal, sin tienda.

1. Sube esta carpeta a cualquier hosting estático con **HTTPS** (p. ej. **GitHub Pages**, Netlify, Vercel).
2. Abre la URL en **Chrome** (Android) o **Safari** (iPhone/iPad).
3. Menú del navegador → **«Añadir a pantalla de inicio» / «Instalar aplicación»**.
4. Se abre a pantalla completa, con su icono, y **funciona sin conexión**. Los datos se guardan en el dispositivo.

### Publicar gratis con GitHub Pages
En el repositorio: **Settings → Pages → Build and deployment → Source: "Deploy from a branch"**,
elige la rama `claude/volleyball-stats-app-i4zu3q` y carpeta `/ (root)`, y **Save**.
En ~1 minuto la web queda publicada en `https://fernandodecastilla.github.io/Payasitas/`,
lista para instalar. GitHub la reconstruye sola en cada push (repositorio público = gratis).

### Probar en local
```bash
cd Payasitas
python3 -m http.server 8099
# abre http://localhost:8099
```

---

## 🎨 Diseño
Interfaz táctil en **violeta, negro y blanco con bordes dorados**, marcador de dígitos tipo LED.
El **escudo del C.D. Payasos Crouss** es el icono de la app y aparece en la cabecera y como
marca de agua sutil en el marcador.

## 🗂️ Estructura
```
index.html               Estructura y pantallas
styles.css               Tema (violeta/negro/dorado) y responsive móvil/tablet
app.js                   Lógica: cronómetro, tramos por quinteto, goles, filtros, historial
manifest.webmanifest     Metadatos PWA (instalable)
sw.js                    Service worker (funciona sin conexión)
crest.svg                Escudo del club (cabecera y marca de agua)
icon.svg                 Icono de la app (escudo sobre fondo violeta)
```

## ⚙️ Cómo funciona por dentro
Cada vez que cambia el quinteto en pista se cierra un **tramo** con la alineación y su duración.
Cada gol se guarda con **el quinteto que estaba en pista** en ese momento. Así, para cualquier
filtro, basta sumar la duración de los tramos que cumplen la condición y contar los goles cuya
alineación la cumple. El tiempo solo avanza con el cronómetro en marcha.

Sin dependencias externas: HTML, CSS y JavaScript puro.
