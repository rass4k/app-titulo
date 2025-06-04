const API_URL = "https://connection-bd.onrender.com";
// Referencias al DOM
const tablaBody       = document.querySelector("#tabla-empleados tbody");
const btnVolver       = document.getElementById("btn-volver");
const btnRefrescar    = document.getElementById("btn-refrescar");
const btnAgregar      = document.getElementById("btn-agregar-empleado");
const inputBuscar     = document.getElementById("input-buscar");   // ← referencia busqueda

// Nueva referencia al modal “Ver”
const modalVer      = document.getElementById("modal-ver");
const spanVerId     = document.getElementById("ver-id");
const spanVerNombre = document.getElementById("ver-nombre");
const btnCerrarVer  = document.getElementById("btn-cerrar-ver");


const modalEditar     = document.getElementById("modal-editar");
const formEditar      = document.getElementById("form-editar");
const inputEditId     = document.getElementById("edit-id");
const inputEditNombre = document.getElementById("edit-nombre");
const btnCancelarEd   = document.getElementById("btn-cancelar-editar");

const modalEliminar   = document.getElementById("modal-eliminar");
const btnConfirmarEl  = document.getElementById("btn-confirmar-eliminar");
const btnCancelarEl   = document.getElementById("btn-cancelar-eliminar");

let empleadosCache    = [];  // listado completo

// 1) Volver atrás
if (btnVolver) {
  btnVolver.addEventListener("click", () => window.history.back());
}

// 2) Listar empleados y pintar tabla
async function cargarEmpleados() {
  try {
    const token = sessionStorage.getItem("ID_TOKEN");
    const res = await fetch(`${API_URL}/empleados`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    empleadosCache = await res.json();
    construirTabla(empleadosCache);
  } catch (err) {
    console.error("Error cargando empleados:", err);
    tablaBody.innerHTML = `<tr><td colspan="3">Error al cargar empleados</td></tr>`;
  }
}

function abrirModalVer(emp) {
  document.getElementById("ver-id").textContent      = emp.empId;
  document.getElementById("ver-nombre").textContent  = emp.nombre;
  document.getElementById("ver-rut").textContent     = emp.rut      || "—";
  document.getElementById("ver-telefono").textContent= emp.telefono || "—";
  document.getElementById("ver-email").textContent   = emp.email    || "—";

  // si guardas la fecha en Firestore:
  if (emp.creadoEn && emp.creadoEn.toDate) {
    const d = emp.creadoEn.toDate();
    document.getElementById("ver-creado").textContent = d.toLocaleString();
  } else {
    document.getElementById("ver-creado").textContent = "—";
  }
  modalVer.classList.remove("hidden");
  modalVer.classList.add("flex");
}

// cerrar con el botón
btnCerrarVer.addEventListener("click", () => {
  modalVer.classList.add("hidden");
  modalVer.classList.remove("flex");
});

// cerrar clicando fuera del contenido
modalVer.addEventListener("click", e => {
  if (e.target === modalVer) {
    modalVer.classList.add("hidden");
    modalVer.classList.remove("flex");
 }
});


// 3) Construir tabla a partir de un array dado
function construirTabla(lista) {
  tablaBody.innerHTML = "";
  if (!lista.length) {
    tablaBody.innerHTML = `<tr><td colspan="3">No hay empleados</td></tr>`;
    return;
  }
  lista.forEach(emp => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-opacity-10";

    const tdId = document.createElement("td");
    tdId.className = "px-6 py-4 whitespace-nowrap text-sm font-medium text-light";
    tdId.textContent = emp.empId;

    const tdNombre = document.createElement("td");
    tdNombre.className = "px-6 py-4 whitespace-nowrap text-sm text-light";
    tdNombre.textContent = emp.nombre;

    const tdAcc = document.createElement("td");
    tdAcc.className = "px-6 py-4 whitespace-nowrap text-sm text-light flex gap-2";

    // Botón Ver
    const btnVer = document.createElement("button");
    btnVer.className = "btn-ver glow-secondary px-3 py-1 rounded bg-secondary text-dark text-xs font-medium hover:bg-opacity-90 transition-all duration-300";
    btnVer.innerHTML = `<i class="material-icons text-xs">visibility</i>`;
    btnVer.title = "Ver detalles";
    btnVer.addEventListener("click", () => abrirModalVer(emp));

    // Botón Editar
    const btnEd = document.createElement("button");
    btnEd.className = "btn-editar glow-primary px-3 py-1 rounded bg-primary text-light text-xs font-medium hover:bg-opacity-90 transition-all duration-300";
    btnEd.innerHTML = `<i class="material-icons text-xs">edit</i>`;
    btnEd.title = "Editar";
    btnEd.addEventListener("click", () => abrirModalEditar(emp));

    // Botón Eliminar
    const btnEl = document.createElement("button");
    btnEl.className = "btn-eliminar glow-accent px-3 py-1 rounded bg-accent text-light text-xs font-medium hover:bg-opacity-90 transition-all duration-300";
    btnEl.innerHTML = `<i class="material-icons text-xs">delete</i>`;
    btnEl.title = "Eliminar";
    btnEl.addEventListener("click", () => abrirModalEliminar(emp.empId));

    tdAcc.append(btnVer, btnEd, btnEl);
    tr.append(tdId, tdNombre, tdAcc);
    tablaBody.append(tr);
  });
}


