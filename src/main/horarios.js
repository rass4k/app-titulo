const API_URL = "https://connection-bd.onrender.com";

let feriados = []; // se llenará desde API
let inicioSemana = new Date(); // Se actualizará dinámicamente


// Cargar feriados desde API
async function cargarFeriados() {
  try {
    const res = await fetch("https://api.boostr.cl/feriados");
    const data = await res.json();
    feriados = data.data.map(f => f.date.slice(0, 10)); // Asegura formato YYYY-MM-DD
    console.log("Feriados cargados:", feriados);
  } catch (err) {
    console.error("Error al cargar feriados:", err);
    feriados = []; // fallback vacío
  }
}

// Generar fechas reales de la semana
const dias = [];
const hoy = new Date();
const diaSemana = hoy.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
const diffALunes = diaSemana === 0 ? -6 : 1 - diaSemana; // domingo retrocede 6, martes retrocede 1, etc.
console.log('diflunes:', diffALunes);
hoy.setDate(hoy.getDate() + diffALunes);
console.log('hoy:', hoy);

const opcionesDiaTexto = { weekday: 'short' };
const opcionesFecha     = { day: '2-digit', month: '2-digit', year: '2-digit' };

for (let i = 0; i < 7; i++) {
  const fecha = new Date(hoy);
  fecha.setDate(hoy.getDate() + i);

  const diaTexto = fecha.toLocaleDateString('es-CL', opcionesDiaTexto);
  const fechaTexto = fecha.toLocaleDateString('es-CL', opcionesFecha);

  const nombreDia = diaTexto.charAt(0).toUpperCase() + diaTexto.slice(1, 3);
  const formatoVisible = `${nombreDia} ${fechaTexto.replace(/-/g, '/')}`;
  const formatoISO = toLocalISO(fecha);

  dias.push({
    texto: formatoVisible,
    iso: formatoISO,
    esDomingo: i === 6 // ← este es el domingo, garantizado
  });

}
function ajustarInicioASemanaLunes() {
  const dia = inicioSemana.getDay(); // 0 = dom, 1 = lun, ..., 6 = sab
  const diferencia = dia === 0 ? -6 : 1 - dia;
  inicioSemana.setDate(inicioSemana.getDate() + diferencia);
}
function generarDiasSemana() {
  dias.length = 0;

  for (let i = 0; i < 7; i++) {
    const fecha = new Date(inicioSemana);
    fecha.setDate(inicioSemana.getDate() + i);

    const diaTexto = fecha.toLocaleDateString('es-CL', opcionesDiaTexto);
    const fechaTexto = fecha.toLocaleDateString('es-CL', opcionesFecha);
    const nombreDia = diaTexto.charAt(0).toUpperCase() + diaTexto.slice(1, 3);
    const formatoVisible = `${nombreDia} ${fechaTexto.replace(/-/g, '/')}`;
    
    const formatoISO = toLocalISO(fecha);

    dias.push({ texto: formatoVisible, iso: formatoISO, esDomingo: i === 6 });
  }
}
const cuerpoTabla   = document.getElementById('cuerpo-tabla');
const modal         = document.getElementById('reloj-modal');
const inputEntrada  = document.getElementById('hora-entrada');
const inputSalida   = document.getElementById('hora-salida');
const btnGuardar    = document.getElementById('guardar-hora');
const btnVolver     = document.getElementById('volver');

const modalFijo      = document.getElementById('modal-fijo');
const btnAbrirFijo   = document.getElementById('btn-abrir-modal-fijo');
const inputFijoEnt   = document.getElementById('entrada-fija');
const inputFijoSal   = document.getElementById('salida-fija');
const btnAplicarFijo = document.getElementById('aplicar-fijo');

let empleados = [];
let celdaSeleccionada = null;



