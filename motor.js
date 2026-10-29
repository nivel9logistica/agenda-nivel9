// =========================================================================
// MOTOR JAVASCRIPT: NIVEL 9 ERP - ARCHITECTURE BY STARK
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

// --- VARIABLES DEL DOSSIER 3PL Y MAPAS ---
let cargaAbiertaActual = null;
let telChoferAsignado = null;
let mapaCotizador = null; 
let controlRutaMapa = null;

const ACUERDO_FIJO_CHOFER = "1. Liberación Estricta: El pago se liberará exclusivamente tras la recepción vía WhatsApp de la fotografía nítida del Remito Conformado (Firma, Aclaración, DNI y Sello). Sin este documento, no se procesará la liquidación.\n2. Deslinde de Responsabilidad: Nivel 9 interviene exclusivamente como coordinador. El Transportista asume la responsabilidad total por daños, faltantes o siniestros durante el tránsito.";
const ACUERDO_FIJO_DADOR = "1. Deslinde Tránsito.\n2. Control Estadías.\n3. Falsas Escuadras.";

// ==========================================
// 1. INICIALIZACIÓN Y NAVEGACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('marina-fecha-hoy').textContent = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  sincronizarConServidor();
});

async function sincronizarConServidor() {
  try {
    const res = await fetch(webAppUrl + '?action=getAppData');
    const data = await res.json();
    if(data.eventos) eventosGuardados = data.eventos;
    if(data.cargas) cargasGuardadas = data.cargas;
    if(data.transportistas) transportistasGuardados = data.transportistas;
    if(data.intermediaciones) intermediacionesGuardadas = data.intermediaciones;
    if(data.contactos) contactosGuardados = data.contactos;
    
    document.getElementById('sync-status-portal').innerHTML = '<i class="fas fa-check-circle"></i> Sistema Conectado a Servidor';
    document.getElementById('sync-status-portal').style.color = 'var(--finalizada)';
    dibujarCalendarioMes();
  } catch(error) {
    document.getElementById('sync-status-portal').innerHTML = '<i class="fas fa-wifi"></i> Modo Offline - Sin conexión';
    document.getElementById('sync-status-portal').style.color = 'var(--cancelada)';
  }
}

function showView(viewId) {
  document.getElementById('viewPortal').style.display = 'none'; 
  document.getElementById('appHeader').style.display = 'flex';
  
  // Ocultar todas las vistas
  const views = ['Agenda', 'Cotizador', 'Informes', 'Contactos', 'BolsaCargas', 'Transportistas', 'Intermediaciones'];
  views.forEach(v => { 
    const el = document.getElementById('view' + v); 
    if(el) el.style.display = 'none'; 
  });
  
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  event.currentTarget.classList.add('active');

  if (viewId === 'Portal') { 
    document.getElementById('viewPortal').style.display = 'block'; 
    document.getElementById('appHeader').style.display = 'none'; 
  } else { 
    const target = document.getElementById('view' + viewId);
    if(target) target.style.display = 'block'; 
    document.getElementById('viewTitleText').innerText = viewId;
  }
  
  // Renderizados dinámicos al abrir vistas
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

function abrirModalNativo(id) { 
  cerrarModalesNativos(); 
  const m = document.getElementById(id); 
  if(m) m.style.display = 'flex'; 
}

function cerrarModalesNativos() { 
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); 
}

// ==========================================
// 2. AGENDA DE FLOTA (CALENDARIO)
// ==========================================
function dibujarCalendarioMes() {
  const anio = fechaCalendarioActual.getFullYear(); 
  const mes = fechaCalendarioActual.getMonth();
  document.getElementById('currentMonthYear').textContent = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(fechaCalendarioActual);
  const grid = document.getElementById('calendarGrid'); 
  grid.innerHTML = '';
  
  const primerDia = new Date(anio, mes, 1).getDay(); 
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  
  for(let i = 0; i < primerDia; i++) grid.innerHTML += `<div class="day-cell" style="background:transparent; border:none;"></div>`; 
  
  const strHoy = new Date().toISOString().split('T')[0];
  
  for(let dia = 1; dia <= diasMes; dia++) {
    const strF = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    const esHoy = (strF === strHoy) ? 'today' : '';
    const viajes = eventosGuardados.filter(e => e.fecha === strF);
    
    // Al hacer clic en un viaje, se abre para editarlo (Lógica recuperada)
    const htmlV = viajes.map(v => `<div class="event-chip status-${v.estado}" onclick="editarEventoViaje('${v.id}')"><span>${v.cliente}</span></div>`).join('');
    grid.innerHTML += `<div class="day-cell ${esHoy}" onclick="prepararNuevoViaje('${strF}')"><div class="day-number">${dia}</div>${htmlV}</div>`;
  }
}

