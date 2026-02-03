// ESTADOS Y DATOS - SE MANTIENE V16 PARA TU COMPATIBILIDAD
let dbLIUNTAS = JSON.parse(localStorage.getItem('v16_liuntas')) || [];
let dbEjercicios = JSON.parse(localStorage.getItem('v16_ex')) || [];

const OP_WEIGHTS = {
    TACTICO: { alpha: 0.6, beta: 0.4 },
    OPERACIONAL: { alpha: 0.5, beta: 0.5 },
    ESTRATEGICO: { alpha: 0.4, beta: 0.6 }
};

// ================= SINCRONIZACIÓN MULTI-USUARIO (ONEDRIVE) =================
let fileHandle = null;
let lastSyncTime = 0;
let syncInterval = null;

function getAlphaBeta() {
    if (document.getElementById('tactico-superficie')?.classList.contains('active'))
        return OP_WEIGHTS.TACTICO;

    if (document.getElementById('operacional-superficie')?.classList.contains('active'))
        return OP_WEIGHTS.OPERACIONAL;

    return OP_WEIGHTS.ESTRATEGICO;
}

// ================= ROLES DE USUARIO =================
const ROLES = {
    EVALUADOR: "evaluador",
    MANDO: "mando",
    LECTURA: "lectura",
    SUPERFICIE: "superficie",
    SUBMARINOS: "submarinos",
    AVIACION: "aviacion",
    INFANTERIA: "infanteria",
    GUARDACOSTAS: "guardacostas"
};

ROLES.ADMIN = "admin";

// ================= USUARIOS DEL SISTEMA =================
const USERS = [
    { user: "admin", pass: "1234", role: ROLES.ADMIN },
    { user: "evaluador", pass: "1234", role: ROLES.EVALUADOR },
    { user: "mando", pass: "1234", role: ROLES.MANDO },
    { user: "lectura", pass: "1234", role: ROLES.LECTURA },
    { user: "superficie", pass: "1234", role: ROLES.SUPERFICIE },
    { user: "submarinos", pass: "1234", role: ROLES.SUBMARINOS },
    { user: "aviacion", pass: "1234", role: ROLES.AVIACION },
    { user: "infanteria", pass: "1234", role: ROLES.INFANTERIA },
    { user: "guardacostas", pass: "1234", role: ROLES.GUARDACOSTAS }
];

//USERS.push({
//        user: "admin",
//        pass: "admin123",
//        role: ROLES.ADMIN
//    });


function getUserRole() {
    return localStorage.getItem("user_role") || ROLES.EVALUADOR;
}

function setUserRole(role) {
    localStorage.setItem("user_role", role);
    aplicarPermisos();
}

// ================= LOGIN =================
function login() {
    const u = document.getElementById("loginUser").value.trim();
    const p = document.getElementById("loginPass").value.trim();

    const usersDB = JSON.parse(localStorage.getItem("admin_users")) || USERS;

    const found = usersDB.find(x => x.user === u && x.pass === p);

    if (!found) {
        alert("Usuario o clave incorrectos");
        return;
    }

    localStorage.setItem("logged_user", found.user);
    localStorage.setItem("user_role", found.role);
    localStorage.setItem("logged", "true");

    document.getElementById("loginBox").style.display = "none";
    document.getElementById("app").style.display = "flex";

    document.querySelector(".sidebar").style.display = "flex";
    document.querySelector(".main-content").style.display = "block";

    logAction("Inicio de sesión");
    aplicarPermisos();
}

// ================= FUNCIONES DE SINCRONIZACIÓN =================
async function linkDatabaseFile() {
    try {
        [fileHandle] = await window.showOpenFilePicker({
            types: [{
                description: 'JSON Database',
                accept: { 'application/json': ['.json'] },
            }],
            multiple: false
        });

        // Solicitar permisos de escritura
        const options = { mode: 'readwrite' };
        if (await fileHandle.queryPermission(options) !== 'granted') {
            if (await fileHandle.requestPermission(options) !== 'granted') {
                alert("Se necesitan permisos de escritura para sincronizar.");
                return;
            }
        }

        updateSyncUI(true);
        await loadFromFile();
        startSyncPolling();
        logAction("Base de datos vinculada con éxito.");

    } catch (err) {
        console.error("Error al vincular archivo:", err);
        updateSyncUI(false);
    }
}

async function saveToFile() {
    if (!fileHandle) return;

    try {
        const data = {
            liuntas: dbLIUNTAS,
            ejercicios: dbEjercicios,
            logs: logs,
            ships: adminShips,
            costos: JSON.parse(localStorage.getItem('v16_costos')) || [],
            opName: localStorage.getItem('v16_opName'),
            opStatus: localStorage.getItem('v16_opStatus'),
            users: JSON.parse(localStorage.getItem('admin_users')) || USERS
        };

        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();

        const file = await fileHandle.getFile();
        lastSyncTime = file.lastModified;

    } catch (err) {
        console.error("Error al guardar en archivo:", err);
    }
}

async function loadFromFile() {
    if (!fileHandle) return;

    try {
        const file = await fileHandle.getFile();

        // Si el archivo no ha cambiado, no recargar
        if (file.lastModified <= lastSyncTime) return;

        const text = await file.text();
        if (!text) return;

        const data = JSON.parse(text);

        // Actualizar variables en memoria
        dbLIUNTAS = data.liuntas || [];
        dbEjercicios = data.ejercicios || [];
        logs = data.logs || [];
        adminShips = data.ships || [];

        // Actualizar localStorage para compatibilidad
        localStorage.setItem('v16_liuntas', JSON.stringify(dbLIUNTAS));
        localStorage.setItem('v16_ex', JSON.stringify(dbEjercicios));
        localStorage.setItem('v16_logs', JSON.stringify(logs));
        localStorage.setItem('admin_ships', JSON.stringify(adminShips));
        localStorage.setItem('v16_costos', JSON.stringify(data.costos || []));
        localStorage.setItem('v16_opName', data.opName || "");
        localStorage.setItem('v16_opStatus', data.opStatus || "OPEN");
        localStorage.setItem('admin_users', JSON.stringify(data.users || USERS));

        lastSyncTime = file.lastModified;

        // Refrescar UI (solo si estamos logueados)
        if (localStorage.getItem('logged') === 'true') {
            updateDashboard();
            refreshSelectors();
        }

    } catch (err) {
        console.error("Error al cargar desde archivo:", err);
    }
}

function startSyncPolling() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(loadFromFile, 5000); // Revisar cada 5 segundos
}

function updateSyncUI(linked) {
    const dot = document.getElementById('syncDot');
    const text = document.getElementById('syncText');
    const btn = document.getElementById('btnLinkSync');

    if (linked) {
        dot.style.background = "#48bb78"; // Verde
        text.innerText = "SINCRONIZADO";
        btn.innerText = "🔄 CAMBIAR VINCULO";
    } else {
        dot.style.background = "#718096"; // Gris
        text.innerText = "SIN VINCULAR";
        btn.innerText = "🔗 VINCULAR ONEDRIVE";
    }
}


let logs = JSON.parse(localStorage.getItem('v16_logs')) || [];
let adminShips = JSON.parse(localStorage.getItem('admin_ships')) || [];
let chartT, chartO, chartREficacia, chartREficiencia, chartEficacia, chartCostos, chartEficaciaEval, chartResumenEficacia, chartResumenEficiencia;


// NAVEGACIÓN
function isOperationClosed() {
    return localStorage.getItem('v16_opStatus') === 'CLOSED';
}
function toggleSubmenu(id) { document.getElementById(id).classList.toggle('show'); }

function showMainSection(id, element) {
    // Ocultar todos los tabs principales
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // Quitar activo de menú
    document.querySelectorAll('.submenu-item, .menu-item').forEach(m => m.classList.remove('active'));

    // Mostrar tab seleccionado
    const section = document.getElementById(id);
    if (!section) return;

    section.classList.add('active');
    if (element) element.classList.add('active');

    // 🔴 REACTIVAR CONTENIDO INTERNO
    const internalTabs = section.querySelectorAll('.internal-content');
    const internalLinks = section.querySelectorAll('.internal-link');

    internalTabs.forEach(c => c.classList.remove('active'));
    internalLinks.forEach(l => l.classList.remove('active'));

    if (internalTabs.length > 0) {
        internalTabs[0].classList.add('active');
    }
    if (internalLinks.length > 0) {
        internalLinks[0].classList.add('active');
    }

    updateDashboard();
    refreshSelectors();
    if (id === 'tactico-superficie' || id === 'operacional-superficie') {
        updateDashboard();
    }
    if (id === 'operacional-resumen') {
        renderOperationalSummary();
    }
    if (id === 'admin-datos') {
        renderHistoricalSelectors();
    }
}

function showInternalTab(id, element) {
    const tactico = document.getElementById('tactico-superficie');
    if (!tactico) return;

    // VALIDACIÓN: Si intenta ir a Ejercicios, verificar que tareas sumen 100%
    if (id === 'ejercicios') {
        const totalPeso = dbLIUNTAS.reduce((sum, l) => sum + l.weight, 0);
        if (totalPeso !== 100) {
            alert(`⚠️ ERROR: Las tareas deben sumar exactamente el 100%.\nActualmente suman: ${totalPeso}%\n\nNo puede pasar al apartado de Ejercicios hasta completar esta validación.`);
            return;
        }
    }

    // VALIDACIÓN: Si intenta ir a Costos, verificar que ejercicios por tarea sumen 100%
    if (id === 'costos') {
        const tareasConProblema = [];

        dbLIUNTAS.forEach(tarea => {
            const ejerciciosDeTarea = dbEjercicios.filter(e => e.untlCode === tarea.code);

            if (ejerciciosDeTarea.length === 0) {
                tareasConProblema.push(`${tarea.code}: Sin ejercicios registrados`);
            } else {
                const totalPeso = ejerciciosDeTarea.reduce((sum, e) => sum + e.weight, 0);
                if (totalPeso !== 100) {
                    tareasConProblema.push(`${tarea.code} (${tarea.name}): Ejercicios suman ${totalPeso}%`);
                }
            }
        });

        if (tareasConProblema.length > 0) {
            alert(`⚠️ ERROR: Los ejercicios de cada tarea deben sumar exactamente el 100%.\n\nProblemas encontrados:\n\n${tareasConProblema.join('\n')}\n\nNo puede pasar al apartado de Costos hasta completar esta validación.`);
            return;
        }
    }

    // VALIDACIÓN: Si intenta ir a Evaluaciones, verificar que todos los buques tengan costos registrados
    if (id === 'eficacia') {
        const opActual = localStorage.getItem('v16_opName') || '';
        const costos = JSON.parse(localStorage.getItem('v16_costos')) || [];
        const buequesSinCostos = [];

        adminShips.forEach(buque => {
            const costosDelBuque = costos.filter(c => c.operacion === opActual && c.buque === buque);
            if (costosDelBuque.length === 0) {
                buequesSinCostos.push(buque);
            }
        });

        if (adminShips.length === 0) {
            alert(`⚠️ ERROR: No existen buques registrados.\n\nDebe registrar al menos un buque en el Administrador antes de continuar.`);
            return;
        }

        if (buequesSinCostos.length > 0) {
            alert(`⚠️ ERROR: No todos los buques tienen costos registrados.\n\nBuques sin costos:\n\n${buequesSinCostos.join('\n')}\n\nNo puede pasar al apartado de Evaluaciones hasta registrar costos para TODOS los buques.`);
            return;
        }
    }

    // VALIDACIÓN: Si intenta ir a Resumen, verificar que todos los buques tengan evaluaciones registradas
    if (id === 'resumen') {
        const opActual = localStorage.getItem('v16_opName') || '';
        const evaluaciones = logs.filter(l => l.opName === opActual);
        const buequesSinEvaluaciones = [];

        adminShips.forEach(buque => {
            const evaluacionesDelBuque = evaluaciones.filter(e => e.ship === buque);
            if (evaluacionesDelBuque.length === 0) {
                buequesSinEvaluaciones.push(buque);
            }
        });

        if (adminShips.length === 0) {
            alert(`⚠️ ERROR: No existen buques registrados.\n\nDebe registrar al menos un buque en el Administrador antes de continuar.`);
            return;
        }

        if (buequesSinEvaluaciones.length > 0) {
            alert(`⚠️ ERROR: No todos los buques tienen evaluaciones registradas.\n\nBuques sin evaluaciones:\n\n${buequesSinEvaluaciones.join('\n')}\n\nNo puede pasar al apartado de Resumen hasta registrar evaluaciones para TODOS los buques.`);
            return;
        }
    }

    // CARGAR DATOS DE EFICIENCIA SI VA AL APARTADO 5
    if (id === 'eficiencia' && typeof renderEficiencia === 'function') {
        renderEficiencia();
    }

    const contenidos = tactico.querySelectorAll('.internal-content');
    const links = tactico.querySelectorAll('.internal-link');

    contenidos.forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });

    links.forEach(l => l.classList.remove('active'));

    const target = document.getElementById(id);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }

    if (element) element.classList.add('active');

    if (id === 'eficacia' && typeof updateDashboard === 'function') {
        updateDashboard();
    }

    syncCostToEvaluation();

    if (id === 'resumen' && typeof renderResumen === 'function') {
        renderResumen();
    }

    // === PASO 3: MOSTRAR NOMBRE DE LA OPERACIÓN ===
    if (id === 'costos') {
        const opActual = localStorage.getItem('v16_opName') || 'NO DEFINIDA';
        const inputOp = document.getElementById('costOperacion');
        if (inputOp) {
            inputOp.value = opActual.toUpperCase();
        }
        // Cargar selector de buques y actualizar tabla
        const shipSelect = document.getElementById('costShip');
        if (shipSelect) {
            shipSelect.innerHTML = adminShips.map(s => `<option value="${s}">${s}</option>`).join('');
        }
        renderCosts();
    }
}

