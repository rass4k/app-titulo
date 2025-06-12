// script.js

// 1) Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBpiHbgAutYlf7hErNdipunTuJFFyqQc2U",
  authDomain: "trabajotitulo-22b92.firebaseapp.com",
  projectId: "trabajotitulo-22b92",
  storageBucket: "trabajotitulo-22b92.firebasestorage.app",
  messagingSenderId: "652621572271",
  appId: "1:652621572271:web:9d40986ed6179087cc0c5a",
  measurementId: "G-V5VK2BKFWJ",
};
const API_BASE = "https://connection-bd.onrender.com";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// 2) Helpers para token (solo si usas authFetch)
const TOKEN_KEY = "ID_TOKEN";
const saveToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);
const readToken = () => sessionStorage.getItem(TOKEN_KEY);

document.addEventListener("DOMContentLoaded", () => {
  function showToast(msg, tipo = "info", duracion = 3000) {
    const cont = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style = `
      background: ${tipo === "error" ? "#dc3545"
                 : tipo === "success" ? "#28a745"
                 : "#333"};
      color: white;
      padding: 10px 14px;
      border-radius: 4px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      font-size: 14px;
      opacity: 0.9;
    `;
    cont.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = 0;
      setTimeout(() => cont.removeChild(toast), 500);
    }, duracion);
  }
  // Referencias DOM
  const loginForm          = document.getElementById("loginForm");
  const registroForm       = document.getElementById("registroForm");
  const loginContainer     = document.getElementById("login-container");
  const registroContainer  = document.getElementById("registro-container");
  const btnMostrarRegistro = document.getElementById("mostrarRegistro");
  const btnMostrarLogin    = document.getElementById("mostrarLogin");
  const forgotLink         = document.getElementById("forgotPasswordLink");
  const resetModal         = document.getElementById("resetModal");
  const resetForm          = document.getElementById("resetForm");
  const resetEmail         = document.getElementById("resetEmail");
  const btnCloseModal      = resetModal.querySelector(".btn-close");

  /* Toggle entre login y registro */
  btnMostrarRegistro.addEventListener("click", () => {
    loginContainer.style.display    = "none";
    registroContainer.style.display = "block";
  });
  btnMostrarLogin.addEventListener("click", () => {
    registroContainer.style.display = "none";
    loginContainer.style.display    = "block";
  });

  /* OLVIDÉ MI CONTRASEÑA: abrir modal */
  forgotLink.addEventListener("click", (e) => {
    e.preventDefault();
    resetEmail.value = "";           // Limpiar el campo cada vez que se abre
    resetModal.style.display = "flex"; // Mostrar el modal
  });

  /* Cerrar modal al presionar “Cancelar” */
  btnCloseModal.addEventListener("click", () => {
    resetModal.style.display = "none";
  });

  /* Enviar formulario de recuperación */
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = resetEmail.value.trim();
    if (!email) {
      return showToast("Debes ingresar un correo válido.", "error");
    }

    try {
      await auth.sendPasswordResetEmail(email);
      showToast("✅ Si ese correo está registrado, recibirás instrucciones para restablecer tu contraseña.", "success");
      resetModal.style.display = "none";
    } catch (err) {
      console.error("Error al enviar correo de restablecimiento:", err);
      if (err.code === "auth/user-not-found") {
        return showToast("❌ Ese correo no está registrado.", "error");
      }
      showToast("❌ Ocurrió un error al intentar enviar el correo. Intenta más tarde.", "error");
    }
  });

  /* LOGIN */
  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    const email = correoLogin.value.trim();
    const pass  = claveLogin.value.trim();
  
    // 1) Antes de Firebase: pregunto bloqueo
    const st = await fetch(
      `${API_BASE}/login-status?email=${encodeURIComponent(email)}`
    ).then(r => r.json());
    
    if (st.ok === false && st.reason === "blocked") {
      const until = new Date(st.blockedUntil);
      return showToast(`🔒 Bloqueado hasta ${until.toLocaleTimeString()}`, "error");
    }
    if (st.ok === false && st.reason === "force-reset") {
      return showToast("❌ Excediste intentos. Restablece tu contraseña.", "error");
    }
  
    // 2) Intento login
    try {
      const { user } = await auth.signInWithEmailAndPassword(email, pass);
      const token = await user.getIdToken(true);
      saveToken(token);
  
      // 3) Éxito → reset de contador
      await fetch(`${API_BASE}/reset-attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
  
      window.location.href = "main/main.html";
  
    } catch (_) {
      // 4) Falló → mensaje y registro de fallo
      showToast("❌ Usuario o contraseña incorrectos", "error");
      const fail = await fetch(`${API_BASE}/login-failure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      }).then(r => r.json());
  
      if (fail.ok === false && fail.reason === "blocked") {
        const until = new Date(fail.blockedUntil);
        showToast(`🔒 Ahora bloqueado hasta ${until.toLocaleTimeString()}`, "error");
      }
      if (fail.ok === false && fail.reason === "force-reset") {
        showToast("❌ Excediste intentos. Restablece tu contraseña.", "error");
      }
    }
  });
  


  /* REGISTRO */
  registroForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre   = document.getElementById("nombreRegistro").value.trim();
    const email    = document.getElementById("correoRegistro").value.trim();
    const password = document.getElementById("claveRegistro").value.trim();

    try {
      const res  = await fetch("https://connection-bd.onrender.com/registrar-usuario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email, password, rol: "usuario" }),
      });
      const data = await res.json();
      if (data.uid) {
        showToast("✅ Usuario registrado. Inicia sesión.", "success");
        registroForm.reset();
        registroContainer.style.display = "none";
        loginContainer.style.display    = "block";
      } else {
        throw new Error(data.error || "No se pudo registrar.");
      }
    } catch (err) {
      console.error("Registro fallido:", err);
      showToast("❌ " + err.message, "error");
    }
  });
});

/* authFetch global (opcional) */
window.authFetch = async function (url, opts = {}) {
  let token = readToken();
  if (!token && auth.currentUser) {
    token = await auth.currentUser.getIdToken(true);
    saveToken(token);
  }
  if (!token) throw new Error("Sesión caducada");

  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
};
