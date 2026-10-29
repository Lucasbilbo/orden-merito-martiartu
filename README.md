# Orden de Mérito Martiartu

Web de la Orden de Mérito del Club Deportivo Martiartu: clasificaciones públicas y panel para que el administrador meta los resultados.

- **Web:** https://orden-merito-martiartu.netlify.app
- **Demo con datos inventados:** https://orden-merito-martiartu.netlify.app/?demo=1 (incluye el panel admin sin contraseña; los cambios se guardan solo en tu navegador; `?demo=0` para salir)
- **Stack:** React + Vite (JS), Supabase (Postgres + Auth), Netlify (despliegue automático desde `main`).

## Puesta en marcha (una sola vez)

1. **Supabase activo.** El plan gratuito pausa los proyectos tras 7 días sin uso; la función `keepalive` de Netlify lo consulta a diario para evitarlo. Si aun así se pausara, Supabase > proyecto > *Restore project*.
2. **Migraciones:** 0001, 0002 y 0003 ya están aplicadas (29/10/2026). Si añades una nueva, pégala en Supabase > SQL Editor > New query > *Run*.
3. **Usuario admin** (ya creado). Supabase > Authentication > Users > *Add user* > *Create new user*, con `lucasbilbao.lucasbi@gmail.com`, una contraseña y **Auto Confirm User** marcado. Solo ese correo tiene permiso de escritura (tabla `admins`).
4. **Cerrar el registro público** (recomendado). Authentication > Sign In / Providers > Email: desactiva *Allow new users to sign up*.

Entra en `/admin` con ese correo y contraseña.

## Meter los resultados de un torneo

1. `/admin` > elige temporada > en el torneo, **Resultados**. (Si el torneo no existe: **Añadir torneo**, con fecha, campo y si es la final.)
2. **Importar PDF del campo:** sube a la vez la clasificación Handicap (Stableford) y la Scratch. Se leen nombre, puntos y hándicap exacto (HEX), y se descartan los no presentados y retirados. Si el torneo ya tenía resultados, te avisa de las diferencias.
   Alternativa: pega las filas en **Pegar resultados** y pulsa **Leer**. Vale:
   - desde Excel, con cabecera: `Jugador | Stableford | Scratch | Hcp` (cualquier orden de columnas);
   - CSV con `;`: `Iñaki Etxeberria Garai;38;30;6,1`;
   - texto copiado del PDF: `1 ETXEBERRIA GARAI, IÑAKI 38 30 6.1` (el puesto de delante se ignora).
3. Revisa la tabla: los jugadores reconocidos salen ya elegidos (aunque el PDF corte el nombre o haya erratas); los **amarillos** tienen nombres parecidos y hay que elegir. Al importar un PDF, los que no están en la base salen en **gris** como "No es de la Orden" y no se guardan; si sí son de la Orden, elige "Crear jugador nuevo". Al pegar texto, los desconocidos se proponen como nuevos.
4. **Guardar resultados.** Los puestos se calculan solos por puntos entre los jugadores de la Orden; los empatados comparten puesto, como en el sistema antiguo. Si hace falta otro orden, marca *Puestos a mano*.

Guardar de nuevo un torneo sustituye sus resultados; no duplica.

## Inscripciones

1. `/admin` > en un torneo sin jugar, **Inscripciones**. Pon cuándo se abre y se cierra (por defecto, dos días antes a las 20:00), las plazas (45 por defecto; vacío = sin límite) y la información para los jugadores (hora, green fee…). O pulsa **Abrir ahora**.
2. Comparte el enlace del torneo (`/torneo/ID`) en el grupo de WhatsApp. En la portada sale un aviso del próximo torneo con inscripción abierta.
3. Cada jugador se busca en la lista de la Orden (o se apunta como invitado), deja correo o teléfono y recibe un enlace propio para ver o anular su inscripción. Si no quedan plazas, entra en reserva; cuando alguien anula, sube el primero de la reserva.
4. En el panel ves contactos y comentarios, puedes apuntar a alguien a mano (sin contacto si hace falta), cambiar estados, **exportar CSV** para el campo y **copiar la lista** para WhatsApp.
5. **Horarios:** genéralos automáticamente (primera salida, minutos entre partidas, jugadores por partida) o escríbelos a mano; **Publicar horarios** los muestra en la web, y **Copiar horarios** te da el texto para WhatsApp.

En público solo se ven los nombres; correo, teléfono, hándicap y comentarios solo los ve el admin.

## Reglas

- **Clasificación de la temporada:** mejores N resultados (4 por defecto) + final × 2. Se cambia por temporada en `/admin` > *Reglas de AAAA*.
- **Empate a puntos:** hándicap más bajo (el de la final o, si no, el último de la temporada; si no hay, el actual del jugador).
- **Ranking histórico:** el del sistema PHP, con sus parámetros editables en `/admin/reglas`.
- El cálculo vive en la base de datos (`season_board()`, `save_tournament_results()`), con una copia en `src/lib/standings.js` para el modo demo. Si cambias una, cambia la otra (los tests comparan ambas).

## Desarrollo

```
npm install
npm run dev            # http://localhost:5173  (añade ?demo=1 para datos inventados)
npm test               # pruebas de lectura de pegados, emparejado de nombres y puestos
npm run test:db        # migraciones + comparación SQL/JS en un Postgres local (DATABASE_URL)
```

Estructura:

```
src/pages/        web pública (clasificación, ranking, torneos, página de torneo)
src/admin/        panel admin (torneos y temporadas, resultados, inscripciones, jugadores, reglas)
src/data/         real.js (Supabase), demo.js (datos inventados), api.js elige uno
src/lib/          standings.js (cálculos), paste.js (lectura de pegados), format.js
supabase/migrations/  0001, 0002 y 0003 aplicadas en Supabase
```

La clave de Supabase del código es la pública (anon): solo puede hacer lo que permiten las políticas RLS. Se puede cambiar con las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Netlify.

Ver también `DECISIONES.md` y `ROADMAP.md`.
