const fs = require('fs');

// Fix the one remaining line in index.html - the transfer message
let content = fs.readFileSync('public/index.html', 'utf8');

// Find and replace the specific bad line
// The broken form has: ðŸ¦  (bank emoji corrupted) and Ã‰ (É corrupted)
// and \\n\\n (literal backslash-n instead of actual newlines)

// Replace the entire broken message with a clean version
const badPattern = /mostrarMensaje\('success', `[^`]*Reserva Solicitada con[^`]*`\)/;
const goodMessage = "mostrarMensaje('success', `\uD83C\uDFE6 \u00A1Reserva Solicitada con \u00C9xito!\\n\\n1. Transfiere ${montoVal} al alias exclusivo de reservas: ${reservasAlias}\\n2. En el MOTIVO de la transferencia coloca: ${refCode}\\n3. Tu turno ya est\u00E1 reservado en el sistema. Al verificar el dinero se pasar\u00E1 a confirmado de inmediato.`)";

if (badPattern.test(content)) {
    content = content.replace(badPattern, goodMessage);
    console.log('Replaced transfer message successfully');
} else {
    console.log('Pattern not found, showing context:');
    const line = content.split('\n').find(l => l.includes('Reserva Solicitada'));
    if (line) console.log(JSON.stringify(line.trim().substring(0, 120)));
}

fs.writeFileSync('public/index.html', content, 'utf8');

// Final verification
const check = fs.readFileSync('public/index.html', 'utf8');
const remaining = check.split('\n').filter(l => /[\u00C3]/.test(l));
console.log('Remaining bad lines:', remaining.length);
remaining.forEach(l => console.log(' -', l.trim().substring(0, 80)));