// LÓGICA PASO 1 Y 2 (SIN CAMBIOS)
function saveOpName() {
    localStorage.setItem('v16_opName', document.getElementById('opName').value);
    localStorage.setItem('v16_opStatus', 'OPEN');
    saveToFile();
    updateResumenSelector();
}

function saveLIUNTA() {
    const idx = parseInt(document.getElementById('editIndexL').value);
    const data = { code: document.getElementById('ltCode').value, name: document.getElementById('ltName').value, weight: parseFloat(document.getElementById('ltWeight').value) };
    // 🔒 VALIDACIÓN DE PESO TOTAL DE TAREAS (NO > 100%)
    const totalPesoLIUNTAS = dbLIUNTAS
        .filter((_, i) => i !== idx)
        .reduce((sum, l) => sum + l.weight, 0) + data.weight;

    if (totalPesoLIUNTAS > 100) {
        alert("❌ La suma de pesos de las tareas supera el 100 %");
        return;
    }
    if (idx === -1) dbLIUNTAS.push(data); else dbLIUNTAS[idx] = data;
    localStorage.setItem('v16_liuntas', JSON.stringify(dbLIUNTAS));
    resetFormL();
    renderLIUNTAS();
    saveToFile();
    refreshSelectors();
}

function renderLIUNTAS() {
    document.getElementById('opName').value = localStorage.getItem('v16_opName') || "";
    document.querySelector('#tblLiuntas tbody').innerHTML = dbLIUNTAS.map((l, i) => `<tr><td><b>${l.code}</b></td><td>${l.name}</td><td>${l.weight}%</td><td><button class="btn btn-edit" onclick="editL(${i})">Editar</button><button class="btn btn-danger" onclick="delL(${i})">X</button></td></tr>`).join('');
}

function saveEjercicio() {
    const idx = parseInt(document.getElementById('editIndexE').value);
    const selectedCode = document.getElementById('exUntlParent').value;
    const taskObj = dbLIUNTAS.find(l => l.code === selectedCode);
    const data = { untlCode: selectedCode, untlName: taskObj.name, name: document.getElementById('exName').value, weight: parseFloat(document.getElementById('exWeight').value) };
    // 🔒 VALIDACIÓN DE PESO TOTAL DE EJERCICIOS POR TAREA
    const totalPesoEjercicios = dbEjercicios
        .filter(e => e.untlCode === selectedCode && e !== dbEjercicios[idx])
        .reduce((sum, e) => sum + e.weight, 0) + data.weight;

    if (totalPesoEjercicios > 100) {
        alert("❌ La suma de pesos de ejercicios para esta tarea supera el 100 %");
        return;
    }
    if (idx === -1) dbEjercicios.push(data); else dbEjercicios[idx] = data;
    localStorage.setItem('v16_ex', JSON.stringify(dbEjercicios));
    resetFormE();
    renderEjercicios();
    saveToFile();
    refreshSelectors();
}

function renderEjercicios() {
    document.querySelector('#tblEjercicios tbody').innerHTML = dbEjercicios.map((e, i) => `<tr><td><b>${e.untlCode}</b></td><td>${e.untlName}</td><td>${e.name}</td><td>${e.weight}%</td><td><button class="btn btn-edit" onclick="editE(${i})">Editar</button><button class="btn btn-danger" onclick="delE(${i})">X</button></td></tr>`).join('');
}

function saveCost() {
    const item = document.getElementById('costItem').value.trim();
    const value = parseFloat(document.getElementById('costValue').value);
    const ship = document.getElementById('costShip').value.trim();
    const editIndex = document.getElementById('editCostIndex').value;

    if (!item || isNaN(value) || value <= 0) {
        alert('Ingrese un ítem de costo y un monto válido.');
        return;
    }

    if (!ship) {
        alert('Seleccione un buque.');
        return;
    }

    const opName = localStorage.getItem('v16_opName');
    if (!opName) {
        alert('Debe definir primero el nombre de la operación.');
        return;
    }

    let costos = JSON.parse(localStorage.getItem('v16_costos')) || [];

    const nuevoCosto = {
        operacion: opName,
        buque: ship,
        item: item,
        monto: value
    };

    if (editIndex >= 0) {
        costos[editIndex] = nuevoCosto;
        document.getElementById('editCostIndex').value = -1;
    } else {
        costos.push(nuevoCosto);
    }

    localStorage.setItem('v16_costos', JSON.stringify(costos));

    // limpiar formulario
    document.getElementById('costItem').value = '';
    document.getElementById('costValue').value = '';
    document.getElementById('editCostIndex').value = -1;

    renderCosts();
    syncCostToEvaluation();
    saveToFile();
}

