document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_KEY = 'ID_TOKEN';
  const readToken = () => sessionStorage.getItem(TOKEN_KEY);
  const saveToken = t => sessionStorage.setItem(TOKEN_KEY, t);

  const btnRefresh = document.getElementById('btn-refresh');
  const btnAsis = document.getElementById('btn-reconocer');
  const fechaInput = document.getElementById('fecha');
  const empleadoInput = document.getElementById('empleado');
  const asistenciasBody = document.getElementById('asistencias-body');

  // Variable para almacenar todos los datos
  let todosLosDatos = [];

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg text-white z-50 ${type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  function mostrarDatos(datos) {
    asistenciasBody.innerHTML = '';
    if (!datos || datos.length === 0) {
      asistenciasBody.innerHTML = '<tr class="hover:bg-dark/80 transition-colors"><td colspan="3" class="px-6 py-4 whitespace-nowrap text-sm text-light text-center">No hay registros</td></tr>';
      return;
    }

    datos.forEach(r => {
      let fecha = '';
      let hora = '';
      if (r.timestamp) {
        const secs = r.timestamp.seconds ?? r.timestamp._seconds;
        const nanos = r.timestamp.nanoseconds ?? r.timestamp._nanoseconds ?? 0;
        if (typeof secs === 'number') {
          const ms = secs * 1000 + Math.floor(nanos / 1e6);
          const fechaObj = new Date(ms);
          fecha = fechaObj.toLocaleDateString();
          hora = fechaObj.toLocaleTimeString();
        }
      }

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-dark/80 transition-colors';
      tr.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm text-light">${r.empId || ''}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-light">${fecha}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-light">${hora}</td>
      `;
      asistenciasBody.appendChild(tr);
    });
  }

  function filtrarDatos() {
    const fechaFiltro = fechaInput.value;
    const empleadoFiltro = empleadoInput.value.trim().toLowerCase();

    if (!fechaFiltro && !empleadoFiltro) {
      mostrarDatos(todosLosDatos);
      return;
    }

    const datosFiltrados = todosLosDatos.filter(r => {
      let cumpleFecha = true;
      let cumpleEmpleado = true;

      if (fechaFiltro) {
        const secs = r.timestamp.seconds ?? r.timestamp._seconds;
        const nanos = r.timestamp.nanoseconds ?? r.timestamp._nanoseconds ?? 0;
        if (typeof secs === 'number') {
          const ms = secs * 1000 + Math.floor(nanos / 1e6);
          const fechaObj = new Date(ms);
          const fechaStr = fechaObj.toISOString().split('T')[0];
          cumpleFecha = fechaStr === fechaFiltro;
        }
      }

      if (empleadoFiltro) {
        cumpleEmpleado = (r.empId || '').toLowerCase().includes(empleadoFiltro);
      }

      return cumpleFecha && cumpleEmpleado;
    });

    mostrarDatos(datosFiltrados);
  }

  async function loadTabla() {
    try {
      btnRefresh.disabled = true;
      btnRefresh.textContent = 'Cargando…';
      showToast('Cargando datos...', 'info');

      let idToken = readToken();
      if (!idToken && window.authAPI) {
        idToken = await window.authAPI.getIdToken();
        saveToken(idToken);
      }

      const res = await fetch('https://connection-bd.onrender.com/tabla', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} ${res.statusText} – ${text}`);
      }

      const rows = await res.json();
      console.log('📊 Datos recibidos:', rows);
      
      todosLosDatos = rows;
      mostrarDatos(todosLosDatos);
      showToast('Datos cargados correctamente', 'success');

    } catch (err) {
      console.error('Error cargando tabla:', err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btnRefresh.disabled = false;
      btnRefresh.textContent = 'Refresh';
    }
  }

  // Manejadores de eventos para filtrado automático
  fechaInput.addEventListener('change', filtrarDatos);
  empleadoInput.addEventListener('input', filtrarDatos);

  // Manejador del botón Reconocer
  btnAsis.addEventListener('click', async () => {
    try {
      btnAsis.disabled = true;
      btnAsis.textContent = 'Iniciando reconocimiento…';
      showToast('Iniciando reconocimiento facial...', 'info');

      let idToken = readToken();
      if (!idToken && window.authAPI) {
        idToken = await window.authAPI.getIdToken();
        saveToken(idToken);
      }

      await window.facialAPI.compararRostros(idToken);
      showToast('Reconocimiento completado', 'success');
    } catch (err) {
      console.error('Error en reconocimiento:', err);
      showToast(`Error en reconocimiento: ${err.message}`, 'error');
    } finally {
      btnAsis.disabled = false;
      btnAsis.textContent = 'Reconocer';
    }
  });

  // Inicializar
  loadTabla();
  btnRefresh.addEventListener('click', loadTabla);
});