// =========================================================================
// MOTOR JAVASCRIPT: NIVEL 9 ERP - ARCHITECTURE BY STARK (MARK 85)
// =========================================================================

// ⚠️ ACÁ VA TU URL DE GOOGLE APPS SCRIPT (EL WEBHOOK):
const webAppUrl = 'https://script.google.com/macros/s/AKfycbzJgp7Q0-LnufrbdYtB1nww9VPWIT-GDOHTGAmhk4qrp44CjhXTErniQQUGgrJofRJt/exec';

// --- BASES DE DATOS EN MEMORIA ---
let eventosGuardados = []; 
let cargasGuardadas = []; 
let transportistasGuardados = []; 
let intermediacionesGuardadas = [];
let contactosGuardados = [];
let fechaCalendarioActual = new Date();

// --- VARIABLES 3PL Y MAPAS ---
let cargaAbiertaActual = null;
let telChoferAsignado = null;
let mapaCotizador = null; 
let controlRutaMapa = null;

const ACUERDO_FIJO_CHOFER = "1. Liberación Estricta: El pago se liberará exclusivamente tras la recepción vía WhatsApp de la fotografía nítida del Remito Conformado (Firma, Aclaración, DNI y Sello). Sin este documento, no se procesará la liquidación.\n2. Deslinde de Responsabilidad: Nivel 9 interviene exclusivamente como coordinador. El Transportista asume la responsabilidad total por daños, faltantes o siniestros durante el tránsito.";
const ACUERDO_FIJO_DADOR = "1. Deslinde Tránsito.\n2. Control Estadías.\n3. Falsas Escuadras.";

// ==========================================
// 1. INICIALIZACIÓN Y MENÚ MÓVIL
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('marina-fecha-hoy').textContent = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  sincronizarConServidor();
});

function toggleMenu() {
  document.getElementById('sidebarMenu').classList.toggle('active');
}

async function sincronizarConServidor() {
  try {
    const res = await fetch(webAppUrl + '?action=getAppData');
    const data = await res.json();
    
    // Normalizar eventos de Agenda (convierte mayúsculas a minúsculas y estandariza fechas)
    if(data.eventos && Array.isArray(data.eventos)) {
      eventosGuardados = data.eventos.map(item => {
        let obj = {};
        // Pasa todas las claves a minúsculas (ej: "Fecha" -> "fecha")
        Object.keys(item).forEach(k => { obj[k.toLowerCase()] = item[k]; });
        
        // Estandariza la fecha a YYYY-MM-DD
        if(obj.fecha) {
          let strF = String(obj.fecha).trim();
          if(strF.includes('T')) strF = strF.split('T')[0];
          if(strF.includes('/')) {
            const p = strF.split('/');
            if(p.length === 3) {
              // Si está en formato DD/MM/YYYY
              if(p[0].length === 2 && p[2].length === 4) {
                strF = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
              }
            }
          }
          obj.fecha = strF;
        }
        return obj;
      });
    }

    if(data.cargas) cargasGuardadas = data.cargas;
    if(data.transportistas) transportistasGuardados = data.transportistas;
    if(data.intermediaciones) intermediacionesGuardadas = data.intermediaciones;
    if(data.contactos) contactosGuardados = data.contactos;
    
    document.getElementById('sync-status-portal').innerHTML = '<i class="fas fa-check-circle"></i> Base Conectada (' + eventosGuardados.length + ' viajes)';
    document.getElementById('sync-status-portal').style.color = 'var(--finalizada)';
    
    dibujarCalendarioMes();
  } catch(error) {
    document.getElementById('sync-status-portal').innerHTML = '<i class="fas fa-wifi"></i> Modo Offline - Error de Conexión';
    document.getElementById('sync-status-portal').style.color = 'var(--cancelada)';
  }
}
function showView(viewId) {
  document.getElementById('viewPortal').style.display = 'none'; 
  document.getElementById('appHeader').style.display = 'flex';
  
  const views = ['Agenda', 'Cotizador', 'Informes', 'Contactos', 'BolsaCargas', 'Transportistas', 'Intermediaciones'];
  views.forEach(v => { const el = document.getElementById('view' + v); if(el) el.style.display = 'none'; });
  
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if(event && event.currentTarget) event.currentTarget.classList.add('active');

  if (viewId === 'Portal') { 
    document.getElementById('viewPortal').style.display = 'block'; 
    document.getElementById('appHeader').style.display = 'none'; 
  } else { 
    const target = document.getElementById('view' + viewId);
    if(target) target.style.display = 'block'; 
    document.getElementById('viewTitleText').innerText = viewId;
  }
  
  // Cierra menú móvil al hacer clic
  if(window.innerWidth <= 768) { document.getElementById('sidebarMenu').classList.remove('active'); }

  if(viewId === 'BolsaCargas') renderBolsaCargas();
  if(viewId === 'Transportistas') renderTransportistas();
  if(viewId === 'Agenda') dibujarCalendarioMes();
  if(viewId === 'Intermediaciones') renderIntermediaciones();
  if(viewId === 'Contactos') renderContactos();
  if(viewId === 'Cotizador') { 
    setTimeout(() => { 
      if(!mapaCotizador) { 
        mapaCotizador = L.map('map').setView([-31.4135, -64.1810], 11); 
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaCotizador); 
      } 
      mapaCotizador.invalidateSize(); 
    }, 400); 
  }
}

