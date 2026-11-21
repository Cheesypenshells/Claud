const $ = (id) => document.getElementById(id);
let mode = "login";

// Kalau sudah login, langsung ke halaman utama
fetch("/api/me").then((r) => { if (r.ok) location.replace("/"); }).catch(() => {});

function setMode(m) {
  mode = m;
  $("tab-login").setAttribute("aria-selected", String(m === "login"));
  $("tab-register").setAttribute("aria-selected", String(m === "register"));
  $("name-field").hidden = m !== "register";
  $("password").autocomplete = m === "register" ? "new-password" : "current-password";
  $("submit").textContent = m === "register" ? "Bikin akun" : "Masuk";
  $("error").textContent = "";
}
$("tab-login").onclick = () => setMode("login");
$("tab-register").onclick = () => setMode("register");

$("auth-form").onsubmit = async (e) => {
  e.preventDefault();
  $("error").textContent = "";
  $("submit").disabled = true;
  try {
    const res = await fetch(mode === "register" ? "/api/register" : "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: $("username").value.trim().toLowerCase(),
        password: $("password").value,
        name: $("name").value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Gagal. Coba lagi.");
    location.replace("/");
  } catch (err) {
    $("error").textContent = err.message;
  } finally {
    $("submit").disabled = false;
  }
};
