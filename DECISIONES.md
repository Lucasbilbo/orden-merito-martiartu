# Decisiones (noche del 28 al 29/10/2026)

Decisiones tomadas sin consultar, para revisar. Cualquiera se cambia fácil.

## Contexto encontrado
- **Ya había una v1** (20/10): web pública en GitHub y Netlify sobre el proyecto Supabase `orden-merito-martiartu` con los datos reales (110 jugadores, 43 torneos, ~2.500 resultados migrados del PHP). **He construido encima** en vez de crear otro proyecto y empezar de cero: rehacerlo habría perdido la migración ya verificada.
- **El proyecto de Supabase está pausado** (plan gratuito, 7 días sin uso). No he podido reactivarlo: la herramienta me pidió tu permiso. Por eso la migración nueva está escrita y probada en un Postgres local, pero **no aplicada**. Hasta que reactives el proyecto la web real no carga datos; la demo sí.

## Datos
1. **Datos de prueba solo en modo demo** (`?demo=1`), nunca en la base real: meter 40 jugadores falsos junto a los reales los habría mezclado en la clasificación pública.
2. **Se mantiene el esquema existente** (una fila por jugador, torneo y modalidad) en vez de la tabla `resultados(stableford, scratch, …)` del encargo. Es equivalente y no obliga a migrar los datos.
3. **Temporadas = año.** Nueva tabla `seasons` con las reglas de cada año (`best_n`, `final_multiplier`). Un torneo pertenece a la temporada del año de su fecha.
4. **"Puntos" de un torneo = puntos Stableford/Scratch que da el campo**, como en el PHP y como dijiste ("los puntos los da el campo"). No hay tabla de puntos por puesto: el puesto solo se usa para el ranking histórico. La tabla del encargo quedó sin rellenar; si existe otra tabla de puntos por puesto, avísame.
5. **Cuentan los 4 mejores + la final ×2**, no los 8. Es lo que hacía el PHP y la clasificación 2026 cuadró al 100 % con esa regla. Configurable por temporada.
6. **Puesto en cada torneo calculado solo,** por puntos y solo entre jugadores de la Orden; los empatados comparten puesto. Así lo hacía el PHP (comprobado con los PDF de Uraburu y Abra del Pas). El hándicap solo desempata la clasificación de la temporada. Se puede meter a mano.
7. **Desempate de la temporada:** hándicap más bajo de la final; si no jugó la final, el último de la temporada; si no hay, el hándicap actual del jugador. Si siguen empatados, comparten puesto (T3).
8. **Hándicaps privados.** "En público solo el nombre": quito la lectura pública de `handicaps` (estaba abierta) y el hándicap actual va en `player_private`. La web muestra "desempate por hándicap" pero no el número.
9. **Ids automáticos** para jugadores y torneos nuevos, continuando los del PHP. Nombre interno con el formato antiguo (`OMNoviembre26`).

## Importar PDF (añadido la misma noche, con 4 PDF reales de Uraburu y Abra del Pas)
19. Se lee el PDF en el navegador (pdf.js), sin servidor ni IA: los dos campos usan el mismo programa de gestión y el texto es extraíble. Solo se descarga pdf.js al pulsar "Elegir PDF".
20. Del PDF se toman nombre, puntos (TOT), hándicap exacto (HEX). Los puestos del PDF no se usan: se recalculan entre los jugadores de la Orden, como hacía el PHP.
21. Modalidad por el título ("Handicap" = Stableford, "Scratch"); si no lo dice (el de Uraburu pone solo "TORNEO MARTIARTU"), por el nombre del archivo o por ser la contraria del otro PDF.
22. Jugadores del PDF que no están en la base: por defecto **no se incluyen** ("No es de la Orden"), porque el PHP no los metía (Benninghaus, Vicente Martiarena, Antolín Largo). Se pueden crear con un clic.
23. Emparejado tolerante: nombres cortados ("FCO. JAVIE"), abreviaturas, tx/ch (Birichinaga/Biritxinaga) y erratas de una letra (Laino/Laind, Vierna/Viema). Con los 4 PDF reales se reconocen solos todos los jugadores que están en la base (también con un apellido de más, como Aniel-Quiroga Trujillo); solo quedan fuera los que no son de la Orden. Comprobado contra lo guardado: Abra del Pas y el Scratch de Uraburu cuadran al 100 %.

