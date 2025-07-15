/**
 * @jest-environment jsdom
 */

describe("Funciones de main.js", () => {
    // ------------------------
    // Funciones utilitarias puras
    // ------------------------
    function toTitleCase(str) {
      return str
        .split(" ")
        .map((word) =>
          word.length > 0
            ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            : ""
        )
        .join(" ");
    }
  
    function toAcronimo(fullName) {
      return fullName
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase())
        .join("");
    }
  
    function debounce(fn, delay) {
      let timer = null;
      return function (...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    }
  
    // ------------------------
    // Simulación de data
    // ------------------------
    const menuSections = [
      { label: "Dashboard", id: "dashboard" },
      { label: "Gestión Empleados", id: "gestion-empleados" },
    ];
  
    const internalLabels = [
      { label: "Empleados Activos", section: "dashboard" },
      { label: "Asistencias Hoy", section: "dashboard" },
    ];
  
    function findMenuMatches(term) {
      return menuSections.filter((s) =>
        s.label.toLowerCase().includes(term)
      );
    }
  
    function findInternalMatches(term) {
      return internalLabels.filter((e) =>
        e.label.toLowerCase().includes(term)
      );
    }
  
    function renderActividad(listado) {
      const cont = document.getElementById("actividad-lista");
      if (!cont) return;
      if (!listado.length) {
        cont.innerHTML = `<li>No hay actividad reciente.</li>`;
        return;
      }
      cont.innerHTML = listado
        .map((e) => `<li>${e.usuario}: ${e.accion}</li>`)
        .join("");
    }
  
    function renderVacaciones(listado) {
      const cont = document.getElementById("vacaciones-lista");
      if (!cont) return;
      if (!listado.length) {
        cont.innerHTML = `<li>No hay empleados con vacaciones.</li>`;
        return;
      }
      cont.innerHTML = listado
        .map((emp) => `<li>${emp.nombre}</li>`)
        .join("");
    }
  
    function filterActividad(term) {
      const cont = document.getElementById("actividad-lista");
      if (!cont) return;
      const original = cont.dataset.originalJson
        ? JSON.parse(cont.dataset.originalJson)
        : [];
      const filtrado = original.filter(
        (e) =>
          e.usuario.toLowerCase().includes(term) ||
          e.accion.toLowerCase().includes(term) ||
          e.fecha.toLowerCase().includes(term)
      );
      renderActividad(filtrado);
    }
  
    function filterVacaciones(term) {
      const cont = document.getElementById("vacaciones-lista");
      if (!cont) return;
      const original = cont.dataset.originalJson
        ? JSON.parse(cont.dataset.originalJson)
        : [];
      const filtrado = original.filter(
        (emp) =>
          emp.nombre.toLowerCase().includes(term) ||
          emp.empId.toLowerCase().includes(term) ||
          emp.fechas.some((f) => f.toLowerCase().includes(term))
      );
      renderVacaciones(filtrado);
    }
  
    function recargarSinFiltro() {
      const actividadCont = document.getElementById("actividad-lista");
      if (actividadCont && actividadCont.dataset.originalJson) {
        const arr = JSON.parse(actividadCont.dataset.originalJson);
        renderActividad(arr);
      }
      const vacCont = document.getElementById("vacaciones-lista");
      if (vacCont && vacCont.dataset.originalJson) {
        const arr = JSON.parse(vacCont.dataset.originalJson);
        renderVacaciones(arr);
      }
    }
  
    // ------------------------
    // Tests
    // ------------------------
  
    test("toTitleCase transforma correctamente", () => {
      expect(toTitleCase("rodrigo cancino")).toBe("Rodrigo Cancino");
    });
  
    test("toAcronimo genera siglas", () => {
      expect(toAcronimo("Rodrigo Cancino")).toBe("RC");
    });
  
    test("debounce ejecuta solo una vez", (done) => {
      const mockFn = jest.fn();
      const debounced = debounce(mockFn, 100);
      debounced();
      debounced();
      debounced();
      setTimeout(() => {
        expect(mockFn).toHaveBeenCalledTimes(1);
        done();
      }, 150);
    });
  
    test("findMenuMatches encuentra coincidencias", () => {
      const res = findMenuMatches("dash");
      expect(res.length).toBe(1);
      expect(res[0].id).toBe("dashboard");
    });
  
    test("findInternalMatches encuentra coincidencias", () => {
      const res = findInternalMatches("activos");
      expect(res[0].label).toBe("Empleados Activos");
    });
  
    test("filterActividad filtra correctamente", () => {
      document.body.innerHTML = `<ul id="actividad-lista"></ul>`;
      const cont = document.getElementById("actividad-lista");
      cont.dataset.originalJson = JSON.stringify([
        { usuario: "Rodrigo", accion: "editó", fecha: "2023-01-01" },
        { usuario: "Maria", accion: "eliminó", fecha: "2023-01-02" },
      ]);
      filterActividad("maria");
      expect(cont.innerHTML).toMatch("Maria");
      expect(cont.innerHTML).not.toMatch("Rodrigo");
    });
  
    test("filterVacaciones filtra correctamente", () => {
      document.body.innerHTML = `<ul id="vacaciones-lista"></ul>`;
      const cont = document.getElementById("vacaciones-lista");
      cont.dataset.originalJson = JSON.stringify([
        { nombre: "Rodrigo", empId: "001", fechas: ["2024-06-01"] },
        { nombre: "Paula", empId: "002", fechas: ["2024-07-01"] },
      ]);
      filterVacaciones("paula");
      expect(cont.innerHTML).toMatch("Paula");
      expect(cont.innerHTML).not.toMatch("Rodrigo");
    });
  
    test("recargarSinFiltro restaura listas", () => {
      document.body.innerHTML = `
        <ul id="actividad-lista" data-original-json='[{"usuario":"Rodrigo","accion":"editó","fecha":"hoy"}]'></ul>
        <ul id="vacaciones-lista" data-original-json='[{"nombre":"Paula","empId":"002","fechas":["2024-07-01"]}]'></ul>
      `;
      recargarSinFiltro();
      expect(document.getElementById("actividad-lista").innerHTML).toMatch("Rodrigo");
      expect(document.getElementById("vacaciones-lista").innerHTML).toMatch("Paula");
    });
  });
  