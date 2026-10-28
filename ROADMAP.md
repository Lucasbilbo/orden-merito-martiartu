# Roadmap

## Hecho (v2, 29/10/2026)
Clasificación con puntos por torneo y desempate, páginas de torneo, panel admin (temporadas, torneos, resultados pegados o a mano, jugadores, reglas), modo demo, pruebas.

## Pendiente de la v1
- Dos nombres del PDF de la final 2026 sin emparejar (Aitor Prieto Busnadiego, Javier Marquina Sagarduy): ahora se pueden crear o asignar desde *Resultados* de esa final.
- Logo de la torre (`omtorre.png`) en la cabecera: falta el archivo.
- Tres incidencias antiguas de datos (feb-2025 resultado sin jugador; oct-2022 Scratch sin puesto; oct-2023 fila duplicada).

## Fase 2 — Inscripciones (especificación)

### Objetivo
Que los jugadores se apunten a cada torneo desde el móvil en lugar del grupo de WhatsApp, y que el admin tenga la lista y los horarios.

### Usuarios
- **Invitado:** se apunta con nombre, apellidos, correo y hándicap, sin cuenta. Recibe un enlace por correo para anular.
- **Jugador registrado:** cuenta con enlace mágico (Supabase Auth). Se le vincula a su ficha de `players` (el admin confirma la primera vez para evitar suplantaciones). Ve sus inscripciones y su historial.
- **Admin:** abre y cierra inscripciones, ve la lista, la exporta para el campo y publica horarios.

### Modelo
```
tournaments  + signup_opens_at, signup_closes_at, max_players (null = sin límite), notes
signups      (id, tournament_id, player_id null, guest_name, guest_email, hcp, status: inscrito|reserva|anulado,
              created_at, cancel_token)
tee_times    (tournament_id, slot_time, hole, player_ids int[])   -- o columna tee_time en signups
player_accounts (user_id uuid -> auth.users, player_id, confirmed_by_admin bool)
```
RLS: el público ve cuántos inscritos hay y los nombres (como la clasificación); cada usuario solo crea/anula lo suyo; el admin todo. Inserción de invitados mediante una función RPC con límite de frecuencia y captcha (Turnstile) para evitar spam.

### Pantallas
- Torneo: botón **Apuntarme** mientras esté abierto; lista de inscritos; lista de reserva si hay cupo.
- Admin: inscritos del torneo (pasarlos a resultados con un clic, ya emparejados), exportar CSV para el campo, editor de horarios.
- Aviso de horarios: correo a los inscritos al publicar (Supabase Edge Function + Resend, plan gratuito) y, más adelante, WhatsApp vía Blip/Meta con plantilla aprobada.

### Fuera
Pago (lo dijiste). Gestión del hándicap oficial: la RFEG no tiene API pública, se sigue metiendo a mano.

## Importar resultados desde PDF — HECHO (29/10)
Funciona con el formato de Uraburu y Abra del Pas. Pendiente:
- Probar PDF de otros campos (Izki, Meaztegi, Zuia, La Nivelle, Llanes, Rioja Alta, Villarías). Si alguno tiene otro formato, añadirlo a `src/lib/pdfResults.js` con su prueba.
- Plan B si un PDF es una imagen escaneada: Netlify Function que lo pasa a Claude y devuelve las filas en el mismo formato, siempre revisadas en la tabla antes de guardar.

## Ideas sueltas
- Ficha de jugador (`/jugador/:id`) con su historial por temporadas.
- Dominio propio (p. ej. orden.clubmartiartu.com).
- Varios administradores (añadir correos a la tabla `admins`).
- Copia de seguridad semanal de la base (exportación programada).
