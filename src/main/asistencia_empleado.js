document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_KEY = 'ID_TOKEN';
  const { jsPDF } = window.jspdf;
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
  // Índice   empId → fecha ISO → [registros]
  let idxAsis = {};

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
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const margin = 30;
    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
  
    /* ── 1. Fechas legibles y objetos Date ───────────────────────── */
    const [yD, mD, dD] = desde.split('-').map(Number);
    const [yH, mH, dH] = hasta.split('-').map(Number);
    const dispDesde = `${String(dD).padStart(2,'0')}/${String(mD).padStart(2,'0')}/${yD}`;
    const dispHasta = `${String(dH).padStart(2,'0')}/${String(mH).padStart(2,'0')}/${yH}`;
    const dDesde = new Date(yD, mD - 1, dD);
    const dHasta = new Date(yH, mH - 1, dH);
  
    /* ── 2. Array exacto de días del rango ───────────────────────── */
    const diasRango = [];
    for (let d = new Date(dDesde); d <= dHasta; d.setDate(d.getDate() + 1)) {
      diasRango.push(d.toISOString().slice(0, 10));              // YYYY-MM-DD
    }
  
    /* ── 3. Agrupación de marcas por fecha local ──────────────────── */
    const agrup = {};
    state.asistencias.forEach(r => {
      if (!r.empId || !r.timestamp?._seconds) return;
      const isoLocal = fechaLocalISO(r.timestamp);                // local
      agrup[r.empId] = agrup[r.empId] || {};
      agrup[r.empId][isoLocal] = agrup[r.empId][isoLocal] || [];
      agrup[r.empId][isoLocal].push(r);
    });
  
    /* ── 4. Empleados con turno dentro del rango ─────────────────── */
    const empleadosActivos = Object.keys(state.empleados)
      .filter(id => diasRango.some(f => state.horarios[id]?.[f]));
  
    /* ── 5. Portada ──────────────────────────────────────────────── */
    doc.setFontSize(20).text('Reporte de Asistencia', margin, 60);
    doc.setFontSize(12)
       .text(`Período: ${dispDesde} – ${dispHasta}`, margin, 80)
       .text(`Generado: ${new Date().toLocaleString('es-CL')}`, margin, 96);
    doc.addPage();
  
    /* ── 6. Resumen general ──────────────────────────────────────── */
    const resumenCols = [
      { header:'Empleado',       dataKey:'nombre' },
      { header:'Días turno',     dataKey:'dias'   },
      { header:'Horas totales',  dataKey:'totH'   },
      { header:'Ext. brutas',    dataKey:'extH'   },
      { header:'Horas netas',    dataKey:'netH'   },
      { header:'Min atraso',     dataKey:'atr'    }
    ];
  
    const resumenBody = empleadosActivos.map(empId => {
      let dias=0, brutoMs=0, extraMs=0, netMs=0, atrMin=0;
  
      diasRango.forEach(fecha => {
        const turno = state.horarios[empId]?.[fecha];
        if (!turno?.entrada || !turno?.salida) return;
  
        const regs = registrosDelDia(empId, fecha, state.horarios[empId]?.[fecha]);
        if (regs.length < 2) return;
  
        dias++;
        const en = new Date(regs[0].timestamp._seconds*1000);
        const sl = new Date(regs.at(-1).timestamp._seconds*1000);
        brutoMs += sl - en;
  
        const [hEi,mEi] = turno.entrada.split(':').map(Number);
        const atraso    = Math.max(0,(en.getHours()*60+en.getMinutes()) - (hEi*60+mEi));
        atrMin += atraso;
  
        const [hEs,mEs] = turno.salida.split(':').map(Number);
        const progSal = new Date(en); progSal.setHours(hEs,mEs,0,0);
        const exMs = Math.max(0, sl - progSal);
        extraMs += exMs;
        netMs   += Math.max(0, exMs - atraso*60000);
      });
  
      return {
        nombre: state.empleados[empId],
        dias,
        totH: +(brutoMs/3600000).toFixed(2),
        extH: +(extraMs/3600000).toFixed(2),
        netH: +(netMs  /3600000).toFixed(2),
        atr : atrMin
      };
    });
  
    doc.setFontSize(16).text('Resumen General', margin, 50);
    doc.autoTable({
      startY: 70,
      theme:'grid',
      headStyles:{ fillColor:[41,128,185], textColor:255 },
      styles:{ fontSize:9, cellPadding:4 },
      columns: resumenCols,
      body: resumenBody,
      margin:{ left: margin, right: margin }
    });
  
    /* ── 7. Detalle por empleado ─────────────────────────────────── */
    const detCols = [
      { header:'Fecha',      dataKey:'fecha' },
      { header:'Prog. In',   dataKey:'pIn'   },
      { header:'Prog. Out',  dataKey:'pOut'  },
      { header:'Entrada',    dataKey:'rIn'   },
      { header:'Salida',     dataKey:'rOut'  },
      { header:'Total (h)',  dataKey:'brH'   },
      { header:'Ext. brutas',dataKey:'exH'   },
      { header:'Atraso (m)', dataKey:'atr'   },
      { header:'# marcas',   dataKey:'cnt'   }
    ];
  
    empleadosActivos.forEach(empId => {
      doc.addPage();
      doc.setFontSize(14).text(`Detalle: ${state.empleados[empId]}`, margin, 50);
  
      const rows=[];
      diasRango.forEach(fecha=>{
        const turno = state.horarios[empId]?.[fecha] || {};
        const progIn  = turno.entrada || '—';
        const progOut = turno.salida  || '—';
  
        const regs = registrosDelDia(empId, fecha, state.horarios[empId]?.[fecha]);
        let rIn='—', rOut='—', br=0, ex=0, atr=0;
        if (regs.length >= 2) {
          const en = new Date(regs[0].timestamp._seconds*1000);
          const sl = new Date(regs.at(-1).timestamp._seconds*1000);
          rIn  = fmtHoraConDia(en, fecha);   // pasa el ISO del día
          rOut = fmtHoraConDia(sl, fecha);
          br = +((sl-en)/3600000).toFixed(2);
  
          if (turno.entrada && turno.salida) {
            const [hEi,mEi]=turno.entrada.split(':').map(Number);
            atr=Math.max(0,(en.getHours()*60+en.getMinutes())-(hEi*60+mEi));
  
            const [hEs,mEs]=turno.salida.split(':').map(Number);
            const prog=new Date(en); prog.setHours(hEs,mEs,0,0);
            ex = +((Math.max(0, sl - prog))/3600000).toFixed(2);
          }
        }
  
        rows.push({
          fecha: fecha.slice(8,10)+'/'+fecha.slice(5,7),
          pIn: progIn,
          pOut: progOut,
          rIn, rOut,
          brH: br,
          exH: ex,
          atr,
          cnt: regs.length
        });
      });
  
      doc.autoTable({
        startY: 70,
        theme:'striped',
        headStyles:{ fillColor:[52,73,94], textColor:255 },
        styles:{ fontSize:8.5, cellPadding:3 },
        columns: detCols,
        body: rows,
        margin:{ left: margin, right: margin }
      });
    });
  
    /* ── 8. Gráfico Programado vs Trabajado ───────────────────────── */
    doc.addPage().setFontSize(14).text('Programado vs Trabajado', margin, 50);
    const labels = diasRango.map(f => f.slice(8,10)+'/'+f.slice(5,7));

    const schedArr = diasRango.map(f =>
      empleadosActivos.reduce((s,id)=>{
        const t=state.horarios[id]?.[f];
        if(!t?.entrada||!t?.salida) return s;
        const [hEi,mEi]=t.entrada.split(':').map(Number);
        const [hEs,mEs]=t.salida .split(':').map(Number);
        return s + ((hEs*60+mEs)-(hEi*60+mEi))/60;
      },0)
    );
    const workedArr = diasRango.map(f =>
      empleadosActivos.reduce((s,id)=>{
        const regs = registrosDelDia(id, f, state.horarios[id]?.[f]);
        if(regs.length<2) return s;
        const en=new Date(regs[0].timestamp._seconds*1000);
        const sl=new Date(regs.at(-1).timestamp._seconds*1000);
        return s + (sl-en)/3600000;
      },0)
    );

    let canvas=document.createElement('canvas');
    canvas.width=600; canvas.height=300;
    new Chart(canvas.getContext('2d'),{
      type:'bar',
      data:{ labels,
        datasets:[
          { label:'Programado', backgroundColor:'rgba(54,162,235,0.7)', data:schedArr },
          { label:'Trabajado',  backgroundColor:'rgba(75,192,192,0.7)', data:workedArr }
        ]},
      options:{ animation:false, responsive:false, scales:{y:{beginAtZero:true}}}
    });
    let img = canvas.toDataURL();
    let w = pageWidth-2*margin, h=(canvas.height/canvas.width)*w;
    doc.addImage(img,'PNG',margin,80,w,h);

    /* ── 8.2 Pie: distribución de horas netas por empleado ─────── */
    doc.addPage().setFontSize(14).text('Horas netas por empleado', margin, 50);

    // Suma neta por empleado
    const pieLabels = empleadosActivos.map(id=>state.empleados[id]);
    const pieData   = empleadosActivos.map(id=>{
      return diasRango.reduce((sum,f)=>{
        const t=state.horarios[id]?.[f];
        const regs = registrosDelDia(id, f, state.horarios[id]?.[f]);
        if(!t?.entrada||!t?.salida||regs.length<2) return sum;
        const en=new Date(regs[0].timestamp._seconds*1000);
        const sl=new Date(regs.at(-1).timestamp._seconds*1000);
        const [hEi,mEi]=t.entrada.split(':').map(Number);
        const atr=Math.max(0,(en.getHours()*60+en.getMinutes())-(hEi*60+mEi));
        const [hEs,mEs]=t.salida.split(':').map(Number);
        const prog=new Date(en); prog.setHours(hEs,mEs,0,0);
        const netMs=Math.max(0, Math.max(0,sl-prog) - atr*60000);
        return sum + netMs/3600000;
      },0).toFixed(2);
    });

    canvas=document.createElement('canvas'); canvas.width=500; canvas.height=500;
    new Chart(canvas.getContext('2d'),{
      type:'pie',
      data:{ labels:pieLabels, datasets:[{ data:pieData, backgroundColor:[
        '#36A2EB','#4BC0C0','#FFCE56','#FF6384','#9966FF','#FF9F40'
      ]}]},
      options:{ animation:false, responsive:false, plugins:{ legend:{ position:'right' } } }
    });
    img=canvas.toDataURL();
    w=pageWidth-2*margin; h=(canvas.height/canvas.width)*w;
    doc.addImage(img,'PNG',margin,80,w,h);

    /* ── 8.3 Barra horizontal: minutos de atraso por empleado ──── */
    doc.addPage().setFontSize(14).text('Minutos de atraso acumulados', margin, 50);

    const atrData = empleadosActivos.map(id=>{
      return diasRango.reduce((sum,f)=>{
        const t=state.horarios[id]?.[f];
        const regs = registrosDelDia(id, f, state.horarios[id]?.[f]);
        if(!t?.entrada||regs.length<2) return sum;
        const en=new Date(regs[0].timestamp._seconds*1000);
        const [hEi,mEi]=t.entrada.split(':').map(Number);
        return sum + Math.max(0,(en.getHours()*60+en.getMinutes())-(hEi*60+mEi));
      },0);
    });

    canvas=document.createElement('canvas'); canvas.width=600; canvas.height=300;
    new Chart(canvas.getContext('2d'),{
      type:'bar',
      data:{
        labels:pieLabels,
        datasets:[{ label:'Minutos', data:atrData, backgroundColor:'rgba(255,99,132,0.7)' }]
      },
      options:{
        animation:false, responsive:false,
        indexAxis:'y',
        scales:{ x:{ beginAtZero:true } }
      }
    });
    img=canvas.toDataURL();
    w=pageWidth-2*margin; h=(canvas.height/canvas.width)*w;
    doc.addImage(img,'PNG',margin,80,w,h);
  
    /* ── 9. Footer de páginas ─────────────────────────────────────── */
    const totalPages = doc.internal.getNumberOfPages();
    doc.setFontSize(8);
    for(let i=1;i<=totalPages;i++){
      doc.setPage(i).text(`Página ${i} de ${totalPages}`, pageWidth-margin, pageHeight-10,{align:'right'});
    }
  
    doc.save(`asistencia_${desde}_${hasta}.pdf`);
  }
  /* ── 2. Descargar feriados y normalizar ────────────────── */
  async function cargarFeriados(desde, hasta) {
  try {
    const resp = await fetch('https://api.boostr.cl/holidays.json');
    const json = await resp.json();

    let listaISO = [];

    if (Array.isArray(json)) {
      // Formato API gob.cl: [{ fecha:'2025-01-01', ...}, ...]
      listaISO = json.map(f => f.fecha);
    } else if (Array.isArray(json.data)) {
      // Formato { data:[{ date:'2025-01-01', ...}, ...] }
      listaISO = json.data.map(f => f.date);
    } else if (json && typeof json === 'object') {
      // Formato { '2025-01-01': {...}, '2025-03-28': {...} }
      listaISO = Object.keys(json);
    }

    return listaISO.filter(f => f >= desde && f <= hasta);
  } catch (e) {
    console.warn('No se pudo cargar feriados:', e);
    return [];        // continúa sin feriados
  }
  }

