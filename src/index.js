// src/main/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('node:path');

// Maneja accesos directos de instalación (Windows)
if (require('electron-squirrel-startup')) app.quit();

/* ---------- Función que crea la ventana ---------- */
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    webPreferences: {
      contextIsolation: true,                           // ← importante
      preload: path.join(__dirname, 'preload.js'),      // ← tu preload
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.openDevTools();  // opcional: comentar en prod
}

/* ---------- IPC: capturarEmbeddingEnVivo ---------- */
ipcMain.handle('capturarEmbeddingEnVivo', () => {
  return new Promise((resolve, reject) => {
    // Ruta al script Python (ajusta si está en otro directorio)
    const pyPath = path.join(__dirname, 'python', 'registerv2.py');
    // Lanza Python sin argumentos → modo webcam interactivo
    const child = spawn('python', [pyPath]);
    let buffer = '';
    let resolved = false;

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const brace = buffer.indexOf('{');          // buscamos inicio de JSON
      if (brace !== -1 && !resolved) {
        try {
          const json = JSON.parse(buffer.slice(brace));
          resolved = true;
          resolve(json.embedding);                // ← devolvemos array[512]
          child.kill();
        } catch {
          /* aún no llega todo el JSON; seguimos leyendo */
        }
      }
    });

    child.stderr.on('data', (err) => {
      console.error('[python]', err.toString());
    });

    child.on('close', (code) => {
      if (!resolved) reject(new Error(`Python exited with code ${code}`));
    });
  });
});


const fetch = require('node-fetch'); // si lo necesitas

ipcMain.on('compararRostros', (event, idToken) => {
  const pyPath = path.join(__dirname, 'python', 'asistencia.py');
  const child  = spawn('python', [pyPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer   = '';

  child.stdout.on('data', async chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      if (msg.embedding) {
        const embedding = msg.embedding;
        try {
          const resp = await fetch('https://connection-bd.onrender.com/comparar-rostro', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ embedding })
          });

          let nombre = null, distancia = null, mensaje = '';
          if (resp.ok) {
            const data = await resp.json();
            nombre = data.nombre;
            distancia = data.distancia;
            mensaje = nombre
              ? `¡Hola ${nombre}!`
              : `No te reconozco (distancia ${distancia?.toFixed(2)})`;
          } else {
            mensaje = `Error: ${resp.status} ${await resp.text()}`;
          }

          // Escribe la respuesta para que Python la muestre en pantalla
          child.stdin.write(JSON.stringify({ nombre, mensaje }) + '\n');

          // **Envía un evento al renderer cada vez**
          event.sender.send('compararRostros', { nombre, mensaje, distancia });

        } catch (err) {
          child.stdin.write(
            JSON.stringify({ nombre: null, mensaje: `Error: ${err.message}` }) + '\n'
          );
          event.sender.send('compararRostros', { nombre: null, mensaje: `Error: ${err.message}` });
        }
      }
    }
  });

  child.stderr.on('data', err => {
    console.error('[python asistencia]', err.toString());
    event.sender.send('compararRostros', { nombre: null, mensaje: `Error Python: ${err.toString()}` });
  });

  child.on('close', code => {
    event.sender.send('compararRostros', { nombre: null, mensaje: `Proceso finalizado (código ${code})` });
  });
});


/* ---------- Ciclo de vida de la app ---------- */
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
