# Contexto del proyecto

## Nombre de marca

El nombre oficial e inalterable del emprendimiento y catálogo es **Alma Esencia CR**.

Úsalo exactamente así en títulos, navegación, metadatos, textos visibles y futuras piezas de marca. No lo corrijas, traduzcas, abrevies ni sustituyas por nombres de ejemplo, incluidos los utilizados en maquetas externas.

Este proyecto es un catálogo digital con gestión de solicitudes de pedido, inventario y seguimiento de pedidos para un pequeño negocio que vende joyería, productos Farmasi y velas personalizadas.

No es un ecommerce tradicional y no procesa pagos en línea. El cliente envía una solicitud; la propietaria revisa disponibilidad, acuerda condiciones y registra el avance hasta completar el pedido.

El proyecto debe mantenerse simple para un emprendimiento pequeño, pero preparado para crecer de forma ordenada.

---

# Stack tecnológico obligatorio

Usa estas tecnologías, salvo que exista una razón documentada para cambiarlas:

- Gestor de paquetes: `pnpm`.
- Framework principal: Astro con SSR.
- Interactividad de UI: React.
- Herramientas de compilación: Vite.
- Estilos: Tailwind CSS integrado mediante Vite.
- Alertas y notificaciones de UI: Sileo (`sileo`).
- Base de datos: Supabase Postgres.
- Archivos e imágenes: Supabase Storage.
- Estado compartido del cliente: Zustand.
- Validación y esquemas: Zod.
- Lenguaje: TypeScript con modo estricto habilitado.
- Control de versiones: Git y GitHub.

El despliegue inicial debe usar un plan gratuito adecuado para una aplicación pequeña. No introduzcas frameworks ni dependencias importantes sin una razón clara.

---

# Objetivos del producto

Prioriza:

1. Descubrimiento sencillo de productos.
2. Disponibilidad clara.
3. Carrito simple.
4. Creación fiable de solicitudes de pedido.
5. Seguimiento interno de cada pedido.
6. Inventario fácil de administrar.
7. Buena experiencia móvil.
8. Arquitectura mantenible y bajo coste operativo.

No implementes pagos en línea ni cuentas de cliente salvo solicitud expresa.

---

# Flujo funcional principal

```text
Cliente
  ↓
Catálogo
  ↓
Producto
  ↓
Agregar al carrito
  ↓
Revisar carrito
  ↓
Solicitar pedido
  ↓
Se crea una solicitud persistente en el sistema
  ↓
La propietaria revisa y confirma disponibilidad y condiciones
  ↓
Si se requiere, solicita productos al proveedor
  ↓
Registra recepción, entrega y pago
  ↓
Pedido completado
```

Una solicitud de pedido no es una compra finalizada ni un pago. El precio registrado inicialmente es estimado hasta que la propietaria confirme el pedido.

---

# WhatsApp

WhatsApp es un canal de comunicación entre la propietaria y el cliente, no el sistema principal de gestión de pedidos.

El sistema debe crear, guardar y mantener los pedidos independientemente de que exista una conversación de WhatsApp. Desde el detalle administrativo de un pedido se podrá generar una acción o enlace para contactar al cliente con un mensaje prellenado y el código de pedido.

No dependas de la conversación de WhatsApp para crear pedidos, actualizar estados, conservar información o calcular importes.

---

# Solicitudes de pedido

Al finalizar el carrito, la acción principal debe ser `Solicitar pedido`. Debe crear una solicitud con, como mínimo:

- Código único de pedido.
- Nombre y teléfono del cliente.
- Productos y cantidades.
- Variantes u opciones, si existen.
- Precio estimado por línea y total estimado.
- Fecha de solicitud.
- Estados de pedido, abastecimiento, entrega y pago.

Cada línea de pedido debe conservar una copia histórica del nombre del producto, precio estimado, cantidad y opciones seleccionadas. Un cambio posterior en un producto no debe alterar un pedido ya solicitado.

No crees cuentas de cliente en esta primera versión. Solicita únicamente los datos necesarios para gestionar la solicitud.

---

# Estados del pedido

No uses una única cadena de estados para pedido, abastecimiento, entrega y pago: podrían ocurrir en distinto orden. Modela estos aspectos de manera independiente.

## Estado general del pedido

- `pending_review`: solicitud creada, pendiente de revisión.
- `confirmed`: disponibilidad y condiciones confirmadas con el cliente.
- `cancelled`: solicitud cancelada.
- `completed`: pedido entregado y pagado.

## Estado de abastecimiento

