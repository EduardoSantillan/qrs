# QR de muebles compartido

Esta app genera un QR por cada mueble y puede guardar la información en Supabase para que varios dispositivos compartan el mismo inventario.

## Requisitos

- Un proyecto de Supabase
- Una tabla llamada `furniture`
- Un anon key público

## Esquema recomendado de la tabla `furniture`

```sql
create table public.furniture (
  id text primary key,
  name text not null,
  type text not null,
  location text not null,
  status text not null,
  notes text default '',
  created_at timestamptz default now()
);
```

## Configuración

1. Abre `config.js`.
2. Cambia los valores de `supabaseUrl` y `supabaseAnonKey`.
3. Si quieres que la app siga funcionando sin Supabase, deja `localFallback: true`.

## Lanzar localmente

```bash
cd D:\EduardoSan\Qrs
py -3 -m http.server 8000
```

Luego abre:

```text
http://localhost:8000
```

## Deploy en Vercel

1. Sube esta carpeta a un proyecto de Vercel.
2. Asegúrate de que `config.js` se sirva junto con la app.
3. Configura la URL y la anon key del proyecto en `config.js`.

## Nota

Si no configuras Supabase, la app usará `localStorage` como respaldo local.
