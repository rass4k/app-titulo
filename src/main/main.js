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
        pageContent.innerHTML = `
          <h2>Dashboard</h2>
          <p>Aquí se muestran estadísticas y datos generales.</p>`;
        break;

        case 'gestion-empleados':
          pageContent.innerHTML = `
            <h2>Gestión de Empleados</h2>
            <button id="btn-gestionar-empleados">Gestionar Empleados</button>
            <button id="btn-asignar-horarios" style="margin-left: 10px;">Asignar Horarios</button>
            <div id="gestion-empleados-contenido" style="margin-top: 20px;"></div>
          `;
        
          document.getElementById('btn-gestionar-empleados').addEventListener('click', () => {
             window.location.href ='gestionar-empleados.html';
            // Aquí podrías cargar dinámicamente un formulario o tabla de empleados
          });
        
          document.getElementById('btn-asignar-horarios').addEventListener('click', () => {
            window.location.href = 'horarios.html';
          });
        
          break;
        

      case 'registrar-empleados':
        // Redirige al formulario de registro en la misma ventana
        window.location.href = 'empleados_form.html';
        return;

      case 'registro-asistencia':
        pageContent.innerHTML = `
          <h2>Registro de Asistencia</h2>
          <button id="btn-start-asistencia">Gestionar Asistencias</button>
          <button id="btn-ver-asistencias" style="margin-left:10px;">Historico Reconocimiento Facial</button>
          <div id="asistencia-status" style="margin-top:1em;"></div>`;

        const btnAsis  = document.getElementById('btn-start-asistencia');
        const btnVer   = document.getElementById('btn-ver-asistencias');

        btnVer.addEventListener('click', () => {
          window.location.href = 'asistencia.html';
        });

        btnAsis.addEventListener('click', async () => {
          window.location.href = 'asistencia_empleado.html';
        });
        break;

      default:
        pageContent.innerHTML = `
          <h2>Bienvenido</h2>
          <p>Selecciona una opción del menú.</p>`;
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

  // Carga inicial
  loadContent('dashboard');
});