function renderCosts() {
    const tbody = document.querySelector('#tblCostos tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const opName = localStorage.getItem('v16_opName');
    if (!opName) return;

    const costos = JSON.parse(localStorage.getItem('v16_costos')) || [];
    // const shipSelect = document.getElementById('costShip');
    // const selectedShip = shipSelect ? shipSelect.value : null; // Comentado para mostrar TODOS los costos de la operación

    let totalOp = 0;

    costos.forEach((costo, index) => {
        if (costo.operacion !== opName) return;

        // Si se requiere filtrar por buque descomentar. Pero el usuario quiere ver "COSTO TOTAL DE LA OPERACIÓN"
        // if (selectedShip && costo.buque !== selectedShip) return;

        totalOp += parseFloat(costo.monto || 0);

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${costo.buque || 'N/A'}</td>
            <td>${costo.item}</td>
            <td>$${costo.monto.toFixed(2)}</td>
            <td>
                <button class="btn btn-edit" onclick="editCost(${index})">✏️</button>
                <button class="btn btn-danger" onclick="deleteCost(${index})">🗑️</button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    // Actualizar el Label de Total
    const totalDisplay = document.getElementById('totalCostDisplay');
    if (totalDisplay) {
        totalDisplay.innerText = '$' + totalOp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
}

function editCost(index) {
    const costos = JSON.parse(localStorage.getItem('v16_costos')) || [];
    const costo = costos[index];

    if (!costo) return;

    document.getElementById('costShip').value = costo.buque;
    document.getElementById('costItem').value = costo.item;
    document.getElementById('costValue').value = costo.monto;
    document.getElementById('editCostIndex').value = index;
}

function deleteCost(index) {
    if (!confirm('¿Eliminar este costo?')) return;

    let costos = JSON.parse(localStorage.getItem('v16_costos')) || [];
    costos.splice(index, 1);
    localStorage.setItem('v16_costos', JSON.stringify(costos));
    renderCosts();
    resetCostForm();
    saveToFile();
    alert("Costo guardado y sincronizado.");
}

function getOperacionCostoTotal(opName) {
    const costos = JSON.parse(localStorage.getItem('v16_costos')) || [];
    return costos
        .filter(c => c.operacion === opName)
        .reduce((sum, c) => sum + (c.monto || 0), 0);
}

function getBuqueCostoTotal(opName, buque) {
    const costos = JSON.parse(localStorage.getItem('v16_costos')) || [];
    return costos
        .filter(c => c.operacion === opName && c.buque === buque)
        .reduce((sum, c) => sum + (c.monto || 0), 0);
}
function calcularEficiencia(eficacia, costoTotal) {
    if (!costoTotal || costoTotal <= 0) return 0;
    return ((eficacia / costoTotal) * 1000).toFixed(2);
}
function syncCostToEvaluation() {
    const opName = localStorage.getItem('v16_opName');
    const buque = document.getElementById('evShip') ? document.getElementById('evShip').value : null;

    let costoTotal = 0;

    if (buque) {
        costoTotal = getBuqueCostoTotal(opName, buque);
    }

    const evCost = document.getElementById('evCost');
    if (evCost) evCost.value = costoTotal.toFixed(2);
}


function resetCostForm() {
    document.getElementById('editCostIndex').value = -1;
    document.getElementById('costItem').value = '';
    document.getElementById('costValue').value = '';
}

// LÓGICA PASO 3 (MODIFICADA PARA OPCIÓN A: NOVEDADES)
function processEvaluation() {
    const idx = parseInt(document.getElementById('editIndexLog').value);
    const exName = document.getElementById('evExSelect').value;
    const date = document.getElementById('evDate').value;
    const opActual = (localStorage.getItem('v16_opName') || "GENERAL").toUpperCase();
    const buque = document.getElementById('evShip').value;

    if (!exName || !date) return alert("Faltan datos");
    const exObj = dbEjercicios.find(e => e.name === exName);
    const ltObj = dbLIUNTAS.find(l => l.code === exObj.untlCode);

    const data = {
        opName: opActual,
        ship: buque,
        untl: ltObj.code,
        untlName: ltObj.name,
        ex: exObj.name,
        score: parseFloat(document.getElementById('evScore').value),
        wUntl: ltObj.weight,
        wEx: exObj.weight,
        date: date,
        hours: parseFloat(document.getElementById('evTime').value) || 0,
        time: parseFloat(document.getElementById('evTime').value) || 0,
        obs: document.getElementById('evObs').value.toUpperCase()
    };

    if (idx === -1) logs.push(data); else logs[idx] = data;
    localStorage.setItem('v16_logs', JSON.stringify(logs));
    alert("Evaluación procesada y sincronizada.");
    saveToFile();
    resetFormLog();
    updateDashboard();
    updateResumenSelector();
}

// DASHBOARDS
function updateDashboard() {
    const currentOp = (localStorage.getItem('v16_opName') || "GENERAL").toUpperCase();
    const opLogs = logs.filter(l => l.opName === currentOp);

    const shipData = adminShips.map(s => {
        const sLogs = opLogs.filter(l => l.ship === s);
        let obtenido = 0;
        let maximo = 0;

        sLogs.forEach(c => {
            const peso = (c.wEx / 100) * (c.wUntl / 100);
            obtenido += (c.score / 10) * peso;
            maximo += peso;
        });

        return maximo > 0 ? +((obtenido / maximo) * 100).toFixed(1) : 0;
    });

    // Gráfico de Eficacia en apartado 4 (EVALUACIONES/EFICACIA)
    const ctxEficaciaEval = document.getElementById('chartEficaciaEval');
    if (ctxEficaciaEval) {
        if (chartEficaciaEval) chartEficaciaEval.destroy();
        chartEficaciaEval = new Chart(ctxEficaciaEval, {
            type: 'bar',
            data: {
                labels: adminShips.map(s => s.replace('BAE ', '').replace('LAE ', '')),
                datasets: [{
                    label: 'Eficacia (%)',
                    data: shipData,
                    backgroundColor: shipData.map(v => v >= 80 ? '#2f855a' : (v >= 70 ? '#ecc94b' : '#c53030'))
                }]
            },
            options: {
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, max: 100 } }
            }
        });
    }

    // Actualizar tabla de bitácora
    const tbody = document.querySelector('#tblLogs tbody');
    if (tbody) tbody.innerHTML = opLogs.map((l, i) => `
    <tr>
        <td>${l.ship}</td>
        <td>${l.untlName}</td>
        <td>${l.ex}</td>
        <td><b>${l.score.toFixed(1)}</b></td>
        <td>${l.hours || l.time || 0}</td>
        <td>${l.obs || '-'}</td>
        <td>
            <button class="btn btn-edit" onclick="editLog(${i})">Editar</button>
            <button class="btn btn-danger" onclick="delLog(${i})">X</button>
        </td>
    </tr>
    `).join('');

    if (typeof renderResumen === 'function') {
        renderResumen();
    }
}


function closeOperation() {
    if (isOperationClosed()) {
        alert("Operación cerrada. No se permiten más modificaciones.");
        return;

    }

    if (!confirm("¿Está seguro de CERRAR la operación?\nNo se permitirán más cambios.")) {
        return;
    }

    localStorage.setItem('v16_opStatus', 'CLOSED');
    alert("Operación cerrada y sincronizada.");
    saveToFile();
    updateOperationStatusUI();
}
// OPCIÓN C: FUNCIONES DE GESTIÓN DE DATOS
function exportDB() {
    const data = {
        liuntas: dbLIUNTAS,
        ex: dbEjercicios,
        logs: logs,
        opName: localStorage.getItem('v16_opName'),
        ships: adminShips
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'RESPALDO_CODESC.json';
    a.click();
}

function importDB() {
    const fileInput = document.getElementById('importFile');
    if (!fileInput.files[0]) return alert("Seleccione un archivo");
    const reader = new FileReader();
    reader.onload = function (e) {
        const data = JSON.parse(e.target.result);
        if (confirm("¿Restaurar datos? Se borrará lo actual.")) {
            localStorage.setItem('v16_liuntas', JSON.stringify(data.liuntas));
            localStorage.setItem('v16_ex', JSON.stringify(data.ex));
            localStorage.setItem('v16_logs', JSON.stringify(data.logs));
            localStorage.setItem('v16_opName', data.opName);
            location.reload();
        }
    };
    reader.readAsText(fileInput.files[0]);
}

function resetSystem() { if (confirm("¿Seguro? Se borrará TODA la información.")) { localStorage.clear(); location.reload(); } }

// RESUMEN (SIN CAMBIOS)
function updateResumenSelector() {
    const ops = [...new Set(logs.map(l => l.opName))];
    const current = localStorage.getItem('v16_opName');
    if (current && !ops.includes(current)) ops.push(current);
    const sel = document.getElementById('resumenOpSelector');
    if (sel) sel.innerHTML = ops.map(o => `<option value="${o}" ${o === current ? 'selected' : ''}>${o}</option>`).join('');
}

function updateIntegralOpSelector() {
    const ops = [...new Set(logs.map(l => l.opName))].filter(Boolean);
    const current = localStorage.getItem('v16_opName') || "";
    if (current && !ops.includes(current)) ops.push(current);

    const sel = document.getElementById('integralOpSelector');
    if (!sel) return;

    let options = '<option value="">-- Activa Actual --</option>';
    ops.forEach(op => {
        options += `<option value="${op}" ${op === current ? 'selected' : ''}>${op}</option>`;
    });
    sel.innerHTML = options;
}

function renderResumen() {
    const sel = document.getElementById('resumenOpSelector');
    const opSel = sel && sel.value
        ? sel.value
        : (localStorage.getItem('v16_opName') || '');
    const opLogs = logs.filter(l => l.opName === opSel);

    // ===== COSTO TOTAL DE LA OPERACIÓN =====
    const costoTotalOperacion = getOperacionCostoTotal(opSel);

    // 🔒 USAR SIEMPRE TODOS LOS BUQUES REGISTRADOS
    const shipsList = adminShips;

    // ===== TIEMPO TOTAL POR BUQUE (SUMA DE TIEMPOS DE EJERCICIOS) =====
    const shipTimes = shipsList.map(s => {
        const sLogs = opLogs.filter(l => l.ship === s);
        return sLogs.reduce((sum, l) => sum + (l.time || 0), 0);
    });

    // ===== COSTO TOTAL POR BUQUE (DESDE DB COSTOS) =====
    const shipCosts = shipsList.map(s => getBuqueCostoTotal(opSel, s));

    // ===== MÍNIMOS Y MÁXIMOS PARA NORMALIZACIÓN =====
    // Nota: Usamos 1 para evitar división por cero si todos son 0
    // Para eficiencia: Menos es mejor. Usamos min/actual.

    // Filtrar valores > 0 para encontrar el mínimo real (el mejor desempeño)
    const validTimes = shipTimes.filter(t => t > 0);
    const validCosts = shipCosts.filter(c => c > 0);

    const minTime = validTimes.length > 0 ? Math.min(...validTimes) : 0;
    const minCost = validCosts.length > 0 ? Math.min(...validCosts) : 0;

    const shipResults = shipsList.map(s => {
        const sLogs = opLogs.filter(l => l.ship === s);
        let obtenido = 0;
        let maximo = 0;

        sLogs.forEach(c => {
            const peso = (c.wEx / 100) * (c.wUntl / 100);
            obtenido += (c.score / 10) * peso;
            maximo += peso;
        });

        // Eficacia
        const score = maximo > 0 ? (obtenido / maximo) * 100 : 0;
        return { ship: s, score: parseFloat(score.toFixed(1)) };
    });

    // 🔒 GLOBAL NORMALIZADO CON TODOS LOS BUQUES REGISTRADOS
    const safeResults = shipResults.map(b => Math.min(100, Math.max(0, b.score)));

    const global = adminShips.length > 0
        ? (safeResults.reduce((a, b) => a + b, 0) / adminShips.length).toFixed(1)
        : 0;

    const eficaciaGlobal = global;

    // ===== EFICIENCIA POR BUQUE =====
    // Fórmula ponderada: Eficacia (50%) + Tiempo Optimizado (25%) + Costo Optimizado (25%)
    // Lógica Inversa: (Min / Actual) * 100. Si actual es 0, asumimos 100% (si min también es 0).

    const shipEfficiency = shipResults.map((r, i) => {
        // Si no hay datos, eficiencia es 0
        if (shipTimes[i] === 0 && shipCosts[i] === 0 && r.score === 0) return 0;

        // Eficacia como porcentaje (ya viene en 0-100)
        const eficaciaComponent = r.score * 0.5;

        // Componente de tiempo
        const tVal = shipTimes[i];
        let tiempoScore = 0;
        if (tVal > 0) {
            tiempoScore = (minTime / tVal) * 100;
        } else {
            // Si el buque no tiene tiempo pero tiene eficacia, el tiempo no lo penaliza (neutral)
            // O podemos decidir que 0 tiempo es error. Por ahora, si hay eficacia y t=0, ignoramos penalización de tiempo.
            tiempoScore = r.score > 0 ? 100 : 0;
        }
        const tiempoComponent = tiempoScore * 0.25;

        // Componente de costo
        const cVal = shipCosts[i];
        let costoScore = 0;
        if (cVal > 0) {
            costoScore = (minCost / cVal) * 100;
        } else {
            // Si costo es 0 pero hay eficacia, el costo no lo penaliza
            costoScore = r.score > 0 ? 100 : 0;
        }
        const costoComponent = costoScore * 0.25;

        // Eficiencia total
        const eficiencia = eficaciaComponent + tiempoComponent + costoComponent;
        return parseFloat(eficiencia.toFixed(2));
    });

    // Filtramos solo los buques que realmente tienen datos para el promedio global
    const participants = shipResults.filter((r, i) => r.score > 0 || shipTimes[i] > 0 || shipCosts[i] > 0);
    const participantEfficiency = shipEfficiency.filter((val, idx) => {
        const r = shipResults[idx];
        return r.score > 0 || shipTimes[idx] > 0 || shipCosts[idx] > 0;
    });

    const eficaciaGlobalVal = participants.length > 0
        ? (participants.reduce((a, b) => a + b.score, 0) / participants.length).toFixed(1)
        : 0;

    const eficienciaOperativaGlobal = participantEfficiency.length > 0
        ? (participantEfficiency.reduce((a, b) => a + b, 0) / participantEfficiency.length).toFixed(2)
        : 0;

    document.getElementById('resumenGlobalLabel').innerText = eficaciaGlobalVal + "%";

    const estado = global >= 80 ? 'ÓPTIMO' : (global >= 70 ? 'RESTRINGIDO' : 'CRÍTICO');
    document.getElementById('resumenStatusBox').innerText = estado;

    document.getElementById('resumenEficienciaGlobalLabel').innerText = eficienciaOperativaGlobal + "%";

    const estadoEficiencia = eficienciaOperativaGlobal >= 80 ? 'ÓPTIMO' : (eficienciaOperativaGlobal >= 70 ? 'RESTRINGIDO' : 'CRÍTICO');
    document.getElementById('resumenEficienciaStatusBox').innerText = estadoEficiencia;

    /* ================== GRAFICO EFICACIA POR BUQUE ================== */
    const ctxEficacia = document.getElementById('chartResumenEficacia');
    if (ctxEficacia && shipResults.length > 0) {
        if (chartResumenEficacia) chartResumenEficacia.destroy();
        chartResumenEficacia = new Chart(ctxEficacia, {
            type: 'bar',
            data: {
                labels: shipResults.map(r => r.ship),
                datasets: [{
                    label: 'Eficacia (%)',
                    data: shipResults.map(r => r.score),
                    backgroundColor: shipResults.map(r =>
                        r.score >= 80 ? '#2f855a' :
                            r.score >= 70 ? '#ecc94b' : '#c53030'
                    )
                }]
            },
            options: {
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: v => v + '%' }
                    }
                }
            }
        });
    }

    /* ================== GRAFICO EFICIENCIA POR BUQUE ================== */
    const ctxEficiencia = document.getElementById('chartResumenEficiencia');
    if (ctxEficiencia && shipResults.length > 0) {
        if (chartResumenEficiencia) chartResumenEficiencia.destroy(); // FIXED VARIABLE NAME
        chartResumenEficiencia = new Chart(ctxEficiencia, {
            type: 'bar',
            data: {
                labels: shipResults.map(r => r.ship),
                datasets: [{
                    label: 'Eficiencia (%)',
                    data: shipEfficiency,
                    backgroundColor: shipEfficiency.map(v =>
                        v >= 80 ? '#2f855a' :
                            v >= 70 ? '#ecc94b' : '#c53030'
                    )
                }]
            },
            options: {
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: v => v + '%' }
                    }
                }
            }
        });
    }
}


