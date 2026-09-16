const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const nodemailer = require('nodemailer');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(cors());

// --- CONFIGURACIÓN MONGODB / PERSISTENCIA CLOUD ---
let mongoClient = null;
let db = null;

async function getDb() {
    if (db) return db;
    if (!process.env.MONGODB_URI) return null;
    try {
        mongoClient = new MongoClient(process.env.MONGODB_URI);
        await mongoClient.connect();
        db = mongoClient.db('wadasaka');
        console.log("🚀 Conectado con éxito a MongoDB Atlas");
        return db;
    } catch (e) {
        console.error("⚠️ Error de conexión a MongoDB Atlas:", e.message);
        return null;
    }
}

function getStoragePath(collectionName) {
    if (process.env.VERCEL) {
        return path.join('/tmp', `${collectionName}.json`);
    }
    return path.join(__dirname, `${collectionName}.json`);
}

// Carga datos desde Mongo o desde archivo local .json
async function dbLoad(collectionName, defaultVal = []) {
    const database = await getDb();
    if (database) {
        try {
            const docs = await database.collection(collectionName).find({}).toArray();
            return docs.map(d => {
                const { _id, ...rest } = d;
                return rest;
            });
        } catch (e) {
            console.error(`⚠️ Error cargando Mongo (${collectionName}):`, e.message);
        }
    }
    
    // Fallback a archivos en /tmp o local
    const filePath = getStoragePath(collectionName);
    if (fs.existsSync(filePath)) {
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            console.error(`⚠️ Error leyendo archivo ${collectionName}.json:`, e.message);
        }
    }

    // Si es Vercel y no existe en /tmp, intentar leer semilla desde el directorio raíz __dirname
    const seedPath = path.join(__dirname, `${collectionName}.json`);
    if (fs.existsSync(seedPath)) {
        try {
            const data = fs.readFileSync(seedPath, 'utf-8');
            return JSON.parse(data);
        } catch (e) {}
    }
    
    return defaultVal;
}

// Guarda datos en Mongo o en archivo local .json
async function dbSave(collectionName, data) {
    const database = await getDb();
    if (database) {
        try {
            await database.collection(collectionName).deleteMany({});
            if (data.length > 0) {
                // Hacer una copia profunda libre de referencias
                const cleanData = JSON.parse(JSON.stringify(data));
                await database.collection(collectionName).insertMany(cleanData);
            }
            return;
        } catch (e) {
            console.error(`⚠️ Error guardando en Mongo (${collectionName}):`, e.message);
        }
    }
    
    // Fallback a archivos escribibles (/tmp en Vercel o local)
    try {
        const filePath = getStoragePath(collectionName);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`⚠️ Error escribiendo archivo local (${collectionName}):`, e.message);
    }
}

// --- VARIABLES GLOBALES EN MEMORIA ---
let precios = {};
let productos = [];
let cashflow = [];
let auditLog = [];

async function reloadMemoryCache() {
    precios = await dbLoad('precios', { cancha_f5: 50000, cancha_f8: 80000, cancha_padel: 30000 });
    productos = await dbLoad('productos', [
        { id: 'p1', name: 'Coca-Cola 500ml', category: 'Bebidas', cost: 800, price: 1500, stock: 25, minStock: 5 },
        { id: 'p2', name: 'Agua Mineral 500ml', category: 'Bebidas', cost: 500, price: 1000, stock: 30, minStock: 6 },
        { id: 'p3', name: 'Cerveza Heineken 1L', category: 'Bebidas', cost: 1500, price: 2800, stock: 12, minStock: 4 },
        { id: 'p4', name: 'Hamburguesa Completa', category: 'Comidas', cost: 1800, price: 3500, stock: 10, minStock: 2 },
        { id: 'p5', name: 'Tostado Jamón y Queso', category: 'Comidas', cost: 1000, price: 2000, stock: 8, minStock: 3 },
        { id: 'p6', name: 'Papas Fritas Porción', category: 'Comidas', cost: 800, price: 1800, stock: 15, minStock: 3 },
        { id: 'p7', name: 'Alfajor Triple', category: 'Kiosco', cost: 400, price: 800, stock: 45, minStock: 8 },
        { id: 'p8', name: 'Papas Lays Clásicas', category: 'Kiosco', cost: 600, price: 1200, stock: 15, minStock: 4 }
    ]);
    cashflow = await dbLoad('cashflow', []);
    auditLog = await dbLoad('audit', []);
    recargarReservasConfirmadas();
}

// --- CONFIGURACIÓN MERCADO PAGO ---
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

// --- CONFIGURACIÓN EMAIL (Nodemailer) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'tu_email@gmail.com',
        pass: process.env.EMAIL_PASSWORD || 'tu_contraseña'
    }
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@wadasaka.com';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || process.env.MP_ACCESS_TOKEN || 'wadasaka-captcha-secret';
const ADMIN_ALLOWED_IPS = (process.env.ADMIN_ALLOWED_IPS || '')
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean);
const CALENDAR_URLS = {
    futbol: process.env.FUTBOL_CALENDAR_ICS_URL,
    padel: process.env.PADEL_CALENDAR_ICS_URL
};
const calendarCache = new Map();

function normalizarIp(ip) {
    return String(ip || '').replace('::ffff:', '');
}

