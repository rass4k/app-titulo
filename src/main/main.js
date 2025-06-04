// src/renderer/main.js

/* ------------------------------------------------
 * Helpers para cachear el ID Token en sessionStorage
 * ------------------------------------------------ */
const TOKEN_KEY = "ID_TOKEN";
const readToken = () => sessionStorage.getItem(TOKEN_KEY);
const saveToken = t => sessionStorage.setItem(TOKEN_KEY, t);

document.addEventListener('DOMContentLoaded', () => {
  // Simula obtener el email del usuario desde la sesión real
  const userEmail = 'usuario@example.com';
  document.getElementById('welcome-message').textContent = `Bienvenido, ${userEmail}`;

  const links = document.querySelectorAll('#sidebar ul li a');
  const pageContent = document.getElementById('page-content');

  function clearActive() {
    links.forEach(link => link.classList.remove('active'));
  }

  function loadContent(section) {
    clearActive();
    document.getElementById(`menu-${section}`).classList.add('active');

    switch (section) {
      case 'dashboard':
        // Contenedor completo del dashboard
        pageContent.innerHTML = `
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 id="welcome-message" class="text-2xl font-bold text-gray-800">Bienvenido, ${userEmail}</h2>
              <p class="text-gray-500 text-sm" id="current-date"></p>
            </div>
            <div class="flex space-x-2">
              <!-- Dropdown para rango de fechas asistencias -->
              <select id="filtro-fecha-asistencias" class="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="7">Últimos 7 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="mes">Este mes</option>
              </select>
              <!-- Dropdown para rango de fechas empleados -->
              <select id="filtro-fecha-empleados" class="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="7">Registro últimos 7 días</option>
                <option value="30">Registro últimos 30 días</option>
                <option value="mes">Registro este mes</option>
              </select>
            </div>
          </div>

          <!-- Grid de tarjetas de estadísticas -->
          <div id="stats-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"></div>

          <!-- Sección de gráficos -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div class="bg-white p-6 rounded-lg shadow-lg">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-800">Asistencias</h3>
                <button id="refresh-asistencias" class="text-indigo-500 hover:text-indigo-700 text-sm">Actualizar</button>
              </div>
              <canvas id="grafico1" class="w-full h-64"></canvas>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-lg">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-800">Distribución por Empleado</h3>
                <button id="refresh-empleado" class="text-indigo-500 hover:text-indigo-700 text-sm">Actualizar</button>
              </div>
              <canvas id="grafico2" class="w-full h-64"></canvas>
            </div>
          </div>

          <!-- Sección de listas -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div class="bg-white p-6 rounded-lg shadow-lg">
              <h3 class="text-lg font-semibold mb-4 text-gray-800">Actividad Reciente</h3>
              <ul id="actividad-lista" class="divide-y divide-gray-200 text-gray-700 text-sm"></ul>
              <div class="mt-4 text-center">
                <a href="#" class="text-indigo-600 hover:underline text-sm">Ver toda la actividad</a>
              </div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-lg">
              <h3 class="text-lg font-semibold mb-4 text-gray-800">Empleados de Vacaciones</h3>
              <ul id="vacaciones-lista" class="divide-y divide-gray-200 text-gray-700 text-sm"></ul>
              <div class="mt-4 text-center">
                <a href="#" class="text-indigo-600 hover:underline text-sm">Ver todos los permisos</a>
              </div>
            </div>
          </div>
        `;

        // Poner fecha actual en español
        const opcionesFecha = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('current-date').textContent = new Date().toLocaleDateString('es-ES', opcionesFecha);

        // Función para fetch de datos y renderizado de todo
        const cargarDashboard = (diasAsistencias = 7, diasEmpleados = 7) => {
          const token = readToken();
          fetch(`https://connection-bd.onrender.com/dashboard-datos?diasAsistencias=${diasAsistencias}&diasEmpleados=${diasEmpleados}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          .then(res => {
            if (!res.ok) throw new Error('No autorizado o error del servidor');
            return res.json();
          })
          .then(data => {
            // 1. Renderizar tarjetas
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

            // 2. Gráfico de barras (Asistencias por día)
            const ctx1 = document.getElementById("grafico1").getContext("2d");
            if (window.chart1) window.chart1.destroy();
            window.chart1 = new Chart(ctx1, {
              type: "bar",
              data: {
                labels: data.grafico1.labels,
                datasets: [{
                  label: "Asistencias",
                  data: data.grafico1.data,
                  backgroundColor: "rgba(99, 102, 241, 0.7)",
                  borderColor: "rgba(99, 102, 241, 1)",
                  borderWidth: 1
                }]
              },
              options: {
                responsive: true,
                plugins: {
                  legend: { display: false },
                  tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                  x: { grid: { display: false } },
                  y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 },
                    grid: { color: '#f3f4f6' }
                  }
                }
              }
            });

            // 3. Gráfico de dona (Distribución por empleado)
            const ctx2 = document.getElementById("grafico2").getContext("2d");
            if (window.chart2) window.chart2.destroy();
            window.chart2 = new Chart(ctx2, {
              type: "doughnut",
              data: {
                labels: data.grafico2.labels,
                datasets: [{
                  data: data.grafico2.data,
                  backgroundColor: [
                    "rgba(34, 197, 94, 0.7)",
                    "rgba(239, 68, 68, 0.7)",
                    "rgba(59, 130, 246, 0.7)",
                    "rgba(168, 85, 247, 0.7)",
                    "rgba(249, 115, 22, 0.7)"
                  ],
                  borderWidth: 0
                }]
              },
              options: {
                responsive: true,
                plugins: { legend: { position: "bottom" } },
                cutout: '60%'
              }
            });

            // 4. Lista de actividad reciente
            document.getElementById("actividad-lista").innerHTML = data.actividadReciente.length
              ? data.actividadReciente.map(e =>
                  `<li class="py-2 flex items-start">
                    <div class="text-indigo-500 mr-3 mt-1"><i class="fas fa-history"></i></div>
                    <div>
                      <p><strong>${e.usuario}</strong> ${e.accion}</p>
                      <p class="text-gray-400 text-xs">${e.fecha}</p>
                    </div>
                  </li>`
                ).join("")
              : `<li class="py-2 text-center text-gray-400">No hay actividad reciente.</li>`;

            // 5. Lista de empleados de vacaciones
            document.getElementById("vacaciones-lista").innerHTML = data.empleadosVacaciones.length
              ? data.empleadosVacaciones.map(emp =>
                  `<li class="py-2 flex items-center">
                    <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-medium mr-3">${emp.nombre.charAt(0)}</div>
                    <div class="flex-1">
                      <p><strong>${emp.nombre}</strong> <span class="text-gray-500 text-xs">– ${emp.departamento}</span></p>
                      <p class="text-gray-400 text-xs">Del ${emp.rango}</p>
                    </div>
                  </li>`
                ).join("")
              : `<li class="py-2 text-center text-gray-400">No hay empleados de vacaciones.</li>`;
          })
          .catch(error => {
            console.error("Error al cargar el dashboard:", error);
            document.getElementById("stats-cards").innerHTML = `
              <div class="col-span-full text-center text-red-500">
                Ocurrió un error al obtener los datos.
              </div>
            `;
          });
        }; // fin cargarDashboard

        // Cargar inicialmente el dashboard con 7 días por defecto
        cargarDashboard(7, 7);

        // Manejar cambios en los filtros de fecha
        document.getElementById("filtro-fecha-asistencias").addEventListener("change", (e) => {
          const dias = e.target.value === "mes" ? 30 : parseInt(e.target.value);
          cargarDashboard(dias, parseInt(document.getElementById("filtro-fecha-empleados").value));
        });
        document.getElementById("filtro-fecha-empleados").addEventListener("change", (e) => {
          const diasEmp = e.target.value === "mes" ? 30 : parseInt(e.target.value);
          cargarDashboard(parseInt(document.getElementById("filtro-fecha-asistencias").value), diasEmp);
        });

        // Botones de “Actualizar” en cada gráfico
        document.getElementById("refresh-asistencias").addEventListener("click", () => {
          cargarDashboard(parseInt(document.getElementById("filtro-fecha-asistencias").value), parseInt(document.getElementById("filtro-fecha-empleados").value));
        });
        document.getElementById("refresh-empleado").addEventListener("click", () => {
          cargarDashboard(parseInt(document.getElementById("filtro-fecha-asistencias").value), parseInt(document.getElementById("filtro-fecha-empleados").value));
        });

        break;



      case 'gestion-empleados':
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
          .getElementById('card-gestionar-empleados')
          .addEventListener('click', () => {
            window.location.href = 'gestionar-empleados.html';
          });
        document
          .getElementById('card-asignar-horarios')
          .addEventListener('click', () => {
            window.location.href = 'horarios.html';
          });
        break;

      case 'registrar-empleados':
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
          .getElementById('card-registrar-empleados')
          .addEventListener('click', () => {
            window.location.href = 'empleados_form.html';
          });
        break;

      case 'registro-asistencia':
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
          .getElementById('card-start-asistencia')
          .addEventListener('click', () => {
            window.location.href = 'asistencia_empleado.html';
          });
        document
          .getElementById('card-ver-asistencias')
          .addEventListener('click', () => {
            window.location.href = 'asistencia.html';
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


  }

  // Listener de navegación
  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const section = link.id.split('menu-')[1];
      loadContent(section);
    });
  });
  // Toggle sidebar
      document.getElementById('toggle-sidebar').addEventListener('click', function() {
            const sidebar = document.getElementById('sidebar');
            const content = document.getElementById('content');
            
            if (sidebar.style.transform === 'translateX(-280px)') {
                sidebar.style.transform = 'translateX(0)';
                content.style.marginLeft = '280px';
            } else {
                sidebar.style.transform = 'translateX(-280px)';
                content.style.marginLeft = '0';
            }
        });

        // Toggle user dropdown
        document.getElementById('user-menu-button').addEventListener('click', function() {
            const dropdown = document.getElementById('user-dropdown');
            dropdown.classList.toggle('show');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function(event) {
            const dropdown = document.getElementById('user-dropdown');
            const button = document.getElementById('user-menu-button');
            
            if (!button.contains(event.target) && !dropdown.contains(event.target)) {
                dropdown.classList.remove('show');
            }
        });

        

  // Carga inicial
  loadContent('dashboard');
});
