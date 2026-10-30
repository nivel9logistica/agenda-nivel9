// =========================================================================
// MOTOR JAVASCRIPT MAESTRO: NIVEL 9 ERP & BROKERAGE 3PL - MARK 90 PRO
// =========================================================================

// ⚠️ URL DEL WEBHOOK DE GOOGLE APPS SCRIPT
const webAppUrl = 'https://script.google.com/macros/s/AKfycbzJgp7Q0-LnufrbdYtB1nww9VPWIT-GDOHTGAmhk4qrp44CjhXTErniQQUGgrJofRJt/exec';

// --- BASES DE DATOS EN MEMORIA ---
let eventosGuardados = []; 
let contactosGuardados = []; 
let bolsaCargasGuardadas = []; 
let transportistasGuardados = []; 
let intermediacionesGuardadas = [];
let fechaCalendarioActual = new Date(); 
let fechaSeleccionadaDia = null; 

// --- VARIABLES MAPA Y 3PL ---
let mapaCotizador = null; 
let controlRutaMapa = null;
let cargaAbiertaActual = null;
let telChoferAsignado = null;

// Sincronización estandarizada con Portal Público
let configuracionNivel9 = { 
  diesel: 2450, 
  flota: ["Furgón", "Chasis", "Camión Semi", "Sider", "Balancín"], 
  tipos: ["Cargas Generales", "Carga Paletizada", "Cadena de Frío", "Carga a Granel", "Maquinaria y Pesada", "Mudanzas y Muebles", "Carga Peligrosa IMO"] 
};

// ACUERDOS COMERCIALES FIJOS 3PL
const ACUERDO_FIJO_CHOFER = "1. Liberación Estricta: El pago se liberará exclusivamente tras la recepción vía WhatsApp de la fotografía nítida del Remito Conformado (Firma, Aclaración, DNI y Sello). Sin este documento, no se procesará la liquidación.\n2. Deslinde de Responsabilidad: Nivel 9 interviene exclusivamente como coordinador. El Transportista asume la responsabilidad total por daños, faltantes o siniestros durante el tránsito.";
const ACUERDO_FIJO_DADOR = "1. Deslinde Tránsito.\n2. Control Estadías (2hs libres).\n3. Falsas Escuadras (30%).";

// ==========================================
// 1. INICIALIZACIÓN Y NAVEGACIÓN MÓVIL
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const cacheParams = localStorage.getItem('nivel9_config');
  if(cacheParams) configuracionNivel9 = JSON.parse(cacheParams);
  const cfgDiesel = document.getElementById('cfg-diesel');
  if(cfgDiesel) cfgDiesel.value = configuracionNivel9.diesel;
  const fechaHoyEl = document.getElementById('marina-fecha-hoy');
  if(fechaHoyEl) fechaHoyEl.textContent = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  actualizarListasDesplegables(); 
  sincronizarConServidor();
});

function toggleMenu() {
  const nav = document.getElementById('topNavMenu');
  if(nav) nav.classList.toggle('active');
}

async function sincronizarConServidor() {
  try {
    const res = await fetch(webAppUrl + '?action=getAppData');
    const data = await res.json();
    
    if(data.eventos && Array.isArray(data.eventos)) {
      eventosGuardados = data.eventos.map(item => {
        let obj = {};
        Object.keys(item).forEach(k => { obj[k.toLowerCase()] = item[k]; });
        if(obj.fecha) {
          let strF = String(obj.fecha).trim();
          if(strF.includes('T')) strF = strF.split('T')[0];
          if(strF.includes('/')) {
            const p = strF.split('/');
            if(p.length === 3 && p[0].length === 2 && p[2].length === 4) {
              strF = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
            }
          }
          obj.fecha = strF;
        }
        return obj;
      });
    }

    if(data.contactos) contactosGuardados = data.contactos.map(c => { let o = {}; Object.keys(c).forEach(k => o[k.toLowerCase()] = c[k]); return o; });
    if(data.cargas) bolsaCargasGuardadas = data.cargas.map(c => { let o = {}; Object.keys(c).forEach(k => o[k.toLowerCase()] = c[k]); return o; });
    if(data.transportistas) transportistasGuardados = data.transportistas.map(c => { let o = {}; Object.keys(c).forEach(k => o[k.toLowerCase()] = c[k]); return o; });
    if(data.intermediaciones) intermediacionesGuardadas = data.intermediaciones.map(c => { let o = {}; Object.keys(c).forEach(k => o[k.toLowerCase()] = c[k]); return o; });
    
    const syncStatus = document.getElementById('sync-status-portal');
    if(syncStatus) {
      syncStatus.innerHTML = '<i class="fas fa-check-circle"></i> Base Conectada (' + eventosGuardados.length + ' viajes)';
      syncStatus.style.color = 'var(--estado-entregado)';
    }
  } catch(error) {
    const syncStatus = document.getElementById('sync-status-portal');
    if(syncStatus) {
      syncStatus.innerHTML = '<i class="fas fa-wifi"></i> Modo Offline (Lectura Local)'; 
      syncStatus.style.color = 'var(--estado-cancelado)';
    }
  }
  dibujarCalendarioMes(); 
  renderContactos(); 
  renderBolsaCargas(); 
  renderTransportistas(); 
  renderIntermediaciones();
}

function showView(viewId) {
  const portal = document.getElementById('viewPortal');
  const appHeader = document.getElementById('appHeader');
  if(portal) portal.style.display = 'none'; 
  if(appHeader) appHeader.style.display = 'flex';
  
  ['Agenda', 'Cotizador', 'BolsaCargas', 'RedTransportistas', 'Intermediacion', 'Contactos', 'Informes'].forEach(v => {
    const el = document.getElementById('view' + v);
    if(el) el.style.display = 'none';
  });

  if (viewId === 'Portal') { 
    if(portal) portal.style.display = 'flex'; 
    if(appHeader) appHeader.style.display = 'none'; 
  } else { 
    const target = document.getElementById('view' + viewId);
    if(target) target.style.display = 'block'; 
  }
  
  const nav = document.getElementById('topNavMenu');
  if(nav && nav.classList.contains('active')) nav.classList.remove('active');

  if(viewId === 'Agenda') dibujarCalendarioMes();
  if(viewId === 'Informes') inyectarFiltrosDeInformes(); 
  if(viewId === 'BolsaCargas') renderBolsaCargas();
  if(viewId === 'RedTransportistas') renderTransportistas();
  if(viewId === 'Intermediacion') renderIntermediaciones();
  
  if(viewId === 'Cotizador') { 
    setTimeout(() => { 
      if(!mapaCotizador) { 
        mapaCotizador = L.map('map').setView([-31.4135, -64.1810], 11); 
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaCotizador); 
      } 
      mapaCotizador.invalidateSize(); 
    }, 100); 
  }
}

