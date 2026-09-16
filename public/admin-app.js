/* ==========================================================================
   Wadasaka Club - Lógica del Panel de Administración (API)
   ========================================================================== */

let state = {
    currentRole: 'owner',
    currentUserDisplay: 'Propietario',
    currentTab: 'dashboard',
    currentDate: '', // Formato YYYY-MM-DD
    prices: {
        cancha_f5: 50000,
        cancha_f8: 80000,
        cancha_padel: 30000
    },
    canchas: [
        { id: 'cancha_f5_a', name: 'Fútbol 5 - Cancha A', type: 'f5' },
        { id: 'cancha_f5_b', name: 'Fútbol 5 - Cancha B', type: 'f5' },
        { id: 'cancha_f8', name: 'Fútbol 8 (Fusión A+B)', type: 'f8' },
        { id: 'cancha_padel', name: 'Cancha Pádel', type: 'padel' }
    ],
    bookings: [],
    pendingOnline: [], // Se carga de las reservas PENDIENTES con menos de 5 min
    products: [],
    cashflow: [],
    auditLog: []
};

const employees = {
    'owner': { name: 'Propietario', role: 'Administrador' },
    'employee_lucas': { name: 'Lucas', role: 'Empleado Turno Tarde' },
    'employee_sofia': { name: 'Sofia', role: 'Empleado Turno Noche' }
};

let cart = [];

document.addEventListener('DOMContentLoaded', async () => {
    initDate();
    await loadInitialData();
    setupEventListeners();
    updateClock();
    setInterval(updateClock, 1000);
    renderApp();
    
    // Polling de actualización de datos en tiempo real cada 10 segundos
    setInterval(async () => {
        await refreshRealtimeData();
        renderApp();
    }, 10000);
});

function initDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    state.currentDate = `${yyyy}-${mm}-${dd}`;
    
    const dateInput = document.getElementById('calendar-date-input');
    if (dateInput) {
        dateInput.value = state.currentDate;
    }
}

async function loadInitialData() {
    try {
        await Promise.all([
            fetchPrices(),
            fetchBookings(),
            fetchProducts(),
            fetchCashflow(),
            fetchAuditLog()
        ]);
        
        // Cargar link de código fuente en Vercel
        const btnViewSource = document.getElementById('btn-view-source');
        if (btnViewSource) {
            btnViewSource.href = window.location.origin; // O un link de Github si está configurado
        }
    } catch (e) {
        console.error("Error al cargar los datos del servidor:", e);
        showToast("Error de conexión con el servidor. Usando datos locales.", "error");
    }
}

async function refreshRealtimeData() {
    try {
        await Promise.all([
            fetchBookings(),
            fetchProducts(),
            fetchCashflow(),
            fetchAuditLog()
        ]);
    } catch (e) {
        console.error("Error en refresco en tiempo real:", e);
    }
}

// --- LLAMADAS API (FETCH) ---

async function fetchPrices() {
    const res = await fetch('/api/precios');
    if (res.ok) {
        state.prices = await res.json();
    }
}

async function fetchBookings() {
    const res = await fetch('/api/reservas/todas');
    if (res.ok) {
        const all = await res.json();
        
        // Filtrar reservas locales
        state.bookings = all.filter(r => r.estado === 'CONFIRMADO');
        
        // Filtrar reservas que están PENDIENTES y tienen menos de 5 minutos
        // Estas representan turnos en proceso de pago
        state.pendingOnline = all.filter(r => {
            if (r.estado !== 'PENDIENTE') return false;
            const msPassed = Date.now() - new Date(r.timestamp).getTime();
            return msPassed < 5 * 60 * 1000;
        });
    }
}

async function fetchProducts() {
    const res = await fetch('/api/buffet/productos');
    if (res.ok) {
        state.products = await res.json();
    }
}

async function fetchCashflow() {
    const res = await fetch('/api/cashflow');
    if (res.ok) {
        state.cashflow = await res.json();
    }
}

async function fetchAuditLog() {
    const res = await fetch('/api/audit');
    if (res.ok) {
        state.auditLog = await res.json();
    }
}

async function postAudit(accion, detalles) {
    const empleado = employees[state.currentRole].name;
    try {
        await fetch('/api/audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empleado, accion, detalles })
        });
        await fetchAuditLog();
    } catch (e) {
        console.error("Error al registrar auditoría:", e);
    }
}

// --- RELOJ ---
function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString('es-AR');
    }
}

// --- MANEJO DE EVENTOS ---
function setupEventListeners() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    const roleSelect = document.getElementById('role-select');
    if (roleSelect) {
        roleSelect.addEventListener('change', (e) => {
            setRole(e.target.value);
        });
    }

    const mobileToggle = document.getElementById('btn-mobile-toggle');
    const sidebar = document.getElementById('main-sidebar');
    if (mobileToggle && sidebar) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
        });
    }

    const prevDayBtn = document.getElementById('btn-prev-day');
    const nextDayBtn = document.getElementById('btn-next-day');
    const dateInput = document.getElementById('calendar-date-input');

    if (prevDayBtn) prevDayBtn.addEventListener('click', () => adjustDate(-1));
    if (nextDayBtn) nextDayBtn.addEventListener('click', () => adjustDate(1));
    if (dateInput) {
        dateInput.addEventListener('change', (e) => {
            state.currentDate = e.target.value;
            renderApp();
        });
    }

    const searchInput = document.getElementById('buffet-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', renderBuffetProducts);
    }

    document.querySelectorAll('#buffet-category-filters .btn-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#buffet-category-filters .btn-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderBuffetProducts();
        });
    });

    const clearCartBtn = document.getElementById('btn-clear-cart');
    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', () => {
            cart = [];
            renderCart();
            showToast('Carrito vaciado', 'info');
        });
    }

    const checkoutBtn = document.getElementById('btn-checkout-buffet');
    if (checkoutBtn) checkoutBtn.addEventListener('click', checkoutBuffet);

    document.getElementById('btn-close-booking-modal').addEventListener('click', hideBookingModal);
    document.getElementById('btn-cancel-booking').addEventListener('click', hideBookingModal);
    document.getElementById('form-booking').addEventListener('submit', saveBookingForm);
    document.getElementById('btn-delete-booking').addEventListener('click', deleteBooking);
    
    const durationSelect = document.getElementById('booking-duracion');
    if (durationSelect) {
        durationSelect.addEventListener('change', updateSuggestedPriceInModal);
    }

    const addProductBtn = document.getElementById('btn-add-product');
    if (addProductBtn) {
        addProductBtn.addEventListener('click', () => showProductModal());
    }
    document.getElementById('btn-close-product-modal').addEventListener('click', hideProductModal);
    document.getElementById('btn-cancel-product').addEventListener('click', hideProductModal);
    document.getElementById('form-product').addEventListener('submit', saveProductForm);
    document.getElementById('btn-delete-product').addEventListener('click', deleteProduct);

    // Simulador de reservas
    document.getElementById('btn-sim-booking-f5').addEventListener('click', () => simulateWebBooking('futbol5'));
    document.getElementById('btn-sim-booking-f8').addEventListener('click', () => simulateWebBooking('futbol8'));
    document.getElementById('btn-sim-booking-padel').addEventListener('click', () => simulateWebBooking('padel'));

    // Configuración: Guardar tarifas
    const formPrices = document.getElementById('form-prices-canchas');
    if (formPrices) {
        formPrices.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (state.currentRole !== 'owner') return;
            
            const prices = {
                cancha_f5: parseFloat(document.getElementById('cfg-price-f5').value),
                cancha_f8: parseFloat(document.getElementById('cfg-price-f8').value),
                cancha_padel: parseFloat(document.getElementById('cfg-price-padel').value)
            };

            const res = await fetch('/api/precios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(prices)
            });

            if (res.ok) {
                state.prices = prices;
                await postAudit('Modificar Tarifas', `F5=$${prices.cancha_f5}, F8=$${prices.cancha_f8}, Pádel=$${prices.cancha_padel}`);
                showToast('Tarifas actualizadas', 'success');
                renderApp();
            } else {
                showToast('Error al guardar tarifas', 'error');
            }
        });
    }

    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) exportBtn.addEventListener('click', exportCashflowToCSV);
}