function navigateMonth(dir) { fechaCalendarioActual.setMonth(fechaCalendarioActual.getMonth() + dir); dibujarCalendarioMes(); }
function goToday() { fechaCalendarioActual = new Date(); dibujarCalendarioMes(); }

function prepararNuevoViaje(fecha) {
  // Evitar que abra si se hizo clic en el chip del viaje
  if (event.target.closest('.event-chip')) return;
  document.getElementById('ev-id').value = '';
  document.getElementById('ev-fecha').value = fecha;
  document.getElementById('ev-estado').value = 'Posible';
  document.getElementById('ev-cliente').value = '';
  document.getElementById('ev-inventario').value = '';
  document.getElementById('ev-presupuesto').value = 0;
  document.getElementById('ev-combustible').value = 0;
  document.getElementById('ev-extra').value = 0;
  calculateAgendaTotal();
  document.getElementById('btn-eliminar-evento').style.display = 'none';
  abrirModalNativo('modalEventForm');
}

function editarEventoViaje(id) {
  const v = eventosGuardados.find(e => e.id === id);
  if(!v) return;
  document.getElementById('ev-id').value = v.id;
  document.getElementById('ev-fecha').value = v.fecha;
  document.getElementById('ev-estado').value = v.estado;
  document.getElementById('ev-cliente').value = v.cliente;
  document.getElementById('ev-telefono').value = v.telefono || '';
  document.getElementById('ev-inventario').value = v.inventario;
  document.getElementById('ev-presupuesto').value = v.presupuesto;
  document.getElementById('ev-combustible').value = v.combustible;
  document.getElementById('ev-extra').value = v.extra;
  calculateAgendaTotal();
  document.getElementById('btn-eliminar-evento').style.display = 'block';
  abrirModalNativo('modalEventForm');
}

function calculateAgendaTotal() { 
  const v = (id) => parseFloat(document.getElementById(id).value) || 0; 
  document.getElementById('ev-total').value = v('ev-presupuesto') - (v('ev-combustible') + v('ev-extra')); 
}

function saveEvent() {
  const payload = { 
    id: document.getElementById('ev-id').value || 'MOV-' + Date.now(), 
    fecha: document.getElementById('ev-fecha').value, 
    estado: document.getElementById('ev-estado').value, 
    cliente: document.getElementById('ev-cliente').value, 
    telefono: document.getElementById('ev-telefono').value, 
    inventario: document.getElementById('ev-inventario').value, 
    presupuesto: parseFloat(document.getElementById('ev-presupuesto').value)||0, 
    combustible: parseFloat(document.getElementById('ev-combustible').value)||0, 
    extra: parseFloat(document.getElementById('ev-extra').value)||0 
  };
  const idx = eventosGuardados.findIndex(e => String(e.id) === String(payload.id)); 
  if(idx >= 0) eventosGuardados[idx] = payload; else eventosGuardados.push(payload);
  dibujarCalendarioMes(); cerrarModalesNativos();
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify(payload) });
}

function eliminarEventoViaje() {
  const id = document.getElementById('ev-id').value;
  if(!confirm("¿Eliminar este viaje de la flota?")) return;
  eventosGuardados = eventosGuardados.filter(e => String(e.id) !== String(id));
  dibujarCalendarioMes(); cerrarModalesNativos();
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'deleteEvent', id: id }) });
}

