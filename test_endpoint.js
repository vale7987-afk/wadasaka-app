const http = require('http');

const app = require('./server.js');

const server = http.createServer(app);

server.listen(3099, async () => {
    console.log("Testing server running on port 3099");
    try {
        const res = await fetch('http://localhost:3099/api/create_preference', {
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
                captchaToken: 'invalid',
                captchaAnswer: '4'
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