function switchTab(tabId) {
    if ((tabId === 'reportes' || tabId === 'configuracion') && state.currentRole !== 'owner') {
        showToast('Acceso denegado. Se requiere perfil de Propietario.', 'error');
        return;
    }
    
    state.currentTab = tabId;
    
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        }
    });

    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    const activePane = document.getElementById(`tab-${tabId}`);
    if (activePane) activePane.classList.add('active');
    
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        const titleMap = {
            'dashboard': 'Dashboard General',
            'canchas': 'Agenda Interactiva de Canchas',
            'buffet': 'Control de Buffet & Kiosco',
            'reservas-online': 'Verificar Reservas Web',
            'reportes': 'Reporte Financiero y Caja',
            'configuracion': 'Ajustes del Sistema'
        };
        pageTitle.textContent = titleMap[tabId] || 'Dashboard';
    }

    document.getElementById('main-sidebar').classList.remove('mobile-open');
    renderApp();
}

function setRole(roleKey) {
    state.currentRole = roleKey;
    const user = employees[roleKey];
    state.currentUserDisplay = user.name;
    
    document.getElementById('display-user-name').textContent = user.name;
    document.getElementById('display-user-role').textContent = user.role;
    document.getElementById('user-avatar').textContent = user.name.charAt(0);
    
    if (roleKey === 'owner') {
        document.body.classList.add('role-owner');
        document.body.classList.remove('role-employee');
    } else {
        document.body.classList.remove('role-owner');
        document.body.classList.add('role-employee');
        
        if (state.currentTab === 'reportes' || state.currentTab === 'configuracion') {
            switchTab('dashboard');
        }
    }
    
    postAudit('Cambio de Rol', `Sesión iniciada como ${user.name}`);
    showToast(`Operando como: ${user.name}`, 'success');
    renderApp();
}

function adjustDate(days) {
    const current = new Date(state.currentDate + 'T00:00:00');
    current.setDate(current.getDate() + days);
    
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    state.currentDate = `${yyyy}-${mm}-${dd}`;
    
    document.getElementById('calendar-date-input').value = state.currentDate;
    renderApp();
}

// --- RENDERIZADO GENERAL ---
function renderApp() {
    renderDashboard();
    renderAgendaGrid();
    renderBuffetProducts();
    renderCart();
    renderQuickStockList();
    renderPendingOnlineList();
    renderReports();
    loadConfigFormValues();
}

// --- RENDER: DASHBOARD ---
function renderDashboard() {
    const todayStr = state.currentDate;
    
    // Filtrar transacciones de hoy
    const todayCashEntries = state.cashflow.filter(c => {
        const entryDate = c.timestamp.split('T')[0];
        return entryDate === todayStr;
    });

    let canchasIncome = 0;
    let buffetIncome = 0;
    let cashTotal = 0;
    let transferTotal = 0;

    todayCashEntries.forEach(c => {
        if (c.tipo === 'canchas') canchasIncome += c.monto;
        if (c.tipo === 'buffet') buffetIncome += c.monto;
        if (c.metodo === 'efectivo') cashTotal += c.monto;
        if (c.metodo === 'transferencia') transferTotal += c.monto;
    });

    const totalIncome = canchasIncome + buffetIncome;

    const dashTodayIncome = document.getElementById('dash-today-income');
    const dashIncomeBreakdown = document.getElementById('dash-income-breakdown');
    const dashCurrentCash = document.getElementById('dash-current-cash');
    const dashCashBreakdown = document.getElementById('dash-cash-breakdown');

    if (state.currentRole === 'owner') {
        if (dashTodayIncome) dashTodayIncome.textContent = formatCurrency(totalIncome);
        if (dashIncomeBreakdown) dashIncomeBreakdown.textContent = `Canchas: ${formatCurrency(canchasIncome)} | Buffet: ${formatCurrency(buffetIncome)}`;
        if (dashCurrentCash) dashCurrentCash.textContent = formatCurrency(cashTotal + transferTotal);
        if (dashCashBreakdown) dashCashBreakdown.textContent = `Efectivo: ${formatCurrency(cashTotal)} | Transferencia: ${formatCurrency(transferTotal)}`;
    } else {
        if (dashTodayIncome) dashTodayIncome.innerHTML = `<span class="blurred-text">$ *****</span>`;
        if (dashIncomeBreakdown) dashIncomeBreakdown.textContent = "Restringido (Propietario)";
        if (dashCurrentCash) dashCurrentCash.innerHTML = `<span class="blurred-text">$ *****</span>`;
        if (dashCashBreakdown) dashCashBreakdown.textContent = "Restringido (Propietario)";
    }

    // Cantidad de reservas confirmadas de hoy
    const todayBookings = state.bookings.filter(b => b.fecha === todayStr);
    const bookingsEl = document.getElementById('dash-today-bookings');
    if (bookingsEl) bookingsEl.textContent = `${todayBookings.length} activo(s)`;

    // Alertas de Stock
    const lowStockCount = state.products.filter(p => p.stock < p.minStock).length;
    const stockAlertsEl = document.getElementById('dash-stock-alerts');
    const stockSubtextEl = document.getElementById('dash-stock-subtext');
    const alertCard = document.getElementById('alert-stock-card');
    
    if (stockAlertsEl) stockAlertsEl.textContent = lowStockCount;
    if (stockSubtextEl) {
        stockSubtextEl.textContent = `${lowStockCount} producto(s) bajo mínimo`;
    }

    if (alertCard) {
        if (lowStockCount > 0) alertCard.classList.add('alert-active');
        else alertCard.classList.remove('alert-active');
    }

    renderDashboardCanchasStatus();
    renderDashboardRecentActivity(todayCashEntries);
    renderDashboardLowStock();
}

