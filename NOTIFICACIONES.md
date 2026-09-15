# ⚙️ Configuración de Notificaciones - Wadasaka App

## 📧 Configurar Email (Gmail)

Para que funcionen las notificaciones por email, necesitas agregar estas variables a tu archivo `.env`:

### 1. Crear una Contraseña de Aplicación en Gmail

1. Ve a: [Google Account Security](https://myaccount.google.com/security)
2. Busca "Contraseñas de aplicación"
3. Selecciona "Mail" y "Windows Computer" (o tu dispositivo)
4. Google te dará una contraseña de 16 caracteres

### 2. Actualizar el archivo `.env`

Agrega estas líneas a tu archivo `.env`:

```env
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_contraseña_de_16_caracteres
ADMIN_EMAIL=tu_email@gmail.com
```

**Ejemplo:**
```env
MP_ACCESS_TOKEN=APP_USR-xxxx...
APP_URL=http://localhost:3000
EMAIL_USER=vale7987@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
ADMIN_EMAIL=vale7987@gmail.com
```

---

## 📱 WhatsApp (Próxima versión)

Para WhatsApp, se puede integrar Twilio. Se agregarán estas variables cuando esté listo:

```env
TWILIO_ACCOUNT_SID=xxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE=+1234567890
```

---

## 📊 Panel de Administración

Accede al panel en: **http://localhost:3000/admin**

### Funcionalidades:
- ✅ Ver todas las reservas confirmadas
- ✅ Filtrar por fecha y cancha
- ✅ Llamar directamente (click en teléfono)
- ✅ Enviar recordatorios a clientes
- ✅ Ver estadísticas (ingresos del día, próxima reserva)
- ✅ Auto-actualización cada 30 segundos

---

## 📬 Flujo de Notificaciones

### Cuando se confirma el pago:

1. **Email al cliente**
   - Confirmación de reserva
   - Detalles: cancha, fecha, hora, duración, seña pagada

2. **Email al administrador**
   - Notificación de nueva reserva
   - Datos del cliente (nombre, teléfono)
   - ID de Mercado Pago
   - Link al panel admin

### Recordatorios manuales:
- El admin puede enviar recordatorios desde el panel
- Se envía un email al admin confirmando el envío

---

## 🔍 Pruebas

Para probar sin usar Gmail:

```env
EMAIL_USER=test@example.com
EMAIL_PASSWORD=password123
```

Los emails se registrarán en la consola pero no se enviarán realmente.

---

## 🐛 Troubleshooting

**Error: "Invalid login"**
- Verifica que habilitaste "Aplicaciones menos seguras" o que usas contraseña de aplicación

**Error: "SMTP connection timeout"**
- Verifica tu conexión a internet
- Cambia PORT a 587 o 465

**Los emails no llegan**
- Revisa la carpeta de spam/basura
- Verifica que el email_from está correcto