// FUNCIÓN PARA RENDERIZAR EFICIENCIA
// FUNCIÓN PARA RENDERIZAR EFICIENCIA
function renderEficiencia() {
    const opActual = localStorage.getItem('v16_opName') || '';
    const opLogs = logs.filter(l => l.opName === opActual);
    const costos = JSON.parse(localStorage.getItem('v16_costos')) || [];

    // Pre-calcular minTime y minCost para normalización (basado en min/actual)
    const allShipTimes = adminShips.map(b => {
        const logs = opLogs.filter(l => l.ship === b);
        return logs.reduce((sum, l) => sum + (l.time || 0), 0);
    });
    const allShipCosts = adminShips.map(b => {
        const cst = costos.filter(c => c.operacion === opActual && c.buque === b);
        return cst.reduce((sum, c) => sum + c.monto, 0);
    });

    const validTimes = allShipTimes.filter(t => t > 0);
    const validCosts = allShipCosts.filter(c => c > 0);

    const minTime = validTimes.length > 0 ? Math.min(...validTimes) : 0;
    const minCost = validCosts.length > 0 ? Math.min(...validCosts) : 0;

    // Crear tabla de eficacia, costos y eficiencia por buque
    const dataBuques = adminShips.map((buque, i) => {
        const evaluacionesBuque = opLogs.filter(l => l.ship === buque);
        const costosBuque = costos.filter(c => c.operacion === opActual && c.buque === buque);

        let eficacia = 0;
        let maximo = 0;

        evaluacionesBuque.forEach(e => {
            const peso = (e.wEx / 100) * (e.wUntl / 100);
            eficacia += (e.score / 10) * peso;
            maximo += peso;
        });

        eficacia = maximo > 0 ? (eficacia / maximo) * 100 : 0;
        eficacia = Math.min(100, Math.max(0, eficacia));

        const tVal = allShipTimes[i];
        const cVal = allShipCosts[i];

        // Componente Eficacia (50%)
        const eficaciaComponent = eficacia * 0.5;

        // Componente Tiempo (25%)
        let tScore = 0;
        if (tVal > 0) tScore = (minTime / tVal) * 100;
        else if (eficacia > 0) tScore = 100; // Si no hay tiempo pero hay eficacia, neutro

        // Componente Costo (25%)
        let cScore = 0;
        if (cVal > 0) cScore = (minCost / cVal) * 100;
        else if (eficacia > 0) cScore = 100; // Si no hay costo pero hay eficacia, neutro

        const eficienciaScore = parseFloat((eficaciaComponent + (tScore * 0.25) + (cScore * 0.25)).toFixed(2));
        const estado = eficienciaScore >= 80 ? 'ÓPTIMO' : (eficienciaScore >= 70 ? 'RESTRINGIDO' : 'CRÍTICO');

        return {
            buque,
            eficacia: eficacia.toFixed(1),
            costoTotal: cVal.toFixed(2),
            tiempoTotal: tVal.toFixed(1),
            eficiencia: eficienciaScore,
            evaluaciones: evaluacionesBuque.length,
            estado,
            participo: (evaluacionesBuque.length > 0 || cVal > 0)
        };
    });

    // Filtramos solo los buques que realmente participaron
    const participantes = dataBuques.filter(d => d.participo);

    // Renderizar tabla principal
    const tbody = document.querySelector('#tblEficienciaBuques tbody');
    if (tbody) {
        tbody.innerHTML = participantes.map(d => `
            <tr>
                <td><b>${d.buque}</b></td>
                <td>${d.eficacia}%</td>
                <td>$${d.costoTotal}</td>
                <td>${d.tiempoTotal} h</td>
                <td><b>${d.eficiencia}</b></td>
                <td>${d.evaluaciones}</td>
                <td style="color: ${d.eficiencia >= 80 ? '#2f855a' : (d.eficiencia >= 70 ? '#ecc94b' : '#c53030')}"><b>${d.estado}</b></td>
            </tr>
        `).join('');
    }

    // Actualizar encabezado de la tabla
    const thead = document.querySelector('#tblEficienciaBuques thead tr');
    if (thead) {
        thead.innerHTML = `
            <th>Buque</th>
            <th>Eficacia (%)</th>
            <th>Costo Total (USD)</th>
            <th>Tiempo Total (horas)</th>
            <th>Eficiencia</th>
            <th>Evaluaciones Registradas</th>
            <th>Estado</th>
        `;
    }

    // Gráfico de Eficiencia
    const ctxEficacia = document.getElementById('chartEficacia');
    if (ctxEficacia) {
        if (chartEficacia) chartEficacia.destroy();
        chartEficacia = new Chart(ctxEficacia, {
            type: 'bar',
            data: {
                labels: dataBuques.map(d => d.buque),
                datasets: [{
                    label: 'Eficiencia (%)',
                    data: dataBuques.map(d => parseFloat(d.eficiencia)),
                    backgroundColor: dataBuques.map(d =>
                        parseFloat(d.eficiencia) >= 80 ? '#2f855a' :
                            (parseFloat(d.eficiencia) >= 70 ? '#ecc94b' : '#c53030')
                    )
                }]
            },
            options: {
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
            }
        });
    }


    // Detalles de evaluaciones por buque
    const detallesDiv = document.getElementById('detallesBuques');
    if (detallesDiv) {
        detallesDiv.innerHTML = adminShips.map(buque => {
            const evaluacionesBuque = opLogs.filter(l => l.ship === buque);
            const costosBuque = costos.filter(c => c.operacion === opActual && c.buque === buque);
            const costoTotal = costosBuque.reduce((sum, c) => sum + c.monto, 0);
            const tiempoTotal = evaluacionesBuque.reduce((sum, e) => sum + (e.time || e.hours || 0), 0);

            return `
                <div style="margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; border-left: 4px solid var(--navy);">
                    <h5 style="margin-top: 0;">${buque}</h5>
                    <p><b>Evaluaciones:</b> ${evaluacionesBuque.length}</p>
                    <p><b>Tiempo Total Empleado:</b> ${tiempoTotal.toFixed(1)} horas</p>
                    <p><b>Costo Total:</b> $${costoTotal.toFixed(2)}</p>
                    <p><b>Items de Costo:</b></p>
                    <ul style="margin: 5px 0;">
                        ${costosBuque.map(c => `<li>${c.item}: $${c.monto.toFixed(2)}</li>`).join('') || '<li>Sin costos registrados</li>'}
                    </ul>
                    <p><b>Evaluaciones Realizadas:</b></p>
                    <ul style="margin: 5px 0;">
                        ${evaluacionesBuque.length > 0 ? evaluacionesBuque.map(e =>
                `<li>${e.ex} - Nota: ${e.score}/10 - Tiempo: ${(e.time || e.hours || 0).toFixed(1)}h - ${e.date}</li>`
            ).join('') : '<li>Sin evaluaciones</li>'}
                    </ul>
                </div>
            `;
        }).join('');
    }
}

// HELPERS
function refreshSelectors() {
    const sP = document.getElementById('exUntlParent');
    const sE = document.getElementById('evExSelect');
    const sS = document.getElementById('evShip');
    const sC = document.getElementById('costShip');
    if (sP) sP.innerHTML = dbLIUNTAS.map(l => `<option value="${l.code}">${l.code} - ${l.name}</option>`).join('');
    if (sE) sE.innerHTML = dbEjercicios.map(e => `<option value="${e.name}">${e.name} (${e.untlCode})</option>`).join('');
    if (sS) sS.innerHTML = adminShips.map(s => `<option value="${s}">${s}</option>`).join('');
    if (sC) sC.innerHTML = adminShips.map(s => `<option value="${s}">${s}</option>`).join('');

    updateResumenSelector();
    updateIntegralOpSelector();
    renderHistoricalSelectors();
}

function editL(i) { const l = dbLIUNTAS[i]; document.getElementById('ltCode').value = l.code; document.getElementById('ltName').value = l.name; document.getElementById('ltWeight').value = l.weight; document.getElementById('editIndexL').value = i; }
function resetFormL() { document.getElementById('editIndexL').value = -1; document.getElementById('ltCode').value = ''; document.getElementById('ltName').value = ''; document.getElementById('ltWeight').value = ''; }
function editE(i) { const e = dbEjercicios[i]; document.getElementById('exUntlParent').value = e.untlCode; document.getElementById('exName').value = e.name; document.getElementById('exWeight').value = e.weight; document.getElementById('editIndexE').value = i; }
function resetFormE() { document.getElementById('editIndexE').value = -1; document.getElementById('exName').value = ''; document.getElementById('exWeight').value = ''; }
function editLog(i) { const l = logs[i]; document.getElementById('evShip').value = l.ship; document.getElementById('evExSelect').value = l.ex; document.getElementById('evScore').value = l.score; document.getElementById('evDate').value = l.date; document.getElementById('evTime').value = l.time || l.hours; document.getElementById('evObs').value = l.obs || ""; document.getElementById('editIndexLog').value = i; }
function resetFormLog() { document.getElementById('editIndexLog').value = -1; document.getElementById('evScore').value = ''; document.getElementById('evDate').value = ''; document.getElementById('evTime').value = ''; document.getElementById('evObs').value = ''; }
function delL(i) { dbLIUNTAS.splice(i, 1); localStorage.setItem('v16_liuntas', JSON.stringify(dbLIUNTAS)); renderLIUNTAS(); }
function delE(i) { dbEjercicios.splice(i, 1); localStorage.setItem('v16_ex', JSON.stringify(dbEjercicios)); renderEjercicios(); }
function delLog(i) { logs.splice(i, 1); localStorage.setItem('v16_logs', JSON.stringify(logs)); updateDashboard(); updateResumenSelector(); }

// PDF (ACTUALIZADO CON NOVEDADES)