function renderDashboardCanchasStatus() {
    const container = document.getElementById('canchas-status-container');
    if (!container) return;
    container.innerHTML = '';

    const todayStr = state.currentDate;
    const now = new Date();
    const currentHourStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    state.canchas.forEach(cancha => {
        // Encontrar reserva activa ahora
        const activeBooking = state.bookings.find(b => {
            if (b.cancha !== getMappedCanchaName(cancha.id) || b.fecha !== todayStr) return false;
            const start = timeToMinutes(b.horaInicio);
            const end = start + (b.duracionHoras * 60);
            const current = timeToMinutes(currentHourStr);
            return (current >= start && current < end);
        });

        const nextBooking = state.bookings
            .filter(b => b.cancha === getMappedCanchaName(cancha.id) && b.fecha === todayStr && timeToMinutes(b.horaInicio) > timeToMinutes(currentHourStr))
            .sort((a, b) => timeToMinutes(a.horaInicio) - timeToMinutes(b.horaInicio))[0];

        let statusClass = 'disponible';
        let statusText = 'Disponible';
        let clientInfoHTML = '';

        if (activeBooking) {
            statusClass = 'ocupado';
            statusText = 'En Juego';
            const endTime = minutesToTime(timeToMinutes(activeBooking.horaInicio) + (activeBooking.duracionHoras * 60));
            clientInfoHTML = `
                <div class="cancha-current-booking">
                    <span class="cancha-current-client">${activeBooking.nombre} ${activeBooking.apellido}</span>
                    <span class="cancha-current-time">${activeBooking.horaInicio} a ${endTime}</span>
                </div>
            `;
        } else {
            // Verificar hold/pendiente temporal
            const activeHold = state.pendingOnline.find(b => {
                if (b.cancha !== getMappedCanchaName(cancha.id) || b.fecha !== todayStr) return false;
                const start = timeToMinutes(b.horaInicio);
                const end = start + (b.duracionHoras * 60);
                const current = timeToMinutes(currentHourStr);
                return (current >= start && current < end);
            });

            if (activeHold) {
                statusClass = 'reservado';
                statusText = 'En Espera / Hold';
                const endTime = minutesToTime(timeToMinutes(activeHold.horaInicio) + (activeHold.duracionHoras * 60));
                clientInfoHTML = `
                    <div class="cancha-current-booking" style="border-color: var(--state-reservado);">
                        <span class="cancha-current-client" style="color:var(--state-reservado);">${activeHold.nombre} (Web)</span>
                        <span class="cancha-current-time">${activeHold.horaInicio} a ${endTime}</span>
                    </div>
                `;
            } else {
                const isConflicted = checkConflictActive(cancha.id, todayStr, currentHourStr);
                if (isConflicted) {
                    statusClass = 'conflicto';
                    statusText = cancha.type === 'f8' ? 'Cruce (F5 Activa)' : 'Cruce (F8 Activa)';
                    clientInfoHTML = `
                        <div class="cancha-current-booking" style="border-style: dashed;">
                            <span class="cancha-current-client" style="color: var(--text-muted);">Cancha Cruzada en Uso</span>
                        </div>
                    `;
                }
            }
        }

        const itemHTML = `
            <div class="cancha-status-item">
                <div class="cancha-status-header">
                    <span class="cancha-status-name">${cancha.name}</span>
                    <span class="badge badge-${statusClass === 'disponible' ? 'success' : statusClass === 'reservado' ? 'warning' : 'danger'}">${statusText}</span>
                </div>
                ${clientInfoHTML}
                <div class="cancha-next-booking">
                    ${nextBooking ? `Próximo: ${nextBooking.nombre} (${nextBooking.horaInicio} hs)` : 'Sin más turnos hoy'}
                </div>
            </div>
        `;
        container.innerHTML += itemHTML;
    });
}

function checkConflictActive(canchaId, date, timeStr) {
    const timeVal = timeToMinutes(timeStr);
    const activeBookingConflict = state.bookings.find(b => {
        if (b.fecha !== date) return false;
        const start = timeToMinutes(b.horaInicio);
        const end = start + (b.duracionHoras * 60);
        const isOverlapping = (timeVal >= start && timeVal < end);
        if (!isOverlapping) return false;

        const bCanchaId = getReverseMappedCanchaId(b.cancha);

        if (canchaId === 'cancha_f8' && (bCanchaId === 'cancha_f5_a' || bCanchaId === 'cancha_f5_b')) return true;
        if ((canchaId === 'cancha_f5_a' || canchaId === 'cancha_f5_b') && bCanchaId === 'cancha_f8') return true;

        return false;
    });
    return !!activeBookingConflict;
}

function renderDashboardRecentActivity(todayCashEntries) {
    const tbody = document.getElementById('dashboard-recent-activity');
    if (!tbody) return;
    tbody.innerHTML = '';

    const sorted = [...todayCashEntries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6);

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-list-message">Sin movimientos hoy.</td></tr>';
        return;
    }

    sorted.forEach(c => {
        const time = new Date(c.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const concept = c.concepto.length > 25 ? c.concepto.substring(0, 22) + '...' : c.concepto;
        
        tbody.innerHTML += `
            <tr>
                <td>${time} hs</td>
                <td>${c.empleado}</td>
                <td>${concept}</td>
                <td style="font-weight: 700; color: var(--accent);">${formatCurrency(c.monto)}</td>
            </tr>
        `;
    });
}

function renderDashboardLowStock() {
    const container = document.getElementById('dashboard-low-stock-list');
    if (!container) return;
    container.innerHTML = '';

    const lowStock = state.products.filter(p => p.stock < p.minStock);

    if (lowStock.length === 0) {
        container.innerHTML = '<div class="empty-list-message" style="padding: 15px;">Stock saludable. Sin alertas.</div>';
        return;
    }

    lowStock.forEach(p => {
        container.innerHTML += `
            <div class="low-stock-item">
                <div class="low-stock-info">
                    <span class="low-stock-name">${p.name}</span>
                    <span class="low-stock-qty">Stock: ${p.stock} (Mín: ${p.minStock})</span>
                </div>
                <button class="btn btn-secondary btn-small" onclick="quickRestockProduct('${p.id}')">Reponer +10</button>
            </div>
        `;
    });
}

window.quickRestockProduct = async function(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;
    
    product.stock += 10;
    
    try {
        const res = await fetch('/api/buffet/productos', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state.products)
        });
        
        if (res.ok) {
            await postAudit('Reponer Stock', `Se agregaron 10 unidades de ${product.name}`);
            showToast(`Repuesto: ${product.name} (+10)`, 'success');
            renderApp();
        }
    } catch (e) {
        showToast('Error de conexión', 'error');
    }
};