async function generarExcel(desde, hasta) {
  /* 1. Fechas y rango ---------------------------------------------- */
  const [yD, mD, dD] = desde.split('-').map(Number);
  const [yH, mH, dH] = hasta.split('-').map(Number);
  const dispDesde = `${dD.toString().padStart(2,'0')}/${mD.toString().padStart(2,'0')}/${yD}`;
  const dispHasta = `${dH.toString().padStart(2,'0')}/${mH.toString().padStart(2,'0')}/${yH}`;
  const dDesde = new Date(yD, mD - 1, dD);
  const dHasta = new Date(yH, mH - 1, dH);

  const diasRango = [];
  for (let d = new Date(dDesde); d <= dHasta; d.setDate(d.getDate() + 1)) {
    diasRango.push(d.toISOString().slice(0, 10));   // YYYY-MM-DD
  }

  /* 2. Feriados ----------------------------------------------------- */
  const feriados = await cargarFeriados(desde, hasta);
  const setFeriados = new Set(feriados);

  /* 3. Empleados con turno en el rango ------------------------------ */
  const empleadosActivos = Object.keys(state.empleados).filter(id =>
    diasRango.some(f => state.horarios[id]?.[f])
  );
  if (!empleadosActivos.length) {
    showToast('Ningún empleado con turno en ese rango', 'info');
    return;
  }

  /* 4. Agrupar marcas y hallar máx. marcas -------------------------- */
  const agrup = {};
  let maxMarks = 0;
  state.asistencias.forEach(r => {
    if (!r.empId || !r.timestamp?._seconds) return;
    const iso = fechaLocalISO(r.timestamp);
    agrup[r.empId] ??= {};
    agrup[r.empId][iso] ??= [];
    agrup[r.empId][iso].push(r);
    maxMarks = Math.max(
        maxMarks,
        registrosDelDia(r.empId, iso, state.horarios[r.empId]?.[iso]).length
    );
  });
  const markHeaders = Array.from({ length: maxMarks }, (_, i) => `M${i+1}`);

  /* 5. Crear workbook ------------------------------------------------ */
  const wb = new ExcelJS.Workbook();

  /* 5A. Hoja Resumen ------------------------------------------------- */
  const wsRes = wb.addWorksheet('Resumen');
  wsRes.addRow([`Reporte de Asistencia — Resumen General`]);
  wsRes.addRow([`Período: ${dispDesde} – ${dispHasta}`]);
  wsRes.addRow([]);
  wsRes.addRow([
    'Empleado', 'Días con turno', 'Horas prog.',
    'Horas trabajadas', 'Horas extra netas',
    '% Cumplimiento jornada', 'Min. atraso'
  ]);

  empleadosActivos.forEach(empId => {
    let dias=0, progMin=0, workedMin=0, netExtraMin=0, atrMin=0;
    diasRango.forEach(f=>{
      const t=state.horarios[empId]?.[f];
      if(!t?.entrada||!t?.salida) return;
      const regs = registrosDelDia(empId, f, state.horarios[empId]?.[f]);
      if(regs.length<2) return;
      dias++;
      const en=new Date(regs[0].timestamp._seconds*1000);
      const sl=new Date(regs.at(-1).timestamp._seconds*1000);
      workedMin += (sl-en)/60000;
      const [hEi,mEi]=t.entrada.split(':').map(Number);
      const [hEs,mEs]=t.salida .split(':').map(Number);
      progMin += (hEs*60+mEs)-(hEi*60+mEi);
      const atraso=Math.max(0,(en.getHours()*60+en.getMinutes())-(hEi*60+mEi));
      atrMin+=atraso;
      const progSal=new Date(en); progSal.setHours(hEs,mEs,0,0);
      const extraMin=Math.max(0,(sl-progSal)/60000);
      netExtraMin += Math.max(0, extraMin - atraso);
    });
    wsRes.addRow([
      state.empleados[empId],
      dias,
      (progMin/60).toFixed(2),
      (workedMin/60).toFixed(2),
      (netExtraMin/60).toFixed(2),
      progMin?`${((workedMin/progMin)*100).toFixed(1)} %`:'—',
      atrMin
    ]);
  });
  wsRes.columns.forEach(c=>c.width=18);

  /* 5B. Hoja por empleado ------------------------------------------- */
  empleadosActivos.forEach(empId=>{
    const nombre=state.empleados[empId];
    const ws=wb.addWorksheet(empId);
    ws.addRow([`Empleado: ${nombre}`]);
    ws.addRow([`Período: ${dispDesde} – ${dispHasta}`]);
    ws.addRow([]);
    ws.addRow([
      'Fecha', 'Tipo día',                 // ← nueva columna
      'Prog. In', 'Prog. Out', 'Entrada', 'Salida',
      'Total (h)', 'Extra bruta (h)', 'Extra neta (h)', 'Atraso (m)',
      'ΔEntrada (m)', 'ΔSalida (m)', '# marcas',
      ...markHeaders, 'Observación'
    ]);

    diasRango.forEach(iso=>{
      const [a,m,d]=iso.split('-');
      const fechaDisp=`${d}/${m}/${a}`;
      const [yy, mm, dd] = iso.split('-').map(Number);
      const dow = new Date(yy, mm - 1, dd).getDay(); // 0 = domingo ✅
      let tipoDia='H';
      if(setFeriados.has(iso)) tipoDia='F';
      else if(dow===0)         tipoDia='D';
      else if(dow===6)         tipoDia='S';
      const t=state.horarios[empId]?.[iso]||{};
      const progIn=t.entrada||'—';
      const progOut=t.salida||'—';
      const regs = registrosDelDia(empId, iso, state.horarios[empId]?.[iso]);

      let rowData=[], atrasoMin=0, deltaOutMin=0, extraBrutaH=0, extraNetaH=0, totalH=0;
      if(regs.length){
        const en=new Date(regs[0].timestamp._seconds*1000);
        const sl= regs.length>1 ? new Date(regs.at(-1).timestamp._seconds*1000):null;
        totalH = sl ? (sl-en)/3_600_000 : 0;

        if(progIn!=='—'){
          atrasoMin=Math.max(0,(en.getHours()*60+en.getMinutes())-
                                (parseInt(progIn)*60+parseInt(progIn.split(':')[1])));
        }
        if(sl && progOut!=='—'){
          const [hEs,mEs]=progOut.split(':').map(Number);
          const progSal=new Date(en); progSal.setHours(hEs,mEs,0,0);
          deltaOutMin=Math.round((sl-progSal)/60000);
          extraBrutaH=Math.max(0,deltaOutMin/60);
          extraNetaH=Math.max(0,extraBrutaH - atrasoMin/60);
        }

        rowData = [
          fechaDisp, tipoDia,
          progIn, progOut,
          fmtHoraConDia(en, iso),                       // ①
          sl ? fmtHoraConDia(sl, iso) : '—',            // ②
          +totalH.toFixed(2),
          +extraBrutaH.toFixed(2),
          +extraNetaH.toFixed(2),
          atrasoMin,
          atrasoMin, deltaOutMin, regs.length,
          ...regs.map(r =>
            fmtHoraConDia(new Date(r.timestamp._seconds * 1000), iso) // ③
          ),
          ''
        ];
      }else{
        rowData=[
          fechaDisp, tipoDia,                // ← se agrega aquí
          progIn, progOut,
          '—','—',0,0,0,0,0,0,0,
          ...Array(maxMarks).fill(''), ''
        ];
      }
      const isSunday  = dow === 0;
      const isSaturday = dow === 6;
      const isHoliday = tipoDia === 'F';
      const row=ws.addRow(rowData);
      if (isHoliday || isSunday) {
        row.eachCell(c => c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC7CE' }   // rojo suave
        });
      // ► 2. Sábados (solo si quieres mantenerlos azules)
      } else if (isSaturday) {
        row.eachCell(c => c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFDDEBF7' }   // azul pastel
        });
      }
    });

    ws.columns.forEach((c,i)=>{c.width=i<13?15:10;});
    const refK=`K4:K${ws.rowCount}`;
    ws.addConditionalFormatting({
      ref:refK,
      rules:[
        {type:'cellIs',operator:'greaterThan',formulae:['5'],
         style:{fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFFFC7CE'}}}},
        {type:'cellIs',operator:'between',formulae:['1','5'],
         style:{fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FFFFEB9C'}}}},
        {type:'cellIs',operator:'equal',formulae:['0'],
         style:{fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF9BE9A8'}}}}
      ]
    });
    const colObserv=ws.getColumn(14+maxMarks); // índice ajustado por nueva col
    colObserv.protection={locked:false};
    ws.protect('facepulse',{selectLockedCells:true,selectUnlockedCells:true});
  });

  /* 5C. Hoja Parámetros --------------------------------------------- */
  const wsPar=wb.addWorksheet('Parámetros');
  wsPar.addRow(['Feriados (INCLUIDOS en el rango)']);
  feriados.forEach(f=>{
    const [y,m,d]=f.split('-');
    wsPar.addRow([`${d}/${m}/${y}`]);
  });
  wsPar.columns.forEach(c=>c.width=20);

  /* 6. Descargar ----------------------------------------------------- */
  const buf=await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
    `asistencia_${desde}_${hasta}.xlsx`
  );
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
  function fmtHoraConDia(dt, isoBase) {
    const hora = dt.toLocaleTimeString('es-CL');      // «00:12:36 a. m.»
    const iso  = dt.getFullYear() + '-' +          // ← LOCAL ➜  coincide con isoBase
            String(dt.getMonth()+1).padStart(2,'0') + '-' +
            String(dt.getDate()).padStart(2,'0');      // «2025-06-13»
  
    if (iso !== isoBase) {           // ← pertenece al día siguiente
      const [a,m,d] = iso.split('-');
      return `${hora} (${d}/${m})`;  // «00:12:36 a. m. (13/06)»
      // o si prefieres año:  (${d}/${m}/${a.slice(2)})
    }
    return hora;                     // misma fecha ⇒ solo la hora
  }
  function reconstruirIndice() {
    idxAsis = {};
    state.asistencias.forEach(r => {
      if (!r.empId || !r.timestamp?._seconds) return;
      const iso = fechaLocalISO(r.timestamp);
      idxAsis[r.empId] ??= {};
      idxAsis[r.empId][iso] ??= [];
      idxAsis[r.empId][iso].push(r);
    });
  }
  
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
      reconstruirIndice(); 
      renderTablaResumen();
    } catch (error) {
      panel.innerHTML = `<p>Error al cargar: ${error.message}</p>`;
      showToast(`Error: ${error.message}`, 'error');
    }
  }
  function marcasDelDia(empId, iso) {
    return (idxAsis[empId] && idxAsis[empId][iso]) ? idxAsis[empId][iso] : [];
  }
  function registrosDelDia(empId, iso, turno = {}, margenMin = 60) {
    // 0) Garantiza que los registros queden en orden cronológico
    const ordenar = arr => arr.sort(
      (a,b) => (a.timestamp._seconds - b.timestamp._seconds)
    );
  
    // 1) Marcas del propio día, filtradas
    let lista = ordenar(marcasDelDia(empId, iso))
                  .filter(r => {
                    const dt = new Date(r.timestamp._seconds * 1000);
                    return (dt.getHours() * 60 + dt.getMinutes()) > margenMin;
                  });
  
    // 2) Si no hay turno definido no “prestamos” marcas
    if (!turno.entrada || !turno.salida) return lista;
  
    // 3) Tomar marcas tempranas del día siguiente
    const nextIso = new Date(iso + 'T00:00:00');
    nextIso.setDate(nextIso.getDate() + 1);
    const isoNext = nextIso.toISOString().slice(0,10);
  
    const extra = ordenar(marcasDelDia(empId, isoNext))
                    .filter(r => {
                      const dt = new Date(r.timestamp._seconds * 1000);
                      return (dt.getHours() * 60 + dt.getMinutes()) <= margenMin;
                    });
  
    return lista.concat(extra);
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
    const { diasSemana, asistencias, horarios, empleados } = state;
    // 1) Sólo los empId que tienen turno esta semana
    const empleadosConHorario = Object.keys(horarios);
    if (empleadosConHorario.length === 0) {
      panel.innerHTML = `
        <div class="p-4 text-center text-white-700">
          Actualmente no existen registros de horarios para los empleados.
        </div>
      `;
      return;
    }
  
    // 2) Construir la cabecera de la tabla
    let html = `
      <table id="tabla-asistencias" class="w-full">
        <thead class="bg-gray-700 text-gray-300">
          <tr>
            <th class="px-4 py-3 text-left">Empleado</th>
            ${diasSemana.map(date =>
              `<th class="px-4 py-3 text-center">${formatFechaCorta(date)}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-700">
    `;
  
    // 3) Iterar sólo sobre los empleados con horario
    empleadosConHorario.forEach(empId => {
      const nombre = empleados[empId] || empId;
      html += `<tr class="hover:bg-gray-750 transition-colors">`;
      html += `<td class="px-4 py-3 text-gray-100">${nombre}</td>`;
  
      // 4) Para cada día de la semana, marcamos ✔️ o ❌
      diasSemana.forEach(fecha => {
        const hayAsistencia = registrosDelDia(empId, fecha, state.horarios[empId]?.[fecha]).length > 0;
        html += `
          <td
            class="px-4 py-3 text-center celda-dia ${hayAsistencia ? 'text-green-400' : 'text-red-400'}"
            data-empid="${empId}"
            data-fecha="${fecha}"
            style="cursor:pointer"
          >
            ${hayAsistencia ? '✔️' : '❌'}
          </td>
        `;
      });
  
      html += `</tr>`;
    });
  
    html += `</tbody></table>`;
    panel.innerHTML = html;
  
    // 5) Re-conectar listeners para mostrar el modal de detalle
    panel.querySelectorAll('.celda-dia').forEach(td => {
      td.addEventListener('click', () => mostrarDetalle(td.dataset.empid, td.dataset.fecha));
    });
  }
  function mostrarDetalle(empId, fecha) {
    // 1) Filtrar y ordenar las marcas del día
    const detalles = state.asistencias.filter(r =>
      r.empId === empId &&
      r.timestamp &&
      r.timestamp._seconds &&
      fechaLocalISO(r.timestamp) === fecha
    );
    const detallesOrdenados = registrosDelDia(empId, fecha, state.horarios[empId]?.[fecha]);
  
    // 2) Obtener turno programado
    const horariosEmp = (state.horarios[empId] && state.horarios[empId][fecha]) || {};
  
    // 3) Título del modal
    modalTitulo.textContent =
      `Detalle de ${state.empleados[empId] || empId} — ${formatFechaLarga(fecha)}`;
  
    // 4) Calcular entrada, salida y total trabajado
    let entradaDt, salidaDt;
    if (detallesOrdenados.length >= 2) {
      entradaDt = new Date(detallesOrdenados[0].timestamp._seconds * 1000);
      salidaDt  = new Date(detallesOrdenados.at(-1).timestamp._seconds * 1000);
    } else if (detallesOrdenados.length === 1) {
      entradaDt = new Date(detallesOrdenados[0].timestamp._seconds * 1000);
      salidaDt  = null;
    }
    const diffMs    = salidaDt ? (salidaDt - entradaDt) : 0;
    const horasTrab = Math.floor(diffMs / 3600000);
    const minTrab   = Math.floor((diffMs % 3600000) / 60000);
  
    // 5) Calcular atraso
    let atrasoMin = 0;
    if (horariosEmp.entrada && entradaDt) {
      const [hEsp, mEsp] = horariosEmp.entrada.split(':').map(Number);
      const scheduled    = hEsp * 60 + mEsp;
      const actual       = entradaDt.getHours() * 60 + entradaDt.getMinutes();
      atrasoMin = Math.max(0, actual - scheduled);
    }
  
    // 6) Calcular horas extra
    let horasExtra = 0, minExtra = 0, extraMs = 0;
    if (salidaDt && horariosEmp.salida) {
      const [hSal, mSal]   = horariosEmp.salida.split(':').map(Number);
      const salidaProg     = new Date(entradaDt);
      salidaProg.setHours(hSal, mSal, 0, 0);
      extraMs = Math.max(0, salidaDt - salidaProg);
      horasExtra = Math.floor(extraMs / 3600000);
      minExtra   = Math.floor((extraMs % 3600000) / 60000);
    }
  
    // 7) Calcular horas extra netas
    const netMs = Math.max(0, extraMs - atrasoMin * 60_000);
    const hNet  = Math.floor(netMs / 3600000);
    const mNet  = Math.floor((netMs % 3600000) / 60000);
  
    // 8) Calcular duración programada del turno
    let durTurnoH = 0, durTurnoM = 0;
    if (horariosEmp.entrada && horariosEmp.salida) {
      const [hEi, mEi] = horariosEmp.entrada.split(':').map(Number);
      const [hEs, mEs] = horariosEmp.salida.split(':').map(Number);
      const startMin   = hEi * 60 + mEi;
      const endMin     = hEs * 60 + mEs;
      const durMin     = Math.max(0, endMin - startMin);
      durTurnoH = Math.floor(durMin / 60);
      durTurnoM = durMin % 60;
    }
  
    // 9) Construir el cuerpo del modal
    let body = `<ul class="space-y-2 text-gray-100">
      <li class="font-semibold">Total trabajado: ${horasTrab}h ${minTrab}m</li>`;
  
    if (horasExtra > 0 || minExtra > 0) {
      body += `<li class="text-green-400">Horas extra brutas: ${horasExtra}h ${minExtra}m</li>`;
    }
    if (atrasoMin > 0) {
      body += `<li class="text-red-400">Atraso: ${atrasoMin} min</li>`;
    }
    if (hNet > 0 || mNet > 0) {
      body += `<li class="text-yellow-400">Horas extra netas: ${hNet}h ${mNet}m</li>`;
    }
  
    // Separador
    body += `<li><hr class="border-gray-600 my-2"></li>`;
  

    // 10) Listar cada marca con rol, icono y color
    detallesOrdenados.forEach((r, i) => {
      const dt   = new Date(r.timestamp._seconds * 1000);
      const hora = fmtHoraConDia(dt, fecha);   // ← usa helper

      // Determinar rol según posición
      let rol, icono, colorClass;
      if (i === 0) {
        rol        = 'Entrada';
        icono      = '▶️';
        colorClass = 'text-green-300';
      } else if (i === detallesOrdenados.length - 1) {
        rol        = 'Salida';
        icono      = '⏹️';
        colorClass = 'text-red-300';
      } else {
        rol        = 'Pausa';
        icono      = '⏸️';
        colorClass = 'text-yellow-300';
      }

      body += `
        <li class="${colorClass} flex items-center space-x-2">
          <span>${icono}</span>
          <span><strong>${rol}:</strong> ${hora}</span>
        </li>
      `;
    });

  
    // 11) Mostrar turno programado y duración
    if (horariosEmp.entrada || horariosEmp.salida) {
      body += `<li class="mt-2 font-semibold">Horario programado:</li>`;
      if (horariosEmp.entrada) body += `<li>Entrada: ${horariosEmp.entrada}</li>`;
      if (horariosEmp.salida)  body += `<li>Salida:   ${horariosEmp.salida}</li>`;
      if (durTurnoH > 0 || durTurnoM > 0) {
        body += `<li class="text-blue-400">Duración turno: ${durTurnoH}h ${durTurnoM}m</li>`;
      }
    }
  
    body += `</ul>`;
  
    // 12) Renderizar y abrir modal
    modalBody.innerHTML = body;
    modal.style.display  = 'flex';
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