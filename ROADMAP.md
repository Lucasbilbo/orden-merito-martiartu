# Roadmap

## Hecho (v2, 29/10/2026)
Inscripciones a torneos e importación de PDF (ver abajo).
Clasificación con puntos por torneo y desempate, páginas de torneo, panel admin (temporadas, torneos, resultados pegados o a mano, jugadores, reglas), modo demo, pruebas.

## Pendiente de la v1
- Dos nombres del PDF de la final 2026 sin emparejar (Aitor Prieto Busnadiego, Javier Marquina Sagarduy): ahora se pueden crear o asignar desde *Resultados* de esa final.
- Logo de la torre (`omtorre.png`) en la cabecera: falta el archivo.
- Tres incidencias antiguas de datos (feb-2025 resultado sin jugador; oct-2022 Scratch sin puesto; oct-2023 fila duplicada).

## Inscripciones — HECHO (29/10)
Apuntarse sin cuenta, plazas y reserva, enlace para anular, panel admin con CSV, horarios automáticos y textos para WhatsApp. Pendiente:
- **Avisos automáticos:** correo al publicar horarios o al subir de reserva (Supabase Edge Function + Resend; necesita cuenta de Resend y, mejor, un dominio propio). Más adelante, WhatsApp con plantilla aprobada vía Blip/Meta.
- **Cuentas de jugador** (enlace mágico) para ver su historial e inscribirse sin rellenar datos. Requiere el mismo servicio de correo.
- **Captcha** (Cloudflare Turnstile) si aparece spam.
- **Pasar inscritos a resultados:** que la tabla de resultados salga ya con los inscritos emparejados.
- **Pago:** fuera de alcance por ahora.

## Importar resultados desde PDF — HECHO (29/10)
Funciona con el formato de Uraburu y Abra del Pas. Pendiente:
- Probar PDF de otros campos (Izki, Meaztegi, Zuia, La Nivelle, Llanes, Rioja Alta, Villarías). Si alguno tiene otro formato, añadirlo a `src/lib/pdfResults.js` con su prueba.
- Plan B si un PDF es una imagen escaneada: Netlify Function que lo pasa a Claude y devuelve las filas en el mismo formato, siempre revisadas en la tabla antes de guardar.

## Ideas sueltas
- Ficha de jugador (`/jugador/:id`) con su historial por temporadas.
- Dominio propio (p. ej. orden.clubmartiartu.com).
- Varios administradores (añadir correos a la tabla `admins`).
- Copia de seguridad semanal de la base (exportación programada).