function abrirModalNativo(id) { cerrarModalesNativos(); const m = document.getElementById(id); if(m) m.style.display = 'flex'; }
function cerrarModalesNativos() { document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none'); }

// ==========================================
// 2. CALENDARIO DE AGENDA Y MOVIMIENTOS
// ==========================================
function dibujarCalendarioMes() {
  const grid = document.getElementById('calendarGrid'); 
  if(!grid) return;
  const anio = fechaCalendarioActual.getFullYear(); 
  const mes = fechaCalendarioActual.getMonth();
  
  const titleEl = document.getElementById('currentMonthYear');
  if(titleEl) titleEl.textContent = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(fechaCalendarioActual);
  
  grid.innerHTML = '';
  const primerDiaSemana = new Date(anio, mes, 1).getDay(); 
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  
  for(let i = 0; i < primerDiaSemana; i++) { grid.innerHTML += `<div class="day-cell empty"></div>`; }
  
  const strHoy = new Date().toISOString().split('T')[0];
  for(let dia = 1; dia <= diasDelMes; dia++) {
    const strFechaLoop = `${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    const claseHoy = (strFechaLoop === strHoy) ? 'today' : '';
    const viajesDelDia = eventosGuardados.filter(e => e.fecha === strFechaLoop);
    
    const pastillasHTML = viajesDelDia.map(viaje => {
      const estadoLimpio = String(viaje.estado || 'Posible').replace(/\s+/g, '');
      return `<div class="event-chip status-${estadoLimpio}"><span>${viaje.cliente}</span></div>`;
    }).join('');
    
    grid.innerHTML += `<div class="day-cell ${claseHoy}" onclick="abrirVistaDelDia('${strFechaLoop}')"><div class="day-number">${dia}</div>${pastillasHTML}</div>`;
  }
}

function navigateMonth(dir) { fechaCalendarioActual.setMonth(fechaCalendarioActual.getMonth() + dir); dibujarCalendarioMes(); }
function goToday() { fechaCalendarioActual = new Date(); dibujarCalendarioMes(); }

function abrirVistaDelDia(fechaString) {
  fechaSeleccionadaDia = fechaString; 
  const viajes = eventosGuardados.filter(e => e.fecha === fechaString); 
  const [ano, mes, dia] = fechaString.split('-');
  
  const title = document.getElementById('dayViewTitle');
  if(title) title.textContent = `Movimientos del ${dia}/${mes}/${ano}`;
  const body = document.getElementById('dayViewBody');
  if(!body) return;

  if (viajes.length === 0) { 
    body.innerHTML = '<p style="color:#71717a; text-align:center; margin-top:15px;">Sin agenda para este día.</p>'; 
  } else { 
    body.innerHTML = viajes.map(v => {
      const estadoLimpio = String(v.estado || 'Posible').replace(/\s+/g, '');
      return `
      <div class="event-card ${estadoLimpio}">
        <div class="event-card-header"><div class="event-card-title">${v.cliente}</div><span class="contact-badge status-${estadoLimpio}" style="color:white; margin:0;">${v.estado}</span></div>
        <div class="event-card-meta"><div><i class="fas fa-truck"></i> ${v.tipomov || '-'}</div><div><i class="fas fa-dollar-sign"></i> Tarifa: $${Number(v.presupuesto||0).toLocaleString('es-AR')}</div></div>
        <button class="btn btn-outline-dark" style="padding:5px 10px; font-size:0.8rem; margin-top:10px; width:100%;" onclick="editEvent('${v.id}')"><i class="fas fa-edit"></i> Editar / Ver Ficha</button>
      </div>`;
    }).join(''); 
  }
  abrirModalNativo('modalDayView');
}

function calculateTotal() { 
  const valor = (id) => { const el = document.getElementById(id); return el ? parseFloat(el.value) || 0 : 0; }; 
  const tot = document.getElementById('ev-total');
  if(tot) tot.value = valor('ev-presupuesto') - (valor('ev-combustible') + valor('ev-peajes-costo') + valor('ev-viaticos') + valor('ev-ayudante-monto') + valor('ev-comision') + valor('ev-gastoext')); 
}

function openAddEventModal(fechaPredefinida = null) {
  const form = document.getElementById('eventForm');
  if(form) form.reset(); 
  document.getElementById('ev-id').value = 'MOV-' + Date.now(); 
  document.getElementById('ev-fecha').value = fechaPredefinida || new Date().toISOString().split('T')[0]; 
  const btnEliminar = document.getElementById('btn-eliminar-evento');
  if(btnEliminar) btnEliminar.style.display = 'none'; 
  calculateTotal(); 
  cerrarModalesNativos(); 
  abrirModalNativo('modalEventForm');
}

function editEvent(idViaje) {
  const viaje = eventosGuardados.find(e => String(e.id) === String(idViaje)); 
  if(!viaje) return;
  document.getElementById('ev-id').value = viaje.id; 
  document.getElementById('ev-fecha').value = viaje.fecha; 
  document.getElementById('ev-estado').value = viaje.estado || 'Posible'; 
  document.getElementById('ev-tipocliente').value = viaje.tipocliente || 'Particular'; 
  document.getElementById('ev-cliente').value = viaje.cliente || ''; 
  document.getElementById('ev-telefono').value = viaje.telefono || ''; 
  document.getElementById('ev-tipomov').value = viaje.tipomov || ''; 
  document.getElementById('ev-asignacion').value = viaje.asignacion || ''; 
  document.getElementById('ev-origen').value = viaje.origen || ''; 
  document.getElementById('ev-destino').value = viaje.destino || ''; 
  document.getElementById('ev-distancia').value = viaje.distancia || 0; 
  
  let textoInv = viaje.inventario || viaje.detalles || viaje.descripcion || viaje.detallecarga || '';
  textoInv = textoInv.replace(/<br\s*[\/]?>/gi, "\n");
  document.getElementById('ev-inventario').value = textoInv; 
  
  document.getElementById('ev-obs-ruta').value = viaje.obsruta || ''; 
  document.getElementById('ev-nrodoc').value = viaje.nrodoc || ''; 
  document.getElementById('ev-tarifa-hora').value = viaje.tarifahora || ''; 
  document.getElementById('ev-base-minima').value = viaje.baseminima || ''; 
  document.getElementById('ev-detalle-tarifa').value = viaje.detalletarifa || ''; 
  document.getElementById('ev-presupuesto').value = viaje.presupuesto || 0; 
  document.getElementById('ev-sena').value = viaje.sena || 0; 
  document.getElementById('ev-combustible').value = viaje.combustible || 0; 
  document.getElementById('ev-peajes-costo').value = viaje.peajescosto || 0; 
  document.getElementById('ev-viaticos').value = viaje.viaticos || 0; 
  document.getElementById('ev-ayudante-monto').value = viaje.ayudante || 0; 
  document.getElementById('ev-comision').value = viaje.comision || 0; 
  document.getElementById('ev-gastoext').value = viaje.gastoext || 0; 
  document.getElementById('ev-detallegastoext').value = viaje.detallegastoext || '';
  
  const btnEliminar = document.getElementById('btn-eliminar-evento');
  if(btnEliminar) btnEliminar.style.display = 'inline-flex'; 
  calculateTotal(); 
  cerrarModalesNativos(); 
  abrirModalNativo('modalEventForm');
}

function saveEvent() {
  const fecha = document.getElementById('ev-fecha').value; 
  const cliente = document.getElementById('ev-cliente').value.trim(); 
  if(!fecha || !cliente) { alert("Error: Fecha y Cliente obligatorios."); return; } 
  calculateTotal(); 
  const valorNum = (id) => { const el = document.getElementById(id); return el ? parseFloat(el.value) || 0 : 0; };
  
  const payload = { 
    id: document.getElementById('ev-id').value, 
    fecha: fecha, 
    estado: document.getElementById('ev-estado').value, 
    tipocliente: document.getElementById('ev-tipocliente').value, 
    cliente: cliente, 
    telefono: document.getElementById('ev-telefono').value, 
    tipomov: document.getElementById('ev-tipomov').value, 
    asignacion: document.getElementById('ev-asignacion').value, 
    origen: document.getElementById('ev-origen').value, 
    destino: document.getElementById('ev-destino').value, 
    distancia: valorNum('ev-distancia'), 
    inventario: document.getElementById('ev-inventario').value, 
    obsruta: document.getElementById('ev-obs-ruta').value, 
    nrodoc: document.getElementById('ev-nrodoc').value, 
    tarifahora: valorNum('ev-tarifa-hora'), 
    baseminima: document.getElementById('ev-base-minima').value, 
    detalletarifa: document.getElementById('ev-detalle-tarifa').value, 
    presupuesto: valorNum('ev-presupuesto'), 
    sena: valorNum('ev-sena'), 
    combustible: valorNum('ev-combustible'), 
    peajescosto: valorNum('ev-peajes-costo'), 
    viaticos: valorNum('ev-viaticos'), 
    ayudante: valorNum('ev-ayudante-monto'), 
    comision: valorNum('ev-comision'), 
    gastoext: valorNum('ev-gastoext'), 
    detallegastoext: document.getElementById('ev-detallegastoext').value, 
    total: valorNum('ev-total') 
  };
  window.MotorNivel9.crearViajeEnBaseDeDatos(payload);
}

function eliminarEventoViaje() { 
  if(confirm("¿Eliminar viaje de la base de datos?")) { 
    window.MotorNivel9.eliminarViajeEnBaseDeDatos(document.getElementById('ev-id').value); 
  } 
}

function abrirWhatsAppFormulario() { 
  const tel = document.getElementById('ev-telefono').value.replace(/\D/g, ''); 
  if(tel.length > 9) { window.open(`https://wa.me/549${tel}`); } else { alert("Número de teléfono inválido."); } 
}

// ==========================================
// 3. COTIZADOR GPS OSRM Y COSTOS
// ==========================================
function addDestinoCotizador() { 
  const c = document.getElementById('destinosContainer'); 
  if(!c) return;
  const i = document.createElement('input'); 
  i.type = 'text'; i.className = 'cot-destino-input'; i.placeholder = 'Otra parada...'; i.style.marginTop = '8px'; 
  c.appendChild(i); 
}

async function calcularRutaOSRM() {
  const origen = document.getElementById('cot-origen').value; 
  const destinosArr = Array.from(document.querySelectorAll('.cot-destino-input')).map(i => i.value).filter(v => v);
  if(!origen || destinosArr.length === 0) { alert("Completar origen y destino."); return; }
  
  const puntosTotales = [origen, ...destinosArr].map(p => p.includes('Argentina') ? p : p + ', Argentina');
  try { 
    let coords = []; 
    for(let lugar of puntosTotales) { 
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=ar&q=${encodeURIComponent(lugar)}`).then(x => x.json()); 
      if(res.length > 0) coords.push(L.latLng(res[0].lat, res[0].lon)); 
    }
    if(controlRutaMapa) mapaCotizador.removeControl(controlRutaMapa);
    controlRutaMapa = L.Routing.control({ waypoints: coords, show: false, addWaypoints: false }).addTo(mapaCotizador);
    controlRutaMapa.on('routesfound', (evento) => { 
      document.getElementById('cot-kms').value = Math.round(evento.routes[0].summary.totalDistance / 1000); 
      calcularCostosRuta(); 
      mapaCotizador.fitBounds(L.latLngBounds(coords), {padding: [30,30]}); 
    });
  } catch(e) { alert("Error calculando la ruta con el satélite OSRM."); }
}

function calcularCostosRuta() { 
  document.getElementById('cot-res-combustible').value = Math.round((((parseFloat(document.getElementById('cot-kms').value) || 0) * 2) / 100) * 15 * (parseFloat(configuracionNivel9.diesel) || 2450)); 
  calcularCostosCotizador(); 
}

function calcularCostosCotizador() { 
  const v = (id) => parseFloat(document.getElementById(id).value) || 0; 
  const costos = v('cot-res-combustible') + v('cot-res-peajes-costo') + v('cot-res-viaticos') + v('cot-ayudante'); 
  document.getElementById('cot-res-costostotales').value = costos; 
  document.getElementById('cot-res-utilidad').value = v('cot-res-tarifa') - costos; 
}

function trasladarCotizacion() {
  document.getElementById('ev-id').value = 'MOV-' + Date.now(); 
  document.getElementById('ev-fecha').value = document.getElementById('cot-fecha-estimativa').value || new Date().toISOString().split('T')[0]; 
  document.getElementById('ev-estado').value = 'Posible'; 
  document.getElementById('ev-cliente').value = document.getElementById('cot-cliente').value; 
  document.getElementById('ev-tipomov').value = document.getElementById('cot-tipomov').value; 
  document.getElementById('ev-asignacion').value = document.getElementById('cot-unidad').value; 
  document.getElementById('ev-origen').value = document.getElementById('cot-origen').value; 
  document.getElementById('ev-destino').value = Array.from(document.querySelectorAll('.cot-destino-input')).map(i => i.value).filter(v => v).join(' -> '); 
  document.getElementById('ev-distancia').value = document.getElementById('cot-kms').value; 
  document.getElementById('ev-inventario').value = document.getElementById('cot-detalles-recibidos').value; 
  
  document.getElementById('ev-presupuesto').value = document.getElementById('cot-res-tarifa').value; 
  document.getElementById('ev-combustible').value = document.getElementById('cot-res-combustible').value; 
  document.getElementById('ev-peajes-costo').value = document.getElementById('cot-res-peajes-costo').value; 
  document.getElementById('ev-viaticos').value = document.getElementById('cot-res-viaticos').value; 
  document.getElementById('ev-gastoext').value = 0; 
  document.getElementById('ev-ayudante-monto').value = document.getElementById('cot-ayudante').value;
  
  calculateTotal(); 
  abrirModalNativo('modalEventForm');
}

// ==========================================
// 4. MÓDULO BROKERAGE 3PL, DOSSIER Y BÓVEDA
// ==========================================
function abrirModalNuevaCarga() { 
  document.getElementById('formCarga').reset(); 
  document.getElementById('bc-id').value = 'CARGA-' + Date.now(); 
  abrirModalNativo('modalPublicarCarga'); 
}

function abrirModalNuevoTransportista() { 
  document.getElementById('formTransportista').reset(); 
  document.getElementById('rt-id').value = 'TRANSP-' + Date.now(); 
  abrirModalNativo('modalPublicarTransportista'); 
}

function abrirModalNuevaIntermediacion() { 
  document.getElementById('im-id').value = 'INT-' + Date.now(); 
  document.getElementById('im-fecha').value = new Date().toISOString().split('T')[0]; 
  document.getElementById('im-tarifa-dador').value = 0; 
  document.getElementById('im-tarifa-transp').value = 0; 
  document.getElementById('im-comision').value = 0; 
  abrirModalNativo('modalIntermediacion'); 
}

// EDICIÓN Y ELIMINACIÓN DE CARGAS
function editarCarga(idCarga) {
  const c = bolsaCargasGuardadas.find(item => String(item.id) === String(idCarga));
  if(!c) return alert("Carga no encontrada.");
  
  document.getElementById('bc-id').value = c.id;
  document.getElementById('bc-origen').value = c.origen || '';
  document.getElementById('bc-destino').value = c.destino || '';
  document.getElementById('bc-vehiculo').value = c.vehiculo || 'Furgón';
  document.getElementById('bc-peso').value = c.peso || '';
  document.getElementById('bc-estado').value = c.estado || 'Disponible';
  document.getElementById('bc-tarifa').value = c.tarifa || 0;
  document.getElementById('bc-contacto').value = c.contacto || '';
  document.getElementById('bc-tel').value = c.telefono || '';
  document.getElementById('bc-desc').value = c.descripcion || '';
  
  abrirModalNativo('modalPublicarCarga');
}

function eliminarCarga(idCarga) {
  if(confirm("¿Estás seguro de eliminar esta carga de la base?")) {
    window.MotorNivel9.eliminarCargaEnBase(idCarga);
  }
}

function guardarCargasEnBase() {
  const payload = { 
    id: document.getElementById('bc-id').value, 
    origen: document.getElementById('bc-origen').value, 
    destino: document.getElementById('bc-destino').value, 
    vehiculo: document.getElementById('bc-vehiculo').value, 
    peso: document.getElementById('bc-peso').value, 
    estado: document.getElementById('bc-estado').value,
    tarifa: parseFloat(document.getElementById('bc-tarifa').value)||0, 
    contacto: document.getElementById('bc-contacto').value, 
    telefono: document.getElementById('bc-tel').value, 
    descripcion: document.getElementById('bc-desc').value,
    drive_links: (cargaAbiertaActual && cargaAbiertaActual.id === document.getElementById('bc-id').value) ? cargaAbiertaActual.drive_links : ''
  };
  if(!payload.origen || !payload.destino || !payload.contacto) { alert("Faltan datos obligatorios de la carga."); return; }
  window.MotorNivel9.guardarCargaEnBase(payload);
}

// EDICIÓN Y ELIMINACIÓN DE TRANSPORTISTAS
function editarTransportista(idTransp) {
  const tr = transportistasGuardados.find(t => String(t.id) === String(idTransp));
  if(!tr) return alert("Transportista no encontrado.");

  document.getElementById('rt-id').value = tr.id;
  document.getElementById('rt-nombre').value = tr.nombre || '';
  document.getElementById('rt-tel').value = tr.telefono || '';
  document.getElementById('rt-tipo').value = tr.tipo || 'Furgón';
  document.getElementById('rt-ubicacion').value = tr.ubicacion || '';
  
  if(document.getElementById('rt-marca-modelo')) document.getElementById('rt-marca-modelo').value = tr.marca_modelo || tr.marcamodelo || '';
  if(document.getElementById('rt-carroceria')) document.getElementById('rt-carroceria').value = tr.carroceria || 'Furgón Cerrado / Paquetero';
  
  document.getElementById('rt-capacidad').value = tr.capacidad || '';
  document.getElementById('rt-patente').value = tr.patente || '';
  if(document.getElementById('rt-patente-acoplado')) document.getElementById('rt-patente-acoplado').value = tr.patente_acoplado || tr.patenteacoplado || '';

  abrirModalNativo('modalPublicarTransportista');
}

function eliminarTransportista(idTransp) {
  if(confirm("¿Estás seguro de eliminar este transportista de la red?")) {
    window.MotorNivel9.eliminarTransportistaEnBase(idTransp);
  }
}

function guardarTransportistaEnBase() {
  const payload = { 
    id: document.getElementById('rt-id').value, 
    nombre: document.getElementById('rt-nombre').value, 
    telefono: document.getElementById('rt-tel').value, 
    tipo: document.getElementById('rt-tipo').value, 
    ubicacion: document.getElementById('rt-ubicacion').value, 
    marca_modelo: document.getElementById('rt-marca-modelo') ? document.getElementById('rt-marca-modelo').value : '',
    carroceria: document.getElementById('rt-carroceria') ? document.getElementById('rt-carroceria').value : '',
    capacidad: document.getElementById('rt-capacidad').value, 
    patente: document.getElementById('rt-patente').value,
    patente_acoplado: document.getElementById('rt-patente-acoplado') ? document.getElementById('rt-patente-acoplado').value : ''
  };
  if(!payload.nombre || !payload.telefono || !payload.ubicacion) { alert("Faltan datos obligatorios del transportista."); return; }
  window.MotorNivel9.guardarTransportistaEnBase(payload);
}

// RENDERIZADO DE CARGAS CON EDICIÓN Y ELIMINACIÓN
function renderBolsaCargas() {
  const container = document.getElementById('bolsaCargasCardsContainer');
  if(!container) return;
  const o = (document.getElementById('bc-filter-origen')?.value || '').toLowerCase();
  const d = (document.getElementById('bc-filter-destino')?.value || '').toLowerCase();
  const v = document.getElementById('bc-filter-vehiculo')?.value || 'Todos';
  const est = document.getElementById('bc-filter-estado')?.value || 'Todos';

  let arr = bolsaCargasGuardadas.filter(c => 
    (v === 'Todos' || c.vehiculo === v) && 
    (est === 'Todos' || (String(c.estado || 'Disponible').replace(/\s+/g,'').toUpperCase() === String(est).replace(/\s+/g,'').toUpperCase())) &&
    (c.origen||'').toLowerCase().includes(o) && 
    (c.destino||'').toLowerCase().includes(d)
  );

  container.innerHTML = arr.length === 0 ? '<p style="color:#71717a; grid-column:span 2;">No hay cargas registradas con estos filtros.</p>' : arr.map(c => `
    <div class="broker-card card-status-${String(c.estado || 'Disponible').replace(/\s+/g,'')}">
      <div class="broker-card-header">
        <div class="broker-route"><i class="fas fa-map-marker-alt" style="color:var(--brand);"></i> ${c.origen} <i class="fas fa-arrow-right" style="color:#a1a1aa; font-size:0.8rem;"></i> ${c.destino}</div>
        <span class="contact-badge">${c.vehiculo}</span>
      </div>
      <div style="font-size:0.88rem; color:#52525b;"><i class="fas fa-box"></i> <b>Carga:</b> ${c.descripcion || c.peso || 'Carga General'}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
        <div><span style="font-size:0.8rem; color:#71717a;">Tarifa Ofertada:</span><div class="broker-price">$${Number(c.tarifa||0).toLocaleString('es-AR')}</div></div>
        
        <select onchange="cambiarEstadoCargaRapido('${c.id}', this.value)" style="padding:4px 8px; border-radius:6px; font-weight:800; font-size:0.78rem; cursor:pointer;" class="status-badge status-${String(c.estado || 'Disponible').replace(/\s+/g,'')}">
          <option value="Disponible" ${c.estado === 'Disponible' ? 'selected' : ''}>🔵 Disponible</option>
          <option value="ASIGNADA" ${c.estado === 'ASIGNADA' ? 'selected' : ''}>🟡 Asignada</option>
          <option value="En Tránsito" ${c.estado === 'En Tránsito' ? 'selected' : ''}>🟠 En Tránsito</option>
          <option value="Entregada" ${c.estado === 'Entregada' ? 'selected' : ''}>🟢 Entregada</option>
          <option value="Cancelada" ${c.estado === 'Cancelada' ? 'selected' : ''}>🔴 Cancelada</option>
        </select>
      </div>

      <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:4px; margin-top:10px;">
        <button class="btn btn-dark" style="padding:6px 2px; font-size:0.72rem;" title="Ficha" onclick="abrirFichaOperacion('${c.id}')"><i class="fas fa-folder-open"></i> Ficha</button>
        <button class="btn btn-outline-dark" style="padding:6px 2px; font-size:0.72rem;" title="Editar" onclick="editarCarga('${c.id}')"><i class="fas fa-edit"></i> Editar</button>
        <button class="btn btn-purple" style="padding:6px 2px; font-size:0.72rem;" title="PDF" onclick="generarPdfCarga('${c.id}')"><i class="fas fa-file-pdf"></i> PDF</button>
        <button class="btn btn-success" style="padding:6px 2px; font-size:0.72rem;" title="Difundir" onclick="difundirCargaWA('${c.id}')"><i class="fab fa-whatsapp"></i> Difundir</button>
        <button class="btn btn-danger" style="padding:6px 2px; font-size:0.72rem;" title="Eliminar" onclick="eliminarCarga('${c.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}

function cambiarEstadoCargaRapido(idCarga, nuevoEstado) {
  const carga = bolsaCargasGuardadas.find(c => String(c.id) === String(idCarga));
  if(!carga) return;
  carga.estado = nuevoEstado;
  window.MotorNivel9.guardarCargaEnBase(carga);
}

function generarPdfCarga(idCarga) {
  const c = bolsaCargasGuardadas.find(item => String(item.id) === String(idCarga));
  if(!c) return alert("Carga no encontrada.");

  const html = `
    <div style="padding: 25px; font-family: 'Outfit', sans-serif; color: #111; background: white; border: 2px solid #ea580c; border-radius: 12px; box-sizing: border-box;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #ea580c; padding-bottom:15px; margin-bottom:20px;">
        <div>
          <h1 style="color:#ea580c; margin:0; font-size:24px; font-weight:900;">NIVEL 9 LOGÍSTICA</h1>
          <p style="margin:2px 0; font-size:12px; color:#555;">FICHA TÉCNICA DE REQUERIMIENTO LOGÍSTICO</p>
        </div>
        <div style="text-align:right;">
          <span style="background:#111; color:white; padding:6px 12px; border-radius:6px; font-weight:bold; font-size:12px;">${c.id}</span>
          <p style="margin:5px 0 0; font-size:11px; color:#777;">Emisión: ${new Date().toLocaleDateString('es-AR')}</p>
        </div>
      </div>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold; width:30%;">Dador / Empresa:</td><td style="padding:8px; border-bottom:1px solid #ddd;">${c.contacto || '-'}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Origen:</td><td style="padding:8px; border-bottom:1px solid #ddd; color:#0284c7; font-weight:bold;">${c.origen}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Destino:</td><td style="padding:8px; border-bottom:1px solid #ddd; color:#16a34a; font-weight:bold;">${c.destino}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Tipo de Unidad:</td><td style="padding:8px; border-bottom:1px solid #ddd;">${c.vehiculo}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Detalle / Carga:</td><td style="padding:8px; border-bottom:1px solid #ddd;">${c.descripcion || c.peso || 'Carga General'}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Tarifa Ofertada:</td><td style="padding:8px; border-bottom:1px solid #ddd; font-size:16px; font-weight:bold; color:#ea580c;">$${Number(c.tarifa||0).toLocaleString('es-AR')}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Estado Operativo:</td><td style="padding:8px; border-bottom:1px solid #ddd;"><b>${c.estado || 'Disponible'}</b></td></tr>
      </table>
      <div style="margin-top:30px; font-size:10px; color:#777; text-align:center; border-top:1px solid #ddd; padding-top:10px;">
        Nivel 9 Logística & Brokerage | Tel: +54 9 351 704 6541 | Lino Spilimbergo 7100, Córdoba, Argentina
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  html2pdf().set({
    margin: 10, filename: `FichaCarga_${c.id}.pdf`, image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(container).save().then(() => document.body.removeChild(container));
}

// DIFUSIÓN LIMPIA POR WHATSAPP (SIN LINK DE ENCABEZADO)
function difundirCargaWA(idCarga) {
  const c = bolsaCargasGuardadas.find(item => String(item.id) === String(idCarga));
  if(!c) return alert("Carga no encontrada.");

  const msg = `🚚 *OFERTA DE CARGA - NIVEL 9 BROKERAGE* 📦\n\n📍 *Origen:* ${c.origen}\n🏁 *Destino:* ${c.destino}\n🚛 *Requerimiento:* ${c.vehiculo}\n📦 *Carga:* ${c.descripcion || c.peso || 'Carga General'}\n💵 *Tarifa Ofertada:* $${Number(c.tarifa||0).toLocaleString('es-AR')}\n\n👉 *Postulate o Consultá al Despacho:* https://nivel9logistica.github.io/portal-publico.html/`;
  
  window.open('https://wa.me/?text=' + encodeURIComponent(msg));
}

function abrirFichaOperacion(cargaId) {
  cargaAbiertaActual = bolsaCargasGuardadas.find(c => String(c.id) === String(cargaId));
  if(!cargaAbiertaActual) return;
  
  cargaAbiertaActual.drive_links = cargaAbiertaActual.drive_links || '';
  
  document.getElementById('fo-id-carga').innerText = cargaAbiertaActual.id;
  document.getElementById('fo-dador').innerText = cargaAbiertaActual.contacto || cargaAbiertaActual.dador || '';
  document.getElementById('fo-origen').innerText = cargaAbiertaActual.origen || '';
  document.getElementById('fo-destino').innerText = cargaAbiertaActual.destino || '';
  document.getElementById('fo-desc').innerText = cargaAbiertaActual.descripcion || cargaAbiertaActual.peso || '';
  document.getElementById('fo-cobro').value = cargaAbiertaActual.tarifa || 0;
  
  document.getElementById('fo-select-chofer').innerHTML = '<option value="">-- Buscar Camión en Red --</option>' + transportistasGuardados.map(t => {
    const detalleAuto = (t.marca_modelo || t.marcamodelo || '') + (t.carroceria ? ' | ' + t.carroceria : '');
    const patSemi = (t.patente_acoplado || t.patenteacoplado) ? ' | Semi: ' + (t.patente_acoplado || t.patenteacoplado) : '';
    return `<option value="${t.id}">${t.nombre} - ${t.tipo} ${detalleAuto ? '('+detalleAuto+')' : ''} [Pat: ${t.patente||'S/P'}${patSemi}]</option>`;
  }).join('');

  if(String(cargaAbiertaActual.estado).toUpperCase() === 'ASIGNADA' || String(cargaAbiertaActual.estado).toUpperCase() === 'EN TRÁNSITO') {
    document.getElementById('fo-seccion-asignar').style.display = 'none';
    document.getElementById('fo-seccion-chofer').style.display = 'block';
    const intm = intermediacionesGuardadas.find(i => String(i.id) === 'ITM-' + cargaAbiertaActual.id);
    
    if(intm) {
       document.getElementById('fo-chofer-nombre').innerText = intm.transportista || '';
       document.getElementById('fo-pago').value = intm.tarifatransp || 0;
       document.getElementById('fo-cond-chofer-libre').value = intm.condChoferLibre || '';
       document.getElementById('fo-cond-dador-libre').value = intm.condDadorLibre || '';
       const transp = transportistasGuardados.find(t => String(t.nombre) === String(intm.transportista));
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
  
  document.getElementById('fo-boveda-links').innerHTML = cargaAbiertaActual.drive_links; 
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
  
  window.MotorNivel9.guardarCargaEnBase(cargaAbiertaActual);
  
  const payloadIntm = {
    id: 'ITM-' + cargaAbiertaActual.id, 
    fecha: new Date().toISOString().split('T')[0], 
    dador: cargaAbiertaActual.contacto || cargaAbiertaActual.dador || '', 
    transportista: transp.nombre, 
    tramo: `${cargaAbiertaActual.origen} -> ${cargaAbiertaActual.destino}`, 
    tarifadador: cobro, 
    tarifatransp: pago, 
    comision: cobro - pago, 
    estado: 'En Curso',
    condChoferLibre: document.getElementById('fo-cond-chofer-libre').value, 
    condDadorLibre: document.getElementById('fo-cond-dador-libre').value
  };
  
  window.MotorNivel9.guardarIntermediacionEnBase(payloadIntm);
  telChoferAsignado = transp.telefono;
  abrirFichaOperacion(cargaAbiertaActual.id); 
  alert("¡Carga Asignada exitosamente!");
}

function enviarWhatsAppGPS() {
  if(!telChoferAsignado) return alert("El transportista no tiene teléfono configurado.");
  const orig = cargaAbiertaActual.origen || ''; 
  const dest = cargaAbiertaActual.destino || '';
  const linkO = `https://maps.google.com/?q=${encodeURIComponent(orig)}`; 
  const linkD = `https://maps.google.com/?q=${encodeURIComponent(dest)}`;
  
  let msg = `🚚 *ORDEN DE CARGA Y RUTA GPS - NIVEL 9*\n\n📍 *Retira en:* ${orig}\n🌐 *GPS Origen:* ${linkO}\n\n📍 *Entrega en:* ${dest}\n🌐 *GPS Destino:* ${linkD}\n\n📦 *Detalle:* ${cargaAbiertaActual.descripcion || 'Carga General'}\n💵 *Tarifa Acordada Chofer:* $${Number(document.getElementById('fo-pago').value).toLocaleString('es-AR')}\n\n📝 *ACUERDOS FIJOS DE OPERACIÓN:*\n${ACUERDO_FIJO_CHOFER}\n`;
  const condLibre = document.getElementById('fo-cond-chofer-libre').value;
  if(condLibre) msg += `\n*Condiciones Adicionales:* ${condLibre}\n`;
  msg += `\nPor favor, confirmame recepción de esta orden.`;
  
  window.open('https://wa.me/549' + telChoferAsignado.replace(/\D/g,'') + '?text=' + encodeURIComponent(msg));
}

function enviarWhatsAppDador3PL() {
  if(!cargaAbiertaActual) return;
  const telDador = cargaAbiertaActual.telefono || '';
  if(!telDador) return alert("El dador de carga no tiene teléfono registrado.");

  const intm = intermediacionesGuardadas.find(i => String(i.id) === 'ITM-' + cargaAbiertaActual.id);
  const nombreChofer = intm ? intm.transportista : 'Chofer Asignado';
  const transpObj = transportistasGuardados.find(t => String(t.nombre) === String(nombreChofer));

  let detalleVehiculo = cargaAbiertaActual.vehiculo;
  let patTractora = 'Validada';
  let patAcoplado = '';

  if (transpObj) {
    const mm = transpObj.marca_modelo || transpObj.marcamodelo || '';
    const carroc = transpObj.carroceria || '';
    if (mm || carroc) detalleVehiculo += ` (${mm} ${carroc ? '- ' + carroc : ''})`;
    patTractora = transpObj.patente || 'Validada';
    if(transpObj.patente_acoplado || transpObj.patenteacoplado) patAcoplado = transpObj.patente_acoplado || transpObj.patenteacoplado;
  }

  let msg = `🛡️ *CONFIRMACIÓN DE UNIDAD ASIGNADA - NIVEL 9* 🚚\n\nEstimado/a *${cargaAbiertaActual.contacto || 'Cliente'}*:\nNos complacemos en informar que la unidad requerida para el tramo *${cargaAbiertaActual.origen} ➔ ${cargaAbiertaActual.destino}* ha sido asignada y validada.\n\n👤 *Chofer / Transporte:* ${nombreChofer}\n🚛 *Especificación Unidad:* ${detalleVehiculo}\n🆔 *Patente Tractor:* ${patTractora}\n${patAcoplado ? '🆔 *Patente Semi/Acoplado:* ' + patAcoplado + '\n' : ''}📋 *Estatus:* Chofer y Unidad Habilitados (LiNTI / Póliza Vigente)\n\nCualquier novedad sobre el arribo a planta será notificada de inmediato por esta vía. Gracias por confiar en Nivel 9.`;

  window.open('https://wa.me/549' + telDador.replace(/\D/g,'') + '?text=' + encodeURIComponent(msg));
}

async function subirArchivoBoveda(inputId, btnId) {
  const input = document.getElementById(inputId); 
  const btn = document.getElementById(btnId);
  if (!input.files || input.files.length === 0) return alert("Seleccioná un archivo o foto.");
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...'; btn.disabled = true;
  try {
    const file = input.files[0];
    const base64 = await new Promise((rs, rj) => { const rd = new FileReader(); rd.readAsDataURL(file); rd.onload = () => rs(rd.result.split(',')[1]); rd.onerror = e => rj(e); }); 
    const res = await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: "uploadFileDrive", fileName: `${cargaAbiertaActual.id}_${file.name}`, mimeType: file.type, base64Data: base64 }) }); 
    const d = await res.json(); 
    if(d.success) { 
      const linkHtml = `<div style="background:#e0f2fe; padding:8px; border-radius:6px; border:1px solid #7dd3fc;"><a href="${d.fileUrl}" target="_blank" style="color:#0284c7; font-weight:bold; text-decoration:none;"><i class="fas fa-external-link-alt"></i> Ver Documento / Foto Book: ${file.name}</a></div>`;
      cargaAbiertaActual.drive_links = (cargaAbiertaActual.drive_links || '') + linkHtml;
      document.getElementById('fo-boveda-links').innerHTML = cargaAbiertaActual.drive_links; 
      input.value = ""; 
      window.MotorNivel9.guardarCargaEnBase(cargaAbiertaActual);
    } else alert("Error de Drive: " + d.error);
  } catch(e) { alert("Error de conexión al subir imagen."); } finally { btn.innerHTML = 'Subir a Drive'; btn.disabled = false; }
}

// RENDERIZADO DE TRANSPORTISTAS CON BOTONES DE EDICIÓN Y ELIMINACIÓN
function renderTransportistas() {
  const container = document.getElementById('transportistasCardsContainer');
  if(!container) return;
  const u = (document.getElementById('rt-filter-ubicacion')?.value || '').toLowerCase();
  const t = document.getElementById('rt-filter-tipo')?.value || 'Todos';

  let arr = transportistasGuardados.filter(tr => (t === 'Todos' || tr.tipo === t) && (tr.ubicacion||'').toLowerCase().includes(u));
  container.innerHTML = arr.length === 0 ? '<p style="color:#71717a; grid-column:span 2;">No hay transportistas registrados.</p>' : arr.map(tr => {
    const marcaModelo = tr.marca_modelo || tr.marcamodelo || 'Sin especificar';
    const carroceria = tr.carroceria || 'General / Estándar';
    const patAcoplado = tr.patente_acoplado || tr.patenteacoplado || '-';

    return `
    <div class="broker-card">
      <div class="broker-card-header">
        <div class="broker-route"><i class="fas fa-truck" style="color:#10b981;"></i> ${tr.nombre}</div>
        <span class="contact-badge" style="background:#dcfce7; color:#15803d;">${tr.tipo}</span>
      </div>
      <div style="font-size:0.88rem; color:#52525b;"><i class="fas fa-map-pin"></i> <b>Ubicación/Retorno:</b> ${tr.ubicacion}</div>
      <div style="font-size:0.85rem; color:#111827; margin-top:4px;"><i class="fas fa-shuttle-van"></i> <b>Modelo:</b> ${marcaModelo}</div>
      <div style="font-size:0.85rem; color:#ea580c; font-weight:700; margin-top:2px;"><i class="fas fa-box-open"></i> <b>Carrocería:</b> ${carroceria}</div>
      <div style="font-size:0.82rem; color:#71717a; margin-top:2px;"><i class="fas fa-id-card"></i> <b>Pat. Tractor:</b> ${tr.patente || '-'} | <b>Semi:</b> ${patAcoplado}</div>
      <div style="font-size:0.82rem; color:#71717a; margin-top:2px;"><i class="fas fa-weight-hanging"></i> Capacidad: ${tr.capacidad || 'No especificada'}</div>
      
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:4px; margin-top:10px;">
        <button class="btn btn-success" style="padding:6px 2px; font-size:0.75rem;" title="Chat WA" onclick="window.open('https://wa.me/549' + '${(tr.telefono||'').replace(/\D/g,'')}' + '?text=' + encodeURIComponent('Hola ${tr.nombre}, te contacto desde Nivel 9'))"><i class="fab fa-whatsapp"></i> Chat</button>
        <button class="btn btn-outline-dark" style="padding:6px 2px; font-size:0.75rem;" title="Editar" onclick="editarTransportista('${tr.id}')"><i class="fas fa-edit"></i> Editar</button>
        <button class="btn btn-purple" style="padding:6px 2px; font-size:0.75rem;" title="PDF" onclick="generarPdfTransportista('${tr.id}')"><i class="fas fa-file-pdf"></i> PDF</button>
        <button class="btn btn-danger" style="padding:6px 2px; font-size:0.75rem;" title="Eliminar" onclick="eliminarTransportista('${tr.id}')"><i class="fas fa-trash"></i> Borrar</button>
      </div>
    </div>`;
  }).join('');
}

// GENERADOR PDF DOSSIER TRANSPORTISTA EN 1 SOLA HOJA A4 PERFECTA
function generarPdfTransportista(idTransp) {
  const tr = transportistasGuardados.find(t => String(t.id) === String(idTransp));
  if(!tr) return alert("Transportista no encontrado.");

  const marcaModelo = tr.marca_modelo || tr.marcamodelo || 'No declarada';
  const carroceria = tr.carroceria || 'General / Estándar';
  const patAcoplado = tr.patente_acoplado || tr.patenteacoplado || 'No aplica / Sin declarar';

  const html = `
    <div style="width: 100%; max-width: 700px; height: 950px; margin: 0 auto; padding: 25px; font-family: 'Outfit', sans-serif; color: #111; background: white; border: 2px solid #10b981; border-radius: 12px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #10b981; padding-bottom:12px; margin-bottom:15px;">
          <div>
            <h1 style="color:#10b981; margin:0; font-size:22px; font-weight:900;">NIVEL 9 RED DE TRANSPORTISTAS</h1>
            <p style="margin:2px 0; font-size:11px; color:#555;">DOSSIER TÉCNICO DE UNIDAD Y CHOFER VALIDADO</p>
          </div>
          <div style="text-align:right;">
            <span style="background:#111; color:white; padding:5px 10px; border-radius:6px; font-weight:bold; font-size:11px;">${tr.id}</span>
          </div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:15px; font-size:12px;">
          <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold; width:38%;">Transportista / Titular:</td><td style="padding:8px; border-bottom:1px solid #ddd;">${tr.nombre}</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Teléfono de Contacto:</td><td style="padding:8px; border-bottom:1px solid #ddd;">${tr.telefono}</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Tipo de Unidad:</td><td style="padding:8px; border-bottom:1px solid #ddd; color:#0284c7; font-weight:bold;">${tr.tipo}</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Marca / Modelo / Año:</td><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">${marcaModelo}</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Carrocería / Equipamiento:</td><td style="padding:8px; border-bottom:1px solid #ddd; color:#ea580c; font-weight:bold;">${carroceria}</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Ubicación / Base:</td><td style="padding:8px; border-bottom:1px solid #ddd;">${tr.ubicacion}</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Capacidad / Especialidad:</td><td style="padding:8px; border-bottom:1px solid #ddd;">${tr.capacidad || 'No declarada'}</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Patente Tractora:</td><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold; color:#111827;">${tr.patente || 'En trámite / S/P'}</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Patente Acoplado / Semi:</td><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold; color:#111827;">${patAcoplado}</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Validación Nivel 9:</td><td style="padding:8px; border-bottom:1px solid #ddd; color:#16a34a; font-weight:bold;">Conductores Validados / Documentación en Regla</td></tr>
        </table>
      </div>
      <div style="font-size:10px; color:#777; text-align:center; border-top:1px solid #ddd; padding-top:8px;">
        Nivel 9 Logística de Excelencia | Operador Verificado
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  html2pdf().set({
    margin: 8, filename: `DossierTransportista_${tr.nombre.replace(/\s+/g,'_')}.pdf`, image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(container).save().then(() => document.body.removeChild(container));
}

// PRESENTAR CHOFER COMPLETO POR WHATSAPP CON UTF-8
function presentarChoferWA(idTransp) {
  const tr = transportistasGuardados.find(t => String(t.id) === String(idTransp));
  if(!tr) return alert("Transportista no encontrado.");

  const marcaModelo = tr.marca_modelo || tr.marcamodelo || 'A confirmar';
  const carroceria = tr.carroceria || 'General';
  const patAcoplado = tr.patente_acoplado || tr.patenteacoplado || 'No aplica';

  const msg = `🚛 *PRESENTACIÓN DE UNIDAD Y CHOFER - NIVEL 9* 🛡️\n\n👤 *Transportista:* ${tr.nombre}\n🚚 *Tipo de Unidad:* ${tr.tipo}\n🏎️ *Modelo:* ${marcaModelo}\n📦 *Carrocería:* ${carroceria}\n🆔 *Patente Tractor:* ${tr.patente || 'A confirmar'}\n🆔 *Patente Semi/Acoplado:* ${patAcoplado}\n⚖️ *Capacidad:* ${tr.capacidad || 'General'}\n📍 *Ubicación Actual:* ${tr.ubicacion}\n\n📋 *Certificación:* Licencia Profesional LiNTI y Documentación al día.`;
  
  window.open('https://wa.me/?text=' + encodeURIComponent(msg));
}

function renderIntermediaciones() {
  const tbody = document.getElementById('tablaIntermediacionesBody');
  if(!tbody) return;
  let totComision = 0, totVolumen = 0, ops = intermediacionesGuardadas.length;
  
  tbody.innerHTML = intermediacionesGuardadas.length === 0 ? '<tr><td colspan="9" style="text-align:center; color:#71717a;">Sin intermediaciones registradas.</td></tr>' : intermediacionesGuardadas.map(im => {
    totComision += (Number(im.comision)||0);
    totVolumen += (Number(im.tarifadador)||0);
    const est = im.estado || 'En Curso';
    return `<tr>
      <td><strong>${im.id}</strong></td>
      <td>${(im.fecha||'').split('-').reverse().join('/')}</td>
      <td><strong>${im.dador}</strong></td>
      <td>${im.transportista}</td>
      <td><span class="status-badge status-${String(est).replace(/\s+/g,'')}" style="padding:4px 8px; border-radius:6px; font-weight:800; color:white;">${est}</span></td>
      <td style="color:#0284c7; font-weight:700;">$${Number(im.tarifadador||0).toLocaleString('es-AR')}</td>
      <td style="color:#dc2626;">$${Number(im.tarifatransp||0).toLocaleString('es-AR')}</td>
      <td style="color:#8b5cf6; font-weight:900;">$${Number(im.comision||0).toLocaleString('es-AR')}</td>
      <td>
        <div style="display:flex; gap:4px;">
          <button class="btn btn-dark" style="padding:4px 8px; font-size:0.75rem;" onclick="imprimirOrdenFlete('${im.id}')"><i class="fas fa-print"></i> Orden</button>
          <button class="btn btn-purple" style="padding:4px 8px; font-size:0.75rem;" onclick="generarExpediente3PL('${im.id}')"><i class="fas fa-file-pdf"></i> Expediente</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const elCom = document.getElementById('kpi-broker-comision'); if(elCom) elCom.textContent = `$${totComision.toLocaleString('es-AR')}`;
  const elOps = document.getElementById('kpi-broker-ops'); if(elOps) elOps.textContent = ops;
  const elVol = document.getElementById('kpi-broker-volumen'); if(elVol) elVol.textContent = `$${totVolumen.toLocaleString('es-AR')}`;
}

function generarExpediente3PL(idOp) {
  const op = intermediacionesGuardadas.find(i => String(i.id) === String(idOp));
  if(!op) return alert("Operación 3PL no encontrada.");

  const html = `
    <div style="padding: 30px; font-family: 'Outfit', sans-serif; color: #111; background: white; border: 2px solid #8b5cf6; border-radius: 12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #8b5cf6; padding-bottom:15px; margin-bottom:20px;">
        <div>
          <h1 style="color:#8b5cf6; margin:0; font-size:24px; font-weight:900;">EXPEDIENTE DE BROKERAGE 3PL</h1>
          <p style="margin:2px 0; font-size:12px; color:#555;">NIVEL 9 LOGÍSTICA & CONSOLIDACIÓN DE CARGAS</p>
        </div>
        <div style="text-align:right;">
          <span style="background:#111; color:white; padding:6px 12px; border-radius:6px; font-weight:bold; font-size:12px;">${op.id}</span>
        </div>
      </div>
      <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold; width:35%;">Fecha de Operación:</td><td style="padding:8px; border-bottom:1px solid #ddd;">${(op.fecha||'').split('-').reverse().join('/')}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Empresa Dadora de Carga:</td><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">${op.dador}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Transportista / Chofer:</td><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">${op.transportista}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Tramo / Recorrido:</td><td style="padding:8px; border-bottom:1px solid #ddd; color:#0284c7; font-weight:bold;">${op.tramo}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Tarifa Facturada a Dador:</td><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold; color:#0284c7;">$${Number(op.tarifadador||0).toLocaleString('es-AR')}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Tarifa Liquidada a Chofer:</td><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold; color:#dc2626;">$${Number(op.tarifatransp||0).toLocaleString('es-AR')}</td></tr>
        <tr><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold;">Margen Bruto Intermediación:</td><td style="padding:8px; border-bottom:1px solid #ddd; font-weight:bold; color:#8b5cf6; font-size:16px;">$${Number(op.comision||0).toLocaleString('es-AR')}</td></tr>
      </table>
      <div style="background:#f4f4f5; padding:12px; border-radius:8px; font-size:11px; margin-bottom:15px;">
        <b>Acuerdo Comercial Fijo:</b> ${ACUERDO_FIJO_CHOFER}
      </div>
      <div style="margin-top:20px; font-size:10px; color:#777; text-align:center; border-top:1px solid #ddd; padding-top:10px;">
        Expediente generado por Plataforma Nivel 9 | Documento Interno Confidencial
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  html2pdf().set({
    margin: 10, filename: `Expediente3PL_${op.id}.pdf`, image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(container).save().then(() => document.body.removeChild(container));
}

function calcularComisionBroker() {
  const dador = parseFloat(document.getElementById('im-tarifa-dador').value) || 0;
  const transp = parseFloat(document.getElementById('im-tarifa-transp').value) || 0;
  document.getElementById('im-comision').value = dador - transp;
}

function guardarIntermediacionEnBase() {
  calcularComisionBroker();
  const payload = { 
    id: document.getElementById('im-id').value, 
    fecha: document.getElementById('im-fecha').value, 
    dador: document.getElementById('im-dador').value, 
    transportista: document.getElementById('im-transportista').value, 
    tramo: document.getElementById('im-tramo').value, 
    estado: document.getElementById('im-estado').value,
    tarifadador: parseFloat(document.getElementById('im-tarifa-dador').value)||0, 
    tarifatransp: parseFloat(document.getElementById('im-tarifa-transp').value)||0, 
    comision: parseFloat(document.getElementById('im-comision').value)||0 
  };
  if(!payload.dador || !payload.transportista) { alert("Completar partes del acuerdo."); return; }
  window.MotorNivel9.guardarIntermediacionEnBase(payload);
}

function imprimirOrdenFlete(idOp) {
  const op = intermediacionesGuardadas.find(i => String(i.id) === String(idOp));
  if(!op) return;
  alert(`GENERANDO ORDEN DE FLETE Y CARGA 3PL:\n\nOperación: ${op.id}\nTransportista: ${op.transportista}\nDador: ${op.dador}\nTramo: ${op.tramo}\nTarifa Chofer: $${op.tarifatransp}`);
}

function filtrarBolsaCargas() { renderBolsaCargas(); }
function limpiarFiltrosCargas() { document.getElementById('bc-filter-origen').value = ''; document.getElementById('bc-filter-destino').value = ''; document.getElementById('bc-filter-vehiculo').value = 'Todos'; document.getElementById('bc-filter-estado').value = 'Todos'; renderBolsaCargas(); }
function filtrarTransportistas() { renderTransportistas(); }
function limpiarFiltrosTransportistas() { document.getElementById('rt-filter-ubicacion').value = ''; document.getElementById('rt-filter-tipo').value = 'Todos'; renderTransportistas(); }

// ==========================================
// 5. DIRECTORIO Y AJUSTES DE FLOTA
// ==========================================
function toggleProvFields() { const cat = document.getElementById('cnt-categoria').value; document.getElementById('prov-dinamico').style.display = (cat === 'Proveedor' || cat === 'Chofer') ? 'block' : 'none'; }
function openContactFormModal() { document.getElementById('contactForm').reset(); document.getElementById('cnt-id').value = 'CNT-' + Date.now(); toggleProvFields(); abrirModalNativo('modalContactForm'); }

function guardarContactoManual() { 
  const cat = document.getElementById('cnt-categoria').value;
  const payload = { 
    id: document.getElementById('cnt-id').value, 
    categoria: cat, 
    nombre: document.getElementById('cnt-nombre').value, 
    telefono: document.getElementById('cnt-tel').value, 
    observaciones: document.getElementById('cnt-obs').value, 
    provtipo: (cat === 'Proveedor' || cat === 'Chofer') ? document.getElementById('cnt-prov-tipo').value : '', 
    provflota: (cat === 'Proveedor' || cat === 'Chofer') ? document.getElementById('cnt-prov-flota').value : '' 
  }; 
  if(!payload.nombre || !payload.telefono) { alert("Faltan datos obligatorios del contacto."); return; } 
  window.MotorNivel9.crearContactoEnBaseDeDatos(payload); 
}

function renderContactos() {
  const q = (document.getElementById('cnt-filter-search')?.value || '').toLowerCase(); 
  const cat = document.getElementById('cnt-filter-categoria')?.value || 'Todas';
  const arr = contactosGuardados.filter(c => (cat === 'Todas' || c.categoria === cat) && ((c.nombre||'').toLowerCase().includes(q) || String(c.telefono||'').includes(q)));
  
  const container = document.getElementById('contactListContainer');
  if(!container) return;
  container.innerHTML = arr.length === 0 ? '<p style="color:#71717a;">Sin contactos en el directorio.</p>' : arr.map(c => `
    <div class="contact-card" style="background:white; padding:15px; border-radius:12px; border:1px solid #d4d4d8;">
      <div style="display:flex; justify-content:space-between; align-items:center;"><strong style="font-size:1.05rem;">${c.nombre}</strong><span class="contact-badge">${c.categoria}</span></div>
      <div style="color:#52525b; margin-top:5px; font-size:0.9rem;"><i class="fas fa-phone"></i> ${c.telefono}</div>
      ${c.observaciones ? `<div style="font-size:0.82rem; color:#71717a; margin-top:6px;"><em>"${c.observaciones}"</em></div>` : ''}
      ${(c.categoria === 'Proveedor' || c.categoria === 'Chofer') ? `<div style="font-size:0.78rem; margin-top:6px; background:var(--brand-light); padding:5px; border-radius:6px; color:var(--brand);"><b>Rol:</b> ${c.provtipo || '-'} | <b>Vehículo:</b> ${c.provflota || '-'}</div>` : ''}
      <button class="btn btn-success" style="width:100%; margin-top:8px; padding:6px;" onclick="window.open('https://wa.me/549' + '${String(c.telefono||'').replace(/\D/g,'')}')"><i class="fab fa-whatsapp"></i> Chat</button>
    </div>`).join('');
}

function inyectarFiltrosDeInformes() { 
  const cnt = document.getElementById('rep-tipos-container'); 
  if(!cnt) return;
  const tipos = configuracionNivel9.tipos && configuracionNivel9.tipos.length > 0 ? configuracionNivel9.tipos : ["Cargas Generales"]; 
  cnt.innerHTML = tipos.map(t => `<label class="checkbox-group"><input type="checkbox" class="chk-filtro-tipo" value="${t}" checked style="width:15px; height:15px;"> ${t}</label>`).join(''); 
}

function generarReporteDatos() {
  const start = document.getElementById('rep-start').value; 
  const end = document.getElementById('rep-end').value; 
  const est = document.getElementById('rep-estado').value; 
  const t = Array.from(document.querySelectorAll('.chk-filtro-tipo:checked')).map(c => c.value);
  
  let f = eventosGuardados.filter(ev => t.includes(ev.tipomov));
  if(start) f = f.filter(ev => ev.fecha >= start); 
  if(end) f = f.filter(ev => ev.fecha <= end); 
  if(est !== 'Todos') f = f.filter(ev => String(ev.estado).toUpperCase() === est.toUpperCase());
  f.sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
  
  document.getElementById('reportTableBody').innerHTML = f.map(ev => {
    const p = Number(ev.presupuesto) || 0; 
    const cF = (Number(ev.combustible)||0) + (Number(ev.peajescosto)||0) + (Number(ev.viaticos)||0) + (Number(ev.ayudante)||0) + (Number(ev.comision)||0); 
    const gE = Number(ev.gastoext) || 0; 
    const n = p - (cF + gE); 
    const m = p > 0 ? ((n / p) * 100).toFixed(1) : 0;
    
    return `<tr class="${m < 30 ? 'row-alert' : ''}">
      <td style="text-align:center;"><input type="checkbox" class="chk-linea-informe" data-t="${p}" data-c="${cF}" data-e="${gE}" data-n="${n}" checked onchange="recalcularTotalesPanelKpi()" style="width:15px; height:15px; cursor:pointer;"></td>
      <td>${(ev.fecha||'').split('-').reverse().join('/')}</td>
      <td><strong>${ev.cliente}</strong></td>
      <td>${ev.tipomov || '-'}</td>
      <td style="font-weight:700;">$${p.toLocaleString('es-AR')}</td>
      <td style="color:#dc2626;">$${cF.toLocaleString('es-AR')}</td>
      <td style="color:#ea580c; font-weight:700;">$${gE.toLocaleString('es-AR')}</td>
      <td style="font-weight:900; color:#16a34a;">$${n.toLocaleString('es-AR')}</td>
      <td style="color:${m < 30 ? '#dc2626' : '#16a34a'}; font-weight:900;">${m}%</td>
    </tr>`;
  }).join('');
  
  document.getElementById('kpiDashboardContainer').style.display = 'grid'; 
  document.getElementById('reportTablePanel').style.display = 'block'; 
  document.getElementById('chk-all-rows').checked = true; 
  recalcularTotalesPanelKpi();
}

function toggleAllRowsReporte() { const mst = document.getElementById('chk-all-rows').checked; document.querySelectorAll('.chk-linea-informe').forEach(c => c.checked = mst); recalcularTotalesPanelKpi(); }

function recalcularTotalesPanelKpi() {
  let v = 0, b = 0, c = 0, n = 0; 
  document.querySelectorAll('.chk-linea-informe:checked').forEach(x => { 
    v++; 
    b += parseFloat(x.dataset.t); 
    c += (parseFloat(x.dataset.c) + parseFloat(x.dataset.e)); 
    n += parseFloat(x.dataset.n); 
  });
  const elV = document.getElementById('kpi-tot-viajes'); if(elV) elV.textContent = v; 
  const elB = document.getElementById('kpi-tot-ingresos'); if(elB) elB.textContent = `$${b.toLocaleString('es-AR')}`; 
  const elC = document.getElementById('kpi-tot-costos'); if(elC) elC.textContent = `$${c.toLocaleString('es-AR')}`; 
  const elN = document.getElementById('kpi-tot-utilidad'); if(elN) elN.textContent = `$${n.toLocaleString('es-AR')}`;
}

function exportarExcelPuroNumeros() {
  const cb = document.querySelectorAll('.chk-linea-informe:checked'); 
  if(cb.length === 0) { alert("Nada para exportar."); return; }
  const dataExcel = []; 
  cb.forEach(c => { 
    const f = c.closest('tr'); 
    dataExcel.push({ 
      "Fecha": f.cells[1].innerText, 
      "Cliente": f.cells[2].innerText, 
      "Tipo de Servicio": f.cells[3].innerText, 
      "Tarifa Bruta ($)": parseFloat(c.dataset.t), 
      "Costos Fijos ($)": parseFloat(c.dataset.c), 
      "Gastos Extraordinarios ($)": parseFloat(c.dataset.e), 
      "Utilidad Neta ($)": parseFloat(c.dataset.n), 
      "Margen": f.cells[8].innerText 
    }); 
  });
  const ws = XLSX.utils.json_to_sheet(dataExcel); 
  const wb = XLSX.utils.book_new(); 
  XLSX.utils.book_append_sheet(wb, ws, "Informes Nivel 9"); 
  XLSX.writeFile(wb, "Reporte_Nivel9_Finanzas.xlsx");
}

function imprimirReporte() {
    const cb = document.querySelectorAll('.chk-linea-informe:checked');
    if(cb.length === 0) { alert("No hay movimientos seleccionados para imprimir."); return; }

    document.getElementById('pdf-report-fecha-doc').innerText = new Date().toLocaleDateString('es-AR');
    let filasHtml = '';
    cb.forEach(c => {
        const tr = c.closest('tr');
        filasHtml += `
            <tr style="page-break-inside: avoid; border-bottom: 1px solid #e4e4e7;">
                <td style="padding: 10px;">${tr.cells[1].innerText}</td>
                <td style="padding: 10px;"><strong>${tr.cells[2].innerText}</strong></td>
                <td style="padding: 10px;">${tr.cells[3].innerText}</td>
                <td style="padding: 10px; font-weight:bold;">${tr.cells[4].innerText}</td>
                <td style="padding: 10px; color: #dc2626;">${tr.cells[5].innerText}</td>
                <td style="padding: 10px; color: #ea580c;">${tr.cells[6].innerText}</td>
                <td style="padding: 10px; font-weight: bold; color: #16a34a;">${tr.cells[7].innerText}</td>
                <td style="padding: 10px;">${tr.cells[8].innerText}</td>
            </tr>
        `;
    });
    
    document.getElementById('pdf-report-tbody').innerHTML = filasHtml;

    html2pdf().set({
      margin: 12, filename: `Reporte_Nivel9_Finanzas_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, windowWidth: 1122 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: 'avoid-all' }
    }).from(document.getElementById('pdf-report-content')).save();
}

