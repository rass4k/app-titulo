document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_KEY = 'ID_TOKEN';
  const readToken = () => sessionStorage.getItem(TOKEN_KEY);
  const saveToken = t => sessionStorage.setItem(TOKEN_KEY, t);

  const BASE_URL = 'https://connection-bd.onrender.com';
  const refreshBtn = document.getElementById('refresh-btn');
  const btnPDF = document.getElementById('btn-pdf');
  const panel = document.getElementById('asistencias-panel');
  const modal = document.getElementById('modal-detalle');
  const modalBody = document.getElementById('modal-detalle-body');
  const modalTitulo = document.getElementById('modal-titulo');
  const cerrarModal = document.getElementById('cerrar-modal');
  const btnSemanaPrev = document.getElementById('semana-prev');
  const btnSemanaNext = document.getElementById('semana-next');
  let fechaReferencia = new Date();

  // Estado global
  const state = { 
    empleados: {},     // empId => nombre
    asistencias: [],   // registros crudos
    diasSemana: [],    // ['2024-05-20', '2024-05-21', ...]
    horarios: {}       // horarios de la semana
  };
  const modalExportar = document.getElementById('modal-exportar');
  const btnExportar = document.getElementById('btn-pdf');
  const btnCancelarExport = document.getElementById('cancelar-exportar');
  const btnConfirmarExport = document.getElementById('confirmar-exportar');
  const selectExportType = document.getElementById('export-type');
  const exportDateFrom = document.getElementById('export-date-from');
  const exportDateTo = document.getElementById('export-date-to');
  const inputDateFrom = document.getElementById('date-from');
  inputDateFrom.addEventListener('change', () => {
    const valor = inputDateFrom.value; // “YYYY-MM-DD”
    if (!valor) return;
    const [y, m, d] = valor.split('-').map(Number);
    fechaReferencia = new Date(y, m - 1, d);
    cargarSemanaCompleta();
  });
  // Mostrar modal al hacer click en el botón exportar
  btnExportar.addEventListener('click', () => {
    modalExportar.classList.remove('hidden');
    modalExportar.classList.add('flex');
    
    // Establecer fechas por defecto (semana actual)
    const hoy = new Date();
    const unaSemanaAntes = new Date(hoy);
    unaSemanaAntes.setDate(hoy.getDate() - 7);
    
    exportDateFrom.value = unaSemanaAntes.toISOString().split('T')[0];
    exportDateTo.value = hoy.toISOString().split('T')[0];
  });

  function generarContenidoPorEmpleado(empId, nombre, desde, hasta) {
    const asistenciasEmpleado = state.asistencias.filter(a => a.empId === empId);
    
    if (asistenciasEmpleado.length === 0) {
      return {
        nombre,
        contenido: 'Aún no se ha registrado su primera asistencia'
      };
    }

    // Organizar asistencias por fecha
    const asistenciasPorFecha = {};
    asistenciasEmpleado.forEach(asistencia => {
      const fecha = fechaLocalISO(asistencia.timestamp);
      if (!asistenciasPorFecha[fecha]) {
        asistenciasPorFecha[fecha] = [];
      }
      asistenciasPorFecha[fecha].push(asistencia);
    });

    // Generar tabla de asistencias
    let contenidoTabla = `
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Hora Entrada</th>
            <th>Hora Salida</th>
            <th>Total Horas</th>
          </tr>
        </thead>
        <tbody>
    `;

    // Convertir fechas a Date para comparación
    const desdeDate = new Date(desde);
    const hastaDate = new Date(hasta);

    // Iterar por cada día en el rango
    for (let d = new Date(desdeDate); d <= hastaDate; d.setDate(d.getDate() + 1)) {
      const fechaActual = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');

      const asistenciasDia = asistenciasPorFecha[fechaActual] || [];
      
      if (asistenciasDia.length > 0) {
        // Ordenar por hora
        asistenciasDia.sort((a, b) => a.timestamp._seconds - b.timestamp._seconds);
        
        const entrada = new Date(asistenciasDia[0].timestamp._seconds * 1000);
        const salida = new Date(asistenciasDia[asistenciasDia.length - 1].timestamp._seconds * 1000);
        const horasTrabajadas = (salida - entrada) / (1000 * 60 * 60);

        contenidoTabla += `
          <tr>
            <td>${formatFechaCorta(fechaActual)}</td>
            <td>${entrada.toLocaleTimeString()}</td>
            <td>${salida.toLocaleTimeString()}</td>
            <td>${horasTrabajadas.toFixed(2)}</td>
          </tr>
        `;
      } else {
        contenidoTabla += `
          <tr>
            <td>${formatFechaCorta(fechaActual)}</td>
            <td colspan="3">Sin registro</td>
          </tr>
        `;
      }
    }

    contenidoTabla += '</tbody></table>';

    return {
      nombre,
      contenido: contenidoTabla
    };
  }
  
  async function generarPDF(_contenidoPorEmpleado, desde, hasta) {
    // ——————————————————————————————————————————————————
    // 1) Inicializar jsPDF (A4 retrato, unidades: pts)
    // ——————————————————————————————————————————————————
    const doc = new jspdf.jsPDF({
      unit: 'pt',
      format: 'a4',
      orientation: 'portrait',
    });
  
    // ——————————————————————————————————————————————————
    // 2) Constantes de diseño
    // ——————————————————————————————————————————————————
    const marginLeft   = 30;                                    // margen izquierdo
    const pageWidth    = doc.internal.pageSize.getWidth();      // ≈ 595 pts
    const pageHeight   = doc.internal.pageSize.getHeight();     // ≈ 842 pts
  
    const headerY      = 40;              // Y donde empieza el título
    const titleFont    = 16;              // tamaño de fuente del título
    const subtitleFont = 12;              // tamaño de fuente de subtítulos
    const tableFont    = 12;              // tamaño de fuente del contenido de la tabla
    const lineHeight   = 18;              // altura de cada fila (pts)
  
    // Columnas X fijas para cada celda
    const colFecha   = marginLeft;
    const colEntrada = marginLeft + 120;
    const colSalida  = marginLeft + 260;
    const colHoras   = marginLeft + 400;
  
    // Límites horizontales de la “caja” de la tabla
    const tableLeft  = marginLeft - 5;
    const tableRight = colHoras + 70;
  
    // Altura máxima en Y antes de salto de página interno
    const maxContentY = pageHeight - 60;
  
  
    // ——————————————————————————————————————————————————
    // 3) Construir versiones “DD/MM/YYYY” de desde y hasta
    // ——————————————————————————————————————————————————
    const [yDesde, mDesde, dDesde] = desde.split('-').map(Number);
    const [yHasta, mHasta, dHasta] = hasta.split('-').map(Number);
    const displayDesde = `${String(dDesde).padStart(2, '0')}/${String(mDesde).padStart(2, '0')}/${yDesde}`;
    const displayHasta = `${String(dHasta).padStart(2, '0')}/${String(mHasta).padStart(2, '0')}/${yHasta}`;
  
  
    // ——————————————————————————————————————————————————
    // 4) Convertir 'desde' y 'hasta' en objetos Date (hora local)
    // ——————————————————————————————————————————————————
    const desdeDate = new Date(yDesde, mDesde - 1, dDesde);
    const hastaDate = new Date(yHasta, mHasta - 1, dHasta);
  
  
    // ——————————————————————————————————————————————————
    // 5) Agrupar state.asistencias por empId y por fecha "YYYY-MM-DD"
    // ——————————————————————————————————————————————————
    // Resultado: { empId: { "YYYY-MM-DD": [registros…], … }, … }
    const asistenciasPorEmpleado = {};
    state.asistencias.forEach(r => {
      if (!r.empId || !r.timestamp || typeof r.timestamp._seconds !== 'number') return;
      const ms = r.timestamp._seconds * 1000 + (r.timestamp._nanoseconds || 0) / 1e6;
      const dObj = new Date(ms);
      const iso = 
        dObj.getFullYear() + '-' +
        String(dObj.getMonth() + 1).padStart(2, '0') + '-' +
        String(dObj.getDate()).padStart(2, '0');
  
      if (!asistenciasPorEmpleado[r.empId]) {
        asistenciasPorEmpleado[r.empId] = {};
      }
      if (!asistenciasPorEmpleado[r.empId][iso]) {
        asistenciasPorEmpleado[r.empId][iso] = [];
      }
      asistenciasPorEmpleado[r.empId][iso].push(r);
    });
  
  
    // ——————————————————————————————————————————————————
    // 6) Contar cuántos días hay en el rango (para altura de tabla)
    // ——————————————————————————————————————————————————
    let contadorDias = 0;
    for (let tmp = new Date(desdeDate); tmp <= hastaDate; tmp.setDate(tmp.getDate() + 1)) {
      contadorDias++;
    }
    const rowCount    = contadorDias + 1;      // +1 para la cabecera
    const tableHeight = rowCount * lineHeight;
  
  
    // ——————————————————————————————————————————————————
    // 7) Para cada empleado, generar una página A4
    // ——————————————————————————————————————————————————
    const empleadosKeys = Object.keys(state.empleados);
    empleadosKeys.forEach((empId, idxEmp) => {
      const nombreEmp        = state.empleados[empId] || empId;
      const asistenciasDeEste = asistenciasPorEmpleado[empId] || {};
  
      // Si no es el primer empleado, agregamos página nueva
      if (idxEmp > 0) {
        doc.addPage();
      }
  
      // ——————————————————————————
      // 7.1) Escribir título y subtítulo
      // ——————————————————————————
      doc.setFontSize(titleFont);
      doc.setFont('helvetica', 'bold');
      doc.text('Reporte de Asistencia', marginLeft, headerY);
  
      doc.setFontSize(subtitleFont);
      doc.setFont('helvetica', 'normal');
      doc.text(`Empleado: ${nombreEmp}`, marginLeft, headerY + 20);
  
      const periodoText = `Período: ${displayDesde}  –  ${displayHasta}`;
      const anchoTexto   = doc.getTextWidth(periodoText);
      doc.text(
        periodoText,
        pageWidth - marginLeft - anchoTexto,
        headerY + 20
      );
  
  
      // ——————————————————————————
      // 7.2) Dibujar líneas divisorias de la tabla
      // ——————————————————————————
      const tableY = headerY + 50;  // Y donde empieza la primera línea horizontal
  
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
  
      // Líneas horizontales (i=0..rowCount)
      for (let i = 0; i <= rowCount; i++) {
        const yLine = tableY + i * lineHeight;
        doc.line(tableLeft, yLine, tableRight, yLine);
      }
  
      // Líneas verticales (bordes de columnas)
      const x0 = tableLeft;
      const x1 = colEntrada - 10;
      const x2 = colSalida  - 10;
      const x3 = colHoras  - 10;
      const x4 = tableRight;
  
      doc.line(x0, tableY, x0, tableY + tableHeight);
      doc.line(x1, tableY, x1, tableY + tableHeight);
      doc.line(x2, tableY, x2, tableY + tableHeight);
      doc.line(x3, tableY, x3, tableY + tableHeight);
      doc.line(x4, tableY, x4, tableY + tableHeight);
  
  
      // ——————————————————————————
      // 7.3) Cabecera de la tabla (“Fecha | Entrada | Salida | Horas”)
      // ——————————————————————————
      doc.setFontSize(tableFont);
      doc.setFont('helvetica', 'bold');
      doc.text('Fecha',   colFecha,   tableY + lineHeight - 4);
      doc.text('Entrada', colEntrada, tableY + lineHeight - 4);
      doc.text('Salida',  colSalida,  tableY + lineHeight - 4);
      doc.text('Horas',   colHoras,   tableY + lineHeight - 4);
  
  
      // ——————————————————————————
      // 7.4) Filas de datos, iterando cada día del rango (formato DD/MM/YYYY)
      // ——————————————————————————
      let yText = tableY + lineHeight * 2;
      doc.setFont('helvetica', 'normal');
  
      for (let tmp = new Date(desdeDate); tmp <= hastaDate; tmp.setDate(tmp.getDate() + 1)) {
        const año   = tmp.getFullYear();
        const mes   = String(tmp.getMonth() + 1).padStart(2, '0');
        const dia   = String(tmp.getDate()).padStart(2, '0');
        const iso   = `${año}-${mes}-${dia}`;
        const fecha = `${dia}/${mes}/${año}`;
  
        const registrosHoy = asistenciasDeEste[iso] || [];
  
        if (registrosHoy.length > 0) {
          // Ordenar marcas por timestamp
          registrosHoy.sort((a, b) => a.timestamp._seconds - b.timestamp._seconds);
  
          let entrada, salida, horasTrabajadas;
          if (registrosHoy.length >= 2) {
            entrada = new Date(registrosHoy[0].timestamp._seconds * 1000);
            salida  = new Date(registrosHoy[registrosHoy.length - 1].timestamp._seconds * 1000);
            horasTrabajadas = (salida - entrada) / (1000 * 60 * 60);
          } else {
            // Solo una marca: la consideramos entrada, salida = null
            entrada = new Date(registrosHoy[0].timestamp._seconds * 1000);
            salida = null;
            horasTrabajadas = 0;
          }
  
          const entradaStr = entrada.toLocaleTimeString('es-CL');
          const salidaStr  = salida ? salida.toLocaleTimeString('es-CL') : '—';
          const horasStr   = salida ? horasTrabajadas.toFixed(2) : '0.00';
  
          doc.text(fecha,      colFecha,   yText);
          doc.text(entradaStr, colEntrada, yText);
          doc.text(salidaStr,  colSalida,  yText);
          doc.text(horasStr,   colHoras,   yText);
        } else {
          // Si no hay marcas en ese día:
          doc.text(fecha,        colFecha,   yText);
          doc.text('Sin registro', colEntrada, yText);
        }
  
        yText += lineHeight;
  
        // ——————————————————————————
        // 7.4.1) Salto de página interno si nos pasamos de maxContentY
        // ——————————————————————————
        if (yText + lineHeight * 2 > maxContentY) {
          doc.addPage();
  
          // Repetir título y subtítulo
          doc.setFontSize(titleFont);
          doc.setFont('helvetica', 'bold');
          doc.text('Reporte de Asistencia', marginLeft, headerY);
  
          doc.setFontSize(subtitleFont);
          doc.setFont('helvetica', 'normal');
          doc.text(`Empleado: ${nombreEmp}`, marginLeft, headerY + 20);
          doc.text(
            periodoText,
            pageWidth - marginLeft - anchoTexto,
            headerY + 20
          );
  
          // Repetir líneas divisorias y cabecera de tabla en página nueva
          const tableY2 = headerY + 50;
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.5);
  
          for (let i2 = 0; i2 <= rowCount; i2++) {
            const yLine2 = tableY2 + i2 * lineHeight;
            doc.line(tableLeft, yLine2, tableRight, yLine2);
          }
  
          doc.line(x0, tableY2, x0, tableY2 + tableHeight);
          doc.line(x1, tableY2, x1, tableY2 + tableHeight);
          doc.line(x2, tableY2, x2, tableY2 + tableHeight);
          doc.line(x3, tableY2, x3, tableY2 + tableHeight);
          doc.line(x4, tableY2, x4, tableY2 + tableHeight);
  
          doc.setFontSize(tableFont);
          doc.setFont('helvetica', 'bold');
          doc.text('Fecha',   colFecha,   tableY2 + lineHeight - 4);
          doc.text('Entrada', colEntrada, tableY2 + lineHeight - 4);
          doc.text('Salida',  colSalida,  tableY2 + lineHeight - 4);
          doc.text('Horas',   colHoras,   tableY2 + lineHeight - 4);
  
          yText = tableY2 + lineHeight * 2;
          doc.setFont('helvetica', 'normal');
        }
      }
    });
  
  
    // ——————————————————————————————————————————————————
    // 8) Guardar / Descargar el PDF
    // ——————————————————————————————————————————————————
    doc.save(`asistencia_${desde}_${hasta}.pdf`);
  }
  