function esIpPrivada(ip) {
    const limpia = normalizarIp(ip);
    return limpia === '::1' ||
        limpia === '127.0.0.1' ||
        limpia.startsWith('10.') ||
        limpia.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(limpia);
}

function accesoAdminPermitido(req) {
    if (process.env.VERCEL) return true; // En Vercel permite acceso web al panel admin (protegido por contraseña en el frontend)
    const ip = normalizarIp(req.ip || req.socket.remoteAddress);
    if (ADMIN_ALLOWED_IPS.length === 0) return esIpPrivada(ip);
    return ADMIN_ALLOWED_IPS.includes(ip) || esIpPrivada(ip);
}

function requerirAccesoAdmin(req, res, next) {
    if (accesoAdminPermitido(req)) return next();
    return res.status(403).send('Panel disponible solo desde la cancha.');
}

// Proteger endpoints críticos administrativos
app.use(['/admin.html', '/api/audit', '/api/cashflow', '/api/cron/notificacion-diaria'], requerirAccesoAdmin);
app.use(express.static(path.join(__dirname, 'public')));

// --- INTEGRACIÓN GOOGLE CALENDAR ---
async function getGoogleAuthToken(email, privateKey) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const claim = Buffer.from(JSON.stringify({
        iss: email,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    })).toString('base64url');
    
    const jwt = `${header}.${claim}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(jwt);
    const formattedKey = privateKey.replace(/\\n/g, '\n');
    const signature = sign.sign(formattedKey, 'base64url');
    
    const assertion = `${jwt}.${signature}`;
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion
        })
    });
    
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Google token error: ${errText}`);
    }
    const data = await res.json();
    return data.access_token;
}

async function registrarEventoGoogleCalendar(reserva) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (!email || !privateKey) {
        console.log(" Sincronización omitida: Faltan credenciales de Google Calendar.");
        return;
    }
    
    const deporte = deporteDesdeCancha(reserva.cancha);
    const calendarId = deporte === 'padel' ? process.env.PADEL_CALENDAR_ID : process.env.FUTBOL_CALENDAR_ID;
    if (!calendarId) {
        console.log(` Sincronización omitida: Falta Calendar ID para ${deporte}.`);
        return;
    }
    
    try {
        const token = await getGoogleAuthToken(email, privateKey);
        const startDateTime = new Date(`${reserva.fecha}T${reserva.horaInicio}:00`);
        const endDateTime = new Date(startDateTime.getTime() + (reserva.duracionHoras * 3600 * 1000));
        
        const event = {
            summary: `Reserva - ${reserva.nombre} ${reserva.apellido}`,
            description: `Cancha: ${reserva.cancha}\nTeléfono: ${reserva.telefono || 'Sin especificar'}\nTotal: $${reserva.totalTurno}\nSeña: $${reserva.senaPagada}`,
            start: { dateTime: startDateTime.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' },
            end: { dateTime: endDateTime.toISOString(), timeZone: 'America/Argentina/Buenos_Aires' }
        };
        
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });
        
        if (res.ok) {
            console.log(` Evento registrado en Google Calendar (${deporte})`);
        } else {
            const errText = await res.text();
            console.error(`Error al registrar en Google Calendar: ${errText}`);
        }
    } catch (e) {
        console.error("Error en sincronización con Google Calendar:", e.message);
    }
}

// Array de reservas confirmadas en memoria para verificar disponibilidad
let reservasConfirmadas = [];

// Carga reservas en memoria para verificar disponibilidad rápida
function recargarReservasConfirmadas() {
    dbLoad('reservas').then(todas => {
        reservasConfirmadas = todas
            .filter(r => r.estado === 'CONFIRMADO')
            .flatMap(r => {
                const bloqueInicio = calcularBloqueDesdeHora(r.horaInicio);
                const cantidadBloques = Math.ceil(Number(r.duracionHoras || 1) * 2);

                return Array.from({ length: cantidadBloques }, (_, i) => ({
                    cancha: r.cancha,
                    cliente: r.nombre + ' ' + r.apellido,
                    fecha: r.fecha,
                    bloque: bloqueInicio + (i * 0.5),
                    estado: 'CONFIRMADO'
                }));
            });
        console.log('📊 Reservas confirmadas en caché:', reservasConfirmadas.length);
    });
}

function calcularBloqueDesdeHora(horaInicio) {
    const [horas, minutos] = horaInicio.split(':').map(Number);
    return horas + (minutos === 30 ? 0.5 : 0);
}

function deporteDesdeCancha(cancha) {
    return String(cancha || '').toLowerCase().includes('pad') ? 'padel' : 'futbol';
}

function fechaLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function bloqueDesdeDate(date) {
    return date.getHours() + (date.getMinutes() / 60);
}

function unfoldIcs(text) {
    return String(text || '').replace(/\r?\n[ \t]/g, '');
}

function parseIcsDate(value) {
    if (!value) return null;
    const clean = String(value).trim();
    const match = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
    if (!match) return null;

    const [, y, m, d, hh = '00', mm = '00', ss = '00', z] = match;
    if (z) {
        return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
    }
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
}