function openConfigModal() { dibujarListasConfig(); abrirModalNativo('modalConfig'); }
function dibujarListasConfig() { const iny = (arr, id, clv) => { const el = document.getElementById(id); if(el) el.innerHTML = arr.map((item, i) => `<div class="settings-item">${item} <button class="btn btn-danger" style="padding:4px 8px;" onclick="eliminarItemAjustes('${clv}', ${i})"><i class="fas fa-trash"></i></button></div>`).join(''); }; iny(configuracionNivel9.flota, 'lista-unidades-config', 'flota'); iny(configuracionNivel9.tipos, 'lista-tipos-config', 'tipos'); }
function agregarItemAjustes(c, i) { const el = document.getElementById(i); if(!el) return; const v = el.value.trim(); if(v) { configuracionNivel9[c].push(v); el.value = ''; dibujarListasConfig(); } }
function eliminarItemAjustes(c, i) { configuracionNivel9[c].splice(i, 1); dibujarListasConfig(); }
function guardarAjustes() { configuracionNivel9.diesel = document.getElementById('cfg-diesel').value; localStorage.setItem('nivel9_config', JSON.stringify(configuracionNivel9)); actualizarListasDesplegables(); const el = document.getElementById('rep-tipos-container'); if(el) el.innerHTML = ''; cerrarModalesNativos(); alert("Ajustes guardados exitosamente."); }
function actualizarListasDesplegables() { const opF = configuracionNivel9.flota.map(f => `<option value="${f}">${f}</option>`).join(''); const opT = configuracionNivel9.tipos.map(t => `<option value="${t}">${t}</option>`).join(''); document.querySelectorAll('.dinamico-flota').forEach(e => e.innerHTML = opF); document.querySelectorAll('.dinamico-tipos').forEach(e => e.innerHTML = opT); }

