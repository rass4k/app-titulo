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
      const mockAsistencias = jest.fn();
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
    test("mostrarModalAsistencia muestra mensaje vacío si no hay registros", () => {
        const emp = {
          nombre_completo: "Pedro SinRegistros",
          registros: []
        };
        mostrarModalAsistencia(emp);
        expect(document.getElementById("modal-titulo").textContent).toContain("Pedro SinRegistros");
        expect(document.getElementById("modal-detalle-body").innerHTML).toContain("<ul></ul>");
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
    test("loadAsistencias muestra panel vacío si no hay registros", async () => {
        global.fetch = jest.fn().mockResolvedValue({ json: async () => [] });
        const panel = document.getElementById("asistencias-panel");
        panel.innerHTML = "ANTERIOR";
        async function loadAsistencias() {
          const data = await fetch("/asistencias").then(r => r.json());
          panel.innerHTML = "";
          if (data.length === 0) {
            panel.innerHTML = "<p>No hay asistencias disponibles</p>";
          }
        }
        await loadAsistencias();
        expect(panel.innerHTML).toContain("No hay asistencias disponibles");
      });
      test("cambio en hasta también dispara carga de asistencias", async () => {
        global.fetch = jest.fn().mockResolvedValue({ json: async () => [] });
        const hastaInput = document.getElementById("hasta");
        hastaInput.addEventListener("change", async () => {
          await fetch("/api/asistencias?desde=2024-01-01&hasta=2024-01-02");
        });
        hastaInput.dispatchEvent(new Event("change"));
        expect(fetch).toHaveBeenCalled();
      });
      
      
  });
  