function abrirModalNativo(id) { cerrarModalesNativos(); const m = document.getElementById(id); if(m) m.style.display = 'flex'; }
function cerrarModalesNativos() { document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); }

// ==========================================
// 2. AGENDA DE FLOTA (RESTAURACIÓN TOTAL)
// ==========================================
function dibujarCalendarioMes() {
  const anio = fechaCalendarioActual.getFullYear(); 
  const mes = fechaCalendarioActual.getMonth();
  document.getElementById('currentMonthYear').textContent = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(fechaCalendarioActual);
  const grid = document.getElementById('calendarGrid'); grid.innerHTML = '';
  
  const primerDia = new Date(anio, mes, 1).getDay(); 
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  for(let i = 0; i < primerDia; i++) grid.innerHTML += `<div class="day-cell" style="background:transparent; border:none;"></div>`; 
  
  const strHoy = new Date().toISOString().split('T')[0];
  for(let dia = 1; dia <= diasMes; dia++) {
    const strF = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    const esHoy = (strF === strHoy) ? 'today' : '';
    const viajes = eventosGuardados.filter(e => e.fecha === strF);
    
    const htmlV = viajes.map(v => `<div class="event-chip status-${v.estado}" onclick="editarEventoViaje('${v.id}'); event.stopPropagation();"><span>${v.cliente}</span></div>`).join('');
    grid.innerHTML += `<div class="day-cell ${esHoy}" onclick="prepararNuevoViaje('${strF}')"><div class="day-number">${dia}</div>${htmlV}</div>`;
  }
}

function navigateMonth(dir) { fechaCalendarioActual.setMonth(fechaCalendarioActual.getMonth() + dir); dibujarCalendarioMes(); }
function goToday() { fechaCalendarioActual = new Date(); dibujarCalendarioMes(); }

function prepararNuevoViaje(fecha) {
  document.getElementById('ev-id').value = '';
  document.getElementById('ev-fecha').value = fecha;
  document.getElementById('ev-estado').value = 'Posible';
  ['ev-cliente','ev-telefono','ev-origen','ev-destino','ev-inventario'].forEach(id => document.getElementById(id).value = '');
  ['ev-presupuesto','ev-combustible','ev-extra','ev-ayudante'].forEach(id => document.getElementById(id).value = 0);
  calculateAgendaTotal();
  document.getElementById('btn-eliminar-evento').style.display = 'none';
  abrirModalNativo('modalEventForm');
}