function parseIcs(text) {
    const lines = unfoldIcs(text).split(/\r?\n/);
    const eventos = [];
    let actual = null;

    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') {
            actual = {};
            continue;
        }
        if (line === 'END:VEVENT') {
            if (actual && actual.dtstart && actual.dtend) eventos.push(actual);
            actual = null;
            continue;
        }
        if (!actual) continue;

        const index = line.indexOf(':');
        if (index === -1) continue;
        const key = line.slice(0, index).split(';')[0];
        const value = line.slice(index + 1);

        if (key === 'DTSTART') actual.dtstart = parseIcsDate(value);
        if (key === 'DTEND') actual.dtend = parseIcsDate(value);
        if (key === 'RRULE') actual.rrule = value;
        if (key === 'SUMMARY') actual.summary = value;
    }
    return eventos;
}

async function cargarEventosCalendario(deporte) {
    const url = CALENDAR_URLS[deporte];
    if (!url) return [];

    const cache = calendarCache.get(deporte);
    if (cache && cache.expires > Date.now()) return cache.eventos;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error(`Calendario ${deporte}: ${response.status}`);
        const text = await response.text();
        const eventos = parseIcs(text);
        calendarCache.set(deporte, { eventos, expires: Date.now() + (2 * 60 * 1000) });
        return eventos;
    } catch (error) {
        console.error('Error leyendo calendario externo:', error.message);
        return cache?.eventos || [];
    }
}

function parseRrule(rrule) {
    return String(rrule || '').split(';').reduce((acc, part) => {
        const [key, value] = part.split('=');
        acc[key] = value;
        return acc;
    }, {});
}

function diaIcs(date) {
    return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][date.getDay()];
}

function eventoOcurreEnFecha(evento, fecha) {
    if (!evento.dtstart || !evento.dtend) return false;
    const objetivo = new Date(`${fecha}T00:00:00`);
    const objetivoFin = new Date(`${fecha}T23:59:59`);

    if (!evento.rrule) {
        return evento.dtstart <= objetivoFin && evento.dtend >= objetivo;
    }

    const regla = parseRrule(evento.rrule);
    if (regla.FREQ !== 'WEEKLY') return false;
    if (objetivo < new Date(fechaLocal(evento.dtstart) + 'T00:00:00')) return false;
    if (regla.UNTIL) {
        const until = parseIcsDate(regla.UNTIL);
        if (until && objetivo > until) return false;
    }

    const dias = regla.BYDAY ? regla.BYDAY.split(',') : [diaIcs(evento.dtstart)];
    if (!dias.includes(diaIcs(objetivo))) return false;

    const intervalo = Number(regla.INTERVAL || 1);
    const diffMs = objetivo - new Date(fechaLocal(evento.dtstart) + 'T00:00:00');
    const semanas = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return semanas % intervalo === 0;
}

async function bloquesOcupadosCalendario(deporte, fecha) {
    const eventos = await cargarEventosCalendario(deporte);
    const ocupados = [];

    for (const evento of eventos) {
        if (!eventoOcurreEnFecha(evento, fecha)) continue;

        const inicio = new Date(`${fecha}T00:00:00`);
        inicio.setHours(evento.dtstart.getHours(), evento.dtstart.getMinutes(), 0, 0);
        const fin = new Date(`${fecha}T00:00:00`);
        fin.setHours(evento.dtend.getHours(), evento.dtend.getMinutes(), 0, 0);

        const bloqueInicio = bloqueDesdeDate(inicio);
        const bloqueFin = bloqueDesdeDate(fin);

        for (let bloque = bloqueInicio; bloque < bloqueFin; bloque += 0.5) {
            ocupados.push(Number(bloque.toFixed(1)));
        }
    }
    return [...new Set(ocupados)];
}

// Modificado para incluir Google/Samsung Calendar feeds, holds temporales y reservas locales
async function verificarDisponibilidad(cancha, fecha, bloqueInicio, cantidadBloques, excludeId = null) {
    const todas = await dbLoad('reservas');
    
    // 1. Verificar reservas confirmadas locales y holds activos de 5 minutos
    for (let i = 0; i < cantidadBloques; i++) {
        const bloqueActual = bloqueInicio + (i * 0.5);
        
        const conflicto = todas.find(r => {
            if (r.id.toString() === (excludeId || '').toString() || r.fecha !== fecha) return false;
            
            // Verificar si el bloque del turno guardado colisiona con bloqueActual
            const rStart = calcularBloqueDesdeHora(r.horaInicio);
            const rQtyBlocks = Math.ceil(Number(r.duracionHoras || 1) * 2);
            const inRange = (bloqueActual >= rStart && bloqueActual < rStart + (rQtyBlocks * 0.5));
            if (!inRange) return false;

            // Lógica de hold temporal: si está pendiente, solo choca si tiene menos de 5 min
            let holding = false;
            if (r.estado === 'CONFIRMADO') {
                holding = true;
            } else if (r.estado === 'PENDIENTE') {
                const msPassed = Date.now() - new Date(r.timestamp).getTime();
                if (msPassed < 5 * 60 * 1000) {
                    holding = true;
                }
            }

            if (!holding) return false;

            // Conflictos cruzados Fútbol 5 vs Fútbol 8
            const esFutbolNueva = cancha.includes('Futbol') || cancha.includes('Fútbol');
            const esFutbolConflicto = r.cancha.includes('Futbol') || r.cancha.includes('Fútbol');
            if (esFutbolNueva && esFutbolConflicto) return true;
            
            return r.cancha === cancha;
        });

        if (conflicto) return false;
    }

    // 2. Verificar calendarios externos (.ics)
    const deporte = deporteDesdeCancha(cancha);
    try {
        const bloquesExternos = await bloquesOcupadosCalendario(deporte, fecha);
        for (let i = 0; i < cantidadBloques; i++) {
            const bloqueActual = bloqueInicio + (i * 0.5);
            if (bloquesExternos.includes(bloqueActual)) {
                return false;
            }
        }
    } catch (e) {
        console.error("Error al contrastar con calendarios externos:", e.message);
    }

    return true;
}