function generatePDF() {

    if (!logs || logs.length === 0) {
        alert("No existen evaluaciones registradas para generar el PDF.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const ships = adminShips;
    const shipScores = [];

    /* ================= ENCABEZADO INSTITUCIONAL ================= */
    const drawHeader = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("ARMADA DEL ECUADOR", pageWidth / 2, 15, { align: "center" });

        doc.setFontSize(10);
        doc.text("COMANDANCIA DE LA ESCUADRA", pageWidth / 2, 21, { align: "center" });

        // Línea separadora
        doc.setLineWidth(0.5);
        doc.line(15, 24, pageWidth - 15, 24);
    };

    /* ================= FIRMAS ================= */
    const drawSignatures = () => {
        const baseY = pageHeight - 50;
        doc.setFontSize(8);

        doc.line(15, baseY, 85, baseY);
        doc.text("EVALUADOR OPERACIONAL", 50, baseY + 5, { align: "center" });

        doc.line(15, baseY + 18, 85, baseY + 18);
        doc.text("JEFE DE OPERACIONES", 50, baseY + 23, { align: "center" });

        doc.line(pageWidth - 85, baseY, pageWidth - 15, baseY);
        doc.text("JEFE DE ESTADO MAYOR CODESC", pageWidth - 50, baseY + 5, { align: "center" });

        doc.line(pageWidth - 85, baseY + 18, pageWidth - 15, baseY + 18);
        doc.text("COMANDANTE EN JEFE DE LA ESCUADRA", pageWidth - 50, baseY + 23, { align: "center" });
    };

    /* ================= PORTADA ================= */
    /* ================= PORTADA ================= */
    drawHeader();

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(
        "REPORTE GENERAL DE EVALUACIÓN OPERACIONAL",
        pageWidth / 2,
        35,
        { align: "center" }
    );

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
        `Fecha de generación: ${new Date().toLocaleString()}`,
        pageWidth / 2,
        42,
        { align: "center" }
    );

    /* ================= CÁLCULO GLOBAL ================= */
    ships.forEach(ship => {

        const shipLogs = logs.filter(l => l.ship === ship);

        let total = 0;
        let maximo = 0;

        shipLogs.forEach(c => {
            const peso = (c.wEx / 100) * (c.wUntl / 100);
            total += (c.score / 10) * peso;
            maximo += peso;
        });

        let resultadoFinal = maximo > 0 ? (total / maximo) * 100 : 0;
        resultadoFinal = Math.min(100, Math.max(0, resultadoFinal));
        shipScores.push(resultadoFinal);

    });

    const shipHours = ships.map(ship =>
        logs
            .filter(l => l.ship === ship)
            .reduce((sum, l) => sum + (l.time || 0), 0)
    );

    /* ================= TABLA GLOBAL ================= */
    doc.autoTable({
        startY: 55,
        head: [['UNIDAD NAVAL', 'CALIFICACIÓN', 'HORAS', 'ESTADO']],
        body: ships.map((s, i) => {
            const resultado = shipScores[i].toFixed(2);
            const estado = resultado >= 80 ? "ÓPTIMO" : (resultado >= 70 ? "RESTRINGIDO" : "CRÍTICO");
            return [s, resultado + "%", shipHours[i].toFixed(1), estado];
        }),

        theme: 'grid',
        headStyles: { fillColor: [0, 31, 63] }
    });

    const globalOperacion = shipScores.length > 0
        ? shipScores.reduce((a, b) => a + b, 0) / shipScores.length
        : 0;

    doc.setFontSize(11);
    doc.text(
        `PORCENTAJE GLOBAL DE LA OPERACIÓN: ${globalOperacion.toFixed(1)}%`,
        pageWidth / 2,
        doc.lastAutoTable.finalY + 10,
        { align: "center" }
    );

    drawSignatures();

    /* ================= DETALLE POR BUQUE ================= */
    ships.forEach(ship => {

        const shipLogs = logs.filter(l => l.ship === ship);
        if (shipLogs.length === 0) return;

        doc.addPage();
        drawHeader();

        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(
            `DETALLE DE EVALUACIÓN – ${ship}`,
            pageWidth / 2,
            32,
            { align: "center" }
        );

        doc.autoTable({
            startY: 40,
            head: [['EJERCICIO', 'FECHA', 'NOTA', 'HORAS', 'NOVEDADES']],
            body: shipLogs.map(t => [
                t.ex,
                t.date,
                t.score,
                t.hours || 0,
                t.obs || "SIN NOVEDAD"
            ]),
            theme: 'striped'
        });

        let total = 0;
        let maximo = 0;

        shipLogs.forEach(c => {
            const peso = (c.wEx / 100) * (c.wUntl / 100);
            total += (c.score / 10) * peso;
            maximo += peso;
        });

        const totalShipScore = (maximo > 0 ? (total / maximo) * 100 : 0).toFixed(2);

        doc.setFontSize(11);
        doc.setFont(undefined, "bold");
        doc.text(
            `RESULTADO FINAL DEL BUQUE: ${totalShipScore}%`,
            pageWidth / 2,
            doc.lastAutoTable.finalY + 10,
            { align: "center" }
        );

        drawSignatures();
    });

    /* ================= GUARDAR ================= */
    doc.save("Reporte_Evaluacion_Operacional.pdf");

}


function updateOperationStatusUI() {
    const badge = document.getElementById('opStatusBadge');
    if (!badge) return;

    if (isOperationClosed()) {
        badge.innerHTML = "🔒 OPERACIÓN CERRADA";
        badge.style.color = "#c53030";
    } else {
        badge.innerHTML = "🟢 OPERACIÓN ABIERTA";
        badge.style.color = "#2f855a";
    }
}
window.onload = () => {

    // Forzar login
    document.getElementById("loginBox").style.display = "flex";
    document.getElementById("app").style.display = "none";

    if (localStorage.getItem("logged") === "true") {
        document.getElementById("loginBox").style.display = "none";
        document.getElementById("app").style.display = "flex";
        aplicarPermisos();
    }

    if (!localStorage.getItem('v16_opStatus')) {
        localStorage.setItem('v16_opStatus', 'OPEN');
    }

    renderLIUNTAS();
    renderEjercicios();
    refreshSelectors();
    updateResumenSelector();
    updateDashboard();
    updateOperationStatusUI();

    renderUsers();
    renderShips();
    renderAudit();
};

// ================= CONTROL DE PERMISOS =================
function aplicarPermisos() {
    const rol = getUserRole();
    const subAdmin = document.getElementById("subAdmin");
    const menuAdmin = document.getElementById("menuAdmin");
    const menuTactico = document.getElementById("menuTactico");
    const menuOperacional = document.getElementById("menuOperacional");
    const menuEstrategico = document.getElementById("menuEstrategico");
    const menuGestionDatos = document.getElementById("menuGestionDatos");
    const menuCreditos = document.getElementById("menuCreditos");

    // Reset visibility
    const allMenuItems = [menuTactico, menuOperacional, menuEstrategico, menuGestionDatos, menuCreditos, menuAdmin];
    allMenuItems.forEach(m => { if (m) m.style.display = "block"; });

    const allSubItems = document.querySelectorAll(".submenu-item");
    allSubItems.forEach(s => s.style.display = "block");

    // Hide Admin Submenu by default if not admin
    if (rol !== ROLES.ADMIN) {
        if (menuAdmin) menuAdmin.style.display = "none";
        document.querySelectorAll("#admin-buques input, #admin-buques button")
            .forEach(el => el.disabled = true);
    }

    // Role specific logic
    if (rol === ROLES.EVALUADOR) {
        if (menuOperacional) menuOperacional.style.display = "none";
        if (menuEstrategico) menuEstrategico.style.display = "none";
        if (menuGestionDatos) menuGestionDatos.style.display = "none";
        allSubItems.forEach(s => {
            if (s.id !== "itemSuperficie") s.style.display = "none";
        });
    } else if (rol === ROLES.MANDO || rol === ROLES.LECTURA) {
        if (menuGestionDatos) menuGestionDatos.style.display = "none";
    } else if ([ROLES.SUPERFICIE, ROLES.SUBMARINOS, ROLES.AVIACION, ROLES.INFANTERIA, ROLES.GUARDACOSTAS].includes(rol)) {
        // Force specific roles: Only show their tactical item and credits
        if (menuOperacional) menuOperacional.style.display = "none";
        if (menuEstrategico) menuEstrategico.style.display = "none";
        if (menuGestionDatos) menuGestionDatos.style.display = "none";

        allSubItems.forEach(s => s.style.display = "none");

        if (rol === ROLES.SUPERFICIE) {
            document.getElementById("itemSuperficie").style.display = "block";
            showMainSection('tactico-superficie', document.getElementById("itemSuperficie"));
        }
        if (rol === ROLES.SUBMARINOS) {
            document.getElementById("itemSubmarinos").style.display = "block";
            showMainSection('vacio', document.getElementById("itemSubmarinos"));
        }
        if (rol === ROLES.AVIACION) {
            document.getElementById("itemAviacion").style.display = "block";
            showMainSection('vacio', document.getElementById("itemAviacion"));
        }
        if (rol === ROLES.INFANTERIA) {
            document.getElementById("itemInfanteria").style.display = "block";
            showMainSection('vacio', document.getElementById("itemInfanteria"));
        }
        if (rol === ROLES.GUARDACOSTAS) {
            document.getElementById("itemGuardacostas").style.display = "block";
            showMainSection('vacio', document.getElementById("itemGuardacostas"));
        }
    }

    document.querySelectorAll("input, select, textarea").forEach(el => {
        el.disabled = (rol === ROLES.LECTURA || rol === ROLES.MANDO);
    });
}

let adminUsers = JSON.parse(localStorage.getItem("admin_users")) || USERS;

if (!localStorage.getItem("admin_ships")) {
    localStorage.setItem("admin_ships", JSON.stringify([
        //"BAE MORÁN VALVERDE",
        //"BAE PRESIDENTE ALFARO",
        //"BAE ESMERALDAS"
    ]));

}
adminShips = JSON.parse(localStorage.getItem("admin_ships"));

let audit = JSON.parse(localStorage.getItem("audit_log")) || [];

function logAction(action) {
    audit.push({
        user: localStorage.getItem("logged_user"),
        role: getUserRole(),
        action,
        date: new Date().toLocaleString()
    });
    localStorage.setItem("audit_log", JSON.stringify(audit));
}

function addUser() {
    if (getUserRole() !== ROLES.ADMIN) {
        alert("Acceso restringido: solo Administrador");
        return;
    }

    const idx = parseInt(document.getElementById("editUserIndex").value);
    const userInput = document.getElementById("newUser");
    const passInput = document.getElementById("newPass");
    const roleSelect = document.getElementById("newRole");

    const data = {
        user: userInput.value,
        pass: passInput.value,
        role: roleSelect.value,
        date: new Date().toLocaleDateString()
    };

    if (idx === -1) {
        adminUsers.push(data);
        logAction("Creó usuario");
    } else {
        adminUsers[idx] = data;
        logAction("Editó usuario");
    }

    localStorage.setItem("admin_users", JSON.stringify(adminUsers));
    document.getElementById("editUserIndex").value = -1;
    document.getElementById("newUser").value = "";
    document.getElementById("newPass").value = "";
    renderUsers();
    saveToFile();
}

function renderUsers() {
    tblUsers.innerHTML = adminUsers.map((u, i) => `
    <tr>
        <td>${u.user}</td>
        <td>${u.role}</td>
        <td>${u.date || "-"}</td>
        <td>
            <button class="btn btn-edit" onclick="editUser(${i})">Editar</button>
            <button class="btn btn-danger" onclick="delUser(${i})">X</button>
        </td>
    </tr>`).join('');
}

function editUser(i) {
    const u = adminUsers[i];
    document.getElementById("newUser").value = u.user;
    document.getElementById("newPass").value = u.pass;
    document.getElementById("newRole").value = u.role;
    document.getElementById("editUserIndex").value = i;
}

function delUser(i) {
    adminUsers.splice(i, 1);
    localStorage.setItem("admin_users", JSON.stringify(adminUsers));
    renderUsers();
    saveToFile();
}

function addShip() {
    if (getUserRole() !== ROLES.ADMIN) {
        alert("Acceso restringido: solo Administrador");
        return;
    }

    const idx = parseInt(document.getElementById("editShipIndex").value);
    const shipInput = document.getElementById("newShip");
    const name = shipInput.value.trim().toUpperCase();

    if (!name) return;

    // VALIDAR DUPLICADOS (excepto el mismo índice)
    if (adminShips.includes(name) && adminShips[idx] !== name) {
        alert("El buque ya existe");
        return;
    }

    if (idx === -1) {
        adminShips.push(name);
        logAction("Agregó buque " + name);
    } else {
        const oldName = adminShips[idx];
        adminShips[idx] = name;
        logAction(`Editó buque: ${oldName} → ${name}`);
    }

    localStorage.setItem("admin_ships", JSON.stringify(adminShips));
    document.getElementById("editShipIndex").value = -1;
    document.getElementById("newShip").value = "";

    renderShips();
    refreshSelectors();
    saveToFile();
}

