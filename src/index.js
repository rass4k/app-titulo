const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

if (require('electron-squirrel-startup')) app.quit();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

const isPackaged = app.isPackaged;
const RES = isPackaged ? process.resourcesPath : __dirname;
const PY  = (...p) => path.join(RES, ...p);

// Lector de líneas: evita split manual por ‘\n’
const readline = require('node:readline');
function byLine(stream, cb) {
  const rl = readline.createInterface({ input: stream });
  rl.on('line', cb);
  return rl;
}

// 1) Apertura de modal para verificación de correo
ipcMain.handle('open-verify-window', async () => {
  return new Promise((resolve) => {
    const verifyWindow = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 500,
      height: 600,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Carga la URL de verificación en tu servidor
    verifyWindow.loadURL('https://connection-bd.onrender.com/verify-email');

    // Escucha navegación para detectar resultado
    verifyWindow.webContents.on('did-navigate', (event, url) => {
      try {
        const { URL } = require('url');
        const parsed = new URL(url);
        const status = parsed.searchParams.get('status');
        if (status === 'success') {
          mainWindow.webContents.send('email-verified', { ok: true });
          resolve({ ok: true });
          verifyWindow.close();
        } else if (status === 'error') {
          mainWindow.webContents.send('email-verified', { ok: false });
          resolve({ ok: false });
          verifyWindow.close();
        }
      } catch (e) {
        // Ignorar errores de parseo de URL
      }
    });

    // Si el usuario cierra la ventana sin confirmar
    verifyWindow.on('closed', () => {
      resolve({ ok: false });
    });
  });
});

// 2) Captura de embedding desde Python
ipcMain.handle('capturarEmbeddingEnVivo', () => {
  return new Promise((resolve, reject) => {

    // ► ruta y comando según entorno
    const cmd  = isPackaged ? PY('facepulse-register.exe')
                            : 'python';
    const args = isPackaged ? [] : [PY('python', 'registerv2.py')];

    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let resolved = false;
    byLine(child.stdout, line => {
      try {
        const json = JSON.parse(line);
        if (json.embedding && !resolved) {
          resolved = true;
          resolve(json.embedding);
          child.kill();
        }
      } catch {/* no JSON aún */}
    });

    child.on('close', code => {
      if (!resolved) reject(new Error(`Register exited ${code}`));
    });
  });
});

const fetch = require('node-fetch');

// 3) Comparar rostros y registrar asistencia
ipcMain.on('compararRostros', (event, idToken) => {

  // --- elegir intérprete o .exe según entorno ---
  const cmd  = isPackaged ? PY('facepulse-asistencia.exe') : 'python';
  const args = isPackaged ? [] : [PY('python', 'asistencia.py')];

  const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

  let buffer = '';

  child.stdout.on('data', async chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }

      if (msg.embedding) {
        const embedding = msg.embedding;
        try {
          const resp = await fetch('https://connection-bd.onrender.com/comparar-rostro', {
            method: 'POST',
            headers: {
              'Content-Type' : 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ embedding })
          });

          let nombre = null, distancia = null, mensaje = '';
          if (resp.ok) {
            const data = await resp.json();
            nombre    = data.nombre;
            distancia = data.distancia;
            mensaje   = nombre
              ? `¡Hola ${nombre}!`
              : `No te reconozco (distancia ${distancia?.toFixed(2)})`;
          } else {
            mensaje = `Error: ${resp.status} ${await resp.text()}`;
          }

          child.stdin.write(JSON.stringify({ nombre, mensaje }) + '\n');
          event.sender.send('compararRostros', { nombre, mensaje, distancia });

        } catch (err) {
          child.stdin.write(
            JSON.stringify({ nombre: null, mensaje: `Error: ${err.message}` }) + '\n'
          );
          event.sender.send('compararRostros',
            { nombre: null, mensaje: `Error: ${err.message}` });
        }
      }
    }
  });

});



app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
