document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_KEY = 'ID_TOKEN';
  const readToken = () => sessionStorage.getItem(TOKEN_KEY);
  const saveToken = t => sessionStorage.setItem(TOKEN_KEY, t);

  const BASE_URL = 'https://connection-bd.onrender.com';
  const empleadosList = document.getElementById('empleados-list');
  const refreshBtn    = document.getElementById('refresh-btn');
  const panel         = document.getElementById('asistencias-panel');
  const modal         = document.getElementById('modal-detalle');
  const modalBody     = document.getElementById('modal-detalle-body');
  const modalTitulo   = document.getElementById('modal-titulo');
  const cerrarModal   = document.getElementById('cerrar-modal');

  // Estado global
  const state = { 
    empleados: {},     // empId => nombre
    asistencias: [],   // registros crudos
    diasSemana: [],    // ['2024-05-20', '2024-05-21', ...]
    selectedSemana: null
  };
  function fechaLocalISO(dt) {
    const date = new Date(dt._seconds * 1000 + ((dt._nanoseconds || 0) / 1e6));
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }


  function getDiasSemana(fechaReferencia = new Date()) {
    const dias = [];
    const ref = new Date(fechaReferencia);
    ref.setHours(0,0,0,0); // medianoche local

    // getDay(): 0=domingo, 1=lunes, ..., 6=sábado
    // Para que siempre parta el lunes:
    // Si hoy es domingo (0), retrocede 6 días. Si es lunes (1), retrocede 0, etc.
    const dayOfWeek = ref.getDay();
    // Calcula cuántos días retroceder para llegar al lunes
    const diff = (dayOfWeek + 6) % 7; 
    const lunes = new Date(ref);
    lunes.setDate(ref.getDate() - diff);
    lunes.setHours(0,0,0,0); // fuerza medianoche local

    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      dias.push(
        d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0')
      );
    }
    console.log('DEBUG semana lunes a domingo:', dias);
    return dias;
  }



  function setupEventos() {
    refreshBtn.addEventListener('click', cargarVista);
    cerrarModal.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }
  async function cargarSemanaCompleta() {
    // 1. Calcula los días de la semana y lunes (semanaInicio)
    state.diasSemana = getDiasSemana();
    const semanaInicio = state.diasSemana[0]; // lunes actual

    // 2. Carga los horarios de la semana
    await cargarHorarios(semanaInicio);

    // 3. Carga las asistencias y renderiza la tabla
    await cargarVista();
  }

  async function cargarVista() {
    panel.innerHTML = '<p>Cargando…</p>';
    try {
      let idToken = readToken();
      if (!idToken && window.authAPI) {
        idToken = await window.authAPI.getIdToken();
        saveToken(idToken);
      }
      const url = `${BASE_URL}/asistencia`;
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json();
      console.log('Datos recibidos:', data);

      // 1. Extraer empleados únicos
      const empMap = {};
      data.forEach(r => {
        if (r.empId) empMap[r.empId] = r.nombre || r.empId;
      });
      state.empleados = empMap;
      state.asistencias = data;
      state.diasSemana = getDiasSemana(); // Semana actual

      renderTablaResumen();
    } catch (err) {
      panel.innerHTML = `<p>Error al cargar: ${err.message}</p>`;
    }
  }

  function renderTablaResumen() {
    const { empleados, diasSemana, asistencias } = state;
    let html = `
      <table>
        <thead>
          <tr>
            <th>Empleado</th>
            ${diasSemana.map(date => `<th>${formatFechaCorta(date)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;
    Object.entries(empleados).forEach(([empId, nombre]) => {
      html += `<tr><td>${nombre}</td>`;
      diasSemana.forEach(dateStr => {
        // ¿Tiene al menos un registro ese día?
        const hayAsistencia = asistencias.some(r =>
          r.empId === empId &&
          r.timestamp &&
          r.timestamp._seconds &&
          fechaLocalISO(r.timestamp) === dateStr
        );
        html += `<td class="celda-dia" data-empid="${empId}" data-fecha="${dateStr}" style="cursor:pointer">${hayAsistencia ? '✔️' : '❌'}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    panel.innerHTML = html;

    // Listeners para detalles
    panel.querySelectorAll('.celda-dia').forEach(td => {
      td.addEventListener('click', () => mostrarDetalle(td.dataset.empid, td.dataset.fecha));
    });
  }
  async function cargarHorarios(semanaInicio) {
    const url = `${BASE_URL}/turnos-semanales/${semanaInicio}`;
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${readToken()}`
      }
    });
    if (!res.ok) throw new Error('Error al obtener horarios');
    const data = await res.json();
    // Guarda sólo el mapa de turnos para la semana
    state.horarios = (data && data.turnos) ? data.turnos : {};
  }

  function mostrarDetalle(empId, fecha) {
  console.log("==== DEBUG MODAL ====");
  console.log("Celda clickeada (fecha):", fecha);

  // Muestra todas las asistencias del usuario ese día (debug)
  state.asistencias.forEach(r => {
    const dt = new Date(r.timestamp._seconds * 1000 + ((r.timestamp._nanoseconds || 0) / 1e6));
    const fISO = fechaLocalISO(r.timestamp);
    console.log(`Registro: ${fISO} ${dt.toLocaleTimeString('es-CL')} (${dt.toISOString()})`, r.tipo);
  });

  let detalles = state.asistencias.filter(r =>
    r.empId === empId &&
    r.timestamp &&
    r.timestamp._seconds &&
    fechaLocalISO(r.timestamp) === fecha
  );

  // Ordena por hora
  const detallesOrdenados = [...detalles].sort((a, b) => {
    const tA = a.timestamp._seconds * 1000 + ((a.timestamp._nanoseconds || 0) / 1e6);
    const tB = b.timestamp._seconds * 1000 + ((b.timestamp._nanoseconds || 0) / 1e6);
    return tA - tB;
  });

  // Horarios de referencia del empleado para ese día
  const horariosEmp = (state.horarios[empId] && state.horarios[empId][fecha]) || {};
  const horaEntradaEsperada = horariosEmp.entrada || 'no definida';
  const horaSalidaEsperada  = horariosEmp.salida  || 'no definida';
  const horaColaInEsperada  = horariosEmp.entradaColar || 'no definida';
  const horaColaOutEsperada = horariosEmp.salidaColar  || 'no definida';

  modalTitulo.textContent = `Detalle de ${state.empleados[empId] || empId} - ${formatFechaLarga(fecha)}`;
  let body = '<ul>';

  // Inicializa los eventos
  let rEntrada = null, rColaIn = null, rColaOut = null, rSalida = null;

  // Lógica de asignación automática de marcas
  if (detallesOrdenados.length === 1) {
    rEntrada = detallesOrdenados[0];
  } else if (detallesOrdenados.length === 2) {
    rEntrada = detallesOrdenados[0];
    const t0 = detallesOrdenados[0].timestamp._seconds * 1000 + ((detallesOrdenados[0].timestamp._nanoseconds || 0) / 1e6);
    const t1 = detallesOrdenados[1].timestamp._seconds * 1000 + ((detallesOrdenados[1].timestamp._nanoseconds || 0) / 1e6);
    const diffH = Math.abs(t1 - t0) / 1000 / 3600;
    // Si la diferencia es >=4h, el 2do es salida; si no, entrada colación (caso raro, advertencia)
    if (diffH >= 4) {
      rSalida = detallesOrdenados[1];
    } else {
      rColaIn = detallesOrdenados[1];
    }
  } else if (detallesOrdenados.length === 3) {
    rEntrada = detallesOrdenados[0];
    rColaIn = detallesOrdenados[1];
    const t1 = detallesOrdenados[1].timestamp._seconds * 1000 + ((detallesOrdenados[1].timestamp._nanoseconds || 0) / 1e6);
    const t2 = detallesOrdenados[2].timestamp._seconds * 1000 + ((detallesOrdenados[2].timestamp._nanoseconds || 0) / 1e6);
    const diffHCola = Math.abs(t2 - t1) / 1000 / 3600;
    // Si diferencia 2da-3ra marca es corta (<2h): 3ra es salida colación. Si es larga, es salida normal
    if (diffHCola < 2) {
      rColaOut = detallesOrdenados[2];
    } else {
      rSalida = detallesOrdenados[2];
    }
  } else if (detallesOrdenados.length >= 4) {
    rEntrada  = detallesOrdenados[0];
    rColaIn   = detallesOrdenados[1];
    rColaOut  = detallesOrdenados[2];
    rSalida   = detallesOrdenados[3];
    // Si hay más de 4 marcas, puedes mostrar advertencia
    if (detallesOrdenados.length > 4) {
      body += `<li style="color: orange;"><b>Advertencia:</b> Hay más de 4 marcas este día. Solo se muestran las primeras 4.</li>`;
    }
  }

  // Renderiza cada evento
  function renderMarca(nombre, registro, esperado) {
    if (registro) {
      const dt = new Date(registro.timestamp._seconds * 1000 + ((registro.timestamp._nanoseconds || 0) / 1e6));
      return `<li><b>${nombre}:</b> ${dt.toLocaleTimeString('es-CL')} (${registro.tipo}) <span style="color:gray;">(esperada: ${esperado})</span></li>`;
    }
    return `<li><b>${nombre}:</b> <span style="color:red;">No registrada</span> <span style="color:gray;">(esperada: ${esperado})</span></li>`;
  }

  body += renderMarca('Entrada',          rEntrada, horaEntradaEsperada);
  body += renderMarca('Entrada a colar',  rColaIn,  horaColaInEsperada);
  body += renderMarca('Salida de colar',  rColaOut, horaColaOutEsperada);
  body += renderMarca('Salida',           rSalida,  horaSalidaEsperada);

  body += '</ul>';
  modalBody.innerHTML = body;
  modal.style.display = 'flex';
}

  // Formatear fecha: '2024-05-21' a 'Mar 21'
  function formatFechaCorta(iso) {
    // Forzar la fecha como local (no UTC)
    const [year, month, day] = iso.split('-');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return d.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit' });
  }
  // Formato largo
  function formatFechaLarga(iso) {
    // iso es '2025-05-21'
    const [year, month, day] = iso.split('-').map(Number);
    // Esto fuerza la creación como fecha local, sin UTC
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' });
  }

  // Inicializar
  setupEventos();
  cargarSemanaCompleta();
});