function renderShips() {
    tblShips.innerHTML = adminShips.map((s, i) => `
    <tr>
        <td>${s}</td>
        <td>
            <button class="btn btn-edit" onclick="editShip(${i})">Editar</button>
            <button class="btn btn-danger" onclick="delShip(${i})">X</button>
        </td>
    </tr>
`).join('');
}

function editShip(i) {
    const ship = adminShips[i];
    document.getElementById("newShip").value = ship;
    document.getElementById("editShipIndex").value = i;
}

function delShip(i) {
    if (getUserRole() !== ROLES.ADMIN) {
        alert("Acceso restringido");
        return;
    }

    if (!confirm("¿Eliminar buque? Esto NO borra evaluaciones históricas.")) return;

    adminShips.splice(i, 1);
    localStorage.setItem("admin_ships", JSON.stringify(adminShips));
    logAction("Eliminó buque");
    renderShips();
    refreshSelectors();
    saveToFile();
}

function renderAudit() {
    tblAudit.innerHTML = audit.map(a => `
    <tr><td>${a.user}</td><td>${a.role}</td><td>${a.action}</td><td>${a.date}</td></tr>
`).join('');
}

// ================ FUNCIONES PARA GENERAR REPORTES EN PDF (APARTADO 6) ================

function generateReportPerShip() {
    const { jsPDF } = window.jspdf;
    const sel = document.getElementById('resumenOpSelector');
    const opSel = sel && sel.value ? sel.value : (localStorage.getItem('v16_opName') || '');

    if (!opSel) {
        alert('Por favor selecciona una operación');
        return;
    }

    const opLogs = logs.filter(l => l.opName === opSel);
    const shipsList = adminShips;
    const pageHeight = 297; // A4 height
    const pageWidth = 210;  // A4 width
    const costos = JSON.parse(localStorage.getItem('v16_costos')) || [];

    // Pre-calcular minTime y minCost para normalización (basado en min/actual)
    const allShipTimes = shipsList.map(s => {
        const sLogs = opLogs.filter(l => l.ship === s);
        return sLogs.reduce((sum, l) => sum + (l.time || 0), 0);
    });
    const allShipCosts = shipsList.map(s => {
        const cst = costos.filter(c => c.operacion === opSel && c.buque === s);
        return cst.reduce((sum, c) => sum + c.monto, 0);
    });

    const validTimes = allShipTimes.filter(t => t > 0);
    const validCosts = allShipCosts.filter(c => c > 0);

    const minTime = validTimes.length > 0 ? Math.min(...validTimes) : 0;
    const minCost = validCosts.length > 0 ? Math.min(...validCosts) : 0;

    // Crear PDF
    const doc = new jsPDF('p', 'mm', 'A4');
    let firstPage = true;

    // Por cada buque, crear una página con todos sus ejercicios
    shipsList.forEach((ship, shipIndex) => {
        if (!firstPage) {
            doc.addPage();
        }
        firstPage = false;

        const shipLogs = opLogs.filter(l => l.ship === ship);
        let yPos = 15;

        // Encabezado
        doc.setFont('Arial', 'bold');
        doc.setFontSize(12);
        doc.text('ARMADA DEL ECUADOR', pageWidth / 2, yPos, { align: 'center' });
        yPos += 6;
        doc.setFontSize(11);
        doc.text('REPORTE DE EVALUACIÓN OPERACIONAL POR BUQUE', pageWidth / 2, yPos, { align: 'center' });
        yPos += 8;

        // Información del buque
        doc.setFont('Arial', 'normal');
        doc.setFontSize(10);
        doc.text(`Buque: ${ship}`, 20, yPos);
        yPos += 5;
        doc.text(`Operación: ${opSel}`, 20, yPos);
        yPos += 5;
        doc.text(`Fecha Reporte: ${new Date().toLocaleDateString('es-ES')}`, 20, yPos);
        yPos += 8;

        // Calcular eficacia y eficiencia del buque
        let obtenido = 0;
        let maximo = 0;
        shipLogs.forEach(c => {
            const peso = (c.wEx / 100) * (c.wUntl / 100);
            obtenido += (c.score / 10) * peso;
            maximo += peso;
        });
        const eficacia = maximo > 0 ? (obtenido / maximo) * 100 : 0;
        const eficaciaFixed = parseFloat(eficacia.toFixed(1));

        // Calcular eficiencia
        const shipTime = allShipTimes[shipIndex];
        const shipCost = allShipCosts[shipIndex];

        // Componente tiempo
        let tiempoScore = 0;
        if (shipTime === 0) tiempoScore = 100;
        else tiempoScore = (minTime / shipTime) * 100;

        // Componente costo
        let costoScore = 0;
        if (shipCost === 0) costoScore = 100;
        else costoScore = (minCost / shipCost) * 100;

        const eficiencia = (eficaciaFixed * 0.5) + (tiempoScore * 0.25) + (costoScore * 0.25);
        const eficienciaFixed = parseFloat(eficiencia.toFixed(2));

        const estadoEficacia = eficaciaFixed >= 80 ? 'ÓPTIMO' : (eficaciaFixed >= 70 ? 'RESTRINGIDO' : 'CRÍTICO');
        const estadoEficiencia = eficienciaFixed >= 80 ? 'ÓPTIMO' : (eficienciaFixed >= 70 ? 'RESTRINGIDO' : 'CRÍTICO');

        // Resumen del buque
        doc.setFont('Arial', 'bold');
        doc.setFontSize(10);
        doc.text('RESUMEN DE EVALUACIÓN', 20, yPos);
        yPos += 6;

        doc.setFont('Arial', 'normal');
        doc.setFontSize(9);
        doc.text(`Eficacia Global: ${eficaciaFixed}% - ${estadoEficacia}`, 20, yPos);
        yPos += 5;
        doc.text(`Eficiencia Global: ${eficienciaFixed}% - ${estadoEficiencia}`, 20, yPos);
        yPos += 5;
        doc.text(`Tiempo Total: ${shipTime.toFixed(1)} horas`, 20, yPos);
        yPos += 5;
        doc.text(`Costo Total: $${shipCost.toLocaleString('es-ES')}`, 20, yPos);
        yPos += 8;

        // Tabla de ejercicios por buque
        doc.setFont('Arial', 'bold');
        doc.setFontSize(10);
        doc.text('DETALLE DE EJERCICIOS Y TAREAS', 20, yPos);
        yPos += 5;

        const tableData = shipLogs.map(log => [
            log.untlName,
            log.ex,
            log.score + '/10',
            log.date,
            log.time + 'h',
            log.obs || '-'
        ]);

        doc.autoTable({
            head: [['Tarea', 'Ejercicio', 'Calif.', 'Fecha', 'Tiempo', 'Observaciones']],
            body: tableData,
            startY: yPos,
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [0, 31, 63], textColor: [255, 255, 255], fontStyle: 'bold' },
            bodyStyles: { textColor: [0, 0, 0] },
            margin: { left: 20, right: 20 },
            columnStyles: {
                0: { cellWidth: 30 },
                1: { cellWidth: 35 },
                2: { cellWidth: 15 },
                3: { cellWidth: 25 },
                4: { cellWidth: 15 }
            }
        });

        // Firmantes al pie
        yPos = pageHeight - 50;
        doc.setFont('Arial', 'normal');
        doc.setFontSize(12);

        doc.text('_______________________________', 20, yPos);
        doc.text('Evaluador Operacional de CODESC', 22, yPos + 5);

        doc.text('_____________________________', 130, yPos);
        doc.text('Jefe de Operaciones de CODESC', 132, yPos + 5);

        yPos += 28;
        doc.text('______________________________', 20, yPos);
        doc.text('Jefe de Estado Mayor de CODESC', 22, yPos + 5);

        doc.text('______________________________', 130, yPos);
        doc.text('Comandante en Jefe de la Escuadra', 132, yPos + 5);
    });

    doc.save(`Reporte_Por_Buque_${opSel}.pdf`);
}

function generateReportGlobal() {
    const { jsPDF } = window.jspdf;
    const sel = document.getElementById('resumenOpSelector');
    const opSel = sel && sel.value ? sel.value : (localStorage.getItem('v16_opName') || '');

    if (!opSel) {
        alert('Por favor selecciona una operación');
        return;
    }

    const opLogs = logs.filter(l => l.opName === opSel);
    const costoTotalOperacion = getOperacionCostoTotal(opSel);
    const shipsList = adminShips;
    const costas = JSON.parse(localStorage.getItem('v16_costos')) || [];

    // Calcular datos
    const shipTimes = shipsList.map(s => {
        const sLogs = opLogs.filter(l => l.ship === s);
        return sLogs.reduce((sum, l) => sum + (l.time || 0), 0);
    });

    const shipCosts = shipsList.map(s => {
        const cst = costas.filter(c => c.operacion === opSel && c.buque === s);
        return cst.reduce((sum, c) => sum + c.monto, 0);
    });

    const validTimes = shipTimes.filter(t => t > 0);
    const validCosts = shipCosts.filter(c => c > 0);

    const minTime = validTimes.length > 0 ? Math.min(...validTimes) : 0;
    const minCost = validCosts.length > 0 ? Math.min(...validCosts) : 0;

    const shipResults = shipsList.map(s => {
        const sLogs = opLogs.filter(l => l.ship === s);
        let obtenido = 0;
        let maximo = 0;
        sLogs.forEach(c => {
            const peso = (c.wEx / 100) * (c.wUntl / 100);
            obtenido += (c.score / 10) * peso;
            maximo += peso;
        });
        const score = maximo > 0 ? (obtenido / maximo) * 100 : 0;
        return { ship: s, score: parseFloat(score.toFixed(1)) };
    });

    const safeResults = shipResults.map(b => Math.min(100, Math.max(0, b.score)));
    const global = adminShips.length > 0
        ? (safeResults.reduce((a, b) => a + b, 0) / adminShips.length).toFixed(1)
        : 0;

    const shipEfficiency = shipResults.map((r, i) => {
        const eficaciaComponent = r.score * 0.5;

        // Componente tiempo
        let tiempoScore = 0;
        const tVal = shipTimes[i];
        if (tVal === 0) tiempoScore = 0;
        else tiempoScore = (minTime / tVal) * 100;

        // Componente costo
        let costoScore = 0;
        const cVal = shipCosts[i];
        if (cVal === 0) costoScore = 0;
        else costoScore = (minCost / cVal) * 100;

        const eficiencia = eficaciaComponent + (tiempoScore * 0.25) + (costoScore * 0.25);
        return parseFloat(eficiencia.toFixed(2));
    });

    const eficienciaOperativaGlobal = shipEfficiency.length > 0
        ? (shipEfficiency.reduce((a, b) => a + b, 0) / adminShips.length).toFixed(2)
        : 0;

    // Crear PDF
    const doc = new jsPDF('p', 'mm', 'A4');
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    // Encabezado
    doc.setFont('Arial', 'bold');
    doc.setFontSize(14);
    doc.text('ARMADA DEL ECUADOR', pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;
    doc.setFontSize(12);
    doc.text('REPORTE DE EVALUACIÓN OPERACIONAL DE LA COMANDANCIA DE LA ESCUADRA', pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;

    doc.setFont('Arial', 'normal');
    doc.setFontSize(10);
    doc.text(`Operación: ${opSel}`, 20, yPos);
    yPos += 5;
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, 20, yPos);
    yPos += 8;

    // Resumen Global
    doc.setFont('Arial', 'bold');
    doc.setFontSize(11);
    doc.text('RESUMEN GLOBAL', 20, yPos);
    yPos += 6;

    doc.setFont('Arial', 'normal');
    doc.setFontSize(10);

    const estadoGlobal = global >= 80 ? 'ÓPTIMO' : (global >= 70 ? 'RESTRINGIDO' : 'CRÍTICO');
    const estadoEficiencia = eficienciaOperativaGlobal >= 80 ? 'ÓPTIMO' : (eficienciaOperativaGlobal >= 70 ? 'RESTRINGIDO' : 'CRÍTICO');

    doc.text(`Eficacia Global: ${global}% - ${estadoGlobal}`, 20, yPos);
    yPos += 5;
    doc.text(`Eficiencia Global: ${eficienciaOperativaGlobal}% - ${estadoEficiencia}`, 20, yPos);
    yPos += 5;
    doc.text(`Tiempo Total Operación: ${shipTimes.reduce((a, b) => a + b, 0).toFixed(1)} horas`, 20, yPos);
    yPos += 5;
    doc.text(`Costo Total Operación: $${costoTotalOperacion.toLocaleString('es-ES')}`, 20, yPos);
    yPos += 10;

    // Tabla con todos los buques
    doc.setFont('Arial', 'bold');
    doc.setFontSize(10);
    doc.text('DETALLE POR BUQUE', 20, yPos);
    yPos += 5;

    const tableData = shipResults.map((r, i) => {
        const estado = r.score >= 80 ? 'ÓPTIMO' : (r.score >= 70 ? 'RESTRINGIDO' : 'CRÍTICO');
        const estadoEfic = shipEfficiency[i] >= 80 ? 'ÓPTIMO' : (shipEfficiency[i] >= 70 ? 'RESTRINGIDO' : 'CRÍTICO');
        return [
            r.ship,
            r.score + '%',
            estado,
            shipEfficiency[i] + '%',
            estadoEfic,
            shipTimes[i].toFixed(1),
            '$' + shipCosts[i].toLocaleString('es-ES')
        ];
    });

    doc.autoTable({
        head: [['Buque', 'Eficacia', 'Estado', 'Eficiencia', 'Estado', 'Tiempo (h)', 'Costo ($)']],
        body: tableData,
        startY: yPos,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [0, 31, 63], textColor: [255, 255, 255], fontStyle: 'bold' },
        bodyStyles: { textColor: [0, 0, 0] },
        margin: { left: 20, right: 20 }
    });

    // Firmantes al pie
    yPos = pageHeight - 50;
    doc.setFont('Arial', 'normal');
    doc.setFontSize(12);

    doc.text('_______________________________', 20, yPos);
    doc.text('Evaluador Operacional de CODESC', 22, yPos + 5);

    doc.text('_____________________________', 130, yPos);
    doc.text('Jefe de Operaciones de CODESC', 132, yPos + 5);

    yPos += 28;
    doc.text('______________________________', 20, yPos);
    doc.text('Jefe de Estado Mayor de CODESC', 22, yPos + 5);

    doc.text('______________________________', 130, yPos);
    doc.text('Comandante en Jefe de la Escuadra', 132, yPos + 5);

    doc.save(`Reporte_Global_${opSel}.pdf`);
}