// ==========================================
// 6. GENERACIÓN DE COMPROBANTES Y PDF
// ==========================================
function obtenerSiguienteNumeroDoc(tipo) {
    let maxSeq = 0; let prefix = tipo === 'Empresa' ? 'DOC-01-' : 'DOC-02-'; let baseSeq = tipo === 'Empresa' ? 303 : 135;
    eventosGuardados.forEach(e => { if (e.nrodoc && typeof e.nrodoc === 'string' && e.nrodoc.startsWith(prefix)) { let num = parseInt(e.nrodoc.replace(prefix, ''), 10); if (!isNaN(num) && num > maxSeq) { maxSeq = num; } } });
    let nextDbSeq = Math.max(baseSeq, maxSeq + 1);
    let localKey = tipo === 'Empresa' ? 'nivel9_seq_empresa' : 'nivel9_seq_particular'; let localSeq = parseInt(localStorage.getItem(localKey)) || 0;
    let finalSeq = Math.max(nextDbSeq, localSeq); return prefix + String(finalSeq).padStart(6, '0');
}

function actualizarNumeroComprobante() { let tipo = document.getElementById('pres-tipo-cliente-doc').value; document.getElementById('pres-nro').value = obtenerSiguienteNumeroDoc(tipo); }
function incrementarNumeroDoc(tipo) { let current = obtenerSiguienteNumeroDoc(tipo); let num = parseInt(current.split('-')[2], 10); let localKey = tipo === 'Empresa' ? 'nivel9_seq_empresa' : 'nivel9_seq_particular'; localStorage.setItem(localKey, num + 1); }

