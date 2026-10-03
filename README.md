# El Botín Express

Tienda demo de armas, modificaciones y planos de ARC Raiders con entrega por cita en Discord.
React + Vite, Supabase (Auth, Postgres, Storage, Edge Functions), Tailwind CSS, TanStack Query y react-i18next.

> Proyecto de aprendizaje. No se venden objetos reales: los ToS de Embark prohíben el comercio con dinero real.

## Base de datos compartida

El proyecto usa un proyecto de Supabase en la nube que comparten otras apps (tablas `SP_`, `store_`, `zap_`, `RU_`).
Por eso **todo lo de ARC lleva prefijo**: tablas `"ARC_..."` (con comillas en SQL), tipos y funciones `arc_...`
y el bucket `arc-product-images`. No crees ni modifiques objetos de las otras apps.

Los usuarios de Auth se comparten entre apps. ARC no añade triggers a `auth.users`: el perfil
(`ARC_profiles`) se crea la primera vez que el usuario entra en la tienda, con la RPC `arc_ensure_profile()`.

## Arranque

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (Project Settings → API)
npm run dev                  # http://localhost:5173
```

Las migraciones de `supabase/migrations/` y `supabase/seed.sql` ya están aplicadas en el proyecto.
Para nuevas migraciones: `npx supabase migration new arc_nombre`, revisa que todo lleve prefijo y aplícala
desde el SQL Editor del dashboard (o con `npx supabase db push` tras `npx supabase link`).

### Hacerte admin

Entra en la web con tu cuenta y ejecuta en el SQL Editor:

```sql
update public."ARC_profiles" set role = admin where username = tu_usuario;
```

### Pendiente en la configuración de Auth (compartida)

- **Registro de usuarios nuevos:** la función `handle_new_user` de la app "store" cancela cualquier alta que no traiga
  `nombre_tienda` o `codigo_invitacion`. Hasta que se ajuste, en ARC solo pueden entrar usuarios que ya existen.
- **URLs de redirección:** la Site URL es la de otra app y la lista de redirecciones está vacía. Hay que añadir
  `http://localhost:5173/**` en Authentication → URL Configuration para que los emails y el login con Discord vuelvan a ARC.
- **Login con Discord:** crear la app en https://discord.com/developers/applications y activarlo en
  Authentication → Providers → Discord.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción en `dist/` |
| `npm run lint` | Linter (oxlint) |
| `npx supabase migration new nombre` | Nueva migración SQL |

## Estructura

```
supabase/
  migrations/        SQL versionado (prefijo ARC_/arc_): enums, perfiles + roles, catálogo + RLS + storage
  seed.sql           13 armas, 8 mods, 9 planos y 1 pack de ejemplo
src/
  app/               router, App con providers, layouts (público, cuenta, admin)
  components/        UI base y guardas de rutas
  features/          auth, catalog, cart, settings
  pages/             una página por ruta
  locales/{es,en}/   traducciones por namespace
  lib/               cliente Supabase, i18n, formato de precios
```

## Edge Functions

| Función | Qué hace |
| --- | --- |
| `create-order` | Verifica el usuario, valida el pedido y llama a `arc_create_order` (precio, stock y cita en una transacción). Avisa en Discord si existe el secreto `ARC_DISCORD_WEBHOOK_URL`. |

```bash
# Desplegar (no necesita Docker)
SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy create-order --project-ref evplimhbpveiphqwlggt --use-api

# Secretos opcionales
npx supabase secrets set --project-ref evplimhbpveiphqwlggt   ARC_DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...   ARC_ALLOWED_ORIGINS=http://localhost:5173,https://tu-dominio.com
```

## Estado

**Fase 1 (MVP), en curso.**

Hecho:
- Catálogo con filtros, detalle con selector de mods, carrito.
- Registro, login (email y Discord), recuperar contraseña, perfil e i18n ES/EN.
- Checkout en dos pasos: datos del jugador y reserva de día y hora en los huecos libres.
- Ticket de cita (`/cita/:code`): código, sala, admin, productos, QR, añadir al calendario y cancelar.
- Mi cuenta: pedidos y citas.
- Admin: agenda con acciones (registrar pago, iniciar entrega, entregado, no presentado, cancelar),
  salas de Discord y disponibilidad (horario semanal y días bloqueados).
- Admin de productos (`/admin/armas`, `/planos`, `/mods`, `/packs`): crear, editar, ocultar y borrar, con textos ES/EN,
  estadísticas, mods compatibles, contenido de packs e imágenes en Storage. Se guarda con la RPC `arc_admin_save_product`.
- Páginas de confianza: cómo funciona, FAQ, términos, reembolsos, privacidad y contacto (ES/EN, namespace `legal`).
  El email de contacto se configura en `ARC_settings.contact_email`.

Pendiente: configurar Discord (servidor, salas, login), desplegar el frontend, reprogramar cita (v1).
