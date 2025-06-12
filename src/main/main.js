// src/renderer/main.js
/* ------------------------------------------------
 * Inicializar Firebase Auth en el cliente
 * ------------------------------------------------ */

import {
  getAuth,
  reauthenticateWithCredential,
  EmailAuthProvider,
  verifyBeforeUpdateEmail
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBpiHbgAutYlf7hErNdipunTuJFFyqQc2U",
  authDomain: "trabajotitulo-22b92.firebaseapp.com",
  projectId: "trabajotitulo-22b92",
  storageBucket: "trabajotitulo-22b92.firebasestorage.app",
  messagingSenderId: "652621572271",
  appId: "1:652621572271:web:9d40986ed6179087cc0c5a",
  measurementId: "G-V5VK2BKFWJ",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

/* ------------------------------------------------
 * Helpers para cachear el ID Token en sessionStorage
 * ------------------------------------------------ */
const TOKEN_KEY = "ID_TOKEN";
const readToken = () => sessionStorage.getItem(TOKEN_KEY);
const saveToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);

/* ------------------------------------------------
 * Helper: convierte "rodrigo cancino" → "Rodrigo Cancino"
 * ------------------------------------------------ */
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

/* ------------------------------------------------
 * Helper: construye acrónimo de un nombre completo
 * Ejemplo: "Rodrigo Cancino" → "RC"
 * ------------------------------------------------ */
function toAcronimo(fullName) {
  return fullName
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}
/* ------------------------------------------------
 * Función debounce para optimizar listeners de input
 * ------------------------------------------------ */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
/* ------------------------------------------------
 * Lista de secciones del menú lateral
 * ------------------------------------------------ */
const menuSections = [
  { label: "Dashboard",              id: "dashboard" },
  { label: "Gestión Empleados",      id: "gestion-empleados" },
  { label: "Registrar Empleados",    id: "registrar-empleados" },
  { label: "Registro de Asistencia", id: "registro-asistencia" },
];

const internalLabels = [
  // Cards principales del Dashboard
  { label: "Empleados Activos",        section: "dashboard" },
  { label: "Asistencias Hoy",           section: "dashboard" },
  { label: "Nuevos Registros",          section: "dashboard" },
  { label: "Horas Trabajadas",          section: "dashboard" },
  // Subtítulos / encabezados dentro de Dashboard
  { label: "Asistencia Mensual",        section: "dashboard" },
  { label: "Distribución por Empleado", section: "dashboard" },
  { label: "Actividad Reciente",        section: "dashboard" },
  { label: "Empleados de Vacaciones",   section: "dashboard" },

  // ← Aquí añade también los labels de las cards de las otras secciones ↓

  // Gestión de Empleados
  { label: "Gestionar Empleados", section: "gestion-empleados" },
  { label: "Asignar Horarios",    section: "gestion-empleados" },

  // Registrar Empleados
  { label: "Ir al Formulario",    section: "registrar-empleados" },

  // Registro de Asistencia
  { label: "Gestionar Asistencias", section: "registro-asistencia" },
  { label: "Histórico Facial",      section: "registro-asistencia" },
];


/* ------------------------------------------------
 * Buscar coincidencias en el menú lateral
 * ------------------------------------------------ */
function findMenuMatches(term) {
  return menuSections.filter((s) =>
    s.label.toLowerCase().includes(term)
  );
}

/* ------------------------------------------------
 * –– NUEVO ––: Buscar coincidencias en etiquetas internas
 * ------------------------------------------------ */
function findInternalMatches(term) {
  return internalLabels.filter((e) =>
    e.label.toLowerCase().includes(term)
  );
}

/* ------------------------------------------------
 * –– NUEVO ––: Si hay exactamente una coincidencia interna,
 * redirigimos directamente a esa sección.
 * ------------------------------------------------ */
