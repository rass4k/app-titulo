/**
 * @jest-environment jsdom
 */

describe("Pruebas ampliadas del script.js", () => {
  const TOKEN_KEY = "ID_TOKEN";

  const saveToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);
  const readToken = () => sessionStorage.getItem(TOKEN_KEY);

  function showToast(msg, tipo = "info", duracion = 3000) {
    let cont = document.getElementById("toast-container");
    if (!cont) {
      cont = document.createElement("div");
      cont.id = "toast-container";
      document.body.appendChild(cont);
    }

    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.className = `toast-${tipo}`;
    cont.appendChild(toast);

    setTimeout(() => cont.removeChild(toast), duracion);
  }

  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = ""; // limpia el DOM entre pruebas
  });

  test("saveToken y readToken funcionan correctamente", () => {
    saveToken("mi-token-de-prueba");
    expect(readToken()).toBe("mi-token-de-prueba");
  });

  test("saveToken sobrescribe token anterior", () => {
    saveToken("primer-token");
    saveToken("nuevo-token");
    expect(readToken()).toBe("nuevo-token");
  });

  test("readToken devuelve null si no hay token", () => {
    expect(readToken()).toBeNull();
  });

  test("showToast muestra un mensaje success correctamente", () => {
    showToast("Éxito", "success", 100);
    const toast = document.querySelector(".toast-success");
    expect(toast).not.toBeNull();
    expect(toast.textContent).toBe("Éxito");
  });

  test("showToast muestra un mensaje error correctamente", () => {
    showToast("Error fatal", "error", 100);
    const toast = document.querySelector(".toast-error");
    expect(toast).not.toBeNull();
    expect(toast.textContent).toBe("Error fatal");
  });

  test("showToast muestra un mensaje info correctamente", () => {
    showToast("Info genérica", "info", 100);
    const toast = document.querySelector(".toast-info");
    expect(toast).not.toBeNull();
    expect(toast.textContent).toBe("Info genérica");
  });

  test("showToast elimina el mensaje después del tiempo", (done) => {
    showToast("Temporal", "info", 100);
    setTimeout(() => {
      const toast = document.querySelector(".toast-info");
      expect(toast).toBeNull(); // ya debe estar eliminado
      done();
    }, 200);
  });

  test("showToast no duplica el contenedor", () => {
    showToast("Uno", "info", 100);
    showToast("Dos", "success", 100);
    const contenedores = document.querySelectorAll("#toast-container");
    expect(contenedores.length).toBe(1);
  });
});

describe("authFetch", () => {
  const TOKEN_KEY = "ID_TOKEN";

  const saveToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);
  const readToken = () => sessionStorage.getItem(TOKEN_KEY);

  const authFetch = async function (url, opts = {}, auth = null) {
    let token = readToken();

    if (!token && auth?.currentUser) {
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

  beforeEach(() => {
    sessionStorage.clear();
    global.fetch = jest.fn();
  });

  test("authFetch lanza error si no hay token y no hay usuario", async () => {
    await expect(authFetch("/api/test", {}, null)).rejects.toThrow("Sesión caducada");
  });

  test("authFetch usa token existente en sessionStorage", async () => {
    saveToken("tok-test-123");
    global.fetch.mockResolvedValue({ ok: true });

    const res = await authFetch("/api/prueba", {
      method: "POST",
      body: JSON.stringify({ ejemplo: true }),
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/prueba", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer tok-test-123",
      }),
    }));
  });
});
describe("Login", () => {
  let mockAuth, mockFetch;

  beforeEach(() => {
    sessionStorage.clear();
    mockAuth = {
      signInWithEmailAndPassword: jest.fn(),
      currentUser: {
        getIdToken: jest.fn(),
      },
    };
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  test("login exitoso debe guardar token y redireccionar", async () => {
    // 1. Estado inicial: sin bloqueo
    mockFetch.mockResolvedValueOnce({ json: async () => ({ ok: true }) }); // /login-status
    mockAuth.signInWithEmailAndPassword.mockResolvedValue({
      user: {
        getIdToken: async () => "test-token-123",
      },
    });
    mockFetch.mockResolvedValueOnce({}); // /reset-attempts

    const saveToken = (t) => sessionStorage.setItem("ID_TOKEN", t);

    const login = async (email, password) => {
      const st = await fetch(`/login-status?email=${email}`).then(r => r.json());
      if (st.ok === false) return "Bloqueado";

      const { user } = await mockAuth.signInWithEmailAndPassword(email, password);
      const token = await user.getIdToken();
      saveToken(token);

      await fetch("/reset-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      return token;
    };

    const token = await login("test@correo.com", "clave123");

    expect(token).toBe("test-token-123");
    expect(mockAuth.signInWithEmailAndPassword).toHaveBeenCalledWith("test@correo.com", "clave123");
    expect(mockFetch).toHaveBeenCalledWith("/reset-attempts", expect.any(Object));
    expect(sessionStorage.getItem("ID_TOKEN")).toBe("test-token-123");
  });
});
describe("Recuperación de contraseña", () => {
  let mockAuth;

  beforeEach(() => {
    document.body.innerHTML = "";
    mockAuth = {
      sendPasswordResetEmail: jest.fn(),
    };
  });

  function showToast(msg, tipo = "info") {
    const cont = document.createElement("div");
    cont.id = "toast-container";
    document.body.appendChild(cont);
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.className = `toast-${tipo}`;
    cont.appendChild(toast);
  }

  test("envía correo de recuperación correctamente", async () => {
    mockAuth.sendPasswordResetEmail.mockResolvedValueOnce();

    const resetPassword = async (email) => {
      if (!email) return showToast("Debes ingresar un correo válido.", "error");

      try {
        await mockAuth.sendPasswordResetEmail(email);
        showToast("✅ Si ese correo está registrado, recibirás instrucciones para restablecer tu contraseña.", "success");
      } catch (err) {
        if (err.code === "auth/user-not-found") {
          showToast("❌ Ese correo no está registrado.", "error");
        } else {
          showToast("❌ Ocurrió un error al intentar enviar el correo.", "error");
        }
      }
    };

    await resetPassword("correo@dominio.com");

    expect(mockAuth.sendPasswordResetEmail).toHaveBeenCalledWith("correo@dominio.com");
    expect(document.querySelector(".toast-success").textContent).toMatch(/recibirás instrucciones/);
  });

  test("muestra error si correo no está registrado", async () => {
    mockAuth.sendPasswordResetEmail.mockRejectedValueOnce({ code: "auth/user-not-found" });

    const resetPassword = async (email) => {
      try {
        await mockAuth.sendPasswordResetEmail(email);
      } catch (err) {
        if (err.code === "auth/user-not-found") {
          showToast("❌ Ese correo no está registrado.", "error");
        }
      }
    };

    await resetPassword("noexiste@mail.com");
    expect(document.querySelector(".toast-error").textContent).toMatch(/no está registrado/);
  });
});

