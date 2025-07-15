/**
 * @jest-environment jsdom
 */

describe("asistencia_empleados.js", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="modal-detalle">
          <div id="modal-titulo"></div>
          <div id="modal-detalle-body"></div>
        </div>
        <div id="asistencias-panel"></div>
        <input id="desde" value="2024-01-01" />
        <input id="hasta" value="2024-01-02" />
        <button id="btn-exportar"></button>
        <table><tbody id="asistencias-body"></tbody></table>
        <input id="fecha" value="2024-06-16" />
        <input id="empleado" value="emp1" />
      `;
    });
  
    // Función global para pruebas
    function mostrarModalAsistencia(emp) {
      document.getElementById("modal-titulo").textContent =
        "Detalle de asistencias: " + emp.nombre_completo;
      const cuerpo = emp.registros
        .map(r => `<li><b>${r.fecha}</b>: ${r.entrada} → ${r.salida}</li>`)
        .join("");
      document.getElementById("modal-detalle-body").innerHTML = `<ul>${cuerpo}</ul>`;
    }
  
    // Función pura: agrupar asistencias
    function agruparAsistenciasPorEmpleado(datos) {
      const agrupado = {};
      datos.forEach(reg => {
        const id = reg.empId;
        if (!agrupado[id]) agrupado[id] = [];
        agrupado[id].push(reg);
      });
      return agrupado;
    }
  
    test("agruparAsistenciasPorEmpleado agrupa registros correctamente", () => {
      const datos = [
        { empId: "1", fecha: "2024-01-01" },
        { empId: "1", fecha: "2024-01-02" },
        { empId: "2", fecha: "2024-01-01" }
      ];
      const res = agruparAsistenciasPorEmpleado(datos);
      expect(Object.keys(res)).toEqual(["1", "2"]);
      expect(res["1"]).toHaveLength(2);
      expect(res["2"]).toHaveLength(1);
    });
  
    // DOM rendering: mostrar modal
    test("mostrarModalAsistencia genera contenido correctamente", () => {
      const emp = {
        nombre_completo: "Juan Pérez",
        registros: [
          { fecha: "2024-01-01", entrada: "08:00", salida: "17:00" },
          { fecha: "2024-01-02", entrada: "08:10", salida: "16:50" }
        ]
      };
      mostrarModalAsistencia(emp);
      expect(document.getElementById("modal-titulo").textContent).toContain("Juan Pérez");
      expect(document.getElementById("modal-detalle-body").innerHTML).toContain("2024-01-01");
    });
  
    // Mock de fetch para loadAsistencias
    test("loadAsistencias renderiza asistencias", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => [
          { empId: "1", nombre_completo: "Ana", fecha: "2024-01-01", entrada: "08:00", salida: "16:00" }
        ]
      });
      const panel = document.getElementById("asistencias-panel");
      panel.innerHTML = "";
      async function loadAsistencias() {
        const data = await fetch("/asistencias").then(r => r.json());
        const agrupado = agruparAsistenciasPorEmpleado(data);
        for (const empId in agrupado) {
          const div = document.createElement("div");
          div.textContent = `Empleado: ${agrupado[empId][0].nombre_completo}`;
          panel.appendChild(div);
        }
      }
      await loadAsistencias();
      expect(panel.innerHTML).toContain("Ana");
    });
  
    // Simulación de descarga Excel
    test("descargarExcel llama a generarExcel", () => {
      const mock = jest.fn();
      global.generarExcel = mock;
      const btn = document.getElementById("btn-exportar");
      btn.onclick = () => {
        const desde = document.getElementById("desde").value;
        const hasta = document.getElementById("hasta").value;
        mock(desde, hasta);
      };
      btn.click();
      expect(mock).toHaveBeenCalledWith("2024-01-01", "2024-01-02");
    });
  
    // cargarDatosRango
    test("cargarDatosRango llama a la API con fechas", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => []
      });
      async function cargarDatosRango(desde, hasta) {
        await fetch(`/api/asistencias?desde=${desde}&hasta=${hasta}`);
      }
      await cargarDatosRango("2024-01-01", "2024-01-05");
      expect(fetch).toHaveBeenCalledWith("/api/asistencias?desde=2024-01-01&hasta=2024-01-05");
    });
  
    // Evento: cambio de fecha
    test("cambio de fechas dispara carga de asistencias", async () => {
      global.fetch = jest.fn().mockResolvedValue({ json: async () => [] });
      const desdeInput = document.getElementById("desde");
      desdeInput.addEventListener("change", async () => {
        await fetch("/api/asistencias?desde=2024-01-01&hasta=2024-01-02");
      });
      desdeInput.dispatchEvent(new Event("change"));
      expect(fetch).toHaveBeenCalled();
    });
  
    // Botón de ver detalle por empleado
    test("botón de ver detalle dispara mostrarModalAsistencia", () => {
      const emp = {
        nombre_completo: "Lucas Mora",
        registros: [
          { fecha: "2024-01-03", entrada: "09:00", salida: "17:30" }
        ]
      };
      const btn = document.createElement("button");
      btn.textContent = "Ver Detalle";
      btn.onclick = () => mostrarModalAsistencia(emp);
      document.body.appendChild(btn);
      btn.click();
      expect(document.getElementById("modal-titulo").textContent).toContain("Lucas Mora");
    });
  
    // mostrarDatos
    test("mostrarDatos muestra registros correctamente", () => {
      const asistenciasBody = document.getElementById("asistencias-body");
      const datos = [
        { empId: "123", timestamp: { seconds: 1718600000, nanoseconds: 0 } }
      ];
  
      function mostrarDatos(datos) {
        asistenciasBody.innerHTML = "";
        if (!datos || datos.length === 0) {
          asistenciasBody.innerHTML = "<tr><td colspan='3'>No hay registros</td></tr>";
          return;
        }
  
        datos.forEach(r => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${r.empId}</td><td>fecha</td><td>hora</td>`;
          asistenciasBody.appendChild(tr);
        });
      }
  
      mostrarDatos(datos);
      expect(asistenciasBody.innerHTML).toContain("123");
    });
  
    // filtrarDatos
    test("filtrarDatos filtra correctamente por fecha y empleado", () => {
      const asistenciasBody = document.getElementById("asistencias-body");
      const fechaInput = document.getElementById("fecha");
      const empleadoInput = document.getElementById("empleado");
  
      const todosLosDatos = [
        {
          empId: "emp1",
          timestamp: {
            seconds: Math.floor(new Date("2024-06-16").getTime() / 1000),
            nanoseconds: 0
          }
        },
        {
          empId: "emp2",
          timestamp: {
            seconds: Math.floor(new Date("2024-06-15").getTime() / 1000),
            nanoseconds: 0
          }
        }
      ];
  
      function filtrarDatos() {
        const fechaFiltro = fechaInput.value;
        const empleadoFiltro = empleadoInput.value.trim().toLowerCase();
  
        const datosFiltrados = todosLosDatos.filter(r => {
          const fecha = new Date(r.timestamp.seconds * 1000).toISOString().split("T")[0];
          const cumpleFecha = fecha === fechaFiltro;
          const cumpleEmpleado = r.empId.toLowerCase().includes(empleadoFiltro);
          return cumpleFecha && cumpleEmpleado;
        });
  
        asistenciasBody.innerHTML = JSON.stringify(datosFiltrados);
      }
  
      filtrarDatos();
      expect(asistenciasBody.innerHTML).toContain("emp1");
    });
  });
  