function editarEventoViaje(id) {
  const v = eventosGuardados.find(e => String(e.id) === String(id));
  if(!v) return;
  document.getElementById('ev-id').value = v.id;
  document.getElementById('ev-fecha').value = v.fecha;
  document.getElementById('ev-estado').value = v.estado;
  document.getElementById('ev-cliente').value = v.cliente;
  document.getElementById('ev-telefono').value = v.telefono || '';
  document.getElementById('ev-origen').value = v.origen || '';
  document.getElementById('ev-destino').value = v.destino || '';
  document.getElementById('ev-inventario').value = v.inventario || '';
  document.getElementById('ev-presupuesto').value = v.presupuesto || 0;
  document.getElementById('ev-combustible').value = v.combustible || 0;
  document.getElementById('ev-extra').value = v.extra || 0;
  document.getElementById('ev-ayudante').value = v.ayudante || 0;
  calculateAgendaTotal();
  document.getElementById('btn-eliminar-evento').style.display = 'block';
  abrirModalNativo('modalEventForm');
}

function calculateAgendaTotal() { 
  const v = (id) => parseFloat(document.getElementById(id).value) || 0; 
  document.getElementById('ev-total').value = v('ev-presupuesto') - (v('ev-combustible') + v('ev-extra') + v('ev-ayudante')); 
}

function saveEvent() {
  const payload = { 
    id: document.getElementById('ev-id').value || 'MOV-' + Date.now(), 
    fecha: document.getElementById('ev-fecha').value, 
    estado: document.getElementById('ev-estado').value, 
    cliente: document.getElementById('ev-cliente').value, 
    telefono: document.getElementById('ev-telefono').value,
    origen: document.getElementById('ev-origen').value,
    destino: document.getElementById('ev-destino').value,
    inventario: document.getElementById('ev-inventario').value, 
    presupuesto: parseFloat(document.getElementById('ev-presupuesto').value)||0, 
    combustible: parseFloat(document.getElementById('ev-combustible').value)||0, 
    extra: parseFloat(document.getElementById('ev-extra').value)||0,
    ayudante: parseFloat(document.getElementById('ev-ayudante').value)||0 
  };
  const idx = eventosGuardados.findIndex(e => String(e.id) === String(payload.id)); 
  if(idx >= 0) eventosGuardados[idx] = payload; else eventosGuardados.push(payload);
  dibujarCalendarioMes(); cerrarModalesNativos();
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify(payload) });
}

function eliminarEventoViaje() {
  const id = document.getElementById('ev-id').value;
  if(!confirm("¿Eliminar viaje definitivamente?")) return;
  eventosGuardados = eventosGuardados.filter(e => String(e.id) !== String(id));
  dibujarCalendarioMes(); cerrarModalesNativos();
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'deleteEvent', id: id }) });
}

// ==========================================
// 3. RESTAURACIÓN CONTACTOS Y FINANZAS
// ==========================================
function renderContactos() {
  const q = document.getElementById('cnt-filter-search').value.toLowerCase();
  const arr = contactosGuardados.filter(c => ((c.nombre && c.nombre.toLowerCase().includes(q)) || (c.empresa && c.empresa.toLowerCase().includes(q))));
  
  document.getElementById('contactListContainer').innerHTML = arr.length === 0 ? '<p>No hay contactos agendados.</p>' : arr.map(c => `
    <div class="broker-card">
      <div class="broker-card-header"><strong>${c.nombre}</strong><span class="status-badge" style="background:var(--brand-light); color:var(--brand);">${c.tipo}</span></div>
      <div style="font-size:0.9rem; margin-bottom:8px;"><i class="fas fa-building"></i> <b>Empresa:</b> ${c.empresa || 'Particular'}</div>
      <div style="font-size:0.9rem; margin-bottom:10px;"><i class="fab fa-whatsapp" style="color:#16a34a;"></i> <b>Tel:</b> ${c.telefono}</div>
      <button class="btn btn-outline" style="width:100%; font-size:0.8rem;" onclick="window.open('https://wa.me/549${(c.telefono||'').replace(/\D/g,'')}')">Enviar WhatsApp</button>
    </div>`).join('');
}

function saveContact() {
  const payload = {
    action: 'saveContact',
    id: document.getElementById('cnt-id').value || 'CNT-' + Date.now(),
    nombre: document.getElementById('cnt-nombre').value,
    telefono: document.getElementById('cnt-telefono').value,
    empresa: document.getElementById('cnt-empresa').value,
    tipo: document.getElementById('cnt-tipo').value,
    notas: document.getElementById('cnt-notas').value
  };
  const idx = contactosGuardados.findIndex(c => String(c.id) === String(payload.id));
  if(idx >= 0) contactosGuardados[idx] = payload; else contactosGuardados.push(payload);
  renderContactos(); cerrarModalesNativos();
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify(payload) });
}