## Seguridad
10. **Admin = correo en la tabla `admins` + correo confirmado** en Supabase Auth. Así, aunque alguien se registre con tu correo antes que tú, sin confirmar no tiene permisos. Recomiendo además cerrar el registro público.
11. **Login con correo y contraseña** (no enlace mágico) para no tener que configurar URLs de redirección.
12. La clave pública de Supabase sigue en el código como en la v1 (es pública por diseño); se puede pasar a variables de Netlify.

## Interfaz
13. **Colores:** los del club (rojo y blanco de clubmartiartu.com) que ya usaba la v1, en variables CSS en `src/styles.css`. No he puesto verde golf porque ya había identidad.
14. **Clasificación con dos vistas:** *Resumen* (lista; al tocar un jugador se ven sus puntos por torneo) para el móvil, y *Por torneo* (tabla con una columna por torneo, deslizable, con nombre y total fijos) por defecto en pantallas anchas. Resultados que no cuentan, tachados.
15. **Páginas con URL propia:** `/torneo/12`, `/ranking`, `/torneos`, y temporada/modalidad en la URL para poder compartir enlaces por WhatsApp.
16. Se mantiene el **ranking histórico** de la v1 como pestaña.
17. Enlace "Administración" discreto en el pie de la web pública.

## Despliegue
18. Subo a `main`, que Netlify publica solo. La web real seguía sin datos de todos modos por la pausa de Supabase, así que no empeora nada; mientras tanto la demo funciona.

## Hándicap limitado (confirmado por Lucas, 29/10)
24. Hasta ahora la Orden no limitaba el hándicap de juego; por eso en Uraburu 2026 los Stableford guardados de los jugadores con hándicap alto son mayores que los del PDF (el campo topó en 36). **Desde la próxima temporada se limita**, así que los puntos del PDF valen tal cual. Los resultados históricos no se tocan.

## Inscripciones (fase 2, 29/10)
25. **Sin cuentas de jugador.** Para apuntarse se elige el nombre de la lista de la Orden (o se escribe, si es invitado) y se deja correo o teléfono, que solo ve el admin. Cada inscripción tiene un enlace secreto para verla o anularla, y el navegador lo recuerda. Las cuentas con enlace por correo obligarían a montar un servicio de envío (el de Supabase gratis solo manda unos pocos correos por hora). Se pueden añadir más adelante.
26. **Avisos por WhatsApp, no por correo:** el admin copia la lista o los horarios ya formateados y los pega en el grupo. No requiere configurar nada. El envío automático (correo o WhatsApp vía Blip/Meta) queda en el ROADMAP.
27. **Plazas y reserva automáticas:** al llenarse, los nuevos van a reserva por orden de llegada; si alguien anula, sube el primero. El admin puede mover a cualquiera a mano.
28. **Cierre por defecto: dos días antes del torneo a las 20:00** (editable). Plazas por defecto: 45. Nadie puede anular por su cuenta una vez empezado el día del torneo.
29. **Evitar duplicados:** el mismo jugador de la Orden, o el mismo nombre, no puede estar dos veces activo en un torneo. Sin captcha de momento; hay un tope de 300 inscripciones por torneo y el admin puede anular cualquier fila. Si aparece spam, se añade Cloudflare Turnstile.
30. **Hándicap y comentario opcionales** en la inscripción (para el campo y para pedir partida). No sustituyen al hándicap del PDF de resultados.
31. Migraciones 0003 (inscripciones) y la que quita la obligación de contacto a las altas del admin: **aplicadas directamente en Supabase**, porque solo añaden. Probadas antes en Postgres local y después en producción dentro de una transacción deshecha.
32. **Plazas por defecto: 45** (lo normal en los torneos, dicho por Lucas). Se rellena al abrir la inscripción y se puede cambiar en cada torneo.
33. **La base no se pausa:** una función programada de Netlify (`netlify/functions/keepalive.mts`) consulta Supabase cada día a las 05:17 UTC, así el plan gratuito nunca llega a los 7 días sin actividad. Alternativa descartada: Supabase Pro (unos 25 $/mes).
