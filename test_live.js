const http = require('http');

async function run() {
    try {
        const captchaRes = await fetch('https://wadasaka-app-club.vercel.app/api/captcha');
        const captchaData = await captchaRes.json();
        const [a, b] = captchaData.pregunta.split('+').map(s => parseInt(s));
        const answer = String(a + b);

        const res = await fetch('https://wadasaka-app-club.vercel.app/api/create_preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                price: 500,
                nombre: 'Test',
                apellido: 'User',
                telefono: '1122334455',
                email: 'test@test.com',
                cancha: 'Cancha de Fútbol 5',
                fecha: '2026-10-10',
                horaInicio: '10:00',
                duracionHoras: 1,
                captchaToken: captchaData.token,
                captchaAnswer: answer,
                metodoPago: 'mercadopago'
            })
        });

        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response:", text);
    } catch (e) {
        console.error(e);
    }
}
run();