async function obtenerEmpleados() {
  const token = sessionStorage.getItem("ID_TOKEN");
  if (!token) {
    showToast('Sesión no iniciada o token no encontrado.', "error");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/empleados`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("No autorizado o error en el servidor");
    
    const data = await res.json();
    empleados = data;

    // Mantener la estructura del contenedor principal
    const mainContent = document.querySelector('main');
    mainContent.className = 'flex-1 p-4 overflow-x-auto';

    const contenedorTabla = document.querySelector('main > div');
    contenedorTabla.className = 'bg-darker rounded-xl border border-gray-700 overflow-hidden';
    
    // Configurar la tabla y su encabezado
    const tabla = document.getElementById('tabla-turnos');
    tabla.className = 'w-full table-fixed';
    
    const thead = tabla.querySelector('thead');
    thead.className = 'bg-gray-800';
    
    // Limpiar y configurar el tbody
    const tbody = document.getElementById('cuerpo-tabla');
    tbody.className = 'divide-y divide-gray-700';
    tbody.innerHTML = '';
    
    // Generar filas para cada empleado
    empleados.forEach(empleado => {
      const fila = document.createElement('tr');
      fila.className = 'divide-x divide-gray-700 hover:bg-gray-800 transition-colors';
      
      // Celda del nombre
      const celdaNombre = document.createElement('td');
      celdaNombre.className = 'p-3 font-medium text-gray-300 w-1/6';
      celdaNombre.textContent = empleado.nombre;
      fila.appendChild(celdaNombre);
      
      // Celdas de los días
      for (let i = 0; i < 7; i++) {
        const celdaDia = document.createElement('td');
        celdaDia.className = 'p-3 text-center w-1/7';
        celdaDia.innerHTML = `
          <div class="cursor-pointer py-1 px-2 rounded hover:bg-primary-transparent transition-all">
            <span class="text-xs text-gray-400">—</span>
          </div>
        `;
        fila.appendChild(celdaDia);
      }
      
      tbody.appendChild(fila);
    });

    // Llenar los selectores de empleados en los modales
    llenarSelectVacaciones();

  } catch (err) {
    console.error("Error al obtener empleados:", err);
    showToast('Error al cargar empleados', "error");
  }
}

function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()       ).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


function llenarSelectVacaciones() {
  const selectVac = document.getElementById('select-empleado-vac');
  selectVac.innerHTML = `<option value="all">— Todos —</option>` +
    empleados.map(emp => {
      const name = emp.nombre?.split(" ")[0] || "SinNombre";
      const id   = emp.empId || emp.id;
      return `<option value="${id}">${name}</option>`;
    }).join('');
}
let turnosSemana = {};  // guardará el objeto completo { turnos:{ empleadoId:{ fecha:{…} } } }

async function cargarSemana(fechaLunes) {
  const semanaISO = toLocalISO(fechaLunes);
        
  console.log('semana:', semanaISO);
  const res = await fetch(`${API_URL}/turnos-semanales/${semanaISO}`, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem("ID_TOKEN")}` }
  });
  // si no existe, res.json() será null
  const data = await res.json();
  turnosSemana = data?.turnos || {};  // si es null, asigna objeto vacío
}
function pintarTablaConTurnos() {
  cuerpoTabla.innerHTML = "";

  // Configurar la tabla principal
  const tabla = document.getElementById('tabla-turnos');
  tabla.className = 'w-full table-fixed';

  // Reconstruir encabezado
  const encabezado = document.querySelector("#tabla-turnos thead tr");
  encabezado.innerHTML = "<th class='p-3 text-left font-medium text-primary w-1/6'>Empleado</th>";
  dias.forEach(d => {
    const th = document.createElement("th");
    th.className = 'p-3 text-center font-medium w-1/7';
    th.textContent = d.texto;
    encabezado.appendChild(th);
  });

  empleados.forEach(emp => {
    const fila = document.createElement("tr");
    fila.className = 'divide-x divide-gray-700 hover:bg-gray-800 transition-colors';

    // Celda de nombre
    const tdNombre = document.createElement("td");
    const primerNombre = emp.nombre?.split(" ")[0] || "SinNombre";
    tdNombre.className = 'p-3 font-medium text-gray-300 w-1/6';
    tdNombre.textContent = primerNombre;
    tdNombre.dataset.empleadoId = emp.empId;
    fila.appendChild(tdNombre);

    // Sus 7 celdas
    dias.forEach(d => {
      const celda = document.createElement("td");
      celda.className = 'p-3 text-center w-1/7';
      celda.dataset.empleadoId = emp.empId;
      celda.dataset.fecha = d.iso;

      const turno = turnosSemana[emp.empId]?.[d.iso];
      if (turno) {
        if (turno.tipo === "turno") {
          celda.innerHTML = `<div class="cursor-pointer py-1 px-2 rounded hover:bg-primary-transparent transition-all">
            <span class="text-xs text-gray-400">${turno.entrada}/${turno.salida}</span>
          </div>`;
        } else if (turno.tipo === "vacaciones") {
          celda.innerHTML = `<div class="cursor-pointer py-1 px-2 rounded hover:bg-primary-transparent transition-all">
            <span class="text-xs text-gray-400">Vacaciones</span>
          </div>`;
          celda.classList.add("vacaciones");
        }
      } else {
        celda.innerHTML = `<div class="cursor-pointer py-1 px-2 rounded hover:bg-primary-transparent transition-all">
          <span class="text-xs text-gray-400">-</span>
        </div>`;
      }

      // Resto del código para feriados y eventos...
      const esFeriado = feriados.includes(d.iso);
      if (d.esDomingo || esFeriado) {
        celda.classList.add("dia-feriado");
        celda.title = esFeriado ? "Feriado" : "Domingo";
      }

      celda.addEventListener('click', () => {
        celdaSeleccionada = celda;
        inputEntrada.value = '';
        inputSalida.value = '';
        modal.style.display = 'block';
      });

      fila.appendChild(celda);
    });

    cuerpoTabla.appendChild(fila);
  });
}