function obtenerImportes(cancha, duracionHoras) {
    const duracion = Number(duracionHoras || 1);
    const cLower = String(cancha || '').toLowerCase();
    let total = 0;
    let sena = 0;

    if (cLower.includes('pad')) {
        const valorHora = precios.cancha_padel || 30000;
        if (duracion === 2) {
            total = 58000; // Promoción 2 horas de Pádel
        } else if (duracion === 1.5) {
            total = 45000;
        } else {
            total = valorHora * duracion;
        }
        sena = 10000; // Seña fija de $10.000 para Pádel (1h, 1.5h y 2h)
    } else if (cLower.includes('5')) {
        const valorHora = precios.cancha_f5 || 50000;
        total = valorHora * duracion;
        sena = 15000 * duracion;
    } else {
        const valorHora = precios.cancha_f8 || 80000;
        total = valorHora * duracion;
        sena = 20000 * duracion;
    }

    return { total, sena, saldo: total - sena };
}

function firmarCaptcha(payload) {
    return crypto.createHmac('sha256', CAPTCHA_SECRET).update(payload).digest('hex');
}

function crearCaptcha() {
    const a = crypto.randomInt(2, 10);
    const b = crypto.randomInt(2, 10);
    const respuesta = String(a + b);
    const expires = Date.now() + (5 * 60 * 1000);
    const salt = crypto.randomBytes(8).toString('hex');
    const answerHash = crypto.createHash('sha256').update(`${respuesta}:${salt}`).digest('hex');
    const payload = `${expires}.${salt}.${answerHash}`;

    return {
        pregunta: `${a} + ${b}`,
        token: `${payload}.${firmarCaptcha(payload)}`
    };
}

function validarCaptcha(token, respuesta) {
    if (!token || !respuesta) return false;
    const partes = String(token).split('.');
    if (partes.length !== 4) return false;

    const [expires, salt, answerHash, firma] = partes;
    const payload = `${expires}.${salt}.${answerHash}`;
    if (Number(expires) < Date.now()) return false;
    if (firmarCaptcha(payload) !== firma) return false;

    const respuestaHash = crypto
        .createHash('sha256')
        .update(`${String(respuesta).trim()}:${salt}`)
        .digest('hex');

    return respuestaHash === answerHash;
}

async function enviarNotificaciones(reserva) {
    const nombreCliente = reserva.nombre + ' ' + reserva.apellido;
    const importes = obtenerImportes(reserva.cancha, reserva.duracionHoras);
    const monto = reserva.senaPagada;
    
    // Correo al cliente
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: reserva.email || ADMIN_EMAIL,
            subject: '✅ Reserva Confirmada - Wadasaka Club',
            html: `
                <h2>¡Reserva Confirmada!</h2>
                <p>Hola ${nombreCliente}, tu reserva en Wadasaka Club ha sido procesada con éxito.</p>
                <hr>
                <h3>Detalles de la Reserva:</h3>
                <ul>
                    <li><strong>Cancha:</strong> ${reserva.cancha}</li>
                    <li><strong>Fecha:</strong> ${new Date(reserva.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</li>
                    <li><strong>Hora:</strong> ${reserva.horaInicio} hs</li>
                    <li><strong>Duración:</strong> ${reserva.duracionHoras} horas</li>
                    <li><strong>Total del Turno:</strong> $${reserva.totalTurno.toLocaleString('es-AR')}</li>
                    <li><strong>Seña Pagada:</strong> $${monto.toLocaleString('es-AR')}</li>
                    <li><strong>Saldo a Pagar en Cancha:</strong> $${reserva.saldoPendiente.toLocaleString('es-AR')}</li>
                </ul>
                <p>¡Te esperamos en Wadasaka! 🎾⚽</p>
            `
        });
    } catch (error) {
        console.error('Error enviando email al cliente:', error.message);
    }
    
    // Correo al Administrador
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: ADMIN_EMAIL,
            subject: '🔔 Nueva Reserva Confirmada - ' + nombreCliente,
            html: `
                <h2>Nueva Reserva Confirmada</h2>
                <p><strong>Cliente:</strong> ${nombreCliente}</p>
                <p><strong>Teléfono:</strong> ${reserva.telefono}</p>
                <p><strong>Cancha:</strong> ${reserva.cancha}</p>
                <p><strong>Fecha:</strong> ${new Date(reserva.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</p>
                <p><strong>Hora:</strong> ${reserva.horaInicio} hs (${reserva.duracionHoras}h)</p>
                <p><strong>Total:</strong> $${reserva.totalTurno.toLocaleString('es-AR')}</p>
                <p><strong>Seña:</strong> $${monto.toLocaleString('es-AR')} (${reserva.pagoMetodo})</p>
                <p><strong>ID Pago/Referencia:</strong> ${reserva.mercadoPagoId || 'Manual'}</p>
            `
        });
    } catch (error) {
        console.error('Error enviando email al admin:', error.message);
    }
}