- `not_required`: no hace falta pedir productos al proveedor.
- `pending_supplier`: uno o más productos deben solicitarse.
- `ordered`: los productos ya se solicitaron al proveedor.
- `received`: los productos requeridos fueron recibidos.

## Estado de entrega

- `pending`: aún no se puede o no se ha coordinado la entrega.
- `ready`: pedido listo para entregar o retirar.
- `delivered`: pedido entregado al cliente.

## Estado de pago

- `pending`: pago aún no registrado.
- `partial`: se registró un anticipo; solo usar si el negocio lo necesita.
- `paid`: pago total registrado.

Un pedido solo puede pasar a `completed` cuando su entrega esté en `delivered` y su pago en `paid`. La aplicación no procesa pagos: solo permite registrar que se recibió un pago, su método y, si procede, una nota.

---

# Disponibilidad e inventario

Cada producto debe comunicar claramente su disponibilidad. Los estados mínimos son:

- `in_stock`: disponible físicamente.
- `on_order`: disponible por encargo; debe solicitarse al proveedor.
- `out_of_stock`: agotado; normalmente no se puede agregar al carrito.
- `inactive`: oculto del catálogo público.

La interfaz debe mostrar estados comprensibles como `Disponible`, `Por encargo`, `Agotado` e `Inactivo`, sin depender solo del color.

El inventario permite a la propietaria saber qué productos tiene físicamente, cuántas unidades hay y cuáles debe solicitar al proveedor. No descontes inventario al crear una solicitud; resérvalo o descuéntalo únicamente en el punto de confirmación que se defina para el negocio.

---

# Panel administrativo

El panel privado debe permitir:

## Productos

- Crear, editar, activar y desactivar.
- Gestionar precio, categoría, imágenes, descripción y disponibilidad.

## Inventario

- Consultar existencias.
- Ajustar cantidades.
- Marcar productos como agotados.
- Identificar productos disponibles por encargo.

## Pedidos

- Ver solicitudes nuevas y su información de cliente.
- Ver productos, cantidades, variantes y disponibilidad.
- Cambiar los estados correspondientes.
- Registrar si hay que solicitar productos al proveedor y su recepción.
- Registrar entrega y pago recibido.
- Contactar al cliente mediante una acción de WhatsApp.
- Marcar el pedido como completado cuando corresponda.

---

# Arquitectura

Separa responsabilidades. Estructura conceptual recomendada:

```text
src/
├── components/
├── layouts/
├── pages/
├── services/
├── lib/
├── stores/
├── types/
├── validations/
└── styles/
```

La estructura puede evolucionar si el proyecto lo requiere.

## Astro con SSR

Usa Astro y SSR para rutas, layouts, estructura de páginas, contenido renderizado en servidor cuando corresponda y SEO. Minimiza el JavaScript enviado al navegador.

## React

Usa React solamente para elementos realmente interactivos: carrito, filtros, selectores, formularios, interfaz administrativa y componentes con estado. No conviertas todo el proyecto en una SPA de React sin una razón concreta.

## Estado y validación

Usa Zustand para estado compartido del cliente, como el carrito. No crees estado global cuando el estado local sea suficiente.

Usa Zod para validar formularios, acciones de servidor y contratos de datos. Cuando sea apropiado, deriva tipos de TypeScript desde los esquemas Zod.

Mantén TypeScript estricto. No desactives comprobaciones de tipos ni uses `any` para ocultar errores.

---

# Acceso a datos y Supabase

Los componentes de React no deben consultar Supabase directamente. Usa una capa de servicios o acceso a datos:

```text
Interfaz → Servicio → Supabase
```

No dupliques lógica de negocio entre componentes.

Supabase proporciona PostgreSQL, autenticación de administradores y Storage. Usa Row Level Security (RLS) y protege las operaciones administrativas.

Nunca expongas una clave `secret` de Supabase —ni la clave heredada `service_role`— en código cliente. Usa la clave `publishable` para el cliente, variables de entorno para secretos y nunca incluyas valores reales en Git. Valida las entradas y aplica autorización en la capa de datos.

---

# Modelo de datos

Antes de modificar la base de datos:

1. Inspecciona las tablas y migraciones existentes.
2. Identifica los cambios necesarios.
3. Propón las migraciones antes de aplicarlas.
4. No elimines tablas ni datos sin autorización explícita.

El modelo debe soportar, al menos:

## Categorías

- `id`, `name`, `slug`, `description`, `image`, `active`, `created_at`, `updated_at`.

## Productos

- `id`, `category_id`, `name`, `slug`, `description`, `price`, `availability_status`, `active`, `created_at`, `updated_at`.