async function actualizarSemana() {
  const semanaISO = toLocalISO(inicioSemana);
  console.log('Guardando/cargando semana:', semanaISO , inicioSemana);
  ajustarInicioASemanaLunes();
  generarDiasSemana();

  // 1) recarga los turnos de la nueva semana
  await cargarSemana(inicioSemana);

  // 2) pinta la tabla combinando turnos + empleados
  pintarTablaConTurnos();
}
function pad(n) {
  return String(n).padStart(2,'0');
}

function showToast(msg, tipo = "info", duracion = 3000) {
  const cont = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.textContent = msg;
  toast.style = `
    background: ${tipo === "error" ? "#dc3545"
               : tipo === "success" ? "#28a745"
               : "#333"};
    color: white;
    padding: 10px 14px;
    border-radius: 4px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    font-size: 14px;
    opacity: 0.9;
  `;
  cont.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = 0;
    setTimeout(() => cont.removeChild(toast), 500);
  }, duracion);
}

function construirTabla() {
  cuerpoTabla.innerHTML = '';

  const encabezado = document.querySelector("#tabla-turnos thead tr");
  encabezado.innerHTML = "<th>Empleado</th>";
  dias.forEach(d => {
    const th = document.createElement('th');
    th.textContent = d.texto;
    encabezado.appendChild(th);
  });

  empleados.forEach(emp => {
    const fila = document.createElement('tr');
    const primerNombre = emp.nombre?.split(" ")[0] || "SinNombre";

    // Celda de nombre
    const tdNombre = document.createElement('td');
    tdNombre.textContent = primerNombre;
    tdNombre.dataset.empleadoId = emp.empId || emp.id;
    fila.appendChild(tdNombre);

    // Celdas de cada día
    dias.forEach(d => {
      const celda = document.createElement('td');
      celda.dataset.empleadoId = emp.empId || emp.id;

      // ← Usamos directamente d.iso, sin re-convertirlo
      celda.dataset.fecha = d.iso;
      celda.textContent   = '—';

      // Marcar domingos y feriados
      const esDomingo  = d.esDomingo;
      const esFeriado = feriados.includes(d.iso);
      if (esDomingo || esFeriado) {
        celda.classList.add("dia-feriado");
        celda.title = esFeriado ? "Feriado" : "Domingo";
      }

      // Click para abrir modal de edición
      celda.addEventListener('click', () => {
        celdaSeleccionada = celda;
        inputEntrada.value = '';
        inputSalida.value  = '';
        modal.style.display = 'block';
      });

      fila.appendChild(celda);
    });

    cuerpoTabla.appendChild(fila);
  });
}