// 4) Refrescar
if (btnRefrescar) {
  btnRefrescar.addEventListener("click", cargarEmpleados);
}

// 5) Búsqueda en tiempo real
if (inputBuscar) {
  inputBuscar.addEventListener("input", () => {
    const q = inputBuscar.value.trim().toLowerCase();
    const filtrados = empleadosCache.filter(emp =>
      emp.empId.toLowerCase().includes(q) ||
      emp.nombre.toLowerCase().includes(q)
    );
    construirTabla(filtrados);
  });
}

// 6) Modal Editar
function abrirModalEditar(emp) {
  inputEditId.value      = emp.empId;
  inputEditNombre.value  = emp.nombre;
  document.getElementById("edit-rut").value      = emp.rut      || "";
  document.getElementById("edit-telefono").value = emp.telefono || "";
  document.getElementById("edit-email").value    = emp.email    || "";
  modalEditar.style.display = "flex";
  
}

if (btnCancelarEd) {
  btnCancelarEd.addEventListener("click", () => {
    modalEditar.style.display = "none";
  });
}

// 7) Submit edición
if (formEditar) {
  formEditar.addEventListener("submit", async e => {
    e.preventDefault();
    const empId    = inputEditId.value;
    const nombre   = inputEditNombre.value.trim();
    const rut      = document.getElementById("edit-rut").value.trim();
    const telefono = document.getElementById("edit-telefono").value.trim();
    const email    = document.getElementById("edit-email").value.trim();

    if (!nombre) {
      showToast("El nombre no puede quedar vacio", "error");
      return;
    }

    const token = sessionStorage.getItem("ID_TOKEN");
    const res = await fetch(`${API_URL}/empleados/${empId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ nombre, rut, telefono, email })
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    modalEditar.style.display = "none";
    await cargarEmpleados();
    showToast("✅ Empleado actualizado", "success");
  });
}


// 8) Modal Eliminar
let idAEliminar = null;

function abrirModalEliminar(empId) {
  idAEliminar = empId;
  modalEliminar.classList.remove("hidden");
  modalEliminar.classList.add("flex");
}

// Cancelar
btnCancelarEl.addEventListener("click", () => {
  idAEliminar = null;
  modalEliminar.classList.add("hidden");
  modalEliminar.classList.remove("flex");
});

// Confirmar borrado
btnConfirmarEl.addEventListener("click", async () => {
  if (!idAEliminar) return;
  try {
    const token = sessionStorage.getItem("ID_TOKEN");
    const res = await fetch(`${API_URL}/empleados/${idAEliminar}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    modalEliminar.classList.add("hidden");
    modalEliminar.classList.remove("flex");
    idAEliminar = null;
    await cargarEmpleados();
    showToast("Empleado eliminado", "success");
  } catch (err) {
    console.error("Error eliminando empleado:", err);
    showToast("No se pudo eliminar. Revisa la consola.", "error");
  }
});

// Cerrar haciendo click fuera del modal-contenido
modalEliminar.addEventListener("click", e => {
  if (e.target === modalEliminar) {
    idAEliminar = null;
    modalEliminar.classList.add("hidden");
    modalEliminar.classList.remove("flex");
  }
});

// 9) Confirmar borrado
if (btnConfirmarEl) {
  btnConfirmarEl.addEventListener("click", async () => {
    if (!idAEliminar) return;
    try {
      const token = sessionStorage.getItem("ID_TOKEN");
      const res = await fetch(`${API_URL}/empleados/${idAEliminar}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      modalEliminar.style.display = "none";
      idAEliminar = null;
      await cargarEmpleados();
      showToast("Empleado eliminado", "success");
    } catch (err) {
      console.error("Error eliminando empleado:", err);
      showToast("No se pudo eliminar. Revisa la consola.", "error");
    }
  });
}
// 11) Toasts
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

// 12) Inicia todo al cargar la página
document.addEventListener("DOMContentLoaded", cargarEmpleados);