// --- ENDPOINTS API ---

app.get('/api/captcha', (req, res) => {
    res.json(crearCaptcha());
});

// Endpoint para consultar tarifas
app.get('/api/precios', (req, res) => {
    res.json(precios);
});

// Endpoint para guardar tarifas (solo admin)
app.post('/api/precios', async (req, res) => {
    precios = req.body;
    await dbSave('precios', precios);
    res.json({ success: true });
});

// Endpoint para consultar productos
app.get('/api/buffet/productos', (req, res) => {
    res.json(productos);
});

// Endpoint para guardar productos (solo admin)
app.put('/api/buffet/productos', async (req, res) => {
    productos = req.body;
    await dbSave('productos', productos);
    res.json({ success: true });
});

// Registrar venta buffet
app.post('/api/buffet/venta', async (req, res) => {
    const { items, metodo, empleado } = req.body;
    let totalSale = 0;
    const soldSummary = [];

    items.forEach(item => {
        const prod = productos.find(p => p.id === item.id);
        if (prod) {
            prod.stock -= item.qty;
            totalSale += item.price * item.qty;
            soldSummary.push(`${item.qty}x ${item.name}`);
        }
    });

    // Guardar inventario actualizado
    await dbSave('productos', productos);

    // Guardar movimiento de caja
    const timestamp = new Date().toISOString();
    cashflow.push({
        id: 'c_' + Date.now(),
        timestamp,
        concepto: `Venta Buffet (${soldSummary.join(', ')})`,
        tipo: 'buffet',
        metodo,
        monto: totalSale,
        empleado
    });
    await dbSave('cashflow', cashflow);

    res.json({ success: true, total: totalSale });
});

// Obtener todas las transacciones de caja
app.get('/api/cashflow', (req, res) => {
    res.json(cashflow);
});

// Obtener auditoría
app.get('/api/audit', (req, res) => {
    res.json(auditLog);
});

// Registrar logs de auditoría
app.post('/api/audit', async (req, res) => {
    const { empleado, accion, detalles } = req.body;
    auditLog.push({
        timestamp: new Date().toISOString(),
        empleado,
        accion,
        detalles
    });
    await dbSave('audit', auditLog);
    res.json({ success: true });
});

// Endpoint de estado de horarios en 3 colores para el cliente
app.get('/api/reservas/estado-horarios', async (req, res) => {
    const { cancha, fecha } = req.query;
    if (!cancha || !fecha) {
        return res.status(400).json({ error: 'Faltan parámetros' });
    }

    const todas = await dbLoad('reservas');
    const ocupados = []; // { bloque, estado: 'CONFIRMADO' | 'PENDIENTE' }

    todas.forEach(r => {
        if (r.fecha !== fecha) return;
        
        // Verificar si es la misma cancha o cruce fútbol 5 vs fútbol 8
        let isMatch = (r.cancha === cancha) ||
            (cancha.includes('Fútbol 8') && r.cancha.includes('Fútbol 5')) ||
            (cancha.includes('Fútbol 5') && r.cancha.includes('Fútbol 8'));

        if (!isMatch) return;

        const start = calcularBloqueDesdeHora(r.horaInicio);
        const qtyBlocks = Math.ceil(Number(r.duracionHoras || 1) * 2);

        let estadoReal = null;
        if (r.estado === 'CONFIRMADO') {
            estadoReal = 'CONFIRMADO';
        } else if (r.estado === 'PENDIENTE') {
            // Un hold está activo si tiene menos de 5 minutos
            const msPassed = Date.now() - new Date(r.timestamp).getTime();
            if (msPassed < 5 * 60 * 1000) {
                estadoReal = 'PENDIENTE';
            }
        }

        if (estadoReal) {
            for (let i = 0; i < qtyBlocks; i++) {
                ocupados.push({ bloque: start + (i * 0.5), estado: estadoReal });
            }
        }
    });

    // Agregar ocupación de calendarios externos (.ics)
    const deporte = deporteDesdeCancha(cancha);
    try {
        const bloquesExternos = await bloquesOcupadosCalendario(deporte, fecha);
        bloquesExternos.forEach(bloque => {
            if (!ocupados.some(o => Math.abs(o.bloque - bloque) < 0.01)) {
                ocupados.push({ bloque, estado: 'CONFIRMADO' });
            }
        });
    } catch (e) {
        console.error("Error al cargar ICS externos para el cliente:", e.message);
    }

    res.json(ocupados);
});

