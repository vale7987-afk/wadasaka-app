# Wadasaka Club - Base de la Verdad y Reglas de Negocio (AGENTS.md)

Este documento es la **fuente de la verdad definitiva** para cualquier desarrollo, modificación, consulta o refactorización del sistema de Wadasaka Club. Todas las decisiones técnicas y de negocio deben alinearse con lo aquí especificado.

---

## 1. Información General y Accesos

* **Nombre del Club:** Wadasaka Club
* **URL de Producción (Clientes):** `https://wadasaka-app-club.vercel.app`
* **Panel de Administración:** `https://wadasaka-app-club.vercel.app/admin`
  * *Regla de seguridad/UI:* El panel admin NO debe tener enlaces visibles en la página pública de clientes. Los administradores ingresan directamente por URL o marcadores.
* **Email Oficial de Notificaciones y Reservas:** `wadasaka.reservas@gmail.com`
* **Datos Bancarios Oficiales para Transferencias (App):**
  * **Alias:** `wadasakaya`
  * **Titular:** `Mirta Nilda Duarte`

---

## 2. Matriz de Tarifas y Señas Oficiales

### Pádel
* **1 hora:** $30.000
* **1.5 horas (1 hora y media):** $45.000
* **2 horas (Promoción):** $58.000
* **Seña obligatoria fija:** **$10.000** (aplica exactamente igual para 1h, 1.5h y 2h).
* **Bloques horarios:** Cada 30 minutos (de 09:00 hs a 23:30 hs).

### Fútbol 5
* **Precio:** $50.000 por hora ($50.000/h).
* **Seña:** $15.000 por hora.
* **Bloques horarios:** Cada 60 minutos (de 09:00 hs a 23:00 hs).

### Fútbol 8
* **Precio:** $80.000 por hora ($80.000/h).
* **Seña:** $20.000 por hora.
* **Bloques horarios:** Cada 60 minutos (de 09:00 hs a 23:00 hs).

---

## 3. Reglas de Disponibilidad, Turnos y Cuadrícula

1. **Tiempo de Hold (Retención temporal):**
   * Toda reserva web que inicia el proceso de pago queda en estado `PENDIENTE` durante una ventana exacta de **10 minutos**.
   * Durante esos 10 minutos, el horario queda bloqueado en color **Amarillo (`En espera`)** para evitar que otro usuario tome el mismo turno.
2. **Superposición y Ocultamiento de Horarios:**
   * **Los horarios ya ocupados y confirmados (con seña abonada) desaparecen por completo de la cuadrícula.** El cliente solo ve los horarios disponibles en blanco y los turnos en proceso de pago en amarillo.
   * Los horarios superpuestos por la duración solicitada (ej. si reservan 1.5h a las 18:00, las 18:30 y 19:00 no deben quedar disponibles) también se omiten automáticamente.
   * La leyenda visual del selector de horarios indica únicamente: `(Blanco: Libre, Amarillo: En espera)`. No se muestran botones grises de ocupado.
3. **Filtro del Día Actual:**
   * La fecha de hoy debe estar disponible para alquilar hasta el último turno del día (23:30 hs).
   * Solo se filtran/ocultan los horarios de hoy cuya hora de inicio ya haya transcurrido en tiempo real.

---

## 4. Métodos de Pago y Carteles de Notificación

### Cartel Previo Obligatorio (Aviso de 24hs de Anticipación)
* Al momento de presionar el botón de confirmar la reserva (sea por Mercado Pago o por Transferencia Bancaria), se activa de forma previa un cartel emergente obligatorio con el texto:
  > **"Si luego de reservar usted desea cambiar la reserva, se debe avisar con 24hs de anticipación SIN EXCEPCIÓN!"**
* El usuario debe hacer clic en **"Aceptar y Continuar"** para proceder con el cobro o la solicitud de transferencia.

### Opción 1: Mercado Pago (Seña Online)
* Genera la preferencia mediante Checkout Pro con el monto exacto de la seña precargado.
* El cliente abona dentro de Mercado Pago con dinero en cuenta, débito, tarjeta o transferencia Mercado Pago.
* Confirmación 100% automática mediante Webhook.