btnGuardar.addEventListener('click', () => {
  const entrada = inputEntrada.value;
  const salida  = inputSalida.value;

  if (!entrada || !salida || !celdaSeleccionada) return;
  if (entrada >= salida) {
    showToast('La hora de entrada debe ser anterior a la de salida.', "error");
    return;
  }

  celdaSeleccionada.classList.remove('vacaciones');
  celdaSeleccionada.innerHTML = `
    <div class="cursor-pointer py-1 px-2 rounded hover:bg-primary-transparent transition-all">
      <span class="text-xs text-gray-400">${entrada}/${salida}</span>
    </div>
  `;
  modal.style.display = 'none';
});

btnVolver.addEventListener('click', () => {
  window.history.back();
});
ajustarInicioASemanaLunes();
generarDiasSemana();
// 👇 Primero carga feriados, luego empleados
document.addEventListener("DOMContentLoaded", async () => {
  await cargarFeriados();
  await obtenerEmpleados();
  await cargarSemana(inicioSemana);  // inicioSemana es Date del lunes
  pintarTablaConTurnos();
});

btnAbrirFijo.addEventListener('click', () => {
  modalFijo.style.display = 'flex';
});

btnAplicarFijo.addEventListener('click', () => {
  const entrada = inputFijoEnt.value;
  const salida = inputFijoSal.value;
  const modo = document.querySelector('input[name="modo-aplicacion"]:checked').value;

  if (modo !== "libre" && (!entrada || !salida)) {
    showToast("Debes completar ambas horas.", "error");
    return;
  }

  if (modo !== "libre" && entrada >= salida) {
    showToast("La hora de entrada debe ser anterior a la de salida.", "error");
    return;
  }

  const celdas = document.querySelectorAll('#cuerpo-tabla td:not(:first-child)');

  let diaLibreSeleccionado = null;
  if (modo === "todos-excepto") {
    diaLibreSeleccionado = document.getElementById("dia-libre-semanal").value;
    if (diaLibreSeleccionado === "") {
      showToast("Debes seleccionar el día que será libre.", "error");
      return;
    }
  }

  celdas.forEach(celda => {
    const fecha = celda.dataset.fecha;
    const [y, m, d] = fecha.split('-');
    const dia = new Date(Number(y), Number(m) - 1, Number(d));
    const diaNum = dia.getDay();
    const esFeriado = feriados.includes(fecha);
    const esDiaLibre = (modo === "todos-excepto" && diaNum === Number(diaLibreSeleccionado));
  
    let aplicar = false;
  
    switch (modo) {
      case "todos":
        aplicar = true;
        break;
      case "habiles":
        aplicar = diaNum >= 1 && diaNum <= 5 && !esFeriado;
        break;
        case "sinferiados":
          aplicar = !esFeriado && diaNum !== 0; 
          break;
      case "todos-excepto":
        aplicar = diaNum !== Number(diaLibreSeleccionado);
        break;
      case "libre":
        aplicar = true;
        break;
      case "habilesconferiados":
        aplicar = diaNum >= 1 && diaNum <= 5;
        break;
    }

    const forzarLibre = 
      modo === "libre" || 
      (modo === "todos-excepto" && esDiaLibre) || 
      (modo === "sinferiados" && esFeriado) || 
      (modo === "habiles" && (diaNum < 1 || diaNum > 5 || esFeriado));
  
      if (forzarLibre) {
        celda.classList.remove('vacaciones');
        celda.innerHTML = `<div class="cursor-pointer py-1 px-2 rounded hover:bg-primary-transparent transition-all">
          <span class="text-xs text-gray-400">-</span>
        </div>`;
      } else if (aplicar) {
        celda.classList.remove('vacaciones');
        celda.innerHTML = `<div class="cursor-pointer py-1 px-2 rounded hover:bg-primary-transparent transition-all">
          <span class="text-xs text-gray-400">${entrada}/${salida}</span>
        </div>`;
      }
  });
  
  modalFijo.style.display = 'none';
});
function exportarTablaTurnosAPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'l',  // Landscape
    unit: 'pt',        // Unidades en puntos (≈1pt = 1.333px)
    format: 'a4'
  });

  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();

  // 1) Determinar la fecha del lunes de esta semana en formato DD/MM/YYYY:
  const lunes = new Date(inicioSemana);
  const d = String(lunes.getDate()).padStart(2, '0');
  const m = String(lunes.getMonth() + 1).padStart(2, '0');
  const y = lunes.getFullYear();
  const textoSemana = `${d}/${m}/${y}`;

  // 2) Dibujar el título centrado
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Turno Semanal Semana: ${textoSemana}`,
    pageWidth / 2,
    margin,
    { align: 'center' }
  );

  // 3) Opcional: si quieres una línea secundaria con el rango completo
  // const domingo = new Date(lunes.getTime() + 6 * 24*60*60*1000);
  // const d2 = String(domingo.getDate()).padStart(2, '0');
  // const m2 = String(domingo.getMonth() + 1).padStart(2, '0');
  // const y2 = domingo.getFullYear();
  // doc.setFontSize(10);
  // doc.setFont('helvetica', 'normal');
  // doc.text(
  //   `(${textoSemana} – ${d2}/${m2}/${y2})`,
  //   pageWidth / 2,
  //   margin + 20,
  //   { align: 'center' }
  // );

  // 4) Agregar un pequeño espacio antes de la tabla
  const startY = margin + 40;

  // 5) Usar autoTable para volcar #tabla-turnos con estilos mejorados
  doc.autoTable({
    html: '#tabla-turnos',    // Selector de la tabla HTML
    startY: startY,
    theme: 'grid',            // Muestra bordes completos (grid)
    styles: {
      fontSize: 8,            // Tamaño de letra dentro de la tabla
      cellPadding: 4,         // Espacio interno de cada celda
      valign: 'middle',       // Centrar verticalmente el texto en celdas
      overflow: 'linebreak',  // Si el texto es muy extenso, hace salto de línea
      halign: 'center'        // Por defecto, centrar horizontalmente
    },
    headStyles: {
      fillColor: [52, 58, 64],  // Gris oscuro de fondo en encabezados
      textColor: 255,           // Texto blanco en encabezados
      fontStyle: 'bold',
      halign: 'center'          // Título de columna centrado
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245] // Filas alternas en un gris muy claro
    },
    columnStyles: {
      0: {                    // Columna “Empleado”
        cellWidth: 100,
        halign: 'left',       // Nombre del empleado alineado a la izquierda
        fontStyle: 'bold'
      },
      // Para las demás columnas (1..7), dejar ancho automático. 
      // Si quieres que todas tengan igual ancho, podrías hacer algo como:
      // 1: { cellWidth: (pageWidth - margin*2 - 100) / 7 },
      // 2: { cellWidth: (pageWidth - margin*2 - 100) / 7 },
      // ...
      // Pero normalmente el tema 'grid' ajusta la anchura según contenido.
    },
    didDrawPage: (data) => {
      // Si la tabla ocupa varias páginas, repetir el título en cada página
      if (data.pageNumber > 1) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(
          `Turno Semanal Semana: ${textoSemana}`,
          pageWidth / 2,
          margin - 10,
          { align: 'center' }
        );
      }
    }
  });

  // 6) Guardar / Descargar PDF
  doc.save(`turnos_semana_${textoSemana.replace(/\//g, '-')}.pdf`);
}


const btnLimpiar = document.getElementById("limpiar-horarios");
const modalConfirm = document.getElementById("modal-confirmacion");
const btnConfirmar = document.getElementById("confirmar-limpieza");
const btnCancelar  = document.getElementById("cancelar-limpieza");

btnLimpiar.addEventListener("click", () => {
  modalConfirm.style.display = "flex";
});

btnCancelar.addEventListener("click", () => {
  modalConfirm.style.display = "none";
});

btnConfirmar.addEventListener("click", () => {
  const celdas = document.querySelectorAll('#cuerpo-tabla td:not(:first-child)');
  celdas.forEach(celda => {
    celda.innerHTML = `<div class="cursor-pointer py-1 px-2 rounded hover:bg-primary-transparent transition-all">
      <span class="text-xs text-gray-400">-</span>
    </div>`;
  });
  modalConfirm.style.display = "none";
});
document.getElementById("semana-anterior").addEventListener("click", () => {
  inicioSemana.setDate(inicioSemana.getDate() - 7);
  actualizarSemana();
});

document.getElementById("semana-siguiente").addEventListener("click", () => {
  inicioSemana.setDate(inicioSemana.getDate() + 7);
  actualizarSemana();
});
document.getElementById('exportar-pdf').addEventListener('click', () => {
  exportarTablaTurnosAPDF();
});


// Referencias al modal de vacaciones y sus botones
const btnVacaciones     = document.getElementById('btn-asignar-vacaciones');
const modalVacaciones   = document.getElementById('modal-vacaciones');
const btnCancelarVac    = document.getElementById('cancelar-vacaciones');
const btnConfirmarVac   = document.getElementById('confirmar-vacaciones');
const selectEmpleadoVac = document.getElementById('select-empleado-vac');
const inputVacInicio    = document.getElementById('vac-inicio');
const inputVacFin       = document.getElementById('vac-fin');

// 1) Abrir el modal al pulsar “Asignar vacaciones”
btnVacaciones.addEventListener('click', () => {
  modalVacaciones.style.display = 'flex';
});

// 2) Cerrar el modal sin hacer nada
btnCancelarVac.addEventListener('click', () => {
  modalVacaciones.style.display = 'none';
});

// 3) Al confirmar, marcar las celdas dentro del rango
btnConfirmarVac.addEventListener('click', () => {
  const empIdRaw = selectEmpleadoVac.value;   // valor raw del <select>
  const empId    = String(empIdRaw).trim();   // forzar string y recortar espacios
  const desde    = inputVacInicio.value.trim();
  const hasta    = inputVacFin.value.trim();

  if (!desde || !hasta || desde > hasta) {
    showToast("Completa correctamente ambas fechas.", "error");
    return;
  }

  console.log('-> Vacaciones para:', empId, desde, hasta);

  document.querySelectorAll('#cuerpo-tabla tr').forEach(fila => {
  const tdConId = fila.querySelector('td[data-empleado-id]');
  const filaId  = tdConId.dataset.empleadoId.trim();

  // 1) Si no coincide y no es “all”, saltamos
  if (empId !== 'all' && filaId !== empId) return;

  // 2) Limpiamos vacaciones previas
  fila.querySelectorAll('td.vacaciones').forEach(celda => {
    celda.classList.remove('vacaciones');
    celda.textContent = '—';
  });

  // 3) Marcamos el nuevo rango DE VACACIONES, **solo** para esta fila
  fila.querySelectorAll('td[data-fecha]').forEach(celda => {
    const f = celda.dataset.fecha;
    if (f >= desde && f <= hasta) {
      celda.textContent = 'Vacaciones';
      celda.classList.add('vacaciones');
    }
  });
});

  // Cerrar modal y limpiar inputs
  modalVacaciones.style.display = 'none';
  inputVacInicio.value = '';
  inputVacFin.value    = '';
});
const btnGuardarHorarios = document.getElementById('guardar-horarios');

btnGuardarHorarios.addEventListener('click', async () => {
  
  const semanaISO = toLocalISO(inicioSemana); // p.ej. "2025-05-12"
  const turnos = {};

  empleados.forEach(emp => {
    const empId = emp.empId || emp.id;
    turnos[empId] = {};   // inicializa subobjeto

    dias.forEach(d => {
      const celda = document.querySelector(
        `td[data-empleado-id="${empId}"][data-fecha="${d.iso}"]`
      );
      const txt = celda.textContent.trim();
      if (txt === '—') {
        turnos[empId][d.iso] = { tipo:"libre" };
      } else if (txt === 'Vacaciones') {
        turnos[empId][d.iso] = { tipo:"vacaciones" };
      } else {
        const [entrada,salida] = txt.split('/');
        turnos[empId][d.iso] = {
          tipo: "turno",
          entrada,
          salida
        };
      }
    });
  });

  try {
    const res = await fetch(
      `${API_URL}/turnos-semanales/${semanaISO}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionStorage.getItem("ID_TOKEN")}`
        },
        body: JSON.stringify({ turnos })
      }
    );
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    
    showToast(body.mensaje, "success");
  } catch (err) {
    console.error("Error guardando semana:", err);
    showToast("No se pudo guardar la semana. Revisa la consola.", "error");
  }
});