function handleInternalRedirect(matches) {
  if (matches.length === 1) {
    const destino = matches[0].section;
    loadContent(destino);
    searchInput.value = "";
    suggestionsContainer.classList.add("hidden");
    return true;
  }
  return false;
}

/* ------------------------------------------------
 * Renderizar sugerencias (dropdown) del menú o internas
 * ------------------------------------------------ */
function renderMenuSuggestions(matches) {
  if (!suggestionsContainer) return;
  if (matches.length === 0) {
    suggestionsContainer.classList.add("hidden");
    suggestionsContainer.innerHTML = "";
    return;
  }

  const html = matches
    .map(
      (m) => `
      <div
        class="px-4 py-2 hover:bg-gray-100 cursor-pointer text-gray-800"
        data-section-id="${m.id}"
      >
        ${m.label}
      </div>
    `
    )
    .join("");

  suggestionsContainer.innerHTML = html;
  suggestionsContainer.classList.remove("hidden");

  matches.forEach((m) => {
    const el = suggestionsContainer.querySelector(
      `[data-section-id="${m.id}"]`
    );
    if (el) {
      el.addEventListener("click", () => {
        searchInput.value = "";
        suggestionsContainer.classList.add("hidden");
        loadContent(m.id);
      });
    }
  });
}

/* ------------------------------------------------
 * Variables globales para uso en listeners
 * ------------------------------------------------ */
let searchInput = null;
let suggestionsContainer = null;

/* ------------------------------------------------
 * Funciones para renderizar y filtrar “Actividad Reciente”
 * ------------------------------------------------ */
function renderActividad(listado) {
  const cont = document.getElementById("actividad-lista");
  if (!cont) return;
  if (!listado.length) {
    cont.innerHTML = `<li class="py-2 text-center text-gray-400">No hay actividad reciente.</li>`;
    return;
  }
  cont.innerHTML = listado
    .map(
      (e) => `
    <li class="py-2 flex items-start">
      <div class="text-indigo-500 mr-3 mt-1"><i class="fas fa-history"></i></div>
      <div>
        <p><strong>${e.usuario}</strong> ${e.accion}</p>
        <p class="text-gray-400 text-xs">${e.fecha}</p>
      </div>
    </li>
  `
    )
    .join("");
}