// ==========================================
// 3. COTIZADOR OSRM
// ==========================================
function addDestinoCotizador() { 
  const c = document.getElementById('destinosContainer'); 
  const i = document.createElement('input'); 
  i.type = 'text'; i.className = 'cot-destino-input'; 
  i.placeholder = 'Otra parada...'; i.style.marginTop = '10px'; 
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
    controlRutaMapa = L.Routing.control({ waypoints: coords, show: false }).addTo(mapaCotizador);
    controlRutaMapa.on('routesfound', (e) => { 
      document.getElementById('cot-kms').value = Math.round(e.routes[0].summary.totalDistance / 1000); 
      mapaCotizador.fitBounds(L.latLngBounds(coords)); 
    });
  } catch(e) { alert("Error al conectar con el satélite OSRM."); }
}

function calcularCostosCotizador() { 
  const v = (id) => parseFloat(document.getElementById(id).value) || 0; 
  const costos = v('cot-res-combustible') + v('cot-res-extra'); 
  document.getElementById('cot-res-costostotales').value = costos; 
  document.getElementById('cot-res-utilidad').value = v('cot-res-tarifa') - costos; 
}

// ==========================================
// 4. MÓDULO 3PL: BOLSA CARGAS Y CHOFERES
// ==========================================
function renderBolsaCargas() {
  const orig = document.getElementById('cga-filtro-origen').value.toLowerCase();
  const dest = document.getElementById('cga-filtro-destino').value.toLowerCase();
  const veh = document.getElementById('cga-filtro-vehiculo').value.toLowerCase();
  
  const arr = cargasGuardadas.filter(c => 
    (!orig || (c.origen && c.origen.toLowerCase().includes(orig))) && 
    (!dest || (c.destino && c.destino.toLowerCase().includes(dest))) && 
    (veh === 'todos' || (c.vehiculo && c.vehiculo.toLowerCase().includes(veh))) 
  );
  
  document.getElementById('bolsaCargasGrid').innerHTML = arr.length === 0 ? '<p style="grid-column:span 3; text-align:center;">No hay cargas en radar.</p>' : arr.map(c => `
    <div class="broker-card" style="${c.estado === 'ASIGNADA' ? 'border: 2px solid #16a34a; background:#f0fdf4;' : ''}">
      <div class="broker-card-header">
        <strong>${c.origen} ➔ ${c.destino}</strong>
        <span class="status-badge" style="background:${c.estado === 'ASIGNADA' ? '#16a34a' : 'var(--brand-light)'}; color:${c.estado === 'ASIGNADA' ? 'white' : 'var(--brand)'};">${c.vehiculo}</span>
      </div>
      <div style="font-size:0.95rem; margin-bottom:10px;"><i class="fas fa-boxes" style="color:var(--brand);"></i> <b>Carga:</b> ${c.descripcion}</div>
      <div style="font-size:0.85rem; color:#71717a; margin-bottom:12px;"><b>Dador:</b> ${c.dador} | <b>Estado:</b> ${c.estado || 'Disponible'}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #e4e4e7; padding-top:10px;">
        <strong style="color:var(--brand); font-size:1.1rem;">$${Number(c.tarifa).toLocaleString('es-AR')}</strong>
        <button class="btn btn-dark" style="padding:6px 12px; font-size:0.85rem;" onclick="abrirFichaOperacion('${c.id}')"><i class="fas fa-folder-open"></i> Ver Dossier</button>
      </div>
    </div>`).join('');
}

