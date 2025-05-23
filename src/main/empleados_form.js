// empleados_form.js – integración completa con autocompletado de RUT y datos adicionales

/* ------------------------------------------------ Firebase init */
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

/* ------------------------------------------------ Helpers */
const API_URL   = "https://connection-bd.onrender.com";
const TOKEN_KEY = "ID_TOKEN";
const readToken = () => sessionStorage.getItem(TOKEN_KEY);
const saveToken = t => sessionStorage.setItem(TOKEN_KEY, t);

/* ------------------------------------------------ Estado */
let ultimoEmbedding = null;     // array[512] o null
let mensajeDuracion = 2000;     // ms para toasts

/* ------------------------------------------------ Utilidades de RUT */
function cleanRut(rut) {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

function formatRut(rut) {
  const clean = cleanRut(rut);
  const body  = clean.slice(0, -1);
  const dv    = clean.slice(-1);
  let formatted = "";
  let count = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    formatted = body[i] + formatted;
    count++;
    if (count % 3 === 0 && i !== 0) {
      formatted = "." + formatted;
    }
  }
  return `${formatted}-${dv}`;
}

function validateRut(rut) {
  const clean = cleanRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  const dv   = clean.slice(-1);
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  const dvExpected = res === 11 ? "0" : res === 10 ? "K" : res.toString();
  return dvExpected === dv;
}

// --- Validación contra SII (desactivada) ---
// async function validarRutSii(rutCompleto) {
//   const [rut, dv] = rutCompleto.split("-").map(s => s.trim());
//   const res = await fetch(`${API_URL}/validar-rut/${rut}/${dv}`);
//   if (!res.ok) throw new Error(`Error ${res.status}`);
//   return res.json();  // { valido: true, nombre: "JUAN PÉREZ" } o { valido: false }
// }

/* ------------------------------------------------ Toaster */
function showToast(msg, tipo = "info") {
  const cont = document.getElementById("toast-container") || (() => {
    const c = document.createElement("div");
    c.id = "toast-container";
    c.style.position = "fixed";
    c.style.top = "1rem";
    c.style.right = "1rem";
    c.style.zIndex = 9999;
    document.body.appendChild(c);
    return c;
  })();
  const toast = document.createElement("div");
  toast.textContent = msg;
  toast.style = `
    margin-bottom: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    background: ${tipo === "error" ? "#dc3545"
             : tipo === "success" ? "#28a745"
             : "#333"};
    color: white;
    opacity: 0.9;
    transition: opacity 0.5s ease;
  `;
  cont.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = 0;
    setTimeout(() => cont.removeChild(toast), 500);
  }, mensajeDuracion);
}

/* ------------------------------------------------ DOM ready */
document.addEventListener("DOMContentLoaded", () => {
  const form       = document.getElementById("empleadoForm");
  const inputRut   = document.getElementById("rut");
  const inputTel   = document.getElementById("telefono");
  const inputEmail = document.getElementById("email");
  const btnEmb     = document.getElementById("btnRegistrarRostro");
  const btnGuardar = document.getElementById("btnGuardar");

  // Autocompletar y validar formato de RUT al salir del campo
  inputRut.addEventListener("blur", e => {
    const val = e.target.value.trim();
    if (!validateRut(val)) {
      showToast("Formato de RUT inválido", "error");
      inputRut.classList.add("error");
      return;
    }
    inputRut.value = formatRut(val);
    inputRut.classList.remove("error");
    // Aquí podrías llamar a validarRutSii si lo activas:
    // try { const {valido,nombre} = await validarRutSii(inputRut.value); … }
  });

  /* -------- Capturar rostro (embedding) -------- */
  btnEmb.addEventListener("click", async () => {
    try {
      btnEmb.disabled    = true;
      btnEmb.textContent = "Capturando…";
      ultimoEmbedding    = await window.facialAPI.capturarEmbeddingEnVivo();
      btnEmb.textContent = "✅ Rostro capturado";
    } catch (err) {
      console.error(err);
      showToast("❌ No se pudo capturar el rostro", "error");
      ultimoEmbedding = null;
      btnEmb.textContent = "Registrar rostro (embeddings)";
    } finally {
      btnEmb.disabled = false;
    }
  });

  /* -------- Enviar formulario con embedding -------- */
  form.addEventListener("submit", async e => {
    e.preventDefault();

    // 1) Embedding
    if (!ultimoEmbedding) {
      alert("Primero debes registrar el rostro del empleado.");
      return;
    }
    // 2) RUT
    const rut = inputRut.value.trim();
    if (!validateRut(rut)) {
      alert("Debes ingresar un RUT con formato válido.");
      return;
    }
    // Si activas SII, aquí lo validarías:
    // try {
    //   const { valido } = await validarRutSii(rut);
    //   if (!valido) { alert("El RUT no está en el SII."); return; }
    // } catch {
    //   alert("Error al validar RUT en el SII."); return;
    // }

    // 3) Datos de formulario
    const nombres         = document.getElementById("nombres").value.trim();
    const primerNombre    = nombres.split(" ")[0];  // solo el primer nombre
    const apellidoPaterno = document.getElementById("apellidoPaterno").value.trim();
    const apellidoMaterno = document.getElementById("apellidoMaterno").value.trim();
    const empId           = document.getElementById("empId").value.trim();
    const nombreCompleto  = `${nombres} ${apellidoPaterno} ${apellidoMaterno}`;
    const telefono        = inputTel.value.trim();
    const email           = inputEmail.value.trim();

    try {
      // Obtener token
      let idToken = readToken();
      if (!idToken) {
        const user = auth.currentUser;
        if (!user) throw new Error("Sesión expirada; vuelve a iniciar sesión");
        idToken = await user.getIdToken(true);
        saveToken(idToken);
      }

      btnGuardar.disabled    = true;
      btnGuardar.textContent = "Guardando…";

      // 4) Armar payload
      const payload = {
        empId,
        nombre: primerNombre,
        rut,
        nombres,
        apellidoPaterno,
        apellidoMaterno,
        nombre_completo: nombreCompleto,
        telefono,
        email,
        embeddings: ultimoEmbedding
      };

      // 5) POST al backend
      const resp = await fetch(`${API_URL}/crear-empleado`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Error desconocido");

      alert(`✅ ${data.mensaje}`);
      window.location.href = "main.html";
    } catch (err) {
      console.error("Error al guardar empleado:", err);
      alert("❌ " + err.message);
    } finally {
      btnGuardar.disabled    = false;
      btnGuardar.textContent = "Guardar datos";
    }
  });
});
