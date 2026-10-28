# Orden de Mérito Martiartu

Web de la Orden de Mérito del Club Deportivo Martiartu: clasificaciones públicas y panel para que el administrador meta los resultados.

- **Web:** https://orden-merito-martiartu.netlify.app
- **Demo con datos inventados:** https://orden-merito-martiartu.netlify.app/?demo=1 (incluye el panel admin sin contraseña; los cambios se guardan solo en tu navegador; `?demo=0` para salir)
- **Stack:** React + Vite (JS), Supabase (Postgres + Auth), Netlify (despliegue automático desde `main`).

## Puesta en marcha (una sola vez)

1. **Reactivar Supabase.** El proyecto gratuito `orden-merito-martiartu` se pausa tras 7 días sin uso. Supabase > proyecto > *Restore project*.
2. **Aplicar la migración.** Supabase > SQL Editor > New query: pega entero `supabase/migrations/0002_admin_temporadas_resultados.sql` y pulsa *Run*. No borra datos.
3. **Crear tu usuario admin.** Supabase > Authentication > Users > *Add user* > *Create new user*, con `lucasbilbao.lucasbi@gmail.com`, una contraseña y **Auto Confirm User** marcado. Solo ese correo tiene permiso de escritura (tabla `admins`).
4. **Cerrar el registro público** (recomendado). Authentication > Sign In / Providers > Email: desactiva *Allow new users to sign up*.

Entra en `/admin` con ese correo y contraseña.

## Meter los resultados de un torneo

1. `/admin` > elige temporada > en el torneo, **Resultados**. (Si el torneo no existe: **Añadir torneo**, con fecha, campo y si es la final.)
2. Pega las filas que te pasa el club en **Pegar resultados** y pulsa **Leer**. Vale:
   - desde Excel, con cabecera: `Jugador | Stableford | Scratch | Hcp` (cualquier orden de columnas);
   - CSV con `;`: `Iñaki Etxeberria Garai;38;30;6,1`;
   - texto copiado del PDF: `1 ETXEBERRIA GARAI, IÑAKI 38 30 6.1` (el puesto de delante se ignora).
3. Revisa la tabla: los jugadores reconocidos salen ya elegidos; los **amarillos** tienen nombres parecidos y hay que elegir; los que no existen se crean como nuevos (corrige nombre y apellidos si hace falta).
4. **Guardar resultados.** Los puestos se calculan solos (más puntos; a igualdad, hándicap más bajo). Si el club da otro orden, marca *Puestos a mano*.

Guardar de nuevo un torneo sustituye sus resultados; no duplica.

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
src/admin/        panel admin (torneos y temporadas, resultados, jugadores, reglas)
src/data/         real.js (Supabase), demo.js (datos inventados), api.js elige uno
src/lib/          standings.js (cálculos), paste.js (lectura de pegados), format.js
supabase/migrations/  0001 ya aplicada; 0002 pendiente de aplicar
```

La clave de Supabase del código es la pública (anon): solo puede hacer lo que permiten las políticas RLS. Se puede cambiar con las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Netlify.

Ver también `DECISIONES.md` y `ROADMAP.md`.
