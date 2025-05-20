document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_KEY = 'ID_TOKEN';
  const readToken = () => sessionStorage.getItem(TOKEN_KEY);
  const saveToken = t => sessionStorage.setItem(TOKEN_KEY, t);

  const btnRefresh      = document.getElementById('btn-refresh');
  const btnAsis         = document.getElementById('btn-reconocer');
  const asistenciasBody = document.getElementById('asistencias-body');
  const statusDiv       = document.getElementById('status');

  async function loadTabla() {
    try {
      btnRefresh.disabled = true;
      btnRefresh.textContent = 'Cargando…';
      statusDiv.textContent = '';

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
      console.log('🔍 /tabla status:', res.status, res.statusText);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} ${res.statusText} – ${text}`);
      }

      const rows = await res.json();
      console.log('📊 Datos recibidos:', rows);

      asistenciasBody.innerHTML = '';
      if (!Array.isArray(rows) || rows.length === 0) {
        asistenciasBody.innerHTML = '<tr><td colspan="4">No hay registros</td></tr>';
        return;
      }

      rows.forEach(r => {
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

        const tipo = r.tipo || '';
        const empId = r.empId || '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${empId}</td>
          <td>${fecha}</td>
          <td>${hora}</td>
        `;
        asistenciasBody.appendChild(tr);
      });

    } catch (err) {
      console.error('Error cargando tabla:', err);
      statusDiv.textContent = `⚠️ No se pudo cargar la tabla: ${err.message}`;
    } finally {
      btnRefresh.disabled = false;
      btnRefresh.textContent = 'Refresh Tabla';
    }
  }

  // Inicializar
  loadTabla();
  btnRefresh.addEventListener('click', loadTabla);

  btnAsis.addEventListener('click', async () => {
    try {
      btnAsis.disabled = true;
      btnAsis.textContent = 'Iniciando reconocimiento…';

      let idToken = readToken();
      if (!idToken && window.authAPI) {
        idToken = await window.authAPI.getIdToken();
        saveToken(idToken);
      }
      window.facialAPI.compararRostros(idToken);
    } catch (err) {
      console.error('Error en reconocimiento:', err);
    } finally {
      btnAsis.disabled = false;
      btnAsis.textContent = 'Reconocer Empleado';
    }
  });
});