// Función completa: recibe únicamente dos strings "YYYY-MM-DD"
// ————————————————————————————————————————————————
async function generarExcel(desde, hasta) {
  // 1) Verifica que ExcelJS y FileSaver ya estén cargados:
  //    <script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js"></script>
  //    <script src="https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"></script>

  // 2) Construir versiones “DD/MM/YYYY” de desde y hasta
  const [yDesde, mDesde, dDesde] = desde.split('-').map(Number);
  const [yHasta, mHasta, dHasta] = hasta.split('-').map(Number);
  const displayDesde = `${String(dDesde).padStart(2, '0')}/${String(mDesde).padStart(2, '0')}/${yDesde}`;
  const displayHasta = `${String(dHasta).padStart(2, '0')}/${String(mHasta).padStart(2, '0')}/${yHasta}`;

  // 3) Crear nuevo workbook
  const workbook = new ExcelJS.Workbook();

  // 4) Agrupar state.asistencias por empId y fecha "YYYY-MM-DD"
  const asistenciasPorEmpleado = {};
  state.asistencias.forEach(r => {
    if (!r.empId || !r.timestamp || typeof r.timestamp._seconds !== 'number') return;
    const ms = r.timestamp._seconds * 1000 + (r.timestamp._nanoseconds || 0) / 1e6;
    const dObj = new Date(ms);
    const iso = 
      dObj.getFullYear() + '-' +
      String(dObj.getMonth() + 1).padStart(2, '0') + '-' +
      String(dObj.getDate()).padStart(2, '0');

    if (!asistenciasPorEmpleado[r.empId]) {
      asistenciasPorEmpleado[r.empId] = {};
    }
    if (!asistenciasPorEmpleado[r.empId][iso]) {
      asistenciasPorEmpleado[r.empId][iso] = [];
    }
    asistenciasPorEmpleado[r.empId][iso].push(r);
  });

  // 5) Para cada empleado, crear una hoja
  Object.entries(state.empleados).forEach(([empId, nombre]) => {
    const worksheet = workbook.addWorksheet(nombre);

    // 5.1) Encabezados
    worksheet.addRow([`Reporte de Asistencia: ${nombre}`]);
    worksheet.addRow([`Período: ${displayDesde} – ${displayHasta}`]);
    worksheet.addRow([]); // fila en blanco
    worksheet.addRow(['Fecha', 'Hora Entrada', 'Hora Salida', 'Total Horas']);

    // 5.2) Obtener asistencias de este empleado
    const asistenciasDeEste = asistenciasPorEmpleado[empId] || {};

    // 5.3) Iterar día a día desde 'desde' hasta 'hasta'
    const desdeDate = new Date(yDesde, mDesde - 1, dDesde);
    const hastaDate = new Date(yHasta, mHasta - 1, dHasta);

    for (let tmp = new Date(desdeDate); tmp <= hastaDate; tmp.setDate(tmp.getDate() + 1)) {
      const año  = tmp.getFullYear();
      const mes  = String(tmp.getMonth() + 1).padStart(2, '0');
      const dia  = String(tmp.getDate()).padStart(2, '0');
      const iso  = `${año}-${mes}-${dia}`;
      const fechaDisplay = `${dia}/${mes}/${año}`;

      const registrosHoy = asistenciasDeEste[iso] || [];
      if (registrosHoy.length > 0) {
        registrosHoy.sort((a, b) => a.timestamp._seconds - b.timestamp._seconds);
        let entrada, salida, horasTrabajadas;
        if (registrosHoy.length >= 2) {
          entrada = new Date(registrosHoy[0].timestamp._seconds * 1000);
          salida  = new Date(registrosHoy[registrosHoy.length - 1].timestamp._seconds * 1000);
          horasTrabajadas = (salida - entrada) / (1000 * 60 * 60);
        } else {
          entrada = new Date(registrosHoy[0].timestamp._seconds * 1000);
          salida = null;
          horasTrabajadas = 0;
        }
        const entradaStr = entrada.toLocaleTimeString('es-CL');
        const salidaStr  = salida ? salida.toLocaleTimeString('es-CL') : '—';
        const horasStr   = salida ? horasTrabajadas.toFixed(2) : '0.00';
        worksheet.addRow([fechaDisplay, entradaStr, salidaStr, horasStr]);
      } else {
        worksheet.addRow([fechaDisplay, 'Sin registro', '', '']);
      }
    }

    // 5.4) Ajustar ancho de columnas
    worksheet.columns.forEach(col => {
      col.width = 15;
    });
  });

  // 6) Generar buffer xlsx y descargar
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  saveAs(blob, `asistencia_${desde}_${hasta}.xlsx`);
}

  
  
  
  