function openPresupuestoModal() { 
  document.getElementById('pres-import-select').innerHTML = '<option value="">-- Cargar un movimiento ya agendado (Opcional) --</option>' + eventosGuardados.map(e => `<option value="${e.id}">${(e.fecha||'').split('-').reverse().join('/')} - ${e.cliente}</option>`).join(''); 
  actualizarNumeroComprobante(); 
  document.getElementById('pres-fecha').value = new Date().toISOString().split('T')[0]; 
  document.getElementById('pres-tarifa-hora').value = ''; 
  document.getElementById('pres-base-minima').value = ''; 
  document.getElementById('pres-detalle-tarifa').value = '';
  abrirModalNativo('modalPresupuesto'); 
}

function cargarDatosEnPresupuesto() { 
  const v = eventosGuardados.find(e => String(e.id) === String(document.getElementById('pres-import-select').value)); 
  if(!v) return; 
  if(v.tipocliente === 'Empresa') { document.getElementById('pres-tipo-cliente-doc').value = 'Empresa'; } else { document.getElementById('pres-tipo-cliente-doc').value = 'Particular'; }
  actualizarNumeroComprobante();
  document.getElementById('pres-cliente').value = v.cliente; 
  document.getElementById('pres-origen').value = v.origen || ''; 
  document.getElementById('pres-destino').value = v.destino || ''; 
  
  let invTxt = v.inventario || v.detalles || v.descripcion || '';
  document.getElementById('pres-desc').value = invTxt.replace(/<br\s*[\/]?>/gi, "\n"); 
  
  document.getElementById('pres-obs-ruta').value = v.obsruta || ''; 
  document.getElementById('pres-total').value = v.presupuesto || 0; 
  document.getElementById('pres-sena').value = v.sena || 0; 
  document.getElementById('pres-tarifa-hora').value = v.tarifahora || ''; 
  document.getElementById('pres-base-minima').value = v.baseminima || ''; 
  document.getElementById('pres-detalle-tarifa').value = v.detalletarifa || '';
}

function generarHojaRutaDirecta() { mapearDatosFichaHaciaDocumento(); generarPDFBase('HojaRuta'); }
function generarPresupuestoDirecto() { mapearDatosFichaHaciaDocumento(); generarPDFBase('Presupuesto'); }

function mapearDatosFichaHaciaDocumento() {
  document.getElementById('pres-fecha').value = document.getElementById('ev-fecha').value; 
  if(document.getElementById('ev-tipocliente').value === 'Empresa') { document.getElementById('pres-tipo-cliente-doc').value = 'Empresa'; } else { document.getElementById('pres-tipo-cliente-doc').value = 'Particular'; }
  actualizarNumeroComprobante(); 
  document.getElementById('pres-cliente').value = document.getElementById('ev-cliente').value; 
  document.getElementById('pres-origen').value = document.getElementById('ev-origen').value; 
  document.getElementById('pres-destino').value = document.getElementById('ev-destino').value; 
  document.getElementById('pres-desc').value = document.getElementById('ev-inventario').value; 
  document.getElementById('pres-obs-ruta').value = document.getElementById('ev-obs-ruta').value; 
  document.getElementById('pres-total').value = document.getElementById('ev-presupuesto').value; 
  document.getElementById('pres-sena').value = document.getElementById('ev-sena').value; 
  document.getElementById('pres-tarifa-hora').value = document.getElementById('ev-tarifa-hora').value; 
  document.getElementById('pres-base-minima').value = document.getElementById('ev-base-minima').value; 
  document.getElementById('pres-detalle-tarifa').value = document.getElementById('ev-detalle-tarifa').value;
}

function generarPDFBase(tipoDocumento) { 
  document.getElementById('pdf-nro').innerText = document.getElementById('pres-nro').value; 
  document.getElementById('pdf-lugar-fecha').innerText = `Córdoba, ${document.getElementById('pres-fecha').value.split('-').reverse().join('/')}`; 
  document.getElementById('pdf-cliente').innerText = document.getElementById('pres-cliente').value; 
  document.getElementById('pdf-cuit').innerText = document.getElementById('pres-cuit').value || 'Consumidor Final'; 
  document.getElementById('pdf-origen').innerText = document.getElementById('pres-origen').value; 
  document.getElementById('pdf-destino').innerText = document.getElementById('pres-destino').value; 
  
  let inventarioTexto = document.getElementById('pres-desc').value || '';
  document.getElementById('pdf-desc').innerHTML = inventarioTexto.replace(/\n/g, '<br>'); 
  
  if (tipoDocumento === 'HojaRuta') {
      document.getElementById('pdf-title-text').innerText = "HOJA DE RUTA OPERATIVA"; 
      document.getElementById('pdf-finanzas-section').style.display = 'none'; 
      document.getElementById('pdf-terminos-section').style.display = 'none'; 
      document.getElementById('pdf-obs-ruta-section').style.display = 'block';
      let obsValor = document.getElementById('pres-obs-ruta').value.trim(); 
      document.getElementById('pdf-obs-ruta-text').innerText = obsValor !== "" ? obsValor : "No se registraron observaciones adicionales para este viaje.";
  } else {
      document.getElementById('pdf-title-text').innerText = "PRESUPUESTO DE SERVICIO"; 
      document.getElementById('pdf-finanzas-section').style.display = 'block'; 
      document.getElementById('pdf-terminos-section').style.display = 'block'; 
      document.getElementById('pdf-obs-ruta-section').style.display = 'none';
      document.getElementById('pdf-total').innerText = document.getElementById('pres-total').value; 
      document.getElementById('pdf-sena').innerText = document.getElementById('pres-sena').value; 
      
      let tHora = document.getElementById('pres-tarifa-hora').value; 
      let bMin = document.getElementById('pres-base-minima').value; 
      let detTar = document.getElementById('pres-detalle-tarifa').value;
      
      if (tHora || bMin || detTar) { 
        document.getElementById('pdf-desglose-tarifa').style.display = 'block'; 
        document.getElementById('pdf-detalle-texto').innerText = detTar || "-"; 
        if(tHora) { document.getElementById('pdf-th-container').style.display = 'inline-block'; document.getElementById('pdf-tarifa-hora').innerText = tHora; } else { document.getElementById('pdf-th-container').style.display = 'none'; } 
        if(bMin) { document.getElementById('pdf-bm-container').style.display = 'inline-block'; document.getElementById('pdf-base-minima').innerText = bMin; } else { document.getElementById('pdf-bm-container').style.display = 'none'; }
      } else { 
        document.getElementById('pdf-desglose-tarifa').style.display = 'none'; 
      }

      let tipoCli = document.getElementById('pres-tipo-cliente-doc').value;
      let firmasHTML = `<div style="margin-top: 25px; display: flex; justify-content: flex-start; align-items: center; gap: 30px; padding-top: 15px; page-break-inside: avoid;"><div style="text-align: left; font-size: 12px; font-weight: bold; color: #111; line-height: 1.6;">CEO / Administrador<br>Rodrigo J. Castro<br>Nivel 9 Logística de Excelencia</div><div><svg width="160" height="60" viewBox="0 0 180 70" xmlns="http://www.w3.org/2000/svg"><path d="M30,50 C10,50 15,35 30,30 C50,25 60,35 45,55 C35,70 10,65 35,50 L170,10" stroke="#111" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M75,55 Q85,45 90,60 Q95,65 105,60" stroke="#111" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></div></div>`;
      
      if (tipoCli === 'Empresa') { 
        document.getElementById('pdf-terms-text').innerHTML = `<strong style="font-size:11px; color:#ea580c; text-transform:uppercase;">Términos y Condiciones Legales (Servicio Corporativo):</strong><br><div style="font-size:8.5px; text-align:justify; margin-top:4px; color:#333; line-height:1.35;">El presente presupuesto tiene una validez de 10 (diez) días corridos desde su fecha de emisión. La tarifa cotizada contempla la operación de transporte punto a punto; no incluye tiempos de espera, demoras o estadías prolongadas superiores a 2 (dos) horas en los puntos de carga y/o descarga. De superarse dicha franja horaria, se facturará un recargo en concepto de 'Estadía' por cada hora adicional y por unidad asignada. El servicio se ejecuta con unidades de flota certificadas, choferes habilitados (LiNTI) y pólizas de seguro de carga vigentes. La facturación correspondiente se emite bajo condición fiscal Monotributo (Factura C - CUIT: 20-24691221-2). El pago del servicio deberá efectuarse bajo las condiciones acordadas contra entrega del Remito y/o Hoja de Ruta debidamente conformada.</div>${firmasHTML}`;
      } else { 
        document.getElementById('pdf-terms-text').innerHTML = `<strong style="font-size:11px; color:#ea580c; text-transform:uppercase;">Términos y Condiciones Generales del Servicio</strong><br><div style="font-size:8px; text-align:justify; margin-top:4px; color:#333; line-height:1.35;"><strong>1. Aceptación del Servicio y Reserva:</strong> La confirmación del servicio y la fijación de la fecha y horario estipulados en el presupuesto se harán efectivas únicamente mediante el abono de la seña acordada. El pago de dicha seña implica la lectura, comprensión y aceptación total de los presentes términos.<br><strong>2. Declaración de Carga y Modificaciones:</strong> El presupuesto emitido se basa exclusivamente en la información proporcionada por el cliente. Si el día del servicio el volumen o la complejidad excede lo declarado (ej: desarmes no previstos, izajes), Nivel 9 se reserva el derecho de ajustar el valor final o negarse a trasladar el excedente.<br><strong>3. Accesos, Permisos y Consorcios:</strong> Es responsabilidad exclusiva del cliente gestionar permisos de estacionamiento y coordinar con consorcios (horarios, uso de ascensores). Cualquier demora derivada de la falta de permisos será facturada como tiempo de espera.<br><strong>4. Embalaje y Daños:</strong> Nivel 9 no se hace responsable por roturas de objetos en cajas embaladas por el cliente. Solo responderemos por bienes acondicionados por nuestro personal. Reclamos por daños deben realizarse al finalizar la descarga, antes de que el personal se retire.<br><strong>5. Exclusión de Objetos de Valor:</strong> El cliente asume total responsabilidad por el traslado de dinero, joyas, obras de arte o tecnología. Nivel 9 queda exenta de responsabilidad ante la pérdida de estos bienes.<br><strong>6. Cancelación y Fuerza Mayor:</strong> Cancelaciones con menos de 48 horas de anticipación implicarán la pérdida total de la seña. Nivel 9 se reserva el derecho de reprogramar sin penalidad ante situaciones de fuerza mayor.<br><strong>7. Jurisdicción:</strong> Para cualquier controversia, las partes se someten a los Tribunales Ordinarios de la Ciudad de Córdoba.</div>${firmasHTML}`; 
      }
  }
  
  let nombreFinal = tipoDocumento === 'HojaRuta' ? `HojaDeRuta_${document.getElementById('pres-cliente').value}.pdf` : `Presupuesto_${document.getElementById('pres-cliente').value}.pdf`;
  if (tipoDocumento === 'Presupuesto') { incrementarNumeroDoc(document.getElementById('pres-tipo-cliente-doc').value); }
  if (document.getElementById('modalEventForm').style.display === 'flex') { document.getElementById('ev-nrodoc').value = document.getElementById('pres-nro').value; }

  setTimeout(() => {
    html2pdf().set({ margin: 0, filename: nombreFinal, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, windowWidth: 793 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(document.getElementById('pdf-template-content')).save(); 
  }, 300);
}

// ==========================================
// 7. PUENTE GLOBAL DE CONEXIÓN CON SERVIDOR
// ==========================================
window.MotorNivel9 = {
  crearViajeEnBaseDeDatos: async function(payload) { 
    const idx = eventosGuardados.findIndex(e => String(e.id) === String(payload.id)); 
    if(idx >= 0) { eventosGuardados[idx] = payload; } else { eventosGuardados.push(payload); }
    
    if(payload.telefono && !contactosGuardados.find(c => c.telefono === payload.telefono)) { 
      this.crearContactoEnBaseDeDatos({ id: 'CNT-' + Date.now(), categoria: payload.tipocliente || 'Particular', nombre: payload.cliente, telefono: payload.telefono, observaciones: '', provtipo: '', provflota: '' }); 
    } 
    cerrarModalesNativos(); 
    dibujarCalendarioMes(); 
    try { await fetch(webAppUrl, { method: 'POST', body: JSON.stringify(payload) }); } catch(e) {} 
  },
  
  eliminarViajeEnBaseDeDatos: async function(id) { 
    eventosGuardados = eventosGuardados.filter(e => String(e.id) !== String(id)); 
    cerrarModalesNativos(); 
    dibujarCalendarioMes(); 
    try { await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'deleteEvent', id: id }) }); } catch(e) {} 
  },
  
  crearContactoEnBaseDeDatos: async function(payload) { 
    const idx = contactosGuardados.findIndex(c => String(c.id) === String(payload.id)); 
    if(idx >= 0) { contactosGuardados[idx] = payload; } else { contactosGuardados.push(payload); } 
    cerrarModalesNativos(); 
    renderContactos(); 
    try { await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'saveContact', ...payload }) }); } catch(e) {} 
  },
  
  guardarCargaEnBase: async function(payload) {
    const idx = bolsaCargasGuardadas.findIndex(c => String(c.id) === String(payload.id)); 
    if(idx >= 0) { bolsaCargasGuardadas[idx] = payload; } else { bolsaCargasGuardadas.push(payload); }
    cerrarModalesNativos(); 
    renderBolsaCargas();
    try { await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'saveCarga', ...payload }) }); } catch(e) {}
  },

  eliminarCargaEnBase: async function(id) {
    bolsaCargasGuardadas = bolsaCargasGuardadas.filter(c => String(c.id) !== String(id));
    cerrarModalesNativos();
    renderBolsaCargas();
    try { await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'deleteCarga', id: id }) }); } catch(e) {}
  },
  
  guardarTransportistaEnBase: async function(payload) {
    const idx = transportistasGuardados.findIndex(t => String(t.id) === String(payload.id)); 
    if(idx >= 0) { transportistasGuardados[idx] = payload; } else { transportistasGuardados.push(payload); }
    cerrarModalesNativos(); 
    renderTransportistas();
    try { await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'saveTransportista', ...payload }) }); } catch(e) {}
  },

  eliminarTransportistaEnBase: async function(id) {
    transportistasGuardados = transportistasGuardados.filter(t => String(t.id) !== String(id));
    cerrarModalesNativos();
    renderTransportistas();
    try { await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'deleteTransportista', id: id }) }); } catch(e) {}
  },
  
  guardarIntermediacionEnBase: async function(payload) {
    const idx = intermediacionesGuardadas.findIndex(i => String(i.id) === String(payload.id)); 
    if(idx >= 0) { intermediacionesGuardadas[idx] = payload; } else { intermediacionesGuardadas.push(payload); }
    cerrarModalesNativos(); 
    renderIntermediaciones();
    try { await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: 'saveIntermediacion', ...payload }) }); } catch(e) {}
  },

  parsearMensajeWhatsappCarga: async function() {
    const txt = document.getElementById('bc-raw-text').value.trim();
    if(!txt) return alert("Pegá un texto de WhatsApp para analizar.");
    alert("Marina IA procesando solicitud...");
    
    const promptParser = `Extrae datos de esta solicitud de flete de WhatsApp: "${txt}". Responde en JSON estricto con campos: origen, destino, vehiculo, peso, contacto, telefono.`;
    try {
      const res = await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: "consultaMarina", prompt: promptParser }) });
      const data = await res.json();
      if(data.success) {
        abrirModalNuevaCarga();
        document.getElementById('bc-desc').value = "Extraído por Marina IA:\n" + txt;
      }
    } catch(e) {
      abrirModalNuevaCarga();
      document.getElementById('bc-desc').value = txt;
    }
  },

  procesarChatMarina: async function() { 
    const i = document.getElementById('marina-prompt-input'); 
    const b = document.getElementById('marina-chat-response'); 
    const t = i.value.trim(); 
    if(!t) return; 
    
    b.innerHTML = `<strong>Rodri:</strong> ${t}<br><br>⏳ <em>Marina evaluando solicitud...</em>`; 
    i.value = ""; 
    
    const contextoFlota = configuracionNivel9.flota.join(', ');
    const costoDiesel = configuracionNivel9.diesel;
    const resumenAgenda = eventosGuardados.map(e => `[${e.fecha}] ${e.cliente} (${e.tipomov||'Flete'}) - $${e.presupuesto||0}`).join(' | ');

    const promptDirectivo = `Eres Marina, secretaria ejecutiva y asesora experta en logística/brokerage de Nivel 9 en Córdoba, Argentina. Tu jefe es el Lic. Rodrigo Castro. Sé amable, directa y resolutiva.\nFlota: ${contextoFlota}. Diésel: $${costoDiesel}/L. Agenda: ${resumenAgenda}.\nSolicitud de Rodri: "${t}"`;

    try { 
        const res = await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: "consultaMarina", prompt: promptDirectivo }) }); 
        const inf = await res.json(); 
        if (inf.success) {
            b.innerHTML = inf.result;
        } else {
            b.innerHTML = `⚠️ <strong>Error Servidor:</strong><br><br>${inf.error}`; 
        }
    } catch(e) { 
        b.innerHTML = "⚠️ Error de conexión con el servidor."; 
    } 
  },

  reconocimientoVoz: function() { 
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return alert("Reconocimiento de voz no soportado."); 
    const r = new (window.SpeechRecognition || window.webkitSpeechRecognition)(); 
    r.lang = 'es-AR'; 
    r.start(); 
    document.getElementById('marina-chat-response').innerHTML = "🎙️ <em>Escuchando orden...</em>"; 
    r.onresult = (e) => { 
      document.getElementById('marina-prompt-input').value = e.results[0][0].transcript; 
      this.procesarChatMarina(); 
    }; 
  },

  escanearCarga: async function() { 
    const i = document.getElementById('ev-marina-fotos'); 
    const b = document.getElementById('btn-ev-marina'); 
    if (!i.files || i.files.length === 0) return alert("Elegí una imagen primero."); 
    b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Evaluando...'; 
    b.disabled = true; 
    try { 
      const p = []; 
      for (let f of i.files) { 
        const c = await new Promise((rs, rj) => { const rd = new FileReader(); rd.readAsDataURL(f); rd.onload = () => rs(rd.result.split(',')[1]); rd.onerror = err => rj(err); }); 
        p.push({ mimeType: f.type, base64Data: c }); 
      } 
      const res = await fetch(webAppUrl, { method: 'POST', body: JSON.stringify({ action: "escaneoMarina", archivos: p }) }); 
      const d = await res.json(); 
      if(d.success && d.result) { 
        const inv = document.getElementById('ev-inventario'); 
        inv.value = inv.value ? inv.value + "\n\n--- MARINA IA ---\n" + d.result : d.result; 
      } else { alert("❌ Escáner falló: " + (d.error || "")); }
    } catch(e) { alert("Fallo de conexión con IA."); } finally { b.innerHTML = '<i class="fas fa-camera"></i> Extraer'; b.disabled = false; } 
  }
};

function abrirModalAsistenteIA() { cerrarModalesNativos(); document.getElementById('modalMarinaAsistente').style.display = 'flex'; }