function renderTransportistas() {
  const q = document.getElementById('trp-filtro-search').value.toLowerCase();
  const veh = document.getElementById('trp-filtro-vehiculo').value.toLowerCase();
  
  const arr = transportistasGuardados.filter(t => 
    ((t.chofer && t.chofer.toLowerCase().includes(q)) || (t.patente && t.patente.toLowerCase().includes(q)) || (t.telefono && t.telefono.includes(q))) && 
    (veh === 'todos' || (t.vehiculo && t.vehiculo.toLowerCase().includes(veh))) 
  );
  
  document.getElementById('transportistasGrid').innerHTML = arr.length === 0 ? '<p style="grid-column:span 3; text-align:center;">No hay unidades en radar.</p>' : arr.map(t => `
    <div class="broker-card">
      <div class="broker-card-header"><strong>${t.chofer}</strong><span class="status-badge" style="background:#e0f2fe; color:#0284c7;">${t.vehiculo}</span></div>
      <div style="font-size:0.9rem; margin-bottom:8px;"><i class="fas fa-truck-moving"></i> <b>Patente:</b> ${t.patente}</div>
      <div style="font-size:0.85rem; color:#71717a;"><i class="fas fa-map-marker-alt"></i> <b>Ubicación:</b> ${t.ubicacion || 'En Tránsito'}</div>
    </div>`).join('');
}

function renderIntermediaciones() {
  document.getElementById('intermediacionesTableBody').innerHTML = intermediacionesGuardadas.map(i => `<tr><td>${i.fecha}</td><td><strong>${i.dador}</strong></td><td><strong>${i.transportista}</strong></td><td>${i.tramo}</td><td style="color:#0284c7; font-weight:bold;">$${Number(i.cobrado).toLocaleString('es-AR')}</td><td style="color:#dc2626;">$${Number(i.pagado).toLocaleString('es-AR')}</td><td style="color:#16a34a; font-weight:bold;">$${Number(i.comision).toLocaleString('es-AR')}</td></tr>`).join('');
}

// ==========================================
// 5. DOSSIER 3PL, BÓVEDA DRIVE Y WHATSAPP GPS
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
    const intm = intermediacionesGuardadas.find(i => i.id === 'ITM-' + cargaAbiertaActual.id);
    
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

function calcularComisionDossier() { 
  const c = parseFloat(document.getElementById('fo-cobro').value)||0; 
  const p = parseFloat(document.getElementById('fo-pago').value)||0; 
  document.getElementById('fo-comision').innerText = '$' + (c - p).toLocaleString('es-AR'); 
}

function asignarTransportistaDossier() {
  const transpId = document.getElementById('fo-select-chofer').value;
  if(!transpId) return alert("Seleccioná un transportista de la red.");
  const transp = transportistasGuardados.find(t => String(t.id) === String(transpId));
  
  cargaAbiertaActual.estado = 'ASIGNADA';
  
  const cobro = parseFloat(document.getElementById('fo-cobro').value)||0;
  const pago = parseFloat(document.getElementById('fo-pago').value)||0;
  
  // Guardamos la carga actualizada
  const idx = cargasGuardadas.findIndex(c => String(c.id) === String(cargaAbiertaActual.id));
  if(idx >= 0) cargasGuardadas[idx] = cargaAbiertaActual; 
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'saveCarga', ...cargaAbiertaActual }) });
  renderBolsaCargas();
  
  // Guardamos la intermediación
  const payloadIntm = {
    action: 'saveIntermediacion',
    id: 'ITM-' + cargaAbiertaActual.id, 
    fecha: new Date().toISOString().split('T')[0], 
    dador: cargaAbiertaActual.dador, 
    transportista: transp.chofer, 
    tramo: `${cargaAbiertaActual.origen} -> ${cargaAbiertaActual.destino}`, 
    cobrado: cobro, 
    pagado: pago, 
    comision: cobro - pago, 
    condChoferLibre: document.getElementById('fo-cond-chofer-libre').value, 
    condDadorLibre: document.getElementById('fo-cond-dador-libre').value
  };
  
  const idxi = intermediacionesGuardadas.findIndex(i => String(i.id) === String(payloadIntm.id));
  if(idxi >= 0) intermediacionesGuardadas[idxi] = payloadIntm; else intermediacionesGuardadas.push(payloadIntm);
  renderIntermediaciones();
  fetch(webAppUrl, { method: 'POST', body: JSON.stringify(payloadIntm) });
  
  abrirFichaOperacion(cargaAbiertaActual.id); 
  alert("¡Match Exitoso! Carga Asignada.");
}