// Endpoint para crear reserva (por la web)
app.post(['/create_preference', '/api/create_preference'], async (req, res) => {
    const { price, nombre, apellido, telefono, email, cancha, fecha, horaInicio, duracionHoras, captchaToken, captchaAnswer, metodoPago } = req.body;
    let esSimulado = req.query.simulado === 'true' || metodoPago === 'transferencia' || metodoPago === 'efectivo';

    try {
        // En la simulación o reservas manuales omitimos captcha si no está presente
        if (!esSimulado && !validarCaptcha(captchaToken, captchaAnswer)) {
            return res.status(400).json({ error: 'Captcha incorrecto. Intenta nuevamente.' });
        }

        const bloqueInicio = calcularBloqueDesdeHora(horaInicio);
        const cantidadBloques = Math.ceil(Number(duracionHoras || 1) * 2);

        // Verificar disponibilidad en tiempo real
        const disponible = await verificarDisponibilidad(cancha, fecha, bloqueInicio, cantidadBloques);
        if (!disponible) {
            return res.status(409).json({ error: 'Ese horario ya no está disponible. Elige otro turno.' });
        }

        let preferenceId = null;
        let initPoint = null;

        // Determinar URL pública HTTPS del servidor dinámicamente
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'wadasaka-app-club.vercel.app';
        let currentUrl = process.env.APP_URL;
        if (!currentUrl) {
            currentUrl = host.includes('localhost') ? `http://${host}` : `https://${host}`;
        }
        if (!currentUrl.startsWith('http')) {
            currentUrl = `https://${currentUrl}`;
        }

        // Intentar crear la preferencia de Mercado Pago si se eligió MercadoPago
        if (!esSimulado) {
            const token = String(process.env.MP_ACCESS_TOKEN || '').trim();
            if (token) {
                try {
                    const dynamicClient = new MercadoPagoConfig({ accessToken: token });
                    const preference = new Preference(dynamicClient);
                    const prefBody = {
                        items: [{
                            title: 'Seña Reserva Wadasaka Club',
                            quantity: 1,
                            unit_price: Number(price),
                            currency_id: 'ARS'
                        }],
                        back_urls: {
                            success: `${currentUrl}/?pago=aprobado`,
                            failure: `${currentUrl}/?pago=fallido`,
                            pending: `${currentUrl}/?pago=pendiente`
                        },
                        auto_return: 'approved'
                    };

                    if (!currentUrl.includes('localhost')) {
                        prefBody.notification_url = `${currentUrl}/api/pagos/webhook`;
                    }

                    const response = await preference.create({ body: prefBody });
                    preferenceId = response.id;
                    initPoint = response.init_point || response.sandbox_init_point;
                } catch (mpErr) {
                    console.error('⚠️ MercadoPago no disponible, usando fallback directo:', mpErr.message || mpErr);
                    esSimulado = true;
                }
            } else {
                esSimulado = true;
            }
        }

        if (esSimulado || !initPoint) {
            preferenceId = 'direct_' + Date.now();
            initPoint = metodoPago === 'transferencia' ? '/?pago=transferencia' : '/?pago=aprobado';
        }
        
        // Calcular importes sugeridos y seña
        const importes = obtenerImportes(cancha, duracionHoras);
        const esConfirmado = metodoPago === 'efectivo' || esSimulado;

        // Crear nueva reserva
        const nuevaReserva = {
            id: Date.now(),
            nombre,
            apellido,
            telefono,
            email,
            cancha,
            fecha,
            horaInicio,
            duracionHoras,
            estado: esConfirmado ? 'CONFIRMADO' : 'PENDIENTE',
            mercadoPagoId: null,
            preferenceId,
            pagoMetodo: metodoPago || 'mercadopago',
            totalTurno: importes.total,
            senaPagada: Number(price || importes.sena),
            saldoPendiente: importes.total - Number(price || importes.sena),
            timestamp: new Date().toISOString()
        };
        
        const reservas = await dbLoad('reservas');
        reservas.push(nuevaReserva);
        await dbSave('reservas', reservas);
        recargarReservasConfirmadas();
        
        res.json({ init_point: initPoint, id: preferenceId });
    } catch (error) {
        console.error('❌ Error al procesar reserva:', error.message || error);
        res.status(500).json({ error: error.message || 'Error al procesar la reserva.' });
    }
});

