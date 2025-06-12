const { contextBridge, ipcRenderer } = require('electron');
// src/main/preload.js

contextBridge.exposeInMainWorld('electronAPI', {
  openVerifyWindow: (verifyUrl) => ipcRenderer.invoke('open-verify-window', verifyUrl),
  onEmailVerified: (callback) => ipcRenderer.on('email-verified', (_e, status) => callback(status))
});


contextBridge.exposeInMainWorld("facialAPI", {
  /**
   * Lanza el script que captura el embedding en vivo.
   * (Sin cambios, sigue usando promesa/invoke si quieres.)
   */
  capturarEmbeddingEnVivo: () => ipcRenderer.invoke("capturarEmbeddingEnVivo"),

  /**
   * Lanza reconocimiento facial continuo (mismo nombre, pero por evento).
   */
  
  compararRostros: (idToken) => ipcRenderer.send('compararRostros', idToken),

  /**
   * Listener para recibir múltiples resultados de reconocimiento.
   */
  onCompararRostros: (callback) => ipcRenderer.on('resultadoCompararRostros', (event, data) => callback(data)),
});
