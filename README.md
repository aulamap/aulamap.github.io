# AulaMap · Plano de clase

Aplicación web para dibujar el plano de un aula y repartir en él al alumnado.
Hecha para el día a día del profesorado: montar la distribución de mesas,
sentar a cada alumno en su sitio e imprimir el plano para tenerlo delante en
clase.

**Se usa aquí: [aulamap.github.io](https://aulamap.github.io)**

No hay que instalar nada ni crear ninguna cuenta.

## Qué hace

- **El aula.** Mesas individuales, dobles, «cara a cara», grupos de 3, 4, 5 y 6 (los de 4 y 6, con dos formas), y
  mobiliario: pizarra, mesa del docente, pantalla o proyector, puerta, ventana,
  tablón de anuncios, armario, estantería, mesa auxiliar, ordenador, pica,
  columna, papelera, planta y textos libres. Las
  medidas van en centímetros reales y el tamaño del aula se cambia arrastrando
  sus paredes.
- **El alumnado.** Se pega la lista de nombres, se reparte al azar o se arrastra
  cada uno a su mesa. En el recuadro «Vista», sobre el plano, se elige qué
  parte del nombre se ve, si se dibuja a cada alumno en su silla y si se
  muestran los equipos y la tipología.
- **Equipos.** Se forman con el mismo motor que
  [GeCo](https://github.com/jjdeharo/geco): al azar, heterogéneos u homogéneos
  según la tipología de cada alumno (A, B o C), con alumnado que no debe
  coincidir y con sobrantes repartidos o en un equipo aparte. Cada equipo se
  sienta junto en las mesas tal como están y se ve en el plano con su color y
  su número, o se monta el aula con una mesa por equipo. Los equipos también
  se pueden hacer a mano. Un archivo exportado desde GeCo se importa
  directamente.
- **Varias clases** en la misma aplicación, cada una con su plano y su lista.
- **Ordenar.** Alinear, igualar el espacio entre mesas y centrar la selección en
  el aula, para que las filas queden cuadradas.
- **Girar el aula entera**, con todo lo que hay dentro, para verla desde donde
  te convenga.
- **Imprimir** en A4 apaisado, con el título, la fecha y, si se quiere, la lista
  de quien se ha quedado sin sitio.
- **Español, catalán, gallego, euskera, portugués, francés, alemán e inglés**,
  con el idioma del navegador detectado solo, y apariencia clara u oscura.

## Cómo se usa

1. **Monta el aula.** En la pestaña *Aula*, pon las medidas reales en el recuadro
   «Aula» que hay sobre el plano y pincha en las mesas y el mobiliario que
   necesites. Para una fila entera de golpe, usa «Bloque de mesas…».
2. **Colócalo todo.** Arrastra cada elemento; con el botón derecho puedes
   duplicarlo, girarlo, agruparlo o alinearlo con los demás. Para cambiar el
   tamaño del aula, arrastra una pared. Los dos botones del recuadro «Aula»
   giran el plano entero un cuarto de vuelta a un lado o al otro.
3. **Añade al alumnado.** En la pestaña *Alumnado*, pega la lista con un nombre
   por línea. Valen tanto «Nombre Apellidos» como «Apellidos, Nombre» (esta
   segunda forma es la buena si hay nombres compuestos, como «Fernández
   Villaverde, María del Carmen»).
4. **Siéntalos.** «Repartir al azar» sienta a quien no tiene sitio, o arrastra
   cada nombre a la mesa que quieras. De una mesa a otra, se cambian de sitio.
5. **Por equipos, si se quiere.** En la pestaña *Equipos (opcional)*, elige
   cuántos alumnos por equipo y de qué tipo. Con equipos heterogéneos u
   homogéneos aparece junto a cada nombre un selector A · B · C para marcar
   cómo trabaja cada alumno (sin marca cuenta como B). «Formar equipos» los crea y los sienta juntos. También se
   pueden hacer a mano con el desplegable que hay junto a cada nombre
   («Nuevo» crea el siguiente equipo), o cambiar a alguien de equipo después.
   «Sentar por equipos» vuelve a colocarlos con las mesas tal como están, y
   «Montar el aula para los equipos» cambia las mesas por una por equipo, de
   cara a la pizarra, sin tocar el resto del mobiliario. Esas mesas siguen a
   su equipo: si entra o sale alguien, cambian de tipo (de 6 a 5, de 4 a 3…)
   y, si el equipo se queda vacío, desaparecen. Los grupos de 4 y de 6 tienen
   dos formas: en «Formas de mesa para los equipos…» (pestaña Equipos) se elige cuál se usa al
   montar el aula, y cualquier mesa se cambia después a la otra desde sus
   propiedades o con el botón derecho, que también permite separarla en mesas
   sueltas para recolocar cada puesto a mano. Al imprimir
   se puede añadir la lista de equipos.
6. **Imprime.** El botón «Imprimir» deja elegir el título, si la pizarra se ve
   arriba o abajo, y si se añade la fecha.

Abajo a la izquierda del plano tienes siempre a la vista cuántos puestos hay,
cuántos están ocupados y cuántos quedan libres.

## Guardar y compartir

- **Se guarda solo** en el navegador según trabajas. Al volver a abrir la
  página está todo como lo dejaste.
- **Exportar / Importar** guarda todas las clases en un archivo `.json` y las
  recupera en otro ordenador o en otro navegador.
- **Compartir** crea un enlace que lleva dentro las clases que marques, con la
  opción de enviar **solo el plano, sin el alumnado**. Quien lo abre decide si
  añadirlas a las suyas; nunca sustituyen a lo que ya tiene.

> Si compartes un plano **con los nombres**, esos nombres viajan por donde envíes
> el enlace o el archivo (correo, mensajería…), igual que cualquier otro
> documento con datos del alumnado. Para pasarle la distribución del aula a otra
> persona no hacen falta: marca «Solo el plano, sin el alumnado».

## Privacidad

**Nada sale del navegador.** No hay servidor, ni cuentas, ni base de datos, ni
seguimiento: los planos y las listas se guardan en el almacenamiento local del
propio navegador. Al compartir por enlace, los datos viajan **detrás de la
almohadilla** (`#`) de la dirección, que es la parte que los navegadores no
envían al servidor, así que tampoco pasan por GitHub.

Como todo está en el navegador, borrar los datos de navegación borra también los
planos. Si te importan, expórtalos a un archivo de vez en cuando.

## Atajos de teclado

| Atajo | Qué hace |
|---|---|
| `Ctrl + A` | Seleccionar todo |
| `Ctrl + D` | Duplicar |
| `Ctrl + G` / `Ctrl + Mayús + G` | Agrupar / desagrupar |
| `Ctrl + Z` / `Ctrl + Y` | Deshacer / rehacer |
| `R` / `Mayús + R` | Girar 15° a la derecha / a la izquierda |
| Flechas | Mover 5 cm (con `Mayús`, 1 cm) |
| `Supr` | Eliminar |
| `Esc` | Quitar la selección |
| `Ctrl` + rueda | Acercar y alejar |

## Para trastear con el código

Son archivos estáticos: no hay que compilar nada ni instalar dependencias.

```bash
git clone https://github.com/aulamap/aulamap.github.io.git
cd aulamap.github.io
python3 -m http.server 8000     # y abrir http://localhost:8000
```

También funciona abriendo `index.html` directamente desde el disco.

| Archivo | Qué contiene |
|---|---|
| `index.html` | La página y sus diálogos |
| `app.js` | Todo el editor: plano, alumnado, impresión y compartir |
| `style.css` | Estilos y colores (el tema claro y el oscuro son variables CSS) |
| `i18n.js` | Traducción y detección del idioma |
| `theme.js` | Apariencia clara, oscura o la del sistema |
| `locales/` | Los textos de cada idioma |

**Para traducirlo a otro idioma**, copia `locales/es.js` con el código del idioma
(`it.js`, `nl.js`…), traduce solo los valores, añádelo en `index.html` junto a
los demás y súmalo a la lista del selector de idioma. El resto funciona solo.

## Licencia

- Código: [AGPL v3](https://www.gnu.org/licenses/agpl-3.0.html)
- Contenidos: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es)

© 2026 [Juan José de Haro](https://bilateria.org)
