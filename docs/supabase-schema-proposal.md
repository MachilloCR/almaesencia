# Propuesta de modelo de datos de Supabase

> Estado: propuesta para revisión. No se ha aplicado ninguna migración ni se ha conectado el proyecto a una instancia de Supabase.

## Objetivo

Este modelo soporta el flujo de **solicitud de pedido** de Alma Esencia CR:

1. El cliente explora productos y envía una solicitud sin crear una cuenta.
2. El sistema conserva esa solicitud y sus líneas de producto.
3. La propietaria confirma disponibilidad, coordina abastecimiento, entrega y pago.
4. WhatsApp se usa solo como enlace de comunicación desde el pedido administrativo.

El diseño conserva precios y datos de producto como instantáneas dentro de cada pedido, para que las solicitudes históricas no cambien cuando se edite el catálogo.

---

## Estados independientes propuestos

Los procesos de revisión, abastecimiento, entrega y pago no siempre ocurren en el mismo orden. Por eso se almacenan como columnas independientes en `orders`, no como una cadena única.

| Dimensión | Valores | Valor inicial |
| --- | --- | --- |
| Pedido | `pending_review`, `confirmed`, `cancelled`, `completed` | `pending_review` |
| Abastecimiento | `not_required`, `pending_supplier`, `ordered`, `received` | `not_required` |
| Entrega | `pending`, `ready`, `delivered` | `pending` |
| Pago | `pending`, `partial`, `paid` | `pending` |

Regla de integridad: un pedido solo puede tener `order_status = completed` si `fulfillment_status = delivered` y `payment_status = paid`.

`partial` se conserva para anticipos, pero la interfaz solo debe mostrarlo si el negocio decide utilizar anticipos.

---

## Tipos PostgreSQL propuestos

Crear tipos explícitos evita valores inconsistentes en la base de datos:

- `product_availability_status`: `in_stock`, `on_order`, `out_of_stock`, `inactive`.
- `order_status`: `pending_review`, `confirmed`, `cancelled`, `completed`.
- `procurement_status`: `not_required`, `pending_supplier`, `ordered`, `received`.
- `fulfillment_status`: `pending`, `ready`, `delivered`.
- `payment_status`: `pending`, `partial`, `paid`.
- `payment_method`: `cash`, `sinpe_movil`, `bank_transfer`, `other`.

---

## Tablas propuestas

### `categories`

Representa las categorías públicas del catálogo.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` | PK, generado por la base de datos. |
| `name` | `text` | Nombre visible. |
| `slug` | `text` | Único; usado en URLs. |
| `description` | `text` | Opcional. |
| `image_path` | `text` | Referencia opcional a Storage. |
| `is_active` | `boolean` | Oculta la categoría sin eliminarla. |
| `created_at`, `updated_at` | `timestamptz` | Auditoría básica. |

### `products`

Representa el catálogo. No almacena binarios de imagen.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` | PK. |
| `category_id` | `uuid` | FK a `categories`; obligatorio. |
| `name` | `text` | Nombre público. |
| `slug` | `text` | Único; usado en URLs. |
| `description` | `text` | Opcional. |
| `price` | `numeric(12,2)` | Precio actual de catálogo. |
| `currency` | `char(3)` | Valor inicial recomendado: `CRC`. |
| `availability_status` | `product_availability_status` | Estado público. |
| `is_active` | `boolean` | Controla la publicación. |
| `created_at`, `updated_at` | `timestamptz` | Auditoría básica. |

Restricciones propuestas: `price >= 0`, `slug` único y una categoría válida.

### `product_images`

Mantiene múltiples imágenes ordenadas por producto.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` | PK. |
| `product_id` | `uuid` | FK a `products`. |
| `storage_path` | `text` | Ruta dentro del bucket. |
| `alt_text` | `text` | Obligatorio para una imagen significativa. |
| `sort_order` | `integer` | Orden de galería, no negativo. |
| `created_at` | `timestamptz` | Auditoría. |

### `inventory`

Registra el inventario físico actual con una fila por producto. No es aún un sistema de movimientos avanzado.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `product_id` | `uuid` | PK y FK a `products`. |
| `quantity` | `integer` | Cantidad física, siempre `>= 0`. |
| `updated_at` | `timestamptz` | Último ajuste. |
| `updated_by` | `uuid` | Referencia opcional al administrador que ajustó. |

No se descuenta inventario al crear una solicitud. La política de reserva/ajuste al confirmar un pedido sigue pendiente de decisión.

### `orders`

Representa una solicitud persistente, sin requerir cuenta de cliente.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` | PK interna. |
| `order_number` | `text` | Código público único, por ejemplo `AE-000001`. |
| `customer_name` | `text` | Dato de contacto mínimo. |
| `customer_phone` | `text` | Se conserva como texto para no alterar el formato. |
| `delivery_notes` | `text` | Opcional; no guardar dirección detallada hasta definir entrega. |
| `estimated_total` | `numeric(12,2)` | Total calculado al crear la solicitud. |
| `currency` | `char(3)` | Valor inicial recomendado: `CRC`. |
| `order_status` | `order_status` | Estado general. |
| `procurement_status` | `procurement_status` | Estado de productos por proveedor. |
| `fulfillment_status` | `fulfillment_status` | Estado de entrega/retiro. |
| `payment_status` | `payment_status` | Estado de pago registrado. |
| `payment_method` | `payment_method` | Nulo hasta registrar un pago. |
| `payment_notes` | `text` | Nota opcional de administración. |
| `admin_notes` | `text` | No visible al cliente. |
| `requested_at` | `timestamptz` | Fecha de creación de la solicitud. |
| `confirmed_at`, `delivered_at`, `paid_at`, `completed_at` | `timestamptz` | Marcas de tiempo opcionales. |
| `created_at`, `updated_at` | `timestamptz` | Auditoría. |

