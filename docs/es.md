# Miniflux

Conecte Gladys a [Miniflux](https://miniflux.app), el lector de fuentes
minimalista: siga sus artículos no leídos por categoría, reaccione cuando
llega un nuevo artículo o cuando una fuente deja de funcionar, marque
artículos como leídos desde sus escenas y vea los últimos no leídos en el
panel. La integración sigue el estado de su lector (leído / no leído, el mismo
en todos sus dispositivos), no las fuentes en sí.

Probada con un Miniflux 2.3.4 real (la imagen Docker oficial) y fuentes de
prueba. Sus comentarios son bienvenidos en el foro de Gladys.

## Requisitos previos

- Gladys Assistant 5.1 o posterior.
- Miniflux 2, autoalojado (puerto 8080 por defecto, o detrás de un proxy
  inverso) o el servicio alojado `reader.miniflux.app`, accesible desde la
  máquina de Gladys.
- Una clave de API: en Miniflux, abra **Ajustes → Claves de API** y cree una.
  La integración ve las fuentes del usuario al que pertenece la clave.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. En **Dirección de Miniflux**, introduzca la dirección del servidor, por
   ejemplo `192.168.1.50:8080` (puerto 8080 si no se indica ninguno), o una
   dirección completa como `https://rss.example.org` o
   `https://reader.miniflux.app`.
3. Pegue la **Clave de API**.
4. Opcional: **Leer Miniflux cada** (5 minutos por defecto) y **Palabras clave
   a vigilar**, separadas por comas, para el filtro de palabra clave del
   disparador «Nuevo artículo».
5. Haga clic en **Probar la conexión**: muestra el usuario, los artículos no
   leídos y las fuentes con error.
6. Abra la pestaña **Descubrimiento** y añada los dispositivos que desee.

## Dispositivos

- **Miniflux**: _Artículos no leídos_ (todas las categorías) y _Fuentes con
  error_ (fuentes que Miniflux no pudo leer en su última comprobación, salvo
  las desactivadas).
- **Un dispositivo por categoría** (propuesto para cada categoría de
  Miniflux): sus _Artículos no leídos_.

Los valores se leen cada pocos minutos (el ajuste anterior) y justo después de
cada cambio hecho desde Gladys. Se guardan en el historial, para seguir su
pila de no leídos en un gráfico.

## Widget del panel

**Miniflux**: el número de artículos no leídos (y de fuentes con error, en
rojo, si las hay), los seis últimos artículos no leídos (fuente, fecha,
resumen, enlaces al artículo y a Miniflux cuando son https), un botón
**Actualizar** con el que Miniflux obtiene las fuentes ahora, y un botón
**Marcar leído**, con confirmación, que marca como leídos los artículos
listados (solo ellos). Ajustado a un dispositivo de categoría, el widget solo
muestra y actualiza esa categoría.

## Disparadores de escena

- **Nuevo artículo**: ha llegado un artículo no leído a Miniflux. Filtros: una
  categoría (un dispositivo de categoría), una fuente (su título, exactamente
  como en Miniflux), una palabra clave (una de las palabras clave de la
  configuración, encontrada en el título, sin distinguir mayúsculas ni
  acentos). Información transmitida: título, enlace, fuente, categoría, autor,
  palabra clave encontrada, fecha de publicación e id. del artículo.
- **Fuente con error**: Miniflux ya no consigue leer una fuente que funcionaba
  hasta ahora. Filtro: una categoría. Información transmitida: fuente,
  categoría, mensaje de error, comprobaciones fallidas, dirección del sitio,
  id. de la fuente.

No se dispara nada en la primera lectura tras instalar la integración, ni para
los artículos ya presentes cuando se añade una fuente, ni para los artículos
ya leídos en otro dispositivo. Como máximo se anuncian 10 artículos por
lectura.

## Acciones de escena

- **Marcar una categoría de Miniflux como leída**: todos los artículos no
  leídos de una categoría; elija el dispositivo Miniflux para marcarlo todo.
  Resultados: artículos marcados, categoría.
- **Marcar artículos de Miniflux como leídos**: uno o varios ids. de artículo,
  normalmente el id. del artículo del disparador «Nuevo artículo». Resultado:
  artículos marcados.
- **Actualizar las fuentes de Miniflux**: Miniflux obtiene ahora todas las
  fuentes (o las de una categoría), cuatro a la vez; los nuevos artículos se
  leen después. Resultado: fuentes actualizadas.
- **Leer los títulos no leídos de Miniflux**: los artículos no leídos más
  recientes (de 1 a 10), de todas las categorías o de una, marcados como
  leídos después si lo desea. Resultados: número leído, artículos no leídos en
  total, títulos uno por línea («Título — Fuente»), título, enlace y fuente
  del más reciente.

## Ejemplos de escenas

- **Resumen de la mañana**: a las 7:30, _Leer los títulos no leídos de
  Miniflux_ (categoría Noticias, 5 artículos, después marcarlos como leídos),
  luego enviar un mensaje de Telegram con su resultado _Títulos_ (insértelo
  con el selector de variables).
- **Vigilar un tema**: con `Gladys` en las palabras clave, _Nuevo artículo_
  con la palabra clave `Gladys` → enviar un mensaje con el _Título_ y el
  _Enlace_ del artículo, luego _Marcar artículos de Miniflux como leídos_ con
  su _Id. del artículo_.
- **Fuente rota**: _Fuente con error_ → enviar un mensaje con la _Fuente_ y el
  _Mensaje de error_.

## Solución de problemas

- **«Miniflux rechazó la clave de API»**: la clave se eliminó o se copió mal:
  cree una nueva en Ajustes → Claves de API.
- **«Miniflux no responde»**: compruebe la dirección y el puerto desde la
  máquina de Gladys. Detrás de un proxy inverso, introduzca la dirección
  completa, ruta incluida.
- **«Esta dirección no responde como Miniflux»**: la dirección lleva a otro
  servicio, o a una página de inicio de sesión (un proxy de autenticación
  delante de Miniflux debe dejar pasar `/v1/` con la cabecera
  `X-Auth-Token`).
- **Ningún evento «Nuevo artículo»**: los artículos llegan cuando Miniflux
  comprueba las fuentes (cada 60 minutos por defecto por su parte), y luego en
  la siguiente lectura de la integración. _Actualizar las fuentes de
  Miniflux_ lo acelera.
- Más detalles: ponga la variable `LOG_LEVEL` de la integración en `debug`.

## Limitaciones

- Los filtros de los disparadores solo comparan valores exactos: el filtro de
  fuente es el título exacto, el de palabra clave una de las palabras clave
  configuradas.
- Los favoritos, el historial de lectura y las fuentes en sí no se gestionan
  desde Gladys.
- Los enlaces del widget solo abren direcciones https: un artículo o un
  Miniflux en http simple no tiene enlace.
- Sin relación con Miniflux.
