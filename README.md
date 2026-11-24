# Pokédex PWA

Pokédex de la primera generación (#001–#151) hecha como Progressive Web App.
Los Pokémon **no** están disponibles de entrada: se capturan escaneando un código QR con el formato `pokemon:{id}`.

## Autores
Danna Kristell Rosas, Luz Aida Zamorano, Daniela Paulina Noriega, Jimena Castellanos — Clase de Apps Móviles.

## Cómo ejecutar la aplicación
Necesita servirse por **HTTP(S)** (la cámara y el Service Worker no funcionan abriendo el archivo con `file://`).

```bash
# En la carpeta del proyecto, cualquiera de estas opciones:
python3 -m http.server 8080
# o
npx serve .
```

Abre `http://localhost:8080`. `localhost` cuenta como contexto seguro, así que la cámara funciona.
Para probar en el celular, publica el proyecto (por ejemplo en **GitHub Pages**) y ábrelo desde la URL `https://...`.

## Librería para QR
[html5-qrcode](https://github.com/mebjas/html5-qrcode) v2.3.8 (cargada desde unpkg y guardada en caché por el Service Worker).

## Cómo instalar la PWA
- **Android / Chrome / Edge (PC):** botón “Instalar aplicación” en la pestaña *Acerca de*, o el ícono de instalar en la barra de direcciones.
- **iPhone (Safari):** Compartir → *Agregar a pantalla de inicio*.

## Códigos QR de prueba
Abre `qr.html` (con Internet) para ver, imprimir o descargar los QR: 1, 4, 7, 25, 39, 52, 94, 133, 150 y 151.
Puedes agregar cualquier otro ID entre 1 y 151. Si no tienes cámara, la pantalla del escáner permite escribir el contenido a mano (por ejemplo `pokemon:25`).

## Estructura
```
index.html
manifest.json
service-worker.js
qr.html
js/app.js
icons/  (icon-192, icon-512, icon-maskable-512, apple-touch-icon)
```

## Notas
- La colección se guarda en `localStorage` (clave `pokemonCapturados`); al borrar los datos del navegador se pierde.
- Sin conexión la interfaz abre y muestra lo ya capturado; capturar uno nuevo requiere Internet (PokéAPI).
- Si cambias archivos, sube `VERSION` en `service-worker.js` para que los dispositivos actualicen la caché.