## Imágenes de producto

Un producto puede tener varias imágenes. Guárdalas en Supabase Storage; no guardes binarios directamente en PostgreSQL.

## Inventario

Debe registrar producto, cantidad y fecha de actualización. Una cantidad mínima puede añadirse después si se necesita.

## Pedidos

Debe almacenar solicitud, datos de contacto del cliente, importes estimados, estados independientes, notas administrativas y marcas de tiempo relevantes.

## Líneas de pedido

Debe almacenar la referencia al pedido, referencia al producto cuando exista, instantánea de nombre/precio/opciones, cantidad y disponibilidad observada.

La arquitectura debe poder evolucionar hacia historial de clientes, variantes, estadísticas, notificaciones, pagos online y entregas, sin implementar esas capacidades todavía.

---

# Sistema UI/UX definido

La identidad visual aprobada para **Alma Esencia CR** es **minimalismo editorial cálido**: una boutique digital artesanal, íntima y elegante. Debe transmitir cuidado humano, piezas especiales y un proceso pausado, evitando la apariencia fría de un ecommerce masivo o un marketplace genérico.

La interfaz debe ser móvil primero, responsiva, accesible, limpia y rápida. Prioriza imágenes de producto, espacios amplios, jerarquía editorial y un flujo de solicitud claro.

## Principios de experiencia

- El cliente crea una solicitud; no completa una compra inmediata.
- Comunica que la propietaria revisará disponibilidad, condiciones y entrega.
- Evita `Comprar ahora`, `Pagar`, `Checkout` y `Compra realizada`.
- Prefiere `Agregar al carrito`, `Agregar a solicitud`, `Solicitar pedido`, `Enviar solicitud`, `Mi solicitud`, `Precio estimado` y `Pedido pendiente de confirmación`.
- WhatsApp debe aparecer como acción secundaria de contacto, no como el origen ni la fuente de verdad del pedido.
- Mantén una sensación serena y artesanal: no uses urgencia artificial, contadores agresivos ni patrones de venta invasivos.

## Color

Usa el color de marca `#86365D` como primario: ciruela/rosa profundo y aterciopelado. Es el color de las acciones principales, elementos activos y énfasis de marca.

| Uso | Token | Color |
| --- | --- | --- |
| Color principal | `brand-primary` | `#86365D` |
| Principal en hover | `brand-primary-hover` | `#6E2B4A` |
| Tinte suave del primario | `brand-primary-soft` | `#F5EBF0` |
| Fondo de la aplicación | `surface` | `#FDF8F7` |
| Superficies y tarjetas | `surface-card` | `#FFFFFF` |
| Superficie rosada suave | `surface-soft` | `#FFF0F4` |
| Borde y divisor | `border-subtle` | `#EEDFE5` |
| Texto principal | `text-primary` | `#2C1A23` |
| Texto secundario | `text-secondary` | `#6E5D66` |
| Acento champán | `accent-gold` | `#E6C594` |
| Acento rosa empolvado | `accent-rose` | `#D9A0B8` |

Los acentos dorados y rosa son decorativos o secundarios; no deben competir con el color principal ni reemplazarlo como acción primaria.

### Estados de disponibilidad

No comuniques disponibilidad solo con color: incluye siempre icono y texto.

| Estado | Texto | Fondo | Texto/borde |
| --- | --- | --- | --- |
| `in_stock` | Disponible | `#E8F5E9` | `#2D6A4F` / `#C8E6C9` |
| `on_order` | Por encargo | `#FEF3C7` | `#8A5A12` / `#FDE68A` |
| `out_of_stock` | Agotado | `#F0ECEE` | `#6B5E65` / `#E2D9DD` |

## Tipografía

Usa una combinación editorial y funcional:

- **Playfair Display** para titulares, nombres de producto y secciones narrativas.
- **Plus Jakarta Sans** para navegación, precios, formularios, filtros, etiquetas y contenido funcional.

Escala base:

| Estilo | Fuente | Tamaño / interlineado |
| --- | --- | --- |
| Display escritorio | Playfair Display, 600 | `48px / 56px` |
| Display móvil | Playfair Display, 600 | `34px / 42px` |
| Encabezado grande escritorio | Playfair Display, 600 | `32px / 40px` |
| Encabezado grande móvil | Playfair Display, 600 | `26px / 34px` |
| Título de producto | Playfair Display, 500 | `20px / 28px` |
| Título funcional / precio | Plus Jakarta Sans, 600 | `18px / 26px` |
| Cuerpo | Plus Jakarta Sans, 400 | `14px / 22px` |
| Etiqueta | Plus Jakarta Sans, 600 | `12px / 16px` |

