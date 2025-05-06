// script.js (solo ID‑token) - corregido para navegador no‑module

// Configuración de Firebase
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

// Helpers para token
const TOKEN_KEY = "ID_TOKEN";
const saveToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);
const readToken = () => sessionStorage.getItem(TOKEN_KEY);

// Ref. DOM
document.addEventListener("DOMContentLoaded", () => {
  const loginForm          = document.getElementById("loginForm");
  const registroForm       = document.getElementById("registroForm");
  const loginContainer     = document.getElementById("login-container");
  const registroContainer  = document.getElementById("registro-container");
  const btnMostrarRegistro = document.getElementById("mostrarRegistro");
  const btnMostrarLogin    = document.getElementById("mostrarLogin");

  /* Toggle formularios */
  btnMostrarRegistro.addEventListener("click", () => {
    loginContainer.style.display    = "none";
    registroContainer.style.display = "block";
  });
  btnMostrarLogin.addEventListener("click", () => {
    registroContainer.style.display = "none";
    loginContainer.style.display    = "block";
  });

  /* LOGIN */
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email    = document.getElementById("correoLogin").value.trim();
    const password = document.getElementById("claveLogin").value.trim();

    try {
      const { user } = await auth.signInWithEmailAndPassword(email, password);
      const idToken  = await user.getIdToken(true);
      saveToken(idToken);
      window.location.href = "main/main.html";
    } catch (err) {
      console.error("Login:", err);
      alert("❌ " + err.message);
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
        alert("✅ Usuario registrado. Inicia sesión.");
        registroForm.reset();
        registroContainer.style.display = "none";
        loginContainer.style.display    = "block";
      } else {
        throw new Error(data.error || "No se pudo registrar.");
      }
    } catch (err) {
      console.error("Registro:", err);
      alert("❌ " + err.message);
    }
  });
});

/* authFetch global (uso opcional) */
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