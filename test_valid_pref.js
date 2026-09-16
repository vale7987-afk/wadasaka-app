process.env.APP_URL = 'https://wadasaka-app-club.vercel.app';
const http = require('http');
const app = require('./server.js');
const server = http.createServer(app);

server.listen(3097, async () => {
    try {
        const captchaRes = await fetch('http://localhost:3097/api/captcha');
        const captchaData = await captchaRes.json();
        const [a, b] = captchaData.pregunta.split('+').map(s => parseInt(s));
        const answer = String(a + b);

        const res = await fetch('http://localhost:3097/api/create_preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                price: 10000,
                nombre: 'Juan',
                apellido: 'Perez',
                telefono: '1122334455',
                email: 'test@wadasaka.com',
                cancha: 'Cancha de Fútbol 5',
                fecha: '2026-09-20',
                horaInicio: '18:00',
                duracionHoras: 1,
                captchaToken: captchaData.token,
                captchaAnswer: answer
            })
        });

        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response text:", text);
    } catch (e) {
        console.error("Test error:", e);
    } finally {
        server.close();
    }
});