Los precios deben usar Plus Jakarta Sans en semibold para conservar legibilidad numérica. Los labels de categoría pueden usar mayúsculas discretas, con espaciado de letras moderado.

## Composición y diseño responsivo

Usa una cuadrícula fluida basada en múltiplos de 8 px y espacio en blanco generoso.

- **Móvil (<768px):** márgenes y gutters de `1rem`; catálogo a una columna o dos columnas compactas según el contenido; filtros horizontales desplazables.
- **Tableta (768–1024px):** márgenes de `2rem`, gutters de `1.5rem`, cuadrícula de 2–3 productos.
- **Escritorio (>1024px):** ancho máximo de `1280px`, márgenes de `3.5rem`, gutters de `2rem`, cuadrícula de 3–4 productos y filtros que puedan permanecer visibles.

Escala de espaciado: `4px`, `8px`, `16px`, `24px`, `40px`, `56px`. No comprimas artificialmente la interfaz: la amplitud es parte del carácter editorial.

En móvil usa una cabecera compacta, barra de navegación inferior y acceso visible al carrito/solicitud. La navegación pública no debe presentar un perfil de cliente, porque no existen cuentas de cliente. El acceso administrativo debe estar protegido y no ser una opción de navegación pública para clientes.

## Formas, profundidad e imágenes

- Inputs y controles compactos: radio de `8px`.
- Tarjetas y diálogos: radio de `16–20px`.
- Botones principales, chips y badges: forma píldora (`9999px`).
- Imágenes: radio interno de `12px` y `object-fit: cover`.
- Joyería y velas: proporción de imagen preferida `4:5` vertical.
- Cosméticos: proporción `1:1` cuando sea más adecuada.
- Fotografía: luz natural cálida, fondos de lino, crema, madera o texturas artesanales; tonos marfil, ciruela y arena; composición editorial serena.

Evita sombras oscuras o industriales. Usa borde fino y profundidad ambiental teñida de ciruela:

- Tarjeta en reposo: `0 4px 20px -2px rgba(134, 54, 93, 0.05)` con borde `1px solid #EEDFE5`.
- Tarjeta en hover/foco: `0 12px 28px -4px rgba(134, 54, 93, 0.10)` y borde `#D9A0B8`.
- Modal, drawer o bottom sheet: `0 20px 40px -8px rgba(44, 26, 35, 0.16)`.
- Overlay: `rgba(44, 26, 35, 0.45)` con desenfoque de `4px`.

## Componentes

### Botones

- **Primario:** fondo `#86365D`, texto blanco, píldora. Hover `#6E2B4A`. Foco con anillo de `2px` del color primario, separado `2px` del elemento. Usa para `Solicitar pedido`, `Enviar solicitud` y `Agregar al carrito`.
- **Secundario:** fondo transparente, borde `1.5px solid #86365D`, texto `#86365D`; hover con fondo `#F5EBF0`.
- **Terciario:** sin borde ni fondo, texto `#86365D`; hover con `#6E2B4A` y subrayado sutil.
- **Deshabilitado:** fondo `#F5EBF0`, texto `#6E5D66`, contraste suficiente y sin simular una acción disponible.
- Incluye estados de carga sin alterar el ancho del botón ni ocultar su contexto.

### Tarjetas de producto

Las tarjetas tienen superficie blanca, borde sutil, radio de `16–20px` y sombra ambiental ligera. Deben incluir:

- Imagen dominante.
- Badge de disponibilidad superpuesto en la esquina superior izquierda.
- Acción secundaria de favorito solo si esa funcionalidad existe; no implementar favoritos solo por imitar el diseño.
- Categoría pequeña, título editorial y descripción breve.
- Precio claro y, si aplica, etiqueta `Precio estimado`.
- Acción principal de ancho completo al pie.

La imagen puede hacer micro-zoom hasta `1.03` en hover durante `300ms ease-out`; el efecto debe respetar `prefers-reduced-motion`.

### Filtros, búsqueda y formularios

- Buscador con icono inicial, superficie blanca y radio `12px`.
- Filtros mediante chips de píldora desplazables horizontalmente en móvil.
- Chip activo: fondo `#86365D`, texto blanco.
- Chip inactivo: fondo rosado suave y texto secundario.
- Inputs: fondo blanco, borde `#EEDFE5`, radio `8px`; en foco, borde principal y halo `0 0 0 3px rgba(134, 54, 93, 0.12)`.
- Los errores se presentan junto al campo con texto explicativo; no dependas solo de color.

