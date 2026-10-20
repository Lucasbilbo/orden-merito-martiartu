# Orden de Mérito Martiartu

Web pública con las clasificaciones y resultados de la Orden de Mérito del Club Deportivo Martiartu.

- Front: React + Vite. Publicación en Netlify (`npm run build`, carpeta `dist`).
- Datos: Supabase (Postgres). Las clasificaciones se calculan en la base de datos con las funciones
  `annual_standings(temporada, modalidad)` y `ranking(modalidad, fecha)`.
- La clave que usa la web es la pública (anon): solo puede leer lo que permiten las políticas RLS.
  Los datos de contacto de los jugadores están en una tabla sin acceso público.

## Desarrollo

```
npm install
npm run dev
```