La capa de servicio debe recalcular el total a partir de `order_items`; la base de datos puede verificar que el total no sea negativo. El precio es estimado hasta la confirmación administrativa.

### `order_items`

Almacena las líneas solicitadas y la instantánea histórica del producto.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` | PK. |
| `order_id` | `uuid` | FK a `orders`, con borrado en cascada. |
| `product_id` | `uuid` | FK opcional a `products`; permite conservar historia si un producto se retira. |
| `product_name_snapshot` | `text` | Nombre al momento de solicitar. |
| `product_slug_snapshot` | `text` | Opcional, para referencia histórica. |
| `unit_price_snapshot` | `numeric(12,2)` | Precio estimado unitario al solicitar. |
| `quantity` | `integer` | Debe ser mayor que cero. |
| `options_snapshot` | `jsonb` | Variantes/opciones futuras, por defecto `{}`. |
| `availability_snapshot` | `product_availability_status` | Disponibilidad observada al solicitar. |
| `created_at` | `timestamptz` | Auditoría. |

No se implementa todavía una tabla de variantes; `options_snapshot` evita perder la selección de un cliente cuando las variantes se introduzcan posteriormente.

### `order_status_history`

Registra cambios de estado relevantes para trazabilidad administrativa.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | `uuid` | PK. |
| `order_id` | `uuid` | FK a `orders`, con borrado en cascada. |
| `status_type` | `text` | Uno de: `order`, `procurement`, `fulfillment`, `payment`. |
| `previous_value` | `text` | Estado anterior. |
| `next_value` | `text` | Estado nuevo. |
| `note` | `text` | Motivo o nota opcional. |
| `changed_by` | `uuid` | Administrador autenticado; nulo para creación pública. |
| `created_at` | `timestamptz` | Auditoría. |

Esta tabla es pequeña, aporta historial de pedidos y evita implementar analítica avanzada prematuramente.

---

## Autenticación, RLS y Storage

### Administradores

La propuesta inicial usa Supabase Auth para administradores y una tabla `profiles` mínima:

- `id uuid primary key references auth.users(id)`.
- `role text not null default 'admin'` con un `check` limitado a los roles que se definan.
- `created_at timestamptz`.

En la primera versión se crea un único perfil administrador. La tabla permite crecer a varios administradores sin implementar la interfaz de gestión de usuarios todavía.

### Políticas RLS propuestas

- Catálogo público: solo lectura de categorías activas, productos activos y sus imágenes públicas.
- Administración: lectura/escritura de catálogo, inventario, pedidos e historial solo para perfiles administradores.
- Pedidos: ningún listado público de pedidos, teléfonos ni notas administrativas.
- Creación de solicitud pública: una función PostgreSQL/RPC controlada, llamada desde una acción SSR tras validación con Zod. La función inserta pedido y líneas de forma atómica; no se concede inserción abierta sobre todas las columnas de `orders`.
- Los componentes React nunca hacen consultas administrativas directas a Supabase.

### Storage

Crear el bucket `product-images`:

- Lectura pública para imágenes de productos activos.
- Subida, actualización y borrado solo para administradores.
- Rutas sugeridas: `products/{product-id}/{image-id}.{extension}`.

---

## Migraciones propuestas

No aplicar estas migraciones hasta aprobar este documento.

1. `0001_catalog_and_inventory.sql`
   - Extensión `pgcrypto` para UUIDs.
   - Tipos de disponibilidad.
   - Tablas `categories`, `products`, `product_images`, `inventory`.
   - Índices, restricciones, trigger reutilizable de `updated_at` y bucket de imágenes.

2. `0002_orders.sql`
   - Tipos de estados de pedido.
   - Tablas `profiles`, `orders`, `order_items`, `order_status_history`.
   - Índices para número de pedido, fecha, estados y teléfono.
   - Restricción de pedido completado y generación segura de `order_number`.

3. `0003_rls_and_order_request.sql`
   - Activación de RLS en todas las tablas expuestas.
   - Políticas públicas de catálogo y políticas administrativas.
   - Políticas del bucket `product-images`.
   - Función transaccional `create_order_request` con validaciones de base de datos.

Las migraciones serán aditivas; no se elimina ninguna tabla ni dato existente.

---

## Decisiones que requieren confirmación

Antes de escribir las migraciones SQL definitivas, confirmar:

1. **Entrega:** ¿la primera versión necesita distinguir `retiro`, `envío` y `coordinación posterior`, o basta con una nota libre?
2. **Reserva de inventario:** al confirmar, ¿se descuenta inmediatamente la existencia física o se reserva una cantidad separada?
3. **Anticipos:** ¿se usará el estado `partial` desde el lanzamiento o se ocultará hasta necesitarlo?
4. **Número de pedido:** se propone `AE-000001`; confirmar si el prefijo `AE` es adecuado.
5. **Contacto del cliente:** se propone nombre, teléfono y nota de entrega opcional; confirmar si se necesita correo electrónico en esta primera versión.

Una vez aprobadas estas decisiones, la siguiente fase será instalar el cliente de Supabase, crear las tres migraciones y configurar la capa de servicios, sin construir aún la interfaz completa del catálogo.