### Avisos, estados vacíos y notificaciones

- Avisos de proceso o confirmación: contenedor `#F5EBF0`, borde izquierdo de `3px #86365D`, icono y texto claro. Ejemplo: `Solicitud pendiente de confirmación. La propietaria revisará disponibilidad y detalles.`
- Estados vacíos: icono suave, título editorial, explicación breve y acción de recuperación.
- Usa Sileo (`sileo`) como único sistema de notificaciones. Los toasts deben ser breves, discretos y coherentes con la paleta; no apiles alertas invasivas.
- El resumen flotante del carrito/solicitud en móvil puede usar una superficie ciruela oscura, mostrar cantidad y total estimado, y enlazar a `Mi solicitud`.

## Accesibilidad

Usa HTML semántico, etiquetas visibles, navegación por teclado, foco visible, tamaños táctiles mínimos de `44 × 44px`, contraste suficiente y texto alternativo descriptivo para imágenes significativas.

Respeta `prefers-reduced-motion`. No uses únicamente iconos para acciones importantes; acompáñalos de texto o una etiqueta accesible.

---

# SEO y rendimiento

El catálogo público debe tener títulos y descripciones significativos, HTML semántico, URLs limpias, slugs de producto, metadatos Open Graph cuando corresponda y texto alternativo descriptivo.

Prioriza imágenes optimizadas, carga diferida cuando corresponda, poco JavaScript y SSR de Astro. Usa React únicamente donde se necesite interactividad.

---

# Seguridad

Nunca:

- Incluyas secretos en Git.
- Expongas claves `service_role`.
- Confíes en permisos enviados por el cliente.
- Eludas RLS por comodidad.
- Coloques operaciones administrativas privadas en código público del cliente.

---

# Calidad de código

Prefiere componentes pequeños y reutilizables, nombres claros, funciones simples, tipos sólidos, contratos de datos explícitos y mínima duplicación.

Evita componentes enormes, acoplamiento profundo, abstracciones innecesarias, optimización prematura y dependencias innecesarias.

---

# Flujo de desarrollo

Trabaja de forma incremental. Antes de cambios significativos:

1. Inspecciona el proyecto actual.
2. Lee este archivo `AGENTS.md`.
3. Identifica los archivos afectados.
4. Explica brevemente el cambio previsto.
5. Implementa el cambio.
6. Ejecuta comprobaciones relevantes.
7. Informa los cambios y cualquier problema pendiente.

No reescribas código no relacionado ni modifiques funcionalidad existente sin una razón.

---

# Validación

Cuando corresponda, ejecuta:

```bash
pnpm build
```

Ejecuta además los comandos de linting y comprobación de tipos existentes. Si un comando no existe, no lo inventes. Corrige los errores introducidos por los cambios actuales antes de continuar.

---

# Git y despliegue

Usa Git durante el desarrollo, pero **no ejecutes `git add`, `git commit` ni `git push`** salvo que la propietaria lo solicite de forma explícita. Deja los cambios sin staging para que la propietaria los revise y cree el commit personalmente.

Al finalizar cada unidad de trabajo, propone en el reporte final un mensaje de commit claro y pequeño, sin crear el commit. No envíes cambios directamente a `main` sin autorización explícita; trabaja en una rama de funcionalidad cuando se inicie una nueva funcionalidad.

La plataforma de despliegue inicial y destino de SSR es **Vercel**. Configura Astro con el adaptador oficial de Vercel (`@astrojs/vercel`) cuando se inicialice el proyecto. Las rutas públicas que no requieran datos dinámicos deben aprovechar el prerenderizado; las rutas administrativas y acciones que requieran procesamiento seguro deben usar SSR.

Usa el plan gratuito mientras sea adecuado y evita costes de infraestructura innecesarios. No introduzcas servicios de pago sin aprobación explícita.

---

# Funcionalidades fuera de alcance por ahora

No implementes sin solicitud explícita:

- Pagos en línea.
- Cuentas de cliente.
- Automatización de pedidos a proveedores.
- Inventario avanzado.
- Analítica de ventas.
- Descuentos o fidelización.
- Notificaciones por correo.
- Gestión de entregas avanzada.
- Varios administradores o varias tiendas.

Diseña de modo que estas capacidades puedan añadirse después, sin implementarlas prematuramente.

---

# Regla importante

Construye únicamente lo pedido para la fase actual. No amplíes el alcance de manera automática.

Si una ambigüedad afecta la arquitectura o el modelo de datos, pide aclaración antes de adoptar una suposición importante.