function generarReporteDatos() {
  document.getElementById('kpiDashboardContainer').style.display = 'grid';
  // Calcula en base a Agenda de Flota
  const realizados = eventosGuardados.filter(e => e.estado === 'Realizado');
  const ingresos = realizados.reduce((acc, curr) => acc + (parseFloat(curr.presupuesto)||0), 0);
  const costos = realizados.reduce((acc, curr) => acc + (parseFloat(curr.combustible)||0) + (parseFloat(curr.extra)||0) + (parseFloat(curr.ayudante)||0), 0);
  
  document.getElementById('kpi-tot-viajes').innerText = realizados.length;
  document.getElementById('kpi-tot-ingresos').innerText = '$' + ingresos.toLocaleString('es-AR');
  document.getElementById('kpi-tot-costos').innerText = '$' + costos.toLocaleString('es-AR');
  document.getElementById('kpi-tot-utilidad').innerText = '$' + (ingresos - costos).toLocaleString('es-AR');
}

// ==========================================
// 4. COTIZADOR OSRM (ARREGLO TEXTO SOBRE MAPA)
// ==========================================
function addDestinoCotizador() { 
  const c = document.getElementById('destinosContainer'); 
  const i = document.createElement('input'); 
  i.type = 'text'; i.className = 'cot-destino-input'; i.placeholder = 'Otra parada...'; i.style.marginTop = '10px'; 
  c.appendChild(i); 
}