function enviarWhatsAppGPS() {
  if(!telChoferAsignado) return alert("El transportista no tiene teléfono registrado.");
  
  const orig = cargaAbiertaActual.origen; 
  const dest = cargaAbiertaActual.destino;
  const linkO = `https://maps.google.com/?q=${encodeURIComponent(orig)}`; 
  const linkD = `https://maps.google.com/?q=${encodeURIComponent(dest)}`;
  
  let msg = `*ORDEN DE CARGA ASIGNADA - NIVEL 9* 🚚\n\n`;
  msg += `📍 *Retira en:* ${orig}\n🌐 *GPS:* ${linkO}\n\n`;
  msg += `📍 *Entrega en:* ${dest}\n🌐 *GPS:* ${linkD}\n\n`;
  msg += `📦 *Detalle:* ${cargaAbiertaActual.descripcion}\n`;
  msg += `💵 *Tarifa Acordada:* $${Number(document.getElementById('fo-pago').value).toLocaleString('es-AR')}\n\n`;
  
  msg += `📝 *ACUERDOS FIJOS:*\n${ACUERDO_FIJO_CHOFER}\n`;
  
  const condLibre = document.getElementById('fo-cond-chofer-libre').value;
  if(condLibre) msg += `\n*Condiciones Libres:* ${condLibre}\n`;
  
  msg += `\nPor favor, confirmame recepción de esta orden para habilitarte el viaje.`;
  
  window.open(`https://wa.me/549${telChoferAsignado.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`);
}

async function subirArchivoBoveda(inputId, btnId) {
  const input = document.getElementById(inputId); 
  const btn = document.getElementById(btnId);
  if (!input.files || input.files.length === 0) return alert("Seleccioná un archivo de tu PC o celular.");
  
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo a Drive...'; 
  btn.disabled = true;
  
  try {
    const file = input.files[0];
    const base64 = await new Promise((rs, rj) => { 
      const rd = new FileReader(); 
      rd.readAsDataURL(file); 
      rd.onload = () => rs(rd.result.split(',')[1]); 
      rd.onerror = e => rj(e); 
    }); 
    
    const res = await fetch(webAppUrl, { 
      method: 'POST', 
      body: JSON.stringify({ 
        action: "uploadFileDrive", 
        fileName: `${cargaAbiertaActual.id}_${file.name}`, 
        mimeType: file.type, 
        base64Data: base64 
      }) 
    }); 
    const d = await res.json(); 
    
    if(d.success) { 
      document.getElementById('fo-boveda-links').innerHTML += `<div style="background:#e0f2fe; padding:6px; border-radius:4px; border:1px solid #7dd3fc;"><a href="${d.fileUrl}" target="_blank" style="color:#0284c7; font-weight:bold; text-decoration:none;"><i class="fas fa-external-link-alt"></i> Ver Archivo: ${file.name}</a></div>`; 
      input.value = ""; 
    } else {
      alert("Error de Google Drive: " + d.error);
    }
  } catch(e) { 
    alert("Error de conexión a la Bóveda."); 
  } finally { 
    btn.innerHTML = 'Subir a Drive'; 
    btn.disabled = false; 
  }
}

// ==========================================
// 6. MOTOR DE INTELIGENCIA ARTIFICIAL
// ==========================================
async function procesarChatMarina() { 
  const input = document.getElementById('marina-prompt-input'); 
  const box = document.getElementById('marina-chat-response'); 
  const text = input.value.trim(); 
  
  if(!text) return; 
  box.innerHTML = `<strong>Rodri:</strong> ${text}<br><br>⏳ <em>Marina analizando base de datos...</em>`; 
  input.value = ""; 
  
  try { 
    const res = await fetch(webAppUrl, { 
      method: 'POST', 
      body: JSON.stringify({ 
        action: "consultaMarina", 
        prompt: `Eres Marina, IA de Nivel 9 Logística. Jefe: Rodrigo Castro (Rodri). Responde esto: "${text}"` 
      }) 
    }); 
    const inf = await res.json(); 
    box.innerHTML = inf.success ? inf.result : `⚠️ Error de red neuronal: ${inf.error}`; 
  } catch(e) { 
    box.innerHTML = "⚠️ Sistema fuera de línea."; 
  } 
}