// ================= RESUMEN INTEGRAL (NUEVO) =================
let currentResumenForce = 'superficie';
let chartResumenForceEficaciaRef = null;
let chartResumenForceEficienciaRef = null;

function setResumenForce(force) {
    currentResumenForce = force;

    // Update buttons UI
    ['superficie', 'submarinos', 'aviacion', 'infanteria', 'guardacostas'].forEach(f => {
        const btn = document.getElementById('btn-force-' + f);
        if (btn) {
            // Reset styles
            btn.className = 'btn';
            if (f === force) {
                btn.classList.add('btn-main'); // Use existing main button class
                btn.style.background = '';
                btn.style.color = '';
            } else {
                btn.style.background = '#e2e8f0';
                btn.style.color = '#4a5568';
            }
        }
    });

    renderOperationalSummary();
}

function renderOperationalSummary() {
    const level = document.getElementById('resumenLevelSelector').value; // 'units' or 'global'
    const integralOp = document.getElementById('integralOpSelector') ? document.getElementById('integralOpSelector').value : "";
    const opSel = integralOp || localStorage.getItem('v16_opName') || '';

    // Data Gathering
    // We only have real data for 'superficie'. For others, mock or empty.
    let units = []; // [{ name, eficacia: 0-100, eficiencia: 0-100 }]

    if (currentResumenForce === 'superficie') {
        const opLogs = logs.filter(l => l.opName === opSel);
        const costos = JSON.parse(localStorage.getItem('v16_costos')) || [];

        const allShipTimes = adminShips.map(b => {
            const logs = opLogs.filter(l => l.ship === b);
            return logs.reduce((sum, l) => sum + (l.time || 0), 0);
        });
        const allShipCosts = adminShips.map(b => {
            const cst = costos.filter(c => c.operacion === opSel && c.buque === b);
            return cst.reduce((sum, c) => sum + c.monto, 0);
        });

        const validTimes = allShipTimes.filter(t => t > 0);
        const validCosts = allShipCosts.filter(c => c > 0);
        const minTime = validTimes.length > 0 ? Math.min(...validTimes) : 0;
        const minCost = validCosts.length > 0 ? Math.min(...validCosts) : 0;

        units = adminShips.map((buque, i) => {
            const evaluacionesBuque = opLogs.filter(l => l.ship === buque);
            let eficacia = 0;
            let maximo = 0;
            evaluacionesBuque.forEach(e => {
                const peso = (e.wEx / 100) * (e.wUntl / 100);
                eficacia += (e.score / 10) * peso;
                maximo += peso;
            });
            eficacia = maximo > 0 ? (eficacia / maximo) * 100 : 0;
            eficacia = Math.min(100, Math.max(0, eficacia));

            const tVal = allShipTimes[i];
            const cVal = allShipCosts[i];

            // Componente Tiempo (25%)
            let tScore = 0;
            if (tVal > 0) tScore = (minTime / tVal) * 100;
            else if (eficacia > 0) tScore = 100;

            // Componente Costo (25%)
            let cScore = 0;
            if (cVal > 0) cScore = (minCost / cVal) * 100;
            else if (eficacia > 0) cScore = 100;

            const eficiencia = (eficacia * 0.5) + (tScore * 0.25) + (cScore * 0.25);
            return {
                name: buque,
                eficacia: parseFloat(eficacia.toFixed(1)),
                eficiencia: parseFloat(eficiencia.toFixed(2)),
                participo: (evaluacionesBuque.length > 0 || cVal > 0)
            };
        });
        // Filtrar participantes para el promedio de fuerza
        units = units.filter(u => u.participo);
    } else {
        // Other forces: EMPTY for now
        units = [];
    }

    // Force Metrics
    const avgEficacia = units.length > 0
        ? (units.reduce((s, u) => s + u.eficacia, 0) / units.length).toFixed(1)
        : "0.0";
    const avgEficiencia = units.length > 0
        ? (units.reduce((s, u) => s + u.eficiencia, 0) / units.length).toFixed(1)
        : "0.0";

    const countEl = document.getElementById('resumenForceCount');
    if (countEl) countEl.innerText = units.length;

    const effEl = document.getElementById('resumenForceEficacia');
    if (effEl) effEl.innerText = avgEficacia + "%";

    const eficEl = document.getElementById('resumenForceEficiencia');
    if (eficEl) eficEl.innerText = avgEficiencia + "%";

    // View Logic
    const contentDiv = document.getElementById('resumenDashboardContent');
    const tableDiv = document.getElementById('tblResumenForce').parentElement;
    const chartsDiv = document.getElementById('chartResumenForceEficacia').parentElement.parentElement;
    let msgDiv = document.getElementById('resumenGlobalMsg');

    if (level === 'global') {
        // Hide details
        tableDiv.style.display = 'none';
        chartsDiv.style.display = 'none';
        // Show message
        if (!msgDiv) {
            msgDiv = document.createElement('div');
            msgDiv.id = 'resumenGlobalMsg';
            msgDiv.className = 'card';
            msgDiv.style.textAlign = 'center';
            msgDiv.innerHTML = '<h3>Vista Global Consolidada</h3><p>Visualizando métricas globales de la fuerza seleccionada.</p>';
            contentDiv.appendChild(msgDiv);
        } else {
            msgDiv.style.display = 'block';
        }
    } else {
        // Units view
        tableDiv.style.display = 'block';
        chartsDiv.style.display = 'grid';
        if (msgDiv) msgDiv.style.display = 'none';

        // Render Table
        const tbody = document.querySelector('#tblResumenForce tbody');
        if (tbody) {
            if (units.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay unidades registradas para esta fuerza.</td></tr>';
            } else {
                tbody.innerHTML = units.map(u => {
                    const est = u.eficacia >= 80 ? 'ÓPTIMO' : (u.eficacia >= 70 ? 'RESTRINGIDO' : 'CRÍTICO');
                    const color = u.eficacia >= 80 ? 'green' : (u.eficacia >= 70 ? 'orange' : 'red');
                    return `
                    <tr>
                        <td><b>${u.name}</b></td>
                        <td>${u.eficacia}%</td>
                        <td>${u.eficiencia}%</td>
                        <td style="color:${color}; font-weight:bold;">${est}</td>
                    </tr>`;
                }).join('');
            }
        }

        // Render Charts
        renderResumenChart('chartResumenForceEficacia', units.map(u => u.name), units.map(u => u.eficacia), 'Eficacia (%)', 'chartResumenForceEficaciaRef');
        renderResumenChart('chartResumenForceEficiencia', units.map(u => u.name), units.map(u => u.eficiencia), 'Eficiencia (%)', 'chartResumenForceEficienciaRef');
    }
}

function renderResumenChart(canvasId, labels, data, label, refName) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Destroy previous instance
    if (window[refName]) window[refName].destroy();

    window[refName] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: data.map(v => v >= 80 ? '#2f855a' : (v >= 70 ? '#ecc94b' : '#c53030'))
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, max: 100 } }
        }
    });
}

// ================= REPORTES HISTÓRICOS =================
let currentHistoryForce = 'superficie';

function setHistoryForce(force) {
    currentHistoryForce = force;

    // Update buttons UI (similar to operational summary)
    ['superficie', 'submarinos', 'aviacion', 'infanteria', 'guardacostas'].forEach(f => {
        const btn = document.getElementById('btn-hist-' + f);
        if (btn) {
            btn.className = 'btn';
            if (f === force) {
                btn.classList.add('btn-main'); // Use existing main button class
                btn.style.background = '';
                btn.style.color = '';
            } else {
                btn.style.background = '#e2e8f0';
                btn.style.color = '#4a5568';
            }
        }
    });

    // Re-render report if selection exists
    const selector = document.getElementById('historyOpSelector');
    if (selector && selector.value) {
        renderHistoricalReport();
    }
}

function renderHistoricalSelectors() {
    const selector = document.getElementById('historyOpSelector');
    if (!selector) return;

    // Obtener operaciones únicas de logs
    const ops = [...new Set(logs.map(l => l.opName))].filter(Boolean);

    // Si la operación actual está "Abierta", tal vez excluirla? 
    // El requerimiento dice "UNA VEZ QUE SE HAYAN CERRADO". 
    // Pero para pruebas mostraremos todas las que existan en logs.

    let options = '<option value="">-- Seleccione --</option>';
    options += '<option value="CONSOLIDADO">== CONSOLIDADO GLOBAL ==</option>';

    ops.forEach(op => {
        options += `<option value="${op}">${op}</option>`;
    });

    selector.innerHTML = options;

    // Initialize default force button state
    setHistoryForce('superficie');
}

