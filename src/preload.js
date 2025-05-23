const { contextBridge, ipcRenderer } = require('electron');

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
