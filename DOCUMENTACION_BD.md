# 📊 Documentación de Base de Datos - Wadasaka App

## ✅ Implementación Completada

Se implementó un sistema completo de almacenamiento de reservas con validación de pagos en Mercado Pago.

---

## 📋 Estructura de Datos

### Archivo: `reservas.json`
Todas las reservas se guardan en este archivo con la siguiente estructura:

```json
{
  "id": 1717689600000,
  "nombre": "Valeria",
  "apellido": "Acosta",
  "cancha": "Cancha de Pádel",
  "fecha": "2026-06-27",
  "horaInicio": "17:00",
  "duracionHoras": 2,
  "estado": "CONFIRMADO",
  "mercadoPagoId": "1234567890",
  "preferenceId": "preference_id_xxxx",
  "timestamp": "2026-06-06T15:30:00.000Z"
}
```

### Campos:
- **id**: Timestamp único de la reserva
- **nombre**: Nombre del cliente
- **apellido**: Apellido del cliente
- **cancha**: Nombre de la cancha (Pádel, Fútbol 5, Fútbol 8)
- **fecha**: Fecha de la reserva (YYYY-MM-DD)
- **horaInicio**: Hora de inicio (HH:MM)
- **duracionHoras**: Duración en horas
- **estado**: `PENDIENTE` (esperando pago) o `CONFIRMADO` (pago completado)
- **mercadoPagoId**: ID del pago en Mercado Pago
- **preferenceId**: ID de preferencia de Mercado Pago
- **timestamp**: Fecha y hora de creación

---

## 🔄 Flujo de Reserva

### 1. **Usuario crea reserva**
   - Completa el formulario con: nombre, apellido, cancha, fecha, duración, horario
   - Hace click en "Confirmar y Pagar Seña"

### 2. **Se crea Preferencia de Pago en Mercado Pago**
   - Se envían los datos al endpoint: `POST /create_preference`
   - Se genera una preferencia de pago (link de pago)

### 3. **Se guarda Reserva en PENDIENTE**
   - La reserva se guarda en `reservas.json` con estado `PENDIENTE`
   - Usuario es redirigido a Mercado Pago para pagar

### 4. **Usuario realiza el pago**
   - Completa el pago en Mercado Pago
   - Mercado Pago envía webhook a: `POST /api/pagos/webhook`

### 5. **Webhook valida pago**
   - Se verifica que el pago fue aprobado
   - Se actualiza estado a `CONFIRMADO` en `reservas.json`
   - Se recarga la lista de reservas confirmadas en memoria
   - Se bloquean los horarios disponibles

---

## 📡 Endpoints API

### `POST /create_preference`
Crea una preferencia de pago y reserva

**Body:**
```json
{
  "title": "Seña Reserva Wadasaka Club - FUTBOL5",
  "price": 10000,
  "quantity": 1,
  "nombre": "Valeria",
  "apellido": "Acosta",
  "cancha": "Cancha de Fútbol 5",
  "fecha": "2026-06-27",
  "horaInicio": "17:00",
  "duracionHoras": 2
}
```

**Response:**
```json
{
  "init_point": "https://www.mercadopago.com/checkout/...",
  "id": "preference_id_xxxx"
}
```

---

### `POST /api/pagos/webhook`
Webhook de Mercado Pago para confirmar pagos

**Body (enviado por Mercado Pago):**
```json
{
  "action": "payment.updated",
  "data": {
    "id": "1234567890"
  }
}
```

---

### `GET /api/reservas/confirmadas`
Obtiene todas las reservas confirmadas

**Response:**
```json
[
  {
    "id": 1717689600000,
    "nombre": "Valeria",
    "apellido": "Acosta",
    "cancha": "Cancha de Pádel",
    "fecha": "2026-06-27",
    "horaInicio": "17:00",
    "duracionHoras": 2,
    "estado": "CONFIRMADO",
    ...
  }
]
```

---

## 🛡️ Lógica de Disponibilidad

### Reglas implementadas:
1. **Fútbol 5 bloquea Fútbol 8**: Si se reserva una cancha de 5, la cancha de 8 se bloquea en ese horario
2. **Fútbol 8 bloquea Fútbol 5**: Si se reserva la cancha de 8, ambas canchas de 5 (A y B) se bloquean
3. **Misma cancha**: No se puede reservar la misma cancha dos veces en el mismo horario

### Carga en memoria:
- Al iniciar el servidor, carga todas las reservas confirmadas
- Las verifica para disponibilidad al crear nuevas reservas
- Se recarga automáticamente después de confirmar un pago

---

## 💾 Almacenamiento

**Ubicación**: `c:\Users\vale7\OneDrive\Escritorio\Wadasaka-app\reservas.json`

El archivo es un JSON array que se actualiza cada vez que:
- Se crea una nueva reserva (estado PENDIENTE)
- Se confirma un pago (estado CONFIRMADO)

---

## ⚙️ Características

✅ **Persistencia**: Las reservas se guardan en disco y persisten entre reinicios del servidor
✅ **Validación MP**: Se verifica que el pago fue realizado antes de confirmar
✅ **Disponibilidad**: Sistema de bloques de 30 minutos
✅ **Seña multiplicada**: Para Fútbol 5 y 8 se multiplica por horas
✅ **Interfaz clara**: Muestra rangos horarios (17:00 hs a 19:00 hs)

---

## 🚀 Próximas mejoras

- [ ] Dashboard de administración para ver reservas
- [ ] Confirmación por email/WhatsApp
- [ ] Cancelación de reservas con reembolso
- [ ] Reportes por mes/trimestre
- [ ] Integración con calendario visual