function renderHistoricalReport() {
    const opSel = document.getElementById('historyOpSelector').value;
    const container = document.getElementById('historyReportContainer');

    if (!opSel) {
        container.innerHTML = '<div style="text-align:center; color: #718096; margin-top: 50px;">Seleccione una opción para ver los datos.</div>';
        return;
    }

    // FILTER LOGIC: Currently we only have real data for 'superficie' in logs (via ship names in adminShips).
    // For other forces, since we don't have separate DBs yet, we returns empty or mock.
    // However, if the user registers 'Submarine X', it appears in logs. 
    // Ideally, we filter logs by checking if the ship belongs to the selected force.
    // SINCE WE DON'T HAVE A FORCE MAP, WE WILL ASSUME ALL CURRENT LOGS MATCH 'superficie' FOR NOW, 
    // AND SHOW EMPTY FOR OTHERS TO AVOID CONFUSION, OR SHOW ALL IF THEY MATCH.

    // BETTER APPROACH: Allow showing data if force is 'superficie', else show "No data" until those modules are active.
    if (currentHistoryForce !== 'superficie') {
        container.innerHTML = `<div style="text-align:center; color: #718096; margin-top: 50px;">
            No hay registros históricos para la fuerza <b>${currentHistoryForce.toUpperCase()}</b> todavía.
         </div>`;
        return;
    }

    if (opSel === 'CONSOLIDADO') {
        const ops = [...new Set(logs.map(l => l.opName))].filter(Boolean);
        if (ops.length === 0) {
            container.innerHTML = 'No hay operaciones registradas.';
            return;
        }

        let totalTime = 0;
        let totalCost = 0;
        let filas = '';

        ops.forEach(op => {
            const opStats = calculateOpStats(op);
            totalTime += opStats.totalTime;
            totalCost += opStats.totalCost;

            filas += `
                 <tr>
                     <td>${op}</td>
                     <td>${opStats.lastDate || '-'}</td>
                     <td>${opStats.eficacia}%</td>
                     <td>${opStats.eficiencia}%</td>
                     <td>$${opStats.totalCost.toLocaleString('es-ES')}</td>
                 </tr>
             `;
        });

        container.innerHTML = `
            <h4 style="color:var(--navy); border-bottom:1px solid #ccc; padding-bottom:5px;">CONSOLIDADO DE OPERACIONES</h4>
            <div style="display:flex; justify-content:space-around; margin:15px 0;">
                <div class="card" style="text-align:center; background:white;">
                    <small>Operaciones</small>
                    <div style="font-size:1.5rem; font-weight:bold;">${ops.length}</div>
                </div>
                <div class="card" style="text-align:center; background:white;">
                     <small>Costo Histórico</small>
                    <div style="font-size:1.5rem; font-weight:bold; color:var(--danger);">$${totalCost.toLocaleString('es-ES')}</div>
                </div>
            </div>
            <table class="w-full">
                <thead style="background:var(--navy); color:white;">
                    <tr>
                        <th>Operación</th>
                        <th>Última Fecha</th>
                        <th>Eficacia Media</th>
                        <th>Eficiencia Media</th>
                        <th>Costo Total</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        `;

    } else {
        // REPORTE INDIVIDUAL DE OPERACIÓN CERRADA
        const stats = calculateOpStats(opSel);

        container.innerHTML = `
            <h4 style="color:var(--navy); border-bottom:1px solid #ccc; padding-bottom:5px;">REPORTE DE OPERACIÓN: ${opSel}</h4>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-bottom:20px;">
                <div style="background:white; padding:10px; border-radius:5px; text-align:center;">
                    <div style="color:gray;">Eficacia Global</div>
                    <div style="font-size:1.8rem; font-weight:bold; color:var(--navy);">${stats.eficacia}%</div>
                </div>
                <div style="background:white; padding:10px; border-radius:5px; text-align:center;">
                    <div style="color:gray;">Eficiencia Global</div>
                    <div style="font-size:1.8rem; font-weight:bold; color:var(--navy);">${stats.eficiencia}%</div>
                </div>
                <div style="background:white; padding:10px; border-radius:5px; text-align:center;">
                    <div style="color:gray;">Costo Total</div>
                    <div style="font-size:1.8rem; font-weight:bold; color:var(--danger);">$${stats.totalCost.toLocaleString('es-ES')}</div>
                </div>
            </div>

            <h5>Detalle de Unidades Participantes</h5>
            <table>
                <thead>
                    <th>Buque</th>
                    <th>Eficacia</th>
                    <th>Eficiencia</th>
                    <th>Costo</th>
                </thead>
                <tbody>
                    ${stats.details.map(d => `
                        <tr>
                            <td>${d.name}</td>
                            <td>${d.eficacia}%</td>
                            <td>${d.eficiencia}%</td>
                            <td>$${d.costo.toLocaleString('es-ES')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
}

// Helpers para cálculo on-the-fly de cualquier operación (sin depender del estado activo actual)
function calculateOpStats(opName) {
    const opLogs = logs.filter(l => l.opName === opName);
    const opCosts = JSON.parse(localStorage.getItem('v16_costos')) || [];

    // Identificar buques en esta operación
    // TODO: Filter based on Force map if available
    const shipsInOp = [...new Set(opLogs.map(l => l.ship))];
    if (shipsInOp.length === 0) return { eficacia: 0, eficiencia: 0, totalCost: 0, totalTime: 0, details: [] };

    // Calcular costos totales de la operación
    const totalCost = opCosts.filter(c => c.operacion === opName).reduce((sum, c) => sum + c.monto, 0);

    // Calcular datos por buque para medias
    const shipDetails = shipsInOp.map(ship => {
        const sLogs = opLogs.filter(l => l.ship === ship);
        const sCosts = opCosts.filter(c => c.operacion === opName && c.buque === ship);

        const shipCost = sCosts.reduce((s, c) => s + c.monto, 0);
        const shipTime = sLogs.reduce((s, l) => s + (l.time || 0), 0);

        // Eficacia
        let obtenido = 0;
        let maximo = 0;
        sLogs.forEach(c => {
            const peso = (c.wEx / 100) * (c.wUntl / 100);
            obtenido += (c.score / 10) * peso;
            maximo += peso;
        });
        const eficacia = maximo > 0 ? (obtenido / maximo) * 100 : 0;

        return {
            name: ship,
            eficacia: eficacia,
            time: shipTime,
            costo: shipCost,
            // Guardamos raw para calcular eficiencia relativa luego si se quiere, 
            // O simplificamos:
        };
    });

    // Para eficiencia necesitamos minTime y minCost de este grupo
    const validTimes = shipDetails.map(s => s.time).filter(t => t > 0);
    const validCosts = shipDetails.map(s => s.costo).filter(c => c > 0);
    const minTime = validTimes.length > 0 ? Math.min(...validTimes) : 0;
    const minCost = validCosts.length > 0 ? Math.min(...validCosts) : 0;

    shipDetails.forEach(s => {
        // Componente Eficacia (50%)
        const ef = s.eficacia * 0.5;

        // Componente Tiempo (25%)
        let tScore = 0;
        if (s.time > 0) tScore = (minTime / s.time) * 100;
        else if (s.eficacia > 0) tScore = 100;

        // Componente Costo (25%)
        let cScore = 0;
        if (s.costo > 0) cScore = (minCost / s.costo) * 100;
        else if (s.eficacia > 0) cScore = 100;

        s.eficiencia = ef + (tScore * 0.25) + (cScore * 0.25);

        s.eficacia = parseFloat(s.eficacia.toFixed(1));
        s.eficiencia = parseFloat(s.eficiencia.toFixed(2));
    });

    const participants = shipDetails.filter(s => s.eficacia > 0 || s.costo > 0 || s.time > 0);

    const avgEficacia = participants.length > 0 ? participants.reduce((a, b) => a + b.eficacia, 0) / participants.length : 0;
    const avgEficiencia = participants.length > 0 ? participants.reduce((a, b) => a + b.eficiencia, 0) / participants.length : 0;

    // Obtener última fecha
    const dates = opLogs.map(l => l.date).sort();
    const lastDate = dates.length > 0 ? dates[dates.length - 1] : '';

    return {
        eficacia: parseFloat(avgEficacia.toFixed(1)),
        eficiencia: parseFloat(avgEficiencia.toFixed(2)),
        totalCost: totalCost,
        totalTime: shipDetails.reduce((a, b) => a + b.time, 0),
        lastDate: lastDate,
        details: shipDetails
    };
}

function printHistoricalReport() {
    const opSel = document.getElementById('historyOpSelector').value;
    if (!opSel) return alert("Seleccione un reporte para imprimir");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 20;

    if (currentHistoryForce === 'superficie') {
        doc.setFont('Arial', 'bold');
        doc.setFontSize(14);
        doc.text('ARMADA DEL ECUADOR', pageWidth / 2, yPos, { align: 'center' });
        yPos += 6;
        doc.setFontSize(12);
        doc.text('REPORTE DE EVALUACIÓN OPERACIONAL - CODESC', pageWidth / 2, yPos, { align: 'center' });
        yPos += 10;
    } else {
        doc.setFontSize(16);
        doc.text("REPORTE HISTÓRICO - CODESC", 20, yPos);
        yPos += 8;
        doc.setFontSize(10);
        doc.text(`FUERZA: ${currentHistoryForce.toUpperCase()}`, 20, yPos);
        yPos += 8;
    }

    if (opSel === 'CONSOLIDADO') {
        doc.setFontSize(12);
        doc.text("CONSOLIDADO GLOBAL DE OPERACIONES", 20, yPos);
        yPos += 10;

        const ops = [...new Set(logs.map(l => l.opName))].filter(Boolean);
        const data = ops.map(op => {
            const st = calculateOpStats(op);
            return [op, st.lastDate, st.eficacia + '%', st.eficiencia + '%', '$' + st.totalCost.toLocaleString()];
        });

        doc.autoTable({
            startY: yPos,
            head: [['Operación', 'Fecha', 'Eficacia', 'Eficiencia', 'Costo T.']],
            body: data
        });

    } else {
        const st = calculateOpStats(opSel);
        doc.setFontSize(12);
        doc.text(`OPERACIÓN: ${opSel}`, 20, yPos);
        yPos += 10;
        doc.text(`Eficacia Global: ${st.eficacia}%`, 20, yPos);
        yPos += 8;
        doc.text(`Eficiencia Global: ${st.eficiencia}%`, 20, yPos);
        yPos += 8;
        doc.text(`Costo Total: $${st.totalCost.toLocaleString()}`, 20, yPos);
        yPos += 10;

        const data = st.details.map(d => [d.name, d.eficacia + '%', d.eficiencia + '%', '$' + d.costo.toLocaleString(), d.time + 'h']);

        doc.autoTable({
            startY: yPos,
            head: [['Buque', 'Eficacia', 'Eficiencia', 'Costo', 'Tiempo']],
            body: data
        });
    }

    // Pie de firmas para Superficie (Sincronizado con reportes operacionales)
    if (currentHistoryForce === 'superficie') {
        const pageHeight = doc.internal.pageSize.height;
        let yPos = pageHeight - 50;
        doc.setFont('Arial', 'normal');
        doc.setFontSize(12);

        doc.text('_______________________________', 20, yPos);
        doc.text('Evaluador Operacional de CODESC', 22, yPos + 5);

        doc.text('_____________________________', 130, yPos);
        doc.text('Jefe de Operaciones de CODESC', 132, yPos + 5);

        yPos += 28;
        doc.text('______________________________', 20, yPos);
        doc.text('Jefe de Estado Mayor de CODESC', 22, yPos + 5);

        doc.text('______________________________', 130, yPos);
        doc.text('Comandante en Jefe de la Escuadra', 132, yPos + 5);
    }

    doc.save(`Reporte_Historico_${currentHistoryForce}_${opSel}.pdf`);
}