async function calcularRutaOSRM() {
  const orig = document.getElementById('cot-origen').value; 
  const dest = Array.from(document.querySelectorAll('.cot-destino-input')).map(i => i.value).filter(v => v);
  if(!orig || dest.length === 0) return alert("Falta origen o destino.");
  
  const puntos = [orig, ...dest].map(p => p + ', Argentina');
  try { 
    let coords = []; 
    for(let l of puntos) { 
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(l)}`).then(x => x.json()); 
      if(r.length > 0) coords.push(L.latLng(r[0].lat, r[0].lon)); 
    }
    if(controlRutaMapa) mapaCotizador.removeControl(controlRutaMapa);
    // Instrucción para no mostrar las instrucciones de texto de OSRM (además del CSS)
    controlRutaMapa = L.Routing.control({ waypoints: coords, show: false, addWaypoints: false, routeWhileDragging: false }).addTo(mapaCotizador);
    controlRutaMapa.on('routesfound', (e) => { 
      document.getElementById('cot-kms').value = Math.round(e.routes[0].summary.totalDistance / 1000); 
      mapaCotizador.fitBounds(L.latLngBounds(coords)); 
    });
  } catch(e) { alert("Error al conectar con satélite OSRM."); }
}

function calcularCostosCotizador() { 
  const v = (id) => parseFloat(document.getElementById(id).value) || 0; 
  const costos = v('cot-res-combustible') + v('cot-res-extra'); 
  document.getElementById('cot-res-costostotales').value = costos; 
  document.getElementById('cot-res-utilidad').value = v('cot-res-tarifa') - costos; 
}

// ==========================================
// 5. MÓDULO 3PL: BOLSA Y TRANSPORTISTAS
// ==========================================
function guardarCargaManual() {
  const payload = {
    action: 'saveCarga', id: 'CGA-' + Date.now(), fecha: new Date().toISOString().split('T')[0], estado: 'Disponible',
    dador: document.getElementById('mc-dador').value, origen: document.getElementById('mc-origen').value, destino: document.getElementById('mc-destino').value,
    vehiculo: document.getElementById('mc-vehiculo').value, descripcion: document.getElementById('mc-desc').value, tarifa: document.getElementById('mc-tarifa').value
  };
  cargasGuardadas.push(payload); renderBolsaCargas(); cerrarModalesNativos();
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify(payload) });
}

function guardarTransportistaManual() {
  const payload = {
    action: 'saveTransportista', id: 'TRP-' + Date.now(),
    chofer: document.getElementById('mt-chofer').value, telefono: document.getElementById('mt-telefono').value,
    vehiculo: document.getElementById('mt-vehiculo').value, patente: document.getElementById('mt-patente').value, ubicacion: document.getElementById('mt-ubicacion').value
  };
  transportistasGuardados.push(payload); renderTransportistas(); cerrarModalesNativos();
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify(payload) });
}

function renderBolsaCargas() {
  const orig = document.getElementById('cga-filtro-origen').value.toLowerCase(); const dest = document.getElementById('cga-filtro-destino').value.toLowerCase(); const veh = document.getElementById('cga-filtro-vehiculo').value.toLowerCase();
  const arr = cargasGuardadas.filter(c => (!orig || (c.origen && c.origen.toLowerCase().includes(orig))) && (!dest || (c.destino && c.destino.toLowerCase().includes(dest))) && (veh === 'todos' || (c.vehiculo && c.vehiculo.toLowerCase().includes(veh))) );
  
  document.getElementById('bolsaCargasGrid').innerHTML = arr.length === 0 ? '<p style="grid-column:span 3; text-align:center;">No hay cargas en radar.</p>' : arr.map(c => `
    <div class="broker-card" style="${c.estado === 'ASIGNADA' ? 'border: 2px solid #16a34a; background:#f0fdf4;' : ''}">
      <div class="broker-card-header"><strong>${c.origen} ➔ ${c.destino}</strong><span class="status-badge" style="background:${c.estado === 'ASIGNADA' ? '#16a34a' : 'var(--brand-light)'}; color:${c.estado === 'ASIGNADA' ? 'white' : 'var(--brand)'};">${c.vehiculo}</span></div>
      <div style="font-size:0.95rem; margin-bottom:10px;"><b>Carga:</b> ${c.descripcion}</div>
      <div style="font-size:0.85rem; color:#71717a; margin-bottom:12px;"><b>Dador:</b> ${c.dador} | <b>Estado:</b> ${c.estado || 'Disponible'}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e4e4e7; padding-top:10px;">
        <strong style="color:var(--brand); font-size:1.1rem;">$${Number(c.tarifa).toLocaleString('es-AR')}</strong>
        <button class="btn btn-dark" style="padding:6px 12px; font-size:0.85rem;" onclick="abrirFichaOperacion('${c.id}')"><i class="fas fa-folder-open"></i> Ficha Operación</button>
      </div>
    </div>`).join('');
}

function renderTransportistas() {
  const q = document.getElementById('trp-filtro-search').value.toLowerCase(); const veh = document.getElementById('trp-filtro-vehiculo').value.toLowerCase();
  const arr = transportistasGuardados.filter(t => ((t.chofer && t.chofer.toLowerCase().includes(q)) || (t.patente && t.patente.toLowerCase().includes(q))) && (veh === 'todos' || (t.vehiculo && t.vehiculo.toLowerCase().includes(veh))) );
  
  document.getElementById('transportistasGrid').innerHTML = arr.length === 0 ? '<p style="grid-column:span 3; text-align:center;">No hay unidades en radar.</p>' : arr.map(t => `
    <div class="broker-card">
      <div class="broker-card-header"><strong>${t.chofer}</strong><span class="status-badge" style="background:#e0f2fe; color:#0284c7;">${t.vehiculo}</span></div>
      <div style="font-size:0.9rem; margin-bottom:8px;"><b>Patente:</b> ${t.patente} | <b>Tel:</b> ${t.telefono}</div>
      <div style="font-size:0.85rem; color:#71717a;"><i class="fas fa-map-marker-alt"></i> <b>Ubicación:</b> ${t.ubicacion || 'En Tránsito'}</div>
    </div>`).join('');
}

function renderIntermediaciones() {
  document.getElementById('intermediacionesTableBody').innerHTML = intermediacionesGuardadas.map(i => `<tr><td>${i.fecha}</td><td><strong>${i.dador}</strong></td><td><strong>${i.transportista}</strong></td><td>${i.tramo}</td><td style="color:#0284c7; font-weight:bold;">$${Number(i.cobrado).toLocaleString('es-AR')}</td><td style="color:#dc2626;">$${Number(i.pagado).toLocaleString('es-AR')}</td><td style="color:#16a34a; font-weight:bold;">$${Number(i.comision).toLocaleString('es-AR')}</td></tr>`).join('');
}

// ==========================================
// 6. DOSSIER 3PL, BÓVEDA Y WHATSAPP GPS
// ==========================================
function abrirFichaOperacion(cargaId) {
  cargaAbiertaActual = cargasGuardadas.find(c => String(c.id) === String(cargaId));
  if(!cargaAbiertaActual) return;
  
  document.getElementById('fo-id-carga').innerText = cargaAbiertaActual.id;
  document.getElementById('fo-dador').innerText = cargaAbiertaActual.dador;
  document.getElementById('fo-origen').innerText = cargaAbiertaActual.origen;
  document.getElementById('fo-destino').innerText = cargaAbiertaActual.destino;
  document.getElementById('fo-desc').innerText = cargaAbiertaActual.descripcion;
  document.getElementById('fo-cobro').value = cargaAbiertaActual.tarifa || 0;
  
  document.getElementById('fo-select-chofer').innerHTML = '<option value="">-- Buscar Camión en Red --</option>' + transportistasGuardados.map(t => `<option value="${t.id}">${t.chofer} - ${t.vehiculo}</option>`).join('');

  if(cargaAbiertaActual.estado === 'ASIGNADA') {
    document.getElementById('fo-seccion-asignar').style.display = 'none';
    document.getElementById('fo-seccion-chofer').style.display = 'block';
    const intm = intermediacionesGuardadas.find(i => String(i.id) === 'ITM-' + cargaAbiertaActual.id);
    
    if(intm) {
       document.getElementById('fo-chofer-nombre').innerText = intm.transportista;
       document.getElementById('fo-pago').value = intm.pagado;
       document.getElementById('fo-cond-chofer-libre').value = intm.condChoferLibre || '';
       document.getElementById('fo-cond-dador-libre').value = intm.condDadorLibre || '';
       const transp = transportistasGuardados.find(t => t.chofer === intm.transportista);
       if(transp) telChoferAsignado = transp.telefono;
       calcularComisionDossier();
    }
  } else {
    document.getElementById('fo-seccion-asignar').style.display = 'block'; 
    document.getElementById('fo-seccion-chofer').style.display = 'none'; 
    document.getElementById('fo-pago').value = 0; 
    document.getElementById('fo-cond-chofer-libre').value = ''; 
    document.getElementById('fo-cond-dador-libre').value = ''; 
    calcularComisionDossier();
  }
  document.getElementById('fo-boveda-links').innerHTML = ''; 
  abrirModalNativo('modalFichaOperacion');
}

function calcularComisionDossier() { const c = parseFloat(document.getElementById('fo-cobro').value)||0; const p = parseFloat(document.getElementById('fo-pago').value)||0; document.getElementById('fo-comision').innerText = '$' + (c - p).toLocaleString('es-AR'); }

function asignarTransportistaDossier() {
  const transpId = document.getElementById('fo-select-chofer').value;
  if(!transpId) return alert("Seleccioná un transportista de la red.");
  const transp = transportistasGuardados.find(t => String(t.id) === String(transpId));
  
  cargaAbiertaActual.estado = 'ASIGNADA';
  const cobro = parseFloat(document.getElementById('fo-cobro').value)||0;
  const pago = parseFloat(document.getElementById('fo-pago').value)||0;
  
  const idx = cargasGuardadas.findIndex(c => String(c.id) === String(cargaAbiertaActual.id));
  if(idx >= 0) cargasGuardadas[idx] = cargaAbiertaActual; 
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'saveCarga', ...cargaAbiertaActual }) });
  renderBolsaCargas();
  
  const payloadIntm = {
    action: 'saveIntermediacion', id: 'ITM-' + cargaAbiertaActual.id, fecha: new Date().toISOString().split('T')[0], 
    dador: cargaAbiertaActual.dador, transportista: transp.chofer, tramo: `${cargaAbiertaActual.origen} -> ${cargaAbiertaActual.destino}`, 
    cobrado: cobro, pagado: pago, comision: cobro - pago, condChoferLibre: document.getElementById('fo-cond-chofer-libre').value, condDadorLibre: document.getElementById('fo-cond-dador-libre').value
  };
  
  const idxi = intermediacionesGuardadas.findIndex(i => String(i.id) === String(payloadIntm.id));
  if(idxi >= 0) intermediacionesGuardadas[idxi] = payloadIntm; else intermediacionesGuardadas.push(payloadIntm);
  renderIntermediaciones();
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify(payloadIntm) });
  
  abrirFichaOperacion(cargaAbiertaActual.id); alert("¡Match Exitoso! Carga Asignada.");
}

function enviarWhatsAppGPS() {
  if(!telChoferAsignado) return alert("El transportista no tiene teléfono.");
  const orig = cargaAbiertaActual.origen; const dest = cargaAbiertaActual.destino;
  const linkO = `https://maps.google.com/?q=${encodeURIComponent(orig)}`; const linkD = `https://maps.google.com/?q=${encodeURIComponent(dest)}`;
  
  let msg = `*ORDEN DE CARGA ASIGNADA - NIVEL 9* 🚚\n\n📍 *Retira en:* ${orig}\n🌐 *GPS:* ${linkO}\n\n📍 *Entrega en:* ${dest}\n🌐 *GPS:* ${linkD}\n\n📦 *Detalle:* ${cargaAbiertaActual.descripcion}\n💵 *Tarifa Acordada:* $${Number(document.getElementById('fo-pago').value).toLocaleString('es-AR')}\n\n📝 *ACUERDOS FIJOS:*\n${ACUERDO_FIJO_CHOFER}\n`;
  const condLibre = document.getElementById('fo-cond-chofer-libre').value;
  if(condLibre) msg += `\n*Condiciones Libres:* ${condLibre}\n`;
  msg += `\nPor favor, confirmame recepción de esta orden.`;
  
  window.open(`https://wa.me/549${telChoferAsignado.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`);
}

async function subirArchivoBoveda(inputId, btnId) {
  const input = document.getElementById(inputId); const btn = document.getElementById(btnId);
  if (!input.files || input.files.length === 0) return alert("Seleccioná un archivo.");
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...'; btn.disabled = true;
  try {
    const file = input.files[0];
    const base64 = await new Promise((rs, rj) => { const rd = new FileReader(); rd.readAsDataURL(file); rd.onload = () => rs(rd.result.split(',')[1]); rd.onerror = e => rj(e); }); 
    const res = await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: "uploadFileDrive", fileName: `${cargaAbiertaActual.id}_${file.name}`, mimeType: file.type, base64Data: base64 }) }); 
    const d = await res.json(); 
    if(d.success) { document.getElementById('fo-boveda-links').innerHTML += `<div style="background:#e0f2fe; padding:6px; border-radius:4px; border:1px solid #7dd3fc;"><a href="${d.fileUrl}" target="_blank" style="color:#0284c7; font-weight:bold; text-decoration:none;"><i class="fas fa-external-link-alt"></i> Ver Archivo: ${file.name}</a></div>`; input.value = ""; } else alert("Error de Drive: " + d.error);
  } catch(e) { alert("Error de red."); } finally { btn.innerHTML = 'Subir'; btn.disabled = false; }
}

// ==========================================
// 7. MARINA IA
// ==========================================
async function procesarChatMarina() { 
  const input = document.getElementById('marina-prompt-input'); const box = document.getElementById('marina-chat-response'); const text = input.value.trim(); 
  if(!text) return; box.innerHTML = `<strong>Rodri:</strong> ${text}<br><br>⏳ <em>Marina analizando...</em>`; input.value = ""; 
  try { 
    const res = await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: "consultaMarina", prompt: `Eres Marina, IA de Nivel 9 Logística. Jefe: Rodri. Responde esto: "${text}"` }) }); 
    const inf = await res.json(); box.innerHTML = inf.success ? inf.result : `⚠️ Error IA: ${inf.error}`; 
  } catch(e) { box.innerHTML = "⚠️ Error de red."; } 
}