// Confirmación manual (Aprobar Pago) de reservas pendientes
app.post('/api/reservas/:id/confirmar', async (req, res) => {
    const { id } = req.params;
    const { empleado } = req.body;

    const reservas = await dbLoad('reservas');
    const index = reservas.findIndex(r => r.id.toString() === id.toString());
    if (index === -1) {
        return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const r = reservas[index];
    r.estado = 'CONFIRMADO';
    r.pagoMetodo = 'transferencia'; // Confirmación manual de transferencia web
    await dbSave('reservas', reservas);
    recargarReservasConfirmadas();

    // Registrar cobro de seña en caja
    cashflow.push({
        id: 'c_' + Date.now(),
        timestamp: new Date().toISOString(),
        concepto: `Seña Web Confirmada: ${r.cancha} (${r.nombre} ${r.apellido})`,
        tipo: 'canchas',
        metodo: 'transferencia',
        monto: r.senaPagada,
        empleado
    });
    await dbSave('cashflow', cashflow);

    // Sincronizar con Google Calendar
    await registrarEventoGoogleCalendar(r);

    // Enviar correos automáticos
    await enviarNotificaciones(r);

    res.json({ success: true });
});

// Crear reserva manual directa por administrador
app.post('/api/reservas/manual', async (req, res) => {
    const r = req.body;
    
    const bloqueInicio = calcularBloqueDesdeHora(r.horaInicio);
    const cantidadBloques = Math.ceil(Number(r.duracionHoras || 1) * 2);

    const disponible = await verificarDisponibilidad(r.cancha, r.fecha, bloqueInicio, cantidadBloques);
    if (!disponible) {
        return res.status(409).json({ error: 'Ese horario ya no está disponible' });
    }

    const importes = obtenerImportes(r.cancha, r.duracionHoras);

    const nueva = {
        id: r.id,
        nombre: r.nombre,
        apellido: r.apellido,
        telefono: r.telefono,
        email: r.email || '',
        cancha: r.cancha,
        fecha: r.fecha,
        horaInicio: r.horaInicio,
        duracionHoras: r.duracionHoras,
        estado: r.estado, // CONFIRMADO o PENDIENTE
        mercadoPagoId: null,
        preferenceId: null,
        totalTurno: r.totalTurno || importes.total,
        senaPagada: r.senaPagada || 0,
        saldoPendiente: (r.totalTurno || importes.total) - (r.senaPagada || 0),
        pagoMetodo: r.pagoMetodo || 'efectivo',
        timestamp: new Date().toISOString()
    };

    const reservas = await dbLoad('reservas');
    reservas.push(nueva);
    await dbSave('reservas', reservas);
    recargarReservasConfirmadas();

    // Registrar en caja si abonó seña o total
    let montoCaja = 0;
    let concepto = '';
    if (r.estado === 'CONFIRMADO') {
        montoCaja = nueva.totalTurno;
        concepto = `Cobro Total Manual: Cancha ${r.cancha} (${r.nombre})`;
    } else if (nueva.senaPagada > 0) {
        montoCaja = nueva.senaPagada;
        concepto = `Seña Manual: Cancha ${r.cancha} (${r.nombre})`;
    }

    if (montoCaja > 0) {
        cashflow.push({
            id: 'c_' + Date.now(),
            timestamp: new Date().toISOString(),
            concepto,
            tipo: 'canchas',
            metodo: nueva.pagoMetodo,
            monto: montoCaja,
            empleado: r.empleado
        });
        await dbSave('cashflow', cashflow);
    }

    if (r.estado === 'CONFIRMADO') {
        await registrarEventoGoogleCalendar(nueva);
        if (nueva.email) await enviarNotificaciones(nueva);
    }

    res.json({ success: true });
});

// Modificar reserva existente
app.put('/api/reservas/:id', async (req, res) => {
    const { id } = req.params;
    const body = req.body;

    const reservas = await dbLoad('reservas');
    const index = reservas.findIndex(r => r.id.toString() === id.toString());
    if (index === -1) {
        return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    const old = reservas[index];
    const bloqueInicio = calcularBloqueDesdeHora(body.horaInicio);
    const cantidadBloques = Math.ceil(Number(body.duracionHoras || 1) * 2);

    // Verificar si el cambio choca con otros turnos
    const disponible = await verificarDisponibilidad(body.cancha, body.fecha, bloqueInicio, cantidadBloques, id);
    if (!disponible) {
        return res.status(409).json({ error: 'Horario en conflicto con otro turno' });
    }

    // Registrar cobros extras si pasa de PENDIENTE a CONFIRMADO (Cerrado/Pagado)
    if (old.estado !== 'CONFIRMADO' && body.estado === 'CONFIRMADO') {
        const saldoRestante = body.totalTurno - old.senaPagada;
        if (saldoRestante > 0) {
            cashflow.push({
                id: 'c_' + Date.now(),
                timestamp: new Date().toISOString(),
                concepto: `Cobro Saldo Restante: ${body.cancha} (${body.nombre} ${body.apellido})`,
                tipo: 'canchas',
                metodo: body.pagoMetodo,
                monto: saldoRestante,
                empleado: body.empleado || 'Admin'
            });
            await dbSave('cashflow', cashflow);
        }
        
        // Sincronizar calendario al confirmarse
        const confirmada = { ...old, ...body };
        await registrarEventoGoogleCalendar(confirmada);
        if (confirmada.email) await enviarNotificaciones(confirmada);
    } else if (old.senaPagada === 0 && body.senaPagada > 0 && body.estado !== 'CONFIRMADO') {
        // Cobro de seña sobre reserva pendiente
        cashflow.push({
            id: 'c_' + Date.now(),
            timestamp: new Date().toISOString(),
            concepto: `Cobro Seña Turno: ${body.cancha} (${body.nombre})`,
            tipo: 'canchas',
            metodo: body.pagoMetodo,
            monto: body.senaPagada,
            empleado: body.empleado || 'Admin'
        });
        await dbSave('cashflow', cashflow);
    }

    reservas[index] = {
        ...old,
        nombre: body.nombre,
        apellido: body.apellido,
        telefono: body.telefono,
        email: body.email || old.email || '',
        fecha: body.fecha,
        horaInicio: body.horaInicio,
        duracionHoras: body.duracionHoras,
        estado: body.estado,
        senaPagada: body.senaPagada,
        pagoMetodo: body.pagoMetodo,
        totalTurno: body.totalTurno,
        saldoPendiente: body.totalTurno - body.senaPagada
    };

    await dbSave('reservas', reservas);
    recargarReservasConfirmadas();

    res.json({ success: true });
});

// Eliminar reserva
app.delete('/api/reservas/:id', async (req, res) => {
    const { id } = req.params;
    const reservas = await dbLoad('reservas');
    const filtered = reservas.filter(r => r.id.toString() !== id.toString());
    
    if (reservas.length === filtered.length) {
        return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    await dbSave('reservas', filtered);
    recargarReservasConfirmadas();
    res.json({ success: true });
});

// Obtener todas las reservas
app.get('/api/reservas/todas', async (req, res) => {
    const todas = await dbLoad('reservas');
    res.json(todas);
});

// Webhook de Mercado Pago para acreditar pagos online
app.post('/api/pagos/webhook', async (req, res) => {
    const { action, data } = req.body;
    console.log('🔔 Webhook Recibido:', { action, id: data?.id });
    
    if (action === 'payment.created' || action === 'payment.updated') {
        try {
            const token = String(process.env.MP_ACCESS_TOKEN || '').trim();
            const mpClient = new MercadoPagoConfig({ accessToken: token });
            const payment = new Payment(mpClient);
            const paymentData = await payment.get({ id: data.id });
            
            console.log('💳 Estado de Pago Mercado Pago:', paymentData.status);
            
            if (paymentData.status === 'approved') {
                const preferenceId = paymentData.preference_id;
                const transactionAmount = paymentData.transaction_amount;
                
                const reservas = await dbLoad('reservas');
                let reserva = reservas.find(r => r.preferenceId && r.preferenceId === preferenceId);
                
                // Fallback: Si la transferencia llegó por Alias/CVU a la cuenta sin preferenceId, buscar la reserva PENDIENTE más reciente que coincida en el monto
                if (!reserva) {
                    const ahora = Date.now();
                    reserva = reservas.find(r => {
                        if (r.estado !== 'PENDIENTE') return false;
                        const msPassed = ahora - new Date(r.timestamp).getTime();
                        if (msPassed > 30 * 60 * 1000) return false; // Creada en los últimos 30 min
                        return Math.abs(Number(r.senaPagada) - Number(transactionAmount)) < 1;
                    });
                }
                
                if (reserva && reserva.estado !== 'CONFIRMADO') {
                    reserva.estado = 'CONFIRMADO';
                    reserva.mercadoPagoId = data.id;
                    reserva.pagoMetodo = 'transferencia'; // Clasificar cobro web
                    
                    await dbSave('reservas', reservas);
                    recargarReservasConfirmadas();

                    // Registrar en Libro Diario
                    cashflow.push({
                        id: 'c_' + Date.now(),
                        timestamp: new Date().toISOString(),
                        concepto: `Seña Aprobada Auto (MP/Transferencia): ${reserva.cancha} (${reserva.nombre})`,
                        tipo: 'canchas',
                        metodo: 'transferencia',
                        monto: reserva.senaPagada,
                        empleado: 'Integración Automática MP'
                    });
                    await dbSave('cashflow', cashflow);

                    // Sincronizar Google Calendar
                    await registrarEventoGoogleCalendar(reserva);

                    // Enviar correos
                    await enviarNotificaciones(reserva);
                    
                    console.log('✅ Reserva Confirmada Automáticamente por Mercado Pago / Transferencia:', reserva.id);
                }
            }
        } catch (error) {
            console.error('❌ Error webhook Mercado Pago:', error.message);
        }
    }
    
    res.status(200).send('OK');
});

// --- CRON: NOTIFICACIÓN DIARIA AUTOMÁTICA (23:00) ---
app.get('/api/cron/notificacion-diaria', async (req, res) => {
    // Validar firma de cron de Vercel para seguridad
    const secret = req.headers.authorization;
    if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        const todas = await dbLoad('reservas');
        
        // Obtener fecha de mañana en Buenos Aires (UTC-3)
        const hoy = new Date();
        const mañana = new Date(hoy.getTime() + (24 * 60 * 60 * 1000));
        const mañanaStr = fechaLocal(mañana);

        const reservasMañana = todas.filter(r => r.fecha === mañanaStr && r.estado === 'CONFIRMADO');

        // Formatear el HTML del correo
        let listHtml = '<ul>';
        if (reservasMañana.length === 0) {
            listHtml += '<li>Sin reservas confirmadas para mañana.</li>';
        } else {
            // Ordenar por horario de inicio
            reservasMañana.sort((a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio));
            reservasMañana.forEach(r => {
                const total = r.totalTurno || 0;
                const saldo = r.saldoPendiente || 0;
                listHtml += `
                    <li>
                        <strong>${r.horaInicio} hs</strong> - ${r.cancha}<br>
                        Cliente: ${r.nombre} ${r.apellido} (${r.telefono})<br>
                        Monto total: $${total.toLocaleString('es-AR')} (Saldo pendiente: $${saldo.toLocaleString('es-AR')})
                    </li><br>
                `;
            });
        }
        listHtml += '</ul>';

        // Enviar email consolidado de cierre de turnos
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: ADMIN_EMAIL,
            subject: `📅 Cronograma de Reservas para Mañana - Wadasaka Club (${mañanaStr.split('-').reverse().join('/')})`,
            html: `
                <h2>Resumen Diario de Reservas</h2>
                <p>Este es el reporte consolidado de los turnos programados para mañana:</p>
                <hr>
                ${listHtml}
                <hr>
                <p>Generado automáticamente por el servidor de Wadasaka Club.</p>
            `
        });

        console.log(`✉️ Consolidado de reservas de mañana (${mañanaStr}) enviado a las 23hs.`);
        res.json({ success: true, count: reservasMañana.length });
    } catch (e) {
        console.error("Error al procesar el reporte diario:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// Servir página principal y panel admin
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Cargar memoria de archivos al iniciar
reloadMemoryCache();

if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log('🚀 Servidor WADASAKA CLUB corriendo en puerto ' + PORT);
        console.log('📖 Base de datos con soporte dual local/nube activa.');
    });
}

module.exports = app;