function filterActividad(term) {
  const cont = document.getElementById("actividad-lista");
  if (!cont) return;
  // Tomamos los <li> originales guardados en data-original-json
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

/* ------------------------------------------------
 * Funciones para renderizar y filtrar “Vacaciones”
 * ------------------------------------------------ */
function renderVacaciones(listado) {
  const cont = document.getElementById("vacaciones-lista");
  if (!cont) return;
  if (!listado.length) {
    cont.innerHTML = `<li class="py-2 text-center text-gray-400">No hay empleados con vacaciones esta semana.</li>`;
    return;
  }
  cont.innerHTML = listado
    .map(
      (emp) => `
    <li class="py-2 flex items-center">
      <div
        class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center
               text-green-600 font-medium mr-3">
        ${emp.nombre.charAt(0)}
      </div>
      <div class="flex-1">
        <p>
          <strong>${emp.nombre}</strong>
          <span class="text-gray-500 text-xs"> (ID: ${emp.empId})</span>
        </p>
        <p class="text-gray-400 text-xs">
          Rango: ${emp.fechas.join(", ")}
        </p>
      </div>
    </li>
  `
    )
    .join("");
}

function filterVacaciones(term) {
  const cont = document.getElementById("vacaciones-lista");
  if (!cont) return;
  // Tomamos los <li> originales guardados en data-original-json
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

/* ------------------------------------------------
 * “reset” de listas a su estado completo
 * ------------------------------------------------ */
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
let loadContent;
/* ------------------------------------------------
 * Esperamos a que el DOM esté listo
 * ------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  // Referencias a elementos globales de DOM
  searchInput = document.getElementById("global-search");
  suggestionsContainer = document.getElementById("search-suggestions");
  const avatarBtn = document.querySelector(".user-avatar");
  const userNameSpan = document.querySelector(".user-name");
  const links = document.querySelectorAll("#sidebar ul li a");

  /* ------------------------------------------------
   * Definición de loadContent dentro de este scope
   * para que tenga acceso a avatarBtn y userNameSpan
   * ------------------------------------------------ */
  loadContent = function (section) {
    // Remueve la clase .active del menú
    document
      .querySelectorAll("#sidebar ul li a")
      .forEach((link) => link.classList.remove("active"));
    // Agrega .active al seleccionado
    const activeLink = document.getElementById(`menu-${section}`);
    if (activeLink) activeLink.classList.add("active");

    const pageContent = document.getElementById("page-content");
    switch (section) {
      case "dashboard":
        pageContent.innerHTML = `
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 id="welcome-message" class="text-2xl font-bold text-gray-800">Bienvenido</h2>
              <p id="current-date" class="text-white-500 text-sm"></p>
            </div>
            <div class="flex items-center space-x-2" class="text-gray-700">
              <label for="filtro-periodo" class="text-white-500 text-sm">Período:</label>
              <select id="filtro-periodo"
                      class="border border-gray-300 rounded-md px-3 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" >
                <option class="text-gray-700" value="7">Últimos 7 días</option>
                <option class="text-gray-700" value="30">Últimos 30 días</option>
                <option class="text-gray-700" value="mes">Este mes</option>
              </select>
            </div>
          </div>

          <!-- Estadísticas -->
          <div id="stats-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"></div>

          <!-- Gráficos -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div class="bg-white p-6 rounded-lg shadow-lg">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-800">Asistencias</h3>
                <button id="refresh-asistencias" class="text-indigo-500 hover:text-indigo-700 text-sm">
                  Actualizar
                </button>
              </div>
              <canvas id="grafico1" class="w-full h-64"></canvas>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-lg">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-800">Distribución por Empleado</h3>
                <button id="refresh-empleado" class="text-indigo-500 hover:text-indigo-700 text-sm">
                  Actualizar
                </button>
              </div>
              <canvas id="grafico2" class="w-full h-64"></canvas>
            </div>
          </div>

          <!-- Listas -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="bg-white p-6 rounded-lg shadow-lg">
              <h3 class="text-lg font-semibold mb-4 text-gray-800">Actividad Reciente</h3>
              <ul id="actividad-lista"
                  class="h-64 overflow-hidden divide-y divide-gray-200 text-gray-700 text-sm"
                  data-original-json="">
              </ul>
              <div class="mt-4 text-center">
                <a href="#" id="ver-toda-actividad" class="text-indigo-600 hover:underline text-sm">
                  Ver toda la actividad
                </a>
              </div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-lg">
              <h3 class="text-lg font-semibold mb-4 text-gray-800">Empleados de Vacaciones</h3>
              <ul id="vacaciones-lista"
                  class="h-64 overflow-auto divide-y divide-gray-200 text-gray-700 text-sm"
                  data-original-json="">
              </ul>
            </div>
          </div>
        `;

        // 1) Mostrar fecha actual
        document.getElementById("current-date").textContent =
          new Date().toLocaleDateString("es-ES", {
            weekday: "long", year: "numeric", month: "long", day: "numeric"
          });

        // 2) Función unificada de fetch + render
        function cargarDashboard(periodo) {
          const dias = periodo === "mes" ? 30 : parseInt(periodo, 10);
          const token = readToken();

          fetch(
            `https://connection-bd.onrender.com/dashboard-datos?diasAsistencias=${dias}&diasEmpleados=${dias}`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          .then(r => {
            if (!r.ok) throw new Error("Error al obtener datos");
            return r.json();
          })
          .then(data => {
            // --- Cabecera y avatar ---
            const nombre = toTitleCase(data.userNombre || "");
            document.getElementById("welcome-message").textContent = `Bienvenido, ${nombre}`;
            document.querySelector(".user-avatar").textContent = toAcronimo(data.userNombre);
            document.querySelector(".user-name").textContent   = nombre;

            // --- Tarjetas ---
            document.getElementById("stats-cards").innerHTML = `
              <div class="bg-indigo-50 rounded-lg shadow p-5 flex items-center">
                <div class="p-3 bg-indigo-100 rounded-full">
                  <i class="fas fa-users text-indigo-600 text-2xl"></i>
                </div>
                <div class="ml-4">
                  <p class="text-gray-500 text-sm">Empleados Activos</p>
                  <p class="text-2xl font-bold text-gray-800">${data.empleadosActivos}</p>
                </div>
              </div>
              <div class="bg-green-50 rounded-lg shadow p-5 flex items-center">
                <div class="p-3 bg-green-100 rounded-full">
                  <i class="fas fa-calendar-check text-green-600 text-2xl"></i>
                </div>
                <div class="ml-4">
                  <p class="text-gray-500 text-sm">Asistencias Hoy</p>
                  <p class="text-2xl font-bold text-gray-800">${data.asistenciasHoy}</p>
                </div>
              </div>
              <div class="bg-yellow-50 rounded-lg shadow p-5 flex items-center">
                <div class="p-3 bg-yellow-100 rounded-full">
                  <i class="fas fa-user-plus text-yellow-600 text-2xl"></i>
                </div>
                <div class="ml-4">
                  <p class="text-gray-500 text-sm">Nuevos Registros</p>
                  <p class="text-2xl font-bold text-gray-800">${data.nuevosRegistros}</p>
                </div>
              </div>
              <div class="bg-blue-50 rounded-lg shadow p-5 flex items-center">
                <div class="p-3 bg-blue-100 rounded-full">
                  <i class="fas fa-clock text-blue-600 text-2xl"></i>
                </div>
                <div class="ml-4">
                  <p class="text-gray-500 text-sm">Horas Trabajadas</p>
                  <p class="text-2xl font-bold text-gray-800">${data.horasTrabajadas}</p>
                </div>
              </div>
            `;

            // --- Gráfico de barras ---
            const ctx1 = document.getElementById("grafico1").getContext("2d");
            if (window.chart1) window.chart1.destroy();
            window.chart1 = new Chart(ctx1, {
              type: "bar",
              data: {
                labels: data.grafico1.labels,
                datasets: [{ 
                  data: data.grafico1.data,
                  backgroundColor: "rgba(99,102,241,0.7)",
                  borderColor:     "rgba(99,102,241,1)",
                  borderWidth: 1
                }]
              },
              options: { responsive: true }
            });

            // --- Gráfico de dona ---
            const ctx2 = document.getElementById("grafico2").getContext("2d");
            if (window.chart2) window.chart2.destroy();
            window.chart2 = new Chart(ctx2, {
              type: "doughnut",
              data: {
                labels: data.grafico2.labels,
                datasets: [{ 
                  data: data.grafico2.data,
                  backgroundColor: [
                    "rgba(34,197,94,0.7)",
                    "rgba(239,68,68,0.7)",
                    "rgba(59,130,246,0.7)",
                    "rgba(168,85,247,0.7)",
                    "rgba(249,115,22,0.7)"
                  ]
                }]
              },
              options: { responsive: true }
            });

            // --- Actividad Reciente: sólo primeras 5 ---
            const allAct = data.actividadReciente;
            const primeros5 = allAct.slice(0, 5);
            const ulAct = document.getElementById("actividad-lista");
            ulAct.innerHTML = "";                // limpiamos cualquier contenido previo
            ulAct.dataset.originalJson = JSON.stringify(allAct);
            renderActividad(primeros5);

            // --- Vacaciones: render completo ---
            const ulVac = document.getElementById("vacaciones-lista");
            ulVac.dataset.originalJson = JSON.stringify(data.empleadosVacaciones);
            renderVacaciones(data.empleadosVacaciones);
          })
          .catch(err => {
            console.error("Error al cargar el dashboard:", err);
            document.getElementById("stats-cards").innerHTML = `
              <div class="col-span-full text-center text-red-500">
                Ocurrió un error al obtener los datos.
              </div>
            `;
          });
        }

        // 3) Conecta UI → la misma función
        const sel = document.getElementById("filtro-periodo");
        sel.addEventListener("change", () => cargarDashboard(sel.value));
        document.getElementById("refresh-asistencias")
                .addEventListener("click", () => cargarDashboard(sel.value));
        document.getElementById("refresh-empleado")
                .addEventListener("click", () => cargarDashboard(sel.value));

        // 4) “Ver toda la actividad” + scroll infinito **DENTRO** de la card
        document.getElementById("ver-toda-actividad")
          .addEventListener("click", e => {
            e.preventDefault();
            const ul = document.getElementById("actividad-lista");
            // activamos scroll
            ul.classList.remove("overflow-hidden");
            ul.classList.add("overflow-auto","h-64");

            const all = JSON.parse(ul.dataset.originalJson || "[]");
            let shown = ul.children.length;  // ya hay 5
            const perPage = 5;

            function loadMore() {
              const slice = all.slice(shown, shown + perPage);
              slice.forEach(item => {
                const li = document.createElement("li");
                li.className = "py-2 flex items-start";
                li.innerHTML = `
                  <div class="text-indigo-500 mr-3 mt-1"><i class="fas fa-history"></i></div>
                  <div>
                    <p><strong>${item.usuario}</strong> ${item.accion}</p>
                    <p class="text-gray-400 text-xs">${item.fecha}</p>
                  </div>`;
                ul.appendChild(li);
              });
              shown += slice.length;
            }

            // carga segundo bloque inmediato
            loadMore();

            // scroll infinito
            ul.addEventListener("scroll", () => {
              if (ul.scrollTop + ul.clientHeight >= ul.scrollHeight - 5 && shown < all.length) {
                loadMore();
              }
            });

            // ocultar enlace
            e.target.style.display = "none";
          });

        // 5) Primer render
        cargarDashboard("7");
        break;


      case "gestion-empleados":
        pageContent.innerHTML = `
          <h1 id="welcome-message">Panel Principal</h1>
          <h2>Desde aquí puedes administrar tu nómina y asignar horarios.</h2>

          <div class="grid grid-cols-2 gap-4 mt-4">
            <div
              id="card-gestionar-empleados"
              class="minimal-card cursor-pointer hover:shadow-lg p-4"
            >
              <div class="card-icon">
                <i class="fas fa-users-cog"></i>
              </div>
              <h3 class="card-title">Gestionar Empleados</h3>
              <p class="card-desc">Ver lista y editar empleados</p>
            </div>

            <div
              id="card-asignar-horarios"
              class="minimal-card cursor-pointer hover:shadow-lg p-4"
            >
              <div class="card-icon">
                <i class="fas fa-calendar-alt"></i>
              </div>
              <h3 class="card-title">Asignar Horarios</h3>
              <p class="card-desc">Asignar turnos a empleados</p>
            </div>
          </div>
        `;
        document
          .getElementById("card-gestionar-empleados")
          .addEventListener("click", () => {
            window.location.href = "gestionar-empleados.html";
          });
        document
          .getElementById("card-asignar-horarios")
          .addEventListener("click", () => {
            window.location.href = "horarios.html";
          });
        break;

      case "registrar-empleados":
        pageContent.innerHTML = `
          <h1 id="welcome-message">Formulario de Registro</h1>
          <h2>Completa los datos para dar de alta un empleado.</h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div
              id="card-registrar-empleados"
              class="minimal-card cursor-pointer hover:shadow-lg p-4"
            >
              <div class="card-icon">
                <i class="fas fa-user-plus"></i>
              </div>
              <h3 class="card-title">Ir al Formulario</h3>
              <p class="card-desc">Rellena el formulario para registrar un nuevo empleado</p>
            </div>
          </div>
        `;
        document
          .getElementById("card-registrar-empleados")
          .addEventListener("click", () => {
            window.location.href = "empleados_form.html";
          });
        break;

      case "registro-asistencia":
        pageContent.innerHTML = `
          <h1 id="welcome-message">Registro de Asistencia</h1>
          <h2>Registra nuevas asistencias o consulta el histórico.</h2>

          <div class="grid grid-cols-2 gap-4 mt-4">
            <div
              id="card-start-asistencia"
              class="minimal-card cursor-pointer hover:shadow-lg p-4"
            >
              <div class="card-icon">
                <i class="fas fa-clipboard-check"></i>
              </div>
              <h3 class="card-title">Gestionar Asistencias</h3>
              <p class="card-desc">Registrar nueva asistencia</p>
            </div>

            <div
              id="card-ver-asistencias"
              class="minimal-card cursor-pointer hover:shadow-lg p-4"
            >
              <div class="card-icon">
                <i class="fas fa-history"></i>
              </div>
              <h3 class="card-title">Histórico Facial</h3>
              <p class="card-desc">Ver asistencias previas</p>
            </div>
          </div>

          <div id="asistencia-status" style="margin-top:1em;"></div>
        `;
        document
          .getElementById("card-start-asistencia")
          .addEventListener("click", () => {
            window.location.href = "asistencia_empleado.html";
          });
        document
          .getElementById("card-ver-asistencias")
          .addEventListener("click", () => {
            window.location.href = "asistencia.html";
          });
        break;

      default:
        pageContent.innerHTML = `
          <h1 id="welcome-message">Bienvenido</h1>
          <div class="minimal-card p-4">
            <div class="card-icon">
              <i class="fas fa-home"></i>
            </div>
            <h3 class="card-title">Inicio</h3>
            <p class="card-desc">Selecciona una opción del menú.</p>
          </div>
        `;
    }
  };

  /* ------------------------------------------------
   * Configuración del listener del buscador global
   * ------------------------------------------------ */
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      debounce((e) => {
        const term = e.target.value.trim().toLowerCase();
        if (!term) {
          recargarSinFiltro();
          suggestionsContainer.classList.add("hidden");
          return;
        }
    
        // 1) Matches del menú lateral, ya con { label, id }
        const menuMatches = findMenuMatches(term).map(m => ({
          label: m.label,
          id: m.id
        }));
    
        // 2) Matches de las cards (internalLabels), re-mapeando section → id
        const cardMatches = findInternalMatches(term).map(m => ({
          label: m.label,
          id: m.section
        }));
    
        // 3) Unimos ambos arrays
        const allMatches = [...menuMatches, ...cardMatches];
    
        if (allMatches.length) {
          renderMenuSuggestions(allMatches);
          filterActividad(term);
          filterVacaciones(term);
        } else {
          suggestionsContainer.classList.add("hidden");
          filterActividad(term);
          filterVacaciones(term);
        }
      }, 200)
    );
    
    

    // Cerrar sugerencias si hace clic fuera
    document.addEventListener("click", (evt) => {
      if (
        suggestionsContainer &&
        !suggestionsContainer.contains(evt.target) &&
        evt.target !== searchInput
      ) {
        suggestionsContainer.classList.add("hidden");
      }
    });
  }

  /* ------------------------------------------------
   * Listener de navegación del menú lateral
   * ------------------------------------------------ */
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const section = link.id.split("menu-")[1];
      loadContent(section);
    });
  });

  /* ------------------------------------------------
   * Toggle sidebar
   * ------------------------------------------------ */
  document.getElementById("toggle-sidebar").addEventListener("click", function () {
    const sidebar = document.getElementById("sidebar");
    const content = document.getElementById("content");
    if (sidebar.style.transform === "translateX(-280px)") {
      sidebar.style.transform = "translateX(0)";
      content.style.marginLeft = "280px";
    } else {
      sidebar.style.transform = "translateX(-280px)";
      content.style.marginLeft = "0";
    }
  });

  /* ------------------------------------------------
   * Toggle user dropdown
   * ------------------------------------------------ */
  document.getElementById("user-menu-button").addEventListener("click", function () {
    const dropdown = document.getElementById("user-dropdown");
    dropdown.classList.toggle("show");
  });

  // Cerrar dropdown si el usuario hace clic fuera
  document.addEventListener("click", function (event) {
    const dropdown = document.getElementById("user-dropdown");
    const button = document.getElementById("user-menu-button");
    if (!button.contains(event.target) && !dropdown.contains(event.target)) {
      dropdown.classList.remove("show");
    }
  });

  /* ------------------------------------------------
   * Funcionalidad de “Cerrar sesión”
   * ------------------------------------------------ */
  const logoutBtn = document.getElementById("logout-button");
  const logoutModal = document.getElementById("logout-modal");
  const cancelLogout = document.getElementById("cancel-logout");
  const confirmLogout = document.getElementById("confirm-logout");

  if (logoutBtn && logoutModal && cancelLogout && confirmLogout) {
    // Mostrar modal
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      logoutModal.classList.remove("hidden");
    });
    // Cancelar
    cancelLogout.addEventListener("click", (e) => {
      e.preventDefault();
      logoutModal.classList.add("hidden");
    });
    // Confirmar cierre de sesión
    confirmLogout.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await auth.signOut();
        sessionStorage.removeItem(TOKEN_KEY);
        window.location.href = "../index.html";
      } catch (err) {
        console.error("Error al cerrar sesión:", err);
      }
    });
    // Cerrar modal al hacer clic fuera del cuadro
    logoutModal.addEventListener("click", (e) => {
      if (e.target === logoutModal) {
        logoutModal.classList.add("hidden");
      }
    });
  }

  
  const profileModal = document.getElementById('profile-modal');
  const profileButton = document.querySelector('[data-action="profile"]');
  const cancelProfileButton = document.getElementById('cancel-profile-btn');
  const saveProfileButton    = document.getElementById('save-profile');
  const profileMessage       = document.getElementById('profile-message');
  const profileName          = document.getElementById('profile-name');
  const profileEmail         = document.getElementById('profile-email');
  const profilePasswordContainer = document.getElementById('profile-password-container');
  const profilePassword          = document.getElementById('profile-password');

  // Nueva versión: carga nombre y correo desde /dashboard-datos
  async function reauthenticateUser() {
    const user = auth.currentUser;
    const password = prompt(
      "Para cambiar tu correo, por favor ingresa tu contraseña actual:"
    );
    if (!password) throw new Error("Reautenticación cancelada.");
    const cred = firebase.auth.EmailAuthProvider.credential(
      user.email,
      password
    );
    await user.reauthenticateWithCredential(cred);
  }

  // 2) Función que engloba todo el flujo de cambio de e-mail + sincronización
  async function changeEmailAndName(newEmail, newName) {
    // a) Reautenticamos
    await reauthenticateUser();

    // b) Actualizamos el email en Auth
    const user = auth.currentUser;
    await verifyBeforeUpdateEmail(user, newEmail, actionCodeSettings);

    // d) Llamamos luego a nuestro endpoint para dejar nombre+e-mail en Firestore
    const token = readToken();
    const res = await fetch(
      "https://connection-bd.onrender.com/usuario/update",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newName, email: newEmail })
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error en servidor");
    return json.mensaje;
  }
  async function loadProfileData() {
    try {
      const token = readToken();
      const res = await fetch(
        'https://connection-bd.onrender.com/dashboard-datos',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('No autorizado');
      const data = await res.json();

      profileName.value  = data.userNombre  || '';
      profileEmail.value = data.userEmail   || '';

      // se mantiene del HTML
    } catch (err) {
      console.error('Error cargando perfil:', err);
      profileMessage.textContent = 'No se pudo cargar los datos del perfil.';
      profileMessage.classList.add('text-red-600');
    }
  }

  let isEditing = false;

// 1) Único listener para abrir el modal (modo lectura)
profileButton.addEventListener("click", () => {
  loadProfileData();
  isEditing = false;
  saveProfileButton.textContent = "Editar";
  profileMessage.textContent = "";

  // ocultamos contraseña y bloqueamos inputs
  profilePasswordContainer.classList.add("hidden");
  [profilePassword, profileName, profileEmail].forEach(i => i.value = "");
  [profileName, profileEmail].forEach(input => {
    input.disabled = true;
// fondo clarito, pero texto oscuro
    input.classList.remove("bg-white", "text-gray-900");
    input.classList.add("bg-gray-100", "text-gray-500");
  });

  profileModal.classList.remove("hidden");
  document.getElementById("user-dropdown").classList.add("hidden");
});

// ─── Escucha de “Cerrar” ────────────────────────────────────────
cancelProfileButton.addEventListener("click", () => {
  isEditing = false;
  profileModal.classList.add("hidden");
});
profileModal.addEventListener("click", (e) => {
  if (e.target === profileModal) {
    isEditing = false;
    profileModal.classList.add("hidden");
  }
});

// ─── Escucha de Editar / Guardar Cambios ────────────────────────
saveProfileButton.addEventListener("click", async () => {
  if (!isEditing) {
    // → pasar a MODO EDICIÓN
    isEditing = true;
    saveProfileButton.textContent = "Guardar Cambios";
    profilePasswordContainer.classList.remove("hidden");

    // habilitar name & email
    [profileName, profileEmail].forEach(input => {
      input.disabled = false;
      // fondo clarito, pero texto oscuro
      input.classList.remove("bg-gray-100", "text-gray-500");
      input.classList.add("bg-white", "text-gray-900");
    });
    return;
  }

  // → estás ya en modo guardado: validamos y guardamos
  const name     = profileName.value.trim();
  const email    = profileEmail.value.trim();
  const password = profilePassword.value;
  const emailRx  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || !emailRx.test(email) || !password) {
    profileMessage.textContent = "Todos los campos son obligatorios";
    return;
  }

  try {
    // REAUTENTICAR con la contraseña del modal
    const user = auth.currentUser;
    const actionCodeSettings = {
      url: "https://connection-bd.onrender.com/verify-email",
      handleCodeInApp: true
    };
    await verifyBeforeUpdateEmail(user, email, actionCodeSettings);
    
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(cred);

    // ACTUALIZAR EMAIL + ENVIAR VERIFICACIÓN nativa
    await verifyBeforeUpdateEmail(user, email, actionCodeSettings);


    // SINCRONIZAR NAME/EMAIL en Firestore via tu endpoint
    const token = readToken();
    const res = await fetch("https://connection-bd.onrender.com/usuario/update", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ name, email })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Error actualizando perfil");

    // VOLVER A MODO LECTURA
    isEditing = false;
    saveProfileButton.textContent = "Editar";
    profilePasswordContainer.classList.add("hidden");
    profileModal.classList.add("hidden");

    [profileName, profileEmail].forEach(input => {
      input.disabled = true;
      input.classList.remove("bg-white", "text-gray-900");
      input.classList.add("bg-gray-100", "text-gray-500");
    });

    // MENSAJE OK
    profileMessage.textContent = json.mensaje || "Perfil actualizado. Revisa tu correo.";
    profileMessage.classList.remove("text-red-600");
    profileMessage.classList.add("text-green-600");

  } catch (err) {
    profileMessage.textContent = `Error: ${err.message}`;
    profileMessage.classList.add("text-red-600");
  }
});
  // Cerrar modal al clic fuera
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) {
      profileModal.classList.add('hidden');
      profileMessage.textContent = '';
    }
  });
  // Carga inicial: mostramos ‘dashboard’ por defecto
  loadContent("dashboard");
});