// --- RENDER: AGENDA INTERACTIVA GRID ---
function renderAgendaGrid() {
    const headerRow = document.getElementById('agenda-table-header');
    const tbody = document.getElementById('agenda-table-body');
    if (!headerRow || !tbody) return;

    headerRow.innerHTML = '<th class="hour-col">Hora</th>';
    state.canchas.forEach(c => {
        headerRow.innerHTML += `<th>${c.name}</th>`;
    });

    tbody.innerHTML = '';

    const hours = [];
    for (let h = 9; h < 24; h++) {
        const hStr = String(h).padStart(2, '0');
        hours.push(`${hStr}:00`);
        hours.push(`${hStr}:30`);
    }

    const todayStr = state.currentDate;
    
    const activeSpans = {};
    state.canchas.forEach(c => { activeSpans[c.id] = 0; });

    hours.forEach(timeSlot => {
        const tr = document.createElement('tr');
        
        const tdHour = document.createElement('td');
        tdHour.className = 'hour-col';
        tdHour.textContent = timeSlot;
        tr.appendChild(tdHour);

        state.canchas.forEach(cancha => {
            if (activeSpans[cancha.id] > 0) {
                activeSpans[cancha.id]--;
                return;
            }

            // Buscar reserva confirmada local
            const booking = state.bookings.find(b => 
                b.cancha === getMappedCanchaName(cancha.id) && b.fecha === todayStr && b.horaInicio === timeSlot
            );
            
            // Buscar hold temporal pendiente
            const hold = state.pendingOnline.find(b => 
                b.cancha === getMappedCanchaName(cancha.id) && b.fecha === todayStr && b.horaInicio === timeSlot
            );
            
            if (booking) {
                const td = document.createElement('td');
                const rowSpan = Math.ceil(booking.duracionHoras * 2);
                td.rowSpan = rowSpan;
                activeSpans[cancha.id] = rowSpan - 1;

                const bookingDiv = document.createElement('div');
                bookingDiv.className = `grid-cell-booking pagado`; // Siempre confirmadas
                
                const endTime = minutesToTime(timeToMinutes(booking.horaInicio) + (booking.duracionHoras * 60));
                
                bookingDiv.innerHTML = `
                    <div class="booking-client-name">${booking.nombre} ${booking.apellido}</div>
                    <div class="booking-details-sub">${booking.horaInicio} - ${endTime} | Confirmado</div>
                `;
                
                bookingDiv.addEventListener('click', () => {
                    openBookingModalForEdit(booking.id);
                });

                td.appendChild(bookingDiv);
                tr.appendChild(td);
                return;
            }

            if (hold) {
                const td = document.createElement('td');
                const rowSpan = Math.ceil(hold.duracionHoras * 2);
                td.rowSpan = rowSpan;
                activeSpans[cancha.id] = rowSpan - 1;

                const bookingDiv = document.createElement('div');
                bookingDiv.className = `grid-cell-booking reservado`; // Color Amarillo/Espera
                
                const endTime = minutesToTime(timeToMinutes(hold.horaInicio) + (hold.duracionHoras * 60));
                
                bookingDiv.innerHTML = `
                    <div class="booking-client-name">${hold.nombre} (Web)</div>
                    <div class="booking-details-sub">${hold.horaInicio} - ${endTime} | Pago en Proceso</div>
                `;
                
                bookingDiv.addEventListener('click', () => {
                    openBookingModalForEdit(hold.id);
                });

                td.appendChild(bookingDiv);
                tr.appendChild(td);
                return;
            }

            // Conflicto de Fusión cruzada F5/F8
            const conflictingBooking = checkConflictForGrid(cancha.id, todayStr, timeSlot);
            
            if (conflictingBooking) {
                const td = document.createElement('td');
                const divConflict = document.createElement('div');
                divConflict.className = 'grid-cell-booking blocked-conflict';
                
                const isConfirmed = conflictingBooking.estado === 'CONFIRMADO';
                const conflictSource = conflictingBooking.cancha.includes('Fútbol 8') || conflictingBooking.cancha.includes('Futbol 8') ? 'Fútbol 8' : 'Fútbol 5';
                divConflict.innerHTML = `
                    <div style="font-weight:600; opacity:0.7;">Fusión Cruzada</div>
                    <div style="font-size:0.7rem; opacity:0.6;">Cancha ${conflictSource} (${isConfirmed ? 'Confirmado' : 'Espera'})</div>
                `;
                
                td.appendChild(divConflict);
                tr.appendChild(td);
                return;
            }

            // Celda disponible
            const td = document.createElement('td');
            const divFree = document.createElement('div');
            divFree.className = 'grid-cell-booking disponible';
            divFree.innerHTML = `<span>+ Reservar</span>`;
            
            divFree.addEventListener('click', () => {
                openBookingModalForCreate(cancha.id, todayStr, timeSlot);
            });

            td.appendChild(divFree);
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
}

function checkConflictForGrid(canchaId, date, timeSlot) {
    const timeVal = timeToMinutes(timeSlot);
    
    // Verificamos conflicto tanto en CONFIRMADO como en PENDIENTE activo
    const all = [...state.bookings, ...state.pendingOnline];
    
    return all.find(b => {
        if (b.fecha !== date) return false;
        const start = timeToMinutes(b.horaInicio);
        const end = start + (b.duracionHoras * 60);
        
        const isSlotInBooking = (timeVal >= start && timeVal < end);
        if (!isSlotInBooking) return false;

        const bCanchaId = getReverseMappedCanchaId(b.cancha);

        if (canchaId === 'cancha_f8' && (bCanchaId === 'cancha_f5_a' || bCanchaId === 'cancha_f5_b')) return true;
        if ((canchaId === 'cancha_f5_a' || canchaId === 'cancha_f5_b') && bCanchaId === 'cancha_f8') return true;

        return false;
    });
}

// --- MODALES RESERVA ---
function openBookingModalForCreate(canchaId, date, timeSlot) {
    document.getElementById('form-booking').reset();
    document.getElementById('booking-id-edit').value = '';
    
    document.getElementById('booking-cancha-id').value = canchaId;
    document.getElementById('booking-date').value = date;
    document.getElementById('booking-start-time').value = timeSlot;
    
    const cancha = state.canchas.find(c => c.id === canchaId);
    document.getElementById('booking-display-cancha').value = cancha ? cancha.name : '';
    document.getElementById('booking-display-datetime').value = `${formatDateSpanish(date)} a las ${timeSlot} hs`;
    
    document.getElementById('modal-booking-title').textContent = 'Registrar Turno Manual';
    document.getElementById('btn-delete-booking').style.display = 'none';

    configureDurationOptions(canchaId, date, timeSlot);
    updateSuggestedPriceInModal();

    document.getElementById('booking-modal').classList.add('active');
}

function openBookingModalForEdit(bookingId) {
    // Buscar en confirmadas y pendientes
    const all = [...state.bookings, ...state.pendingOnline];
    const booking = all.find(b => b.id.toString() === bookingId.toString());
    if (!booking) return;

    const canchaId = getReverseMappedCanchaId(booking.cancha);

    document.getElementById('booking-id-edit').value = booking.id;
    document.getElementById('booking-cancha-id').value = canchaId;
    document.getElementById('booking-date').value = booking.fecha;
    document.getElementById('booking-start-time').value = booking.horaInicio;
    
    document.getElementById('booking-display-cancha').value = booking.cancha;
    document.getElementById('booking-display-datetime').value = `${formatDateSpanish(booking.fecha)} a las ${booking.horaInicio} hs`;
    
    document.getElementById('booking-cliente').value = `${booking.nombre} ${booking.apellido}`.trim();
    document.getElementById('booking-telefono').value = booking.telefono || '';
    document.getElementById('booking-seña').value = booking.senaPagada || 0;
    
    const statusSelect = document.getElementById('booking-estado');
    statusSelect.value = booking.estado === 'CONFIRMADO' ? 'pagado' : 'reservado';
    
    document.getElementById('booking-pago-metodo').value = booking.pagoMetodo || 'efectivo';
    document.getElementById('booking-final-price').value = booking.totalTurno || booking.precioFinal || 0;

    document.getElementById('modal-booking-title').textContent = 'Modificar/Cobrar Turno';
    document.getElementById('btn-delete-booking').style.display = 'inline-block';

    configureDurationOptions(canchaId, booking.fecha, booking.horaInicio, booking.id);
    document.getElementById('booking-duracion').value = booking.duracionHoras;

    updateSuggestedPriceInModal();

    document.getElementById('booking-modal').classList.add('active');
}

function configureDurationOptions(canchaId, date, startTime, excludeBookingId = null) {
    const durationSelect = document.getElementById('booking-duracion');
    durationSelect.innerHTML = '';

    const startMin = timeToMinutes(startTime);
    const closeMin = 24 * 60; 
    const maxPossibleHours = (closeMin - startMin) / 60;

    let firstConflictStartMin = closeMin;

    const all = [...state.bookings, ...state.pendingOnline];

    all.forEach(b => {
        if (b.id.toString() === (excludeBookingId || '').toString() || b.fecha !== date) return;
        const otherStartMin = timeToMinutes(b.horaInicio);
        
        if (otherStartMin > startMin) {
            const bCanchaId = getReverseMappedCanchaId(b.cancha);
            let isConflict = (canchaId === bCanchaId) ||
                (canchaId === 'cancha_f8' && (bCanchaId === 'cancha_f5_a' || bCanchaId === 'cancha_f5_b')) ||
                ((canchaId === 'cancha_f5_a' || canchaId === 'cancha_f5_b') && bCanchaId === 'cancha_f8');

            if (isConflict && otherStartMin < firstConflictStartMin) {
                firstConflictStartMin = otherStartMin;
            }
        }
    });

    const maxDurationBeforeConflict = (firstConflictStartMin - startMin) / 60;
    const finalMaxHours = Math.min(maxPossibleHours, maxDurationBeforeConflict);

    const cancha = state.canchas.find(c => c.id === canchaId);

    if (cancha && (cancha.type === 'f5' || cancha.type === 'f8')) {
        // Fútbol fijos de 1 hora
        if (finalMaxHours >= 1) {
            const opt = document.createElement('option');
            opt.value = "1";
            opt.textContent = "1 Hora";
            durationSelect.appendChild(opt);
            durationSelect.disabled = true;
        } else {
            const opt = document.createElement('option');
            opt.value = "0";
            opt.textContent = "Cruce / Sin espacio";
            durationSelect.appendChild(opt);
            durationSelect.disabled = true;
        }
    } else {
        // Pádel: 1, 1.5, 2
        durationSelect.disabled = false;
        const possibleDurations = [
            { val: 1, text: '1 Hora' },
            { val: 1.5, text: '1 Hora y Media' },
            { val: 2, text: '2 Horas' }
        ];

        let addedAny = false;
        possibleDurations.forEach(d => {
            if (d.val <= finalMaxHours) {
                const opt = document.createElement('option');
                opt.value = d.val;
                opt.textContent = d.text;
                durationSelect.appendChild(opt);
                addedAny = true;
            }
        });

        if (!addedAny) {
            const opt = document.createElement('option');
            opt.value = "0";
            opt.textContent = "Sin espacio";
            durationSelect.appendChild(opt);
            durationSelect.disabled = true;
        }
    }
}

function updateSuggestedPriceInModal() {
    const canchaId = document.getElementById('booking-cancha-id').value;
    const duracion = parseFloat(document.getElementById('booking-duracion').value) || 0;
    const finalPriceInput = document.getElementById('booking-final-price');
    const suggestedPriceEl = document.getElementById('booking-suggested-price');

    const cancha = state.canchas.find(c => c.id === canchaId);
    if (!cancha) return;

    let pricePerHour = 0;
    if (cancha.type === 'f5') pricePerHour = state.prices.cancha_f5;
    if (cancha.type === 'f8') pricePerHour = state.prices.cancha_f8;
    if (cancha.type === 'padel') pricePerHour = state.prices.cancha_padel;

    const suggested = pricePerHour * duracion;
    suggestedPriceEl.textContent = formatCurrency(suggested);
    
    const isEdit = !!document.getElementById('booking-id-edit').value;
    if (!isEdit && finalPriceInput) {
        finalPriceInput.value = suggested;
    }
}

function hideBookingModal() {
    document.getElementById('booking-modal').classList.remove('active');
}

async function saveBookingForm(e) {
    e.preventDefault();

    const idEdit = document.getElementById('booking-id-edit').value;
    const canchaId = document.getElementById('booking-cancha-id').value;
    const fecha = document.getElementById('booking-date').value;
    const horaInicio = document.getElementById('booking-start-time').value;
    const duracionHoras = parseFloat(document.getElementById('booking-duracion').value);
    const estado = document.getElementById('booking-estado').value === 'pagado' ? 'CONFIRMADO' : 'PENDIENTE';
    const clienteCompleto = document.getElementById('booking-cliente').value.trim();
    const telefono = document.getElementById('booking-telefono').value.trim();
    const senaPagada = parseFloat(document.getElementById('booking-seña').value) || 0;
    const pagoMetodo = document.getElementById('booking-pago-metodo').value;
    const totalTurno = parseFloat(document.getElementById('booking-final-price').value) || 0;

    if (duracionHoras <= 0) {
        showToast('El turno no posee duración válida', 'error');
        return;
    }

    const partesNombre = clienteCompleto.split(/\s+/);
    const nombre = partesNombre[0] || '';
    const apellido = partesNombre.slice(1).join(' ');

    const cancha = getMappedCanchaName(canchaId);
    const employeeName = employees[state.currentRole].name;

    const bookingData = {
        id: idEdit || Date.now(),
        nombre,
        apellido,
        telefono,
        cancha,
        fecha,
        horaInicio,
        duracionHoras,
        estado,
        senaPagada,
        pagoMetodo,
        totalTurno,
        empleado: employeeName
    };

    try {
        let res;
        if (idEdit) {
            // Edición
            res = await fetch(`/api/reservas/${idEdit}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });
        } else {
            // Creación manual
            res = await fetch('/api/reservas/manual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });
        }

        if (res.ok) {
            showToast(idEdit ? 'Turno modificado' : 'Turno agendado', 'success');
            await postAudit(idEdit ? 'Modificar Reserva' : 'Crear Reserva Manual', `${cancha} - ${fecha} ${horaInicio} (${clienteCompleto})`);
            hideBookingModal();
            await refreshRealtimeData();
            renderApp();
        } else {
            const err = await res.json();
            showToast(err.error || 'Error al guardar reserva', 'error');
        }
    } catch (err) {
        showToast('Error de red', 'error');
    }
}

async function deleteBooking() {
    const idEdit = document.getElementById('booking-id-edit').value;
    if (!idEdit) return;

    if (confirm('¿Estás seguro de que deseas eliminar este turno?')) {
        try {
            const res = await fetch(`/api/reservas/${idEdit}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Turno eliminado', 'warning');
                await postAudit('Eliminar Reserva', `ID Reserva: ${idEdit}`);
                hideBookingModal();
                await refreshRealtimeData();
                renderApp();
            } else {
                showToast('Error al eliminar reserva', 'error');
            }
        } catch (e) {
            showToast('Error de conexión', 'error');
        }
    }
}

// --- MODULE: BUFFET & KIOSCO ---
function renderBuffetProducts() {
    const grid = document.getElementById('buffet-products-grid');
    if (!grid) return;

    const query = document.getElementById('buffet-search-input').value.toLowerCase();
    const activeCategoryBtn = document.querySelector('#buffet-category-filters .btn-filter.active');
    const category = activeCategoryBtn ? activeCategoryBtn.getAttribute('data-category') : 'all';

    grid.innerHTML = '';

    const filtered = state.products.filter(p => {
        const matchesQuery = p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query);
        const matchesCategory = (category === 'all') || (p.category === category);
        return matchesQuery && matchesCategory;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-list-message" style="grid-column: 1/-1;">Sin productos.</div>';
        return;
    }

    filtered.forEach(p => {
        const cartItem = cart.find(item => item.id === p.id);
        const qtyInCart = cartItem ? cartItem.qty : 0;
        const availableStock = p.stock - qtyInCart;

        const isLowStock = p.stock < p.minStock;
        const noStock = availableStock <= 0;

        const card = document.createElement('div');
        card.className = `product-card ${noStock ? 'no-stock' : ''}`;
        card.innerHTML = `
            <div class="product-info-top">
                <span class="product-name">${p.name}</span>
                <span class="product-price">${formatCurrency(p.price)}</span>
            </div>
            <span class="product-stock-tag ${isLowStock ? 'low' : ''}">
                ${p.stock === 0 ? 'Sin Stock' : `Stock: ${p.stock}`}
                ${qtyInCart > 0 ? `| En Carro: ${qtyInCart}` : ''}
            </span>
        `;

        if (!noStock) {
            card.addEventListener('click', () => {
                if (qtyInCart < p.stock) {
                    if (cartItem) cartItem.qty++;
                    else cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
                    renderCart();
                    renderBuffetProducts();
                }
            });
        }

        grid.appendChild(card);
    });
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const totalEl = document.getElementById('cart-total-value');
    if (!container || !totalEl) return;

    container.innerHTML = '';

    if (cart.length === 0) {
        container.innerHTML = '<div class="empty-cart-message">El carrito está vacío</div>';
        totalEl.textContent = '$0.00';
        return;
    }

    let total = 0;
    cart.forEach(item => {
        const subtotal = item.price * item.qty;
        total += subtotal;

        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <div class="cart-item-desc">
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-sub">${item.qty} x ${formatCurrency(item.price)} = ${formatCurrency(subtotal)}</span>
            </div>
            <div class="cart-item-controls">
                <button class="btn-qty" onclick="updateCartQty('${item.id}', -1)">-</button>
                <button class="btn-qty" onclick="updateCartQty('${item.id}', 1)">+</button>
            </div>
        `;
        container.appendChild(row);
    });

    totalEl.textContent = formatCurrency(total);
}

window.updateCartQty = function(productId, delta) {
    const itemIndex = cart.findIndex(item => item.id === productId);
    if (itemIndex === -1) return;

    const item = cart[itemIndex];
    const product = state.products.find(p => p.id === productId);

    if (delta > 0) {
        if (item.qty < product.stock) item.qty++;
        else showToast('Stock insuficiente', 'error');
    } else {
        item.qty--;
        if (item.qty <= 0) cart.splice(itemIndex, 1);
    }
    renderCart();
    renderBuffetProducts();
};

async function checkoutBuffet() {
    if (cart.length === 0) {
        showToast('Carrito vacío', 'error');
        return;
    }

    const paymentMethod = document.querySelector('input[name="buffet-payment"]:checked').value;
    const employeeName = employees[state.currentRole].name;

    try {
        const res = await fetch('/api/buffet/venta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: cart,
                metodo: paymentMethod,
                empleado: employeeName
            })
        });

        if (res.ok) {
            showToast('Venta registrada', 'success');
            cart = [];
            await refreshRealtimeData();
            renderApp();
        } else {
            showToast('Error al registrar venta', 'error');
        }
    } catch (e) {
        showToast('Error de red', 'error');
    }
}

function renderQuickStockList() {
    const tbody = document.getElementById('quick-stock-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    state.products.forEach(p => {
        const isLow = p.stock < p.minStock;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${p.name}</strong><br><span style="font-size:0.7rem; color:var(--text-muted);">${p.category}</span></td>
            <td class="quick-stock-qty ${isLow ? 'alert' : ''}">${p.stock} u.</td>
            <td class="owner-only">${formatCurrency(p.price)}</td>
            <td>
                <button class="btn btn-secondary btn-small" onclick="showProductModal('${p.id}')">
                    ${state.currentRole === 'owner' ? 'Editar' : 'Reponer'}
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function showProductModal(productId = null) {
    const form = document.getElementById('form-product');
    form.reset();

    const titleEl = document.getElementById('modal-product-title');
    const deleteBtn = document.getElementById('btn-delete-product');
    const idInput = document.getElementById('product-id-edit');

    const nameInput = document.getElementById('prod-name');
    const categorySelect = document.getElementById('prod-category');
    const stockInput = document.getElementById('prod-stock');
    const costInput = document.getElementById('prod-cost');
    const priceInput = document.getElementById('prod-price');
    const minStockInput = document.getElementById('prod-min-stock');

    const isOwner = state.currentRole === 'owner';
    nameInput.disabled = !isOwner;
    categorySelect.disabled = !isOwner;
    costInput.disabled = !isOwner;
    priceInput.disabled = !isOwner;
    minStockInput.disabled = !isOwner;

    if (productId) {
        const product = state.products.find(p => p.id === productId);
        if (!product) return;

        idInput.value = product.id;
        nameInput.value = product.name;
        categorySelect.value = product.category;
        stockInput.value = product.stock;
        costInput.value = product.cost;
        priceInput.value = product.price;
        minStockInput.value = product.minStock;

        titleEl.textContent = isOwner ? 'Editar Producto' : 'Reponer Stock';
        deleteBtn.style.display = isOwner ? 'inline-block' : 'none';
    } else {
        if (!isOwner) return;
        idInput.value = '';
        titleEl.textContent = 'Nuevo Producto';
        deleteBtn.style.display = 'none';
        stockInput.value = 0;
    }

    document.getElementById('product-modal').classList.add('active');
}

function hideProductModal() {
    document.getElementById('product-modal').classList.remove('active');
}

async function saveProductForm(e) {
    e.preventDefault();

    const idEdit = document.getElementById('product-id-edit').value;
    const name = document.getElementById('prod-name').value.trim();
    const category = document.getElementById('prod-category').value;
    const stock = parseInt(document.getElementById('prod-stock').value) || 0;
    const cost = parseFloat(document.getElementById('prod-cost').value) || 0;
    const price = parseFloat(document.getElementById('prod-price').value) || 0;
    const minStock = parseInt(document.getElementById('prod-min-stock').value) || 0;

    let updatedProducts = [...state.products];

    if (idEdit) {
        const index = updatedProducts.findIndex(p => p.id === idEdit);
        if (index === -1) return;
        
        const oldP = updatedProducts[index];
        if (state.currentRole === 'owner') {
            updatedProducts[index] = { id: idEdit, name, category, stock, cost, price, minStock };
        } else {
            oldP.stock = stock; // Empleado reponiendo stock
        }
    } else {
        if (state.currentRole !== 'owner') return;
        updatedProducts.push({
            id: 'p_' + Date.now(),
            name, category, stock, cost, price, minStock
        });
    }

    try {
        const res = await fetch('/api/buffet/productos', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProducts)
        });

        if (res.ok) {
            showToast('Inventario actualizado', 'success');
            await postAudit(idEdit ? 'Editar Producto' : 'Crear Producto', name);
            hideProductModal();
            await refreshRealtimeData();
            renderApp();
        }
    } catch (e) {
        showToast('Error de conexión', 'error');
    }
}

async function deleteProduct() {
    const idEdit = document.getElementById('product-id-edit').value;
    if (!idEdit || state.currentRole !== 'owner') return;

    if (confirm('¿Eliminar producto permanentemente?')) {
        const updated = state.products.filter(p => p.id !== idEdit);
        try {
            const res = await fetch('/api/buffet/productos', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });

            if (res.ok) {
                showToast('Producto eliminado', 'warning');
                await postAudit('Eliminar Producto', `ID: ${idEdit}`);
                hideProductModal();
                await refreshRealtimeData();
                renderApp();
            }
        } catch (e) {
            showToast('Error de conexión', 'error');
        }
    }
}

// --- MODULE: VERIFICAR RESERVAS WEB / SIMULADOR ---
async function simulateWebBooking(deporte) {
    const nombres = ['Marcos', 'Romina', 'Florencia', 'Lucas', 'Javier', 'Carolina'];
    const apellidos = ['Sosa', 'Rios', 'Duarte', 'Acosta', 'Benitez', 'Gimenez'];
    
    const clientName = nombres[Math.floor(Math.random() * nombres.length)];
    const clientLastName = apellidos[Math.floor(Math.random() * apellidos.length)];
    
    const hours = [12, 14, 16, 18, 20, 22];
    const hr = hours[Math.floor(Math.random() * hours.length)];
    const min = Math.random() > 0.5 ? '00' : '30';
    const horaInicio = `${hr}:${min}`;

    let cancha = 'Cancha de Pádel';
    let duracion = 1.5;
    let sena = 7000;

    if (deporte === 'futbol5') {
        cancha = 'Cancha de Fútbol 5';
        duracion = 1;
        sena = 10000;
    } else if (deporte === 'futbol8') {
        cancha = 'Cancha de Fútbol 8';
        duracion = 1;
        sena = 15000;
    }

    const payload = {
        title: 'Seña Reserva Wadasaka Club - ' + deporte.toUpperCase(),
        price: sena,
        quantity: 1,
        nombre: clientName,
        apellido: clientLastName,
        telefono: '11-' + Math.floor(10000000 + Math.random() * 90000000),
        email: 'cliente@web.com',
        cancha,
        fecha: state.currentDate,
        horaInicio,
        duracionHoras: duracion,
        captchaToken: 'dummy',
        captchaAnswer: 'dummy' // Ignorado en el simulador
    };

    try {
        const res = await fetch('/create_preference?simulado=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast('Hold temporal simulado en la web (5 minutos)', 'info');
            await refreshRealtimeData();
            renderApp();
        } else {
            showToast('Choque de turnos en simulación', 'error');
        }
    } catch (e) {
        showToast('Error al conectar con la API', 'error');
    }
}

function renderPendingOnlineList() {
    const list = document.getElementById('pending-online-bookings-list');
    const badge = document.getElementById('online-badge-count');
    if (!list || !badge) return;

    badge.textContent = state.pendingOnline.length;

    if (state.pendingOnline.length === 0) {
        list.innerHTML = '<div class="empty-list-message">No hay reservas web pendientes (holds activos).</div>';
        return;
    }

    list.innerHTML = '';
    state.pendingOnline.forEach(b => {
        const endTime = minutesToTime(timeToMinutes(b.horaInicio) + (b.duracionHoras * 60));
        const msPassed = Date.now() - new Date(b.timestamp).getTime();
        const secondsRemaining = Math.max(0, Math.floor((300000 - msPassed) / 1000));
        const minRem = Math.floor(secondsRemaining / 60);
        const secRem = secondsRemaining % 60;

        const card = document.createElement('div');
        card.className = 'online-booking-item';
        card.innerHTML = `
            <div class="online-booking-details">
                <span class="online-booking-client">${b.nombre} ${b.apellido} (WEB)</span>
                <span class="online-booking-meta">
                    <strong>${b.cancha}</strong> | ${formatDateSpanish(b.fecha)} | <strong>${b.horaInicio} a ${endTime} (${b.duracionHoras}h)</strong>
                </span>
                <span class="online-booking-meta" style="color:var(--state-reservado); font-weight:600;">
                    ⏳ Tiempo restante de Hold: ${minRem}:${secRem.toString().padStart(2, '0')}
                </span>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
                <span class="online-booking-price">Seña: ${formatCurrency(b.senaPagada)}</span>
                <div class="online-booking-actions">
                    <button class="btn btn-danger btn-small" onclick="cancelWebHold('${b.id}')">Liberar</button>
                    <button class="btn btn-primary btn-small" onclick="approveWebHold('${b.id}')">Aprobar Pago</button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

window.approveWebHold = async function(bookingId) {
    const employeeName = employees[state.currentRole].name;
    try {
        const res = await fetch(`/api/reservas/${bookingId}/confirmar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empleado: employeeName })
        });

        if (res.ok) {
            showToast('Pago aprobado. Reserva guardada en agenda.', 'success');
            await postAudit('Confirmar Web Hold', `ID: ${bookingId}`);
            await refreshRealtimeData();
            renderApp();
        } else {
            showToast('Error al aprobar', 'error');
        }
    } catch (e) {
        showToast('Error de red', 'error');
    }
};

window.cancelWebHold = async function(bookingId) {
    if (confirm('¿Liberar el hold temporal inmediatamente? El cliente no podrá pagar.')) {
        try {
            const res = await fetch(`/api/reservas/${bookingId}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Hold liberado', 'warning');
                await refreshRealtimeData();
                renderApp();
            }
        } catch (e) {
            showToast('Error de red', 'error');
        }
    }
};

// --- MODULE: REPORTES & CIERRE MENSUAL ---
function renderReports() {
    if (state.currentRole !== 'owner') return;

    let totalIncome = 0;
    let fieldsIncome = 0;
    let buffetIncome = 0;
    let totalCash = 0;
    let totalTransfer = 0;
    let fieldsCount = 0;

    state.cashflow.forEach(c => {
        totalIncome += c.monto;
        if (c.tipo === 'canchas') {
            fieldsIncome += c.monto;
            fieldsCount++;
        }
        if (c.tipo === 'buffet') buffetIncome += c.monto;
        if (c.metodo === 'efectivo') totalCash += c.monto;
        if (c.metodo === 'transferencia') totalTransfer += c.monto;
    });

    document.getElementById('rep-total-income').textContent = formatCurrency(totalIncome);
    document.getElementById('rep-fields-income').textContent = formatCurrency(fieldsIncome);
    document.getElementById('rep-fields-count').textContent = `${fieldsCount} cobros de canchas`;
    document.getElementById('rep-buffet-income').textContent = formatCurrency(buffetIncome);
    document.getElementById('rep-buffet-count').textContent = `${state.cashflow.filter(c => c.tipo === 'buffet').length} ventas buffet`;
    document.getElementById('rep-cash-trans').textContent = `${formatCurrency(totalCash)} / ${formatCurrency(totalTransfer)}`;

    // Rellenar Libro Diario de Caja
    const cashflowTbody = document.getElementById('report-cashflow-tbody');
    if (cashflowTbody) {
        cashflowTbody.innerHTML = '';
        const sortedCashflow = [...state.cashflow].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        if (sortedCashflow.length === 0) {
            cashflowTbody.innerHTML = '<tr><td colspan="5" class="empty-list-message">Sin movimientos de caja.</td></tr>';
        } else {
            sortedCashflow.forEach(c => {
                const dateObj = new Date(c.timestamp);
                const dateStr = dateObj.toLocaleDateString('es-AR') + ' ' + dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                cashflowTbody.innerHTML += `
                    <tr>
                        <td>${dateStr}</td>
                        <td>${c.concepto}</td>
                        <td style="text-transform: capitalize;">${c.metodo}</td>
                        <td>${c.empleado}</td>
                        <td style="font-weight: 700; color: var(--accent);">${formatCurrency(c.monto)}</td>
                    </tr>
                `;
            });
        }
    }

    // Rellenar Auditoría
    const auditTbody = document.getElementById('report-audit-tbody');
    if (auditTbody) {
        auditTbody.innerHTML = '';
        const sortedAudit = [...state.auditLog].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        if (sortedAudit.length === 0) {
            auditTbody.innerHTML = '<tr><td colspan="4" class="empty-list-message">Sin auditorías.</td></tr>';
        } else {
            sortedAudit.forEach(log => {
                const dateObj = new Date(log.timestamp);
                const dateStr = dateObj.toLocaleDateString('es-AR') + ' ' + dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                auditTbody.innerHTML += `
                    <tr>
                        <td>${dateStr}</td>
                        <td><strong>${log.empleado}</strong></td>
                        <td><span class="badge" style="background-color:rgba(255,255,255,0.06); color:var(--text-primary); border:1px solid var(--border-glass);">${log.accion}</span></td>
                        <td>${log.detalles}</td>
                    </tr>
                `;
            });
        }
    }

    // Rellenar Reporte de Cierre de Mes
    calculateMonthlyFinancials();
}

function calculateMonthlyFinancials() {
    const select = document.getElementById('monthly-report-select');
    if (!select) return;

    // Detectar qué meses poseen datos en cashflow
    const monthsSet = new Set();
    state.cashflow.forEach(c => {
        const date = new Date(c.timestamp);
        if (!isNaN(date.getTime())) {
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthsSet.add(key);
        }
    });

    const monthsArray = Array.from(monthsSet).sort().reverse();
    
    // Guardar opción seleccionada antes de renderizar
    const prevSelected = select.value;
    select.innerHTML = '';

    if (monthsArray.length === 0) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = "Sin datos de caja";
        select.appendChild(opt);
        return;
    }

    monthsArray.forEach(m => {
        const [year, month] = m.split('-');
        const name = new Date(year, month - 1).toLocaleString('es-AR', { month: 'long', year: 'numeric' });
        
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        select.appendChild(opt);
    });

    if (prevSelected && monthsArray.includes(prevSelected)) {
        select.value = prevSelected;
    }

    updateMonthlyReportDetails();
}

// Escuchar cambios en selector mensual de reportes
document.getElementById('monthly-report-select')?.addEventListener('change', updateMonthlyReportDetails);

function updateMonthlyReportDetails() {
    const select = document.getElementById('monthly-report-select');
    if (!select || !select.value) return;

    const selectedMonthKey = select.value; // YYYY-MM
    
    let f5Total = 0;
    let f8Total = 0;
    let padelTotal = 0;
    let buffetTotal = 0;

    state.cashflow.forEach(c => {
        const date = new Date(c.timestamp);
        if (isNaN(date.getTime())) return;
        
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (key !== selectedMonthKey) return;

        if (c.tipo === 'buffet') {
            buffetTotal += c.monto;
        } else if (c.tipo === 'canchas') {
            // Desglosar por cancha leyendo el concepto
            const conc = c.concepto.toLowerCase();
            if (conc.includes('padel') || conc.includes('pádel')) {
                padelTotal += c.monto;
            } else if (conc.includes('futbol 5') || conc.includes('fútbol 5')) {
                f5Total += c.monto;
            } else if (conc.includes('futbol 8') || conc.includes('fútbol 8')) {
                f8Total += c.monto;
            } else {
                // Fallback a Pádel si no especifica (cancha_padel)
                padelTotal += c.monto;
            }
        }
    });

    document.getElementById('month-income-f5').textContent = formatCurrency(f5Total);
    document.getElementById('month-income-f8').textContent = formatCurrency(f8Total);
    document.getElementById('month-income-padel').textContent = formatCurrency(padelTotal);
    document.getElementById('month-income-buffet').textContent = formatCurrency(buffetTotal);
}

function loadConfigFormValues() {
    if (state.currentRole !== 'owner') return;

    const f5Input = document.getElementById('cfg-price-f5');
    const f8Input = document.getElementById('cfg-price-f8');
    const padelInput = document.getElementById('cfg-price-padel');

    if (f5Input) f5Input.value = state.prices.cancha_f5;
    if (f8Input) f8Input.value = state.prices.cancha_f8;
    if (padelInput) padelInput.value = state.prices.cancha_padel;
}

// --- TRADUCCIONES DE CANCHA ---
function getMappedCanchaName(canchaId) {
    const map = {
        'cancha_f5_a': 'Cancha de Fútbol 5',
        'cancha_f5_b': 'Cancha de Fútbol 5', // Ambas F5A y F5B usan la misma denominación en reservas.json
        'cancha_f8': 'Cancha de Fútbol 8',
        'cancha_padel': 'Cancha de Pádel'
    };
    return map[canchaId] || canchaId;
}

function getReverseMappedCanchaId(canchaName) {
    if (canchaName.includes('Pádel') || canchaName.includes('Padel')) return 'cancha_padel';
    if (canchaName.includes('Fútbol 8') || canchaName.includes('Futbol 8')) return 'cancha_f8';
    // Por defecto Fútbol 5. En el calendario local buscaremos si es A o B o usaremos A por defecto.
    return 'cancha_f5_a'; 
}

// --- UTILS ---
function timeToMinutes(timeStr) {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function minutesToTime(minutes) {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function formatCurrency(val) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS'
    }).format(val);
}

function formatDateSpanish(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeIn var(--transition-fast) reverse';
        setTimeout(() => toast.remove(), 200);
    }, 4000);
}

function exportCashflowToCSV() {
    if (state.currentRole !== 'owner') return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Fecha/Hora,Concepto,Metodo,Usuario,Monto\r\n";

    state.cashflow.forEach(c => {
        const dateStr = new Date(c.timestamp).toLocaleString('es-AR');
        const row = [
            `"${dateStr}"`,
            `"${c.concepto}"`,
            `"${c.metodo}"`,
            `"${c.empleado}"`,
            c.monto
        ].join(",");
        csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Caja_Mensual_Wadasaka_${state.currentDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Descargando archivo CSV', 'success');
}