async function generarSVG(desde, hasta) {
  // ——————————————————————————————————————————————————
  // 1) Convertir 'desde' y 'hasta' (strings "YYYY-MM-DD") a Date y a formato "DD/MM/YYYY"
  // ——————————————————————————————————————————————————
  const [yDesde, mDesde, dDesde] = desde.split('-').map(Number);
  const [yHasta, mHasta, dHasta] = hasta.split('-').map(Number);
  const displayDesde = `${String(dDesde).padStart(2, '0')}/${String(mDesde).padStart(2, '0')}/${yDesde}`;
  const displayHasta = `${String(dHasta).padStart(2, '0')}/${String(mHasta).padStart(2, '0')}/${yHasta}`;

  const desdeDate = new Date(yDesde, mDesde - 1, dDesde);
  const hastaDate = new Date(yHasta, mHasta - 1, dHasta);

  // ——————————————————————————————————————————————————
  // 2) Agrupar state.asistencias por empId y fecha "YYYY-MM-DD"
  // ——————————————————————————————————————————————————
  const asistenciasPorEmpleado = {};
  state.asistencias.forEach(r => {
    if (!r.empId || !r.timestamp || typeof r.timestamp._seconds !== 'number') return;
    const ms = r.timestamp._seconds * 1000 + (r.timestamp._nanoseconds || 0) / 1e6;
    const dObj = new Date(ms);
    const iso = 
      dObj.getFullYear() + '-' +
      String(dObj.getMonth() + 1).padStart(2, '0') + '-' +
      String(dObj.getDate()).padStart(2, '0');
    if (!asistenciasPorEmpleado[r.empId]) asistenciasPorEmpleado[r.empId] = {};
    if (!asistenciasPorEmpleado[r.empId][iso]) asistenciasPorEmpleado[r.empId][iso] = [];
    asistenciasPorEmpleado[r.empId][iso].push(r);
  });

  // ——————————————————————————————————————————————————
  // 3) Contar cuántos días hay en el rango (para dimensionar cada tabla)
  // ——————————————————————————————————————————————————
  let contadorDias = 0;
  for (let tmp = new Date(desdeDate); tmp <= hastaDate; tmp.setDate(tmp.getDate() + 1)) {
    contadorDias++;
  }
  const rowCount = contadorDias + 1; // +1 para cabecera
  const rowHeight = 20; // px por fila en la tabla
  const tableHeight = rowCount * rowHeight;

  // ——————————————————————————————————————————————————
  // 4) Preparar dimensiones del SVG
  // ——————————————————————————————————————————————————
  const widthSvg = 800;
  const marginTop = 40;
  const marginBetween = 40; // espacio vertical entre tablas de empleados
  const empleadosKeys = Object.keys(state.empleados);
  const totalHeight = marginTop
                    + empleadosKeys.reduce((sum, _empId) => sum + (tableHeight + marginBetween + 30), 0);

  // Crear el contenedor SVG
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', String(widthSvg));
  svg.setAttribute('height', String(totalHeight));
  svg.setAttribute('xmlns', svgNS);

  // ——————————————————————————————————————————————————
  // 5) Título general arriba
  // ——————————————————————————————————————————————————
  const title = document.createElementNS(svgNS, 'text');
  title.setAttribute('x', String(widthSvg / 2));
  title.setAttribute('y', '20');
  title.setAttribute('text-anchor', 'middle');
  title.setAttribute('font-size', '18');
  title.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
  title.textContent = `Reporte de Asistencia (${displayDesde} – ${displayHasta})`;
  svg.appendChild(title);

  // ——————————————————————————————————————————————————
  // 6) Para cada empleado, dibujar su sección (nombre + tabla)
  // ——————————————————————————————————————————————————
  let yOffset = marginTop;
  empleadosKeys.forEach(empId => {
    const nombreEmp = state.empleados[empId] || empId;
    const asistenciasDeEste = asistenciasPorEmpleado[empId] || {};

    // 6.1) Nombre del empleado
    const nameText = document.createElementNS(svgNS, 'text');
    nameText.setAttribute('x', '20');
    nameText.setAttribute('y', String(yOffset + 20));
    nameText.setAttribute('font-size', '16');
    nameText.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
    nameText.setAttribute('font-weight', 'bold');
    nameText.textContent = nombreEmp;
    svg.appendChild(nameText);

    // 6.2) Crear <foreignObject> para la tabla HTML
    const foreignObject = document.createElementNS(svgNS, 'foreignObject');
    foreignObject.setAttribute('x', '20');
    foreignObject.setAttribute('y', String(yOffset + 30));
    foreignObject.setAttribute('width', String(widthSvg - 40));
    foreignObject.setAttribute('height', String(tableHeight + 10));

    // Construir la tabla HTML
    let tablaHTML = `<table style="width:100%; border-collapse: collapse; font-family: Helvetica, Arial, sans-serif;">`;
    // Cabecera
    tablaHTML += `<thead><tr>
      <th style="border: 1px solid #000; padding:4px;">Fecha</th>
      <th style="border: 1px solid #000; padding:4px;">Entrada</th>
      <th style="border: 1px solid #000; padding:4px;">Salida</th>
      <th style="border: 1px solid #000; padding:4px;">Horas</th>
    </tr></thead><tbody>`;

    // Filas por cada día
    for (let tmp = new Date(desdeDate); tmp <= hastaDate; tmp.setDate(tmp.getDate() + 1)) {
      const año  = tmp.getFullYear();
      const mes  = String(tmp.getMonth() + 1).padStart(2, '0');
      const dia  = String(tmp.getDate()).padStart(2, '0');
      const iso  = `${año}-${mes}-${dia}`;
      const fechaDisplay = `${dia}/${mes}/${año}`;

      const registrosHoy = asistenciasDeEste[iso] || [];
      if (registrosHoy.length > 0) {
        registrosHoy.sort((a, b) => a.timestamp._seconds - b.timestamp._seconds);
        let entrada, salida, horasTrabajadas;
        if (registrosHoy.length >= 2) {
          entrada = new Date(registrosHoy[0].timestamp._seconds * 1000);
          salida  = new Date(registrosHoy[registrosHoy.length - 1].timestamp._seconds * 1000);
          horasTrabajadas = (salida - entrada) / (1000 * 60 * 60);
        } else {
          entrada = new Date(registrosHoy[0].timestamp._seconds * 1000);
          salida = null;
          horasTrabajadas = 0;
        }
        const entradaStr = entrada.toLocaleTimeString('es-CL');
        const salidaStr  = salida ? salida.toLocaleTimeString('es-CL') : '—';
        const horasStr   = salida ? horasTrabajadas.toFixed(2) : '0.00';

        tablaHTML += `<tr>
          <td style="border: 1px solid #000; padding:4px;">${fechaDisplay}</td>
          <td style="border: 1px solid #000; padding:4px;">${entradaStr}</td>
          <td style="border: 1px solid #000; padding:4px;">${salidaStr}</td>
          <td style="border: 1px solid #000; padding:4px;">${horasStr}</td>
        </tr>`;
      } else {
        tablaHTML += `<tr>
          <td style="border: 1px solid #000; padding:4px;">${fechaDisplay}</td>
          <td style="border: 1px solid #000; padding:4px;" colspan="3">Sin registro</td>
        </tr>`;
      }
    }

    tablaHTML += `</tbody></table>`;
    foreignObject.innerHTML = tablaHTML;
    svg.appendChild(foreignObject);

    // Actualizar yOffset para el siguiente empleado
    yOffset += tableHeight + marginBetween + 30;
  });

  // ——————————————————————————————————————————————————
  // 7) Serializar SVG y descargarlo como .svg
  // ——————————————————————————————————————————————————
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Crear enlace invisible y disparar la descarga
  const a = document.createElement('a');
  a.href = url;
  a.download = `asistencia_${desde}_${hasta}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


  // Cerrar modal
  btnCancelarExport.addEventListener('click', () => {
    modalExportar.classList.add('hidden');
    modalExportar.classList.remove('flex');
  });

  // Manejar exportación
  btnConfirmarExport.addEventListener('click', async () => {
    const tipo  = selectExportType.value;
    const desde = exportDateFrom.value;
    const hasta = exportDateTo.value;
  
    if (!desde || !hasta) {
      showToast('Por favor seleccione un rango de fechas válido', 'error');
      return;
    }
  
    try {
      // aquí NO mostramos "Generando documento..." inmediato
      // showToast('Generando documento...', 'info');
  
      // Generar contenido para cada empleado
      const contenidoPorEmpleado = Object.entries(state.empleados).map(
        ([empId, nombre]) => generarContenidoPorEmpleado(empId, nombre, desde, hasta)
      );
  
      // Generar el documento según tipo
      switch (tipo) {
        case 'pdf':
          await generarPDF(contenidoPorEmpleado, desde, hasta);
          break;
        case 'excel':
          await generarExcel(desde, hasta);
          break;
        case 'svg':
          await generarSVG(desde, hasta);
          break;
      }
  
      showToast('Documento generado exitosamente', 'success');
      modalExportar.classList.add('hidden');
      modalExportar.classList.remove('flex');
    } catch (error) {
      console.error('Error al exportar:', error);
      showToast('Error al generar el documento', 'error');
    }
  });
  

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg text-white z-50 ${
      type === 'error' ? 'bg-red-500' : 
      type === 'success' ? 'bg-green-500' : 
      'bg-blue-500'
    }`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
  function cambiarSemana(direccion) {
    fechaReferencia.setDate(fechaReferencia.getDate() + (direccion * 7));
    cargarSemanaCompleta();
  }

  btnSemanaPrev.addEventListener('click', () => cambiarSemana(-1));
  btnSemanaNext.addEventListener('click', () => cambiarSemana(1));
  function fechaLocalISO(dt) {
    const date = new Date(dt._seconds * 1000 + ((dt._nanoseconds || 0) / 1e6));
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  function getDiasSemana() {
    const dias = [];
    const ref = new Date(fechaReferencia);
    ref.setHours(0,0,0,0);

    const dayOfWeek = ref.getDay();
    const diff = (dayOfWeek + 6) % 7;
    const lunes = new Date(ref);
    lunes.setDate(ref.getDate() - diff);
    lunes.setHours(0,0,0,0);

    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      dias.push(
        d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0')
      );
    }
    return dias;
  }

  async function cargarSemanaCompleta() {
    try {
      showToast('Cargando datos...', 'info');
      state.diasSemana = getDiasSemana();
      const semanaInicio = state.diasSemana[0];

      await Promise.all([
        cargarHorarios(semanaInicio),
        cargarVista()
      ]);

      showToast('Datos cargados correctamente', 'success');
    } catch (error) {
      console.error('Error:', error);
      showToast('Error al cargar los datos', 'error');
    }
  }

  async function cargarVista() {
    panel.innerHTML = '<p>Cargando…</p>';
    try {
      let idToken = readToken();
      if (!idToken && window.authAPI) {
        idToken = await window.authAPI.getIdToken();
        saveToken(idToken);
      }

      const res = await fetch(`${BASE_URL}/asistencia`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = await res.json();

      // Extraer empleados únicos
      const empMap = {};
      data.forEach(r => {
        if (r.empId) empMap[r.empId] = r.nombre || r.empId;
      });

      state.empleados = empMap;
      state.asistencias = data;
      renderTablaResumen();
    } catch (error) {
      panel.innerHTML = `<p>Error al cargar: ${error.message}</p>`;
      showToast(`Error: ${error.message}`, 'error');
    }
  }

  async function cargarHorarios(semanaInicio) {
    try {
      const res = await fetch(`${BASE_URL}/turnos-semanales/${semanaInicio}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${readToken()}`
        }
      });
      if (!res.ok) throw new Error('Error al obtener horarios');
      const data = await res.json();
      state.horarios = (data && data.turnos) ? data.turnos : {};
    } catch (error) {
      console.error('Error cargando horarios:', error);
      showToast('Error al cargar horarios', 'error');
    }
  }

  function renderTablaResumen() {
    const { empleados, diasSemana, asistencias } = state;
    let html = `
      <table id="tabla-asistencias" class="w-full">
        <thead class="bg-gray-700 text-gray-300">
          <tr>
            <th class="px-4 py-3 text-left">Empleado</th>
            ${diasSemana.map(date => `<th class="px-4 py-3 text-center">${formatFechaCorta(date)}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-700">
    `;
    
    Object.entries(empleados).forEach(([empId, nombre]) => {
      html += `<tr class="hover:bg-gray-750 transition-colors">`;
      html += `<td class="px-4 py-3 text-gray-100">${nombre}</td>`;
      
      diasSemana.forEach(dateStr => {
        const hayAsistencia = asistencias.some(r =>
          r.empId === empId &&
          r.timestamp &&
          r.timestamp._seconds &&
          fechaLocalISO(r.timestamp) === dateStr
        );
        
        html += `<td class="px-4 py-3 text-center celda-dia ${hayAsistencia ? 'text-green-400' : 'text-red-400'}" 
          data-empid="${empId}" 
          data-fecha="${dateStr}" 
          style="cursor:pointer">
          ${hayAsistencia ? '✔️' : '❌'}
        </td>`;
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

  function mostrarDetalle(empId, fecha) {
    const detalles = state.asistencias.filter(r =>
      r.empId === empId &&
      r.timestamp &&
      r.timestamp._seconds &&
      fechaLocalISO(r.timestamp) === fecha
    );

    const detallesOrdenados = [...detalles].sort((a, b) => {
      const tA = a.timestamp._seconds * 1000 + ((a.timestamp._nanoseconds || 0) / 1e6);
      const tB = b.timestamp._seconds * 1000 + ((b.timestamp._nanoseconds || 0) / 1e6);
      return tA - tB;
    });

    const horariosEmp = (state.horarios[empId] && state.horarios[empId][fecha]) || {};
    modalTitulo.textContent = `Detalle de ${state.empleados[empId] || empId} - ${formatFechaLarga(fecha)}`;

    let body = '<ul class="space-y-2">';
    if (detallesOrdenados.length === 0) {
      body += '<li class="text-red-400">No hay registros de asistencia para este día</li>';
    } else {
      detallesOrdenados.forEach((registro, index) => {
        const dt = new Date(registro.timestamp._seconds * 1000 + ((registro.timestamp._nanoseconds || 0) / 1e6));
        const hora = dt.toLocaleTimeString('es-CL');
        const tipo = registro.tipo || 'No especificado';
        body += `<li class="text-gray-100">
          <span class="font-semibold">Marca ${index + 1}:</span> 
          ${hora} (${tipo})
        </li>`;
      });
    }

    if (horariosEmp.entrada || horariosEmp.salida) {
      body += '<li class="mt-4 text-gray-400">Horario programado:</li>';
      if (horariosEmp.entrada) body += `<li class="text-gray-400">Entrada: ${horariosEmp.entrada}</li>`;
      if (horariosEmp.salida) body += `<li class="text-gray-400">Salida: ${horariosEmp.salida}</li>`;
    }

    body += '</ul>';
    modalBody.innerHTML = body;
    modal.style.display = 'flex';
  }

  function formatFechaCorta(iso) {
    const [year, month, day] = iso.split('-');
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return d.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit' });
  }

  function formatFechaLarga(iso) {
    const [year, month, day] = iso.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' });
  }

  // Event Listeners
  refreshBtn.addEventListener('click', cargarSemanaCompleta);
  cerrarModal.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
  // Inicializar
  cargarSemanaCompleta();
});