### Opción 2: Transferencia Bancaria Directa
* **Identificación del Titular Bancario:**
  * Al seleccionar transferencia bancaria, el formulario consulta si la cuenta emisora es propia o de un tercero.
  * Si transfiere otra persona (familiar, amigo, etc.), se solicita obligatoriamente el **Nombre y Apellido del Titular de la cuenta que transfiere**.
  * Se incluye una advertencia destacada informando la importancia de escribir el nombre completo tal como figura registrado en el banco para la auto-aprobación.
* **Auto-Aprobación Inteligente en Backend:**
  * El servidor utiliza comparación flexible (*fuzzy matching* / tokens) para emparejar el `payer` recibido desde Mercado Pago con el titular declarado en la reserva, evitando errores por desempate o múltiples reservas simultáneas.
* El cartel emergente (*Modal*) para transferencias debe tener exactamente el siguiente formato y redacción:
  * **Título:** `Estás a un paso de completar tu reserva`
  * **Cuerpo:**
    ```text
    Transfiere $[Monto de la seña] a la siguiente cuenta:
    • Alias: wadasakaya
    • Titular: Mirta Nilda Duarte

    Tu reserva se confirmará automáticamente cuando se acredite el pago.
    ```
  * *Importante:* No incluir códigos de motivo manuales ni la palabra "(exclusivo)".

---

## 5. Acreditación y Sincronización Automática

1. **Auto-Aprobación de Transferencias:**
   * Como la cuenta y alias `wadasakaya` están dedicados a las reservas de la app, cuando entra un pago a la cuenta de Mercado Pago por el monto exacto de una reserva `PENDIENTE` (dentro de los 30 minutos previos), el sistema la confirma de forma automática sin requerir intervención manual.
2. **Endpoints de Pago:**
   * `/api/pagos/webhook`: Recibe los eventos en tiempo real de Mercado Pago (IPN / Webhooks V1 y V2).
   * `/api/pagos/sincronizar`: Sincronización proactiva para verificar pagos recientes aprobados.
3. **Acciones obligatorias al confirmarse una reserva:**
   * Cambiar estado a `CONFIRMADO`.
   * Registrar asiento en el Libro Diario / Cashflow.
   * Sincronizar evento en Google Calendar (si las credenciales de servicio están activas).
   * Enviar correo con comprobante al cliente (`reserva.email`).
   * Enviar correo de notificación a `wadasaka.reservas@gmail.com`.
   * Disparar alerta Toast / Notificación en el Panel de Administración.

---

## 6. Arquitectura Técnica y Persistencia

* **Plataforma:** Node.js con Express servido en Vercel (Serverless Functions).
* **Persistencia Multi-Capa (Resiliencia en Vercel):**
  1. **MongoDB Atlas:** Conexión primaria vía `MONGODB_URI`.
  2. **Cloud REST Sync (`restful-api.dev`):** Sincronización compartida entre instancias lambdas de Vercel para evitar desfasaje de memoria.
  3. **Almacenamiento Local / Temporal:** `/tmp/reservas.json` y archivos semilla en raíz.
* **Variables de Entorno Críticas (Vercel Settings):**
  * `MP_ACCESS_TOKEN`: Token de producción de Mercado Pago.
  * `EMAIL_USER`: `wadasaka.reservas@gmail.com`
  * `EMAIL_PASSWORD`: Contraseña de aplicación de 16 letras de Google.
  * `ADMIN_EMAIL`: `wadasaka.reservas@gmail.com`
  * `RESERVAS_ALIAS`: `wadasakaya`
  * `RESERVAS_TITULAR`: `Mirta Nilda Duarte`
  * `APP_URL`: `https://wadasaka-app-club.vercel.app`
  * `MONGODB_URI`: String de conexión de base de datos MongoDB Atlas.

---

## 7. Instrucciones para el Asistente de IA (Antigravity)

1. **Preservación de Reglas:** Ningún cambio de código debe alterar los precios, señas fijas, nombres de alias/titular ni textos del modal sin instrucción explícita del usuario.
2. **Integridad de Caracteres (Encoding):** Todos los archivos deben mantenerse en formato **UTF-8 estándar** preservando tildes (`á, é, í, ó, ú`), eñes (`ñ`), signos de apertura (`¿, ¡`) y emojis de la interfaz sin generar caracteres mojibake.
3. **Validación Previa:** Antes de confirmar cambios en la lógica de turnos o scripts del cliente, validar la sintaxis JavaScript completa con `node --check` para evitar fallos de ejecución en el navegador de los usuarios.
