const API_URL = "http://localhost:3000";

let token = localStorage.getItem("sparkai_token");
let username = localStorage.getItem("sparkai_username");
let sessionId = null;
let enviando = false;

const authScreen    = document.getElementById("authScreen");
const chatScreen    = document.getElementById("chatScreen");
const chatMensagens = document.getElementById("chatMensagens");
const inputMensagem = document.getElementById("inputMensagem");
const btnEnviar     = document.getElementById("btnEnviar");
const btnNovoChat   = document.getElementById("btnNovoChat");
const listaSessoes  = document.getElementById("listaSessoes");
const chatTitulo    = document.getElementById("chatTitulo");
const tokensBadge   = document.getElementById("tokensBadge");
const boasVindas    = document.getElementById("boasVindas");
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebar       = document.getElementById("sidebar");
const userNameDisplay = document.getElementById("userNameDisplay");
const btnLogout     = document.getElementById("btnLogout");

if (token) {
  mostrarChat();
} else {
  mostrarAuth();
}

function mostrarTab(tab) {
  document.getElementById("tabLogin").classList.toggle("active", tab === "login");
  document.getElementById("tabRegister").classList.toggle("active", tab === "register");
  document.getElementById("formLogin").classList.toggle("hidden", tab !== "login");
  document.getElementById("formRegister").classList.toggle("hidden", tab !== "register");
}

document.getElementById("btnLogin").addEventListener("click", fazerLogin);
document.getElementById("loginPassword").addEventListener("keydown", e => { if (e.key === "Enter") fazerLogin(); });

async function fazerLogin() {
  const u = document.getElementById("loginUsername").value.trim();
  const p = document.getElementById("loginPassword").value.trim();
  const erroEl = document.getElementById("loginErro");
  const btn = document.getElementById("btnLogin");

  erroEl.textContent = "";
  if (!u || !p) { erroEl.textContent = "Preencha todos os campos."; return; }

  btn.disabled = true; btn.textContent = "Entrando...";

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro);

    salvarAuth(data.token, data.username);
    mostrarChat();
  } catch (err) {
    erroEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = "Entrar";
  }
}

document.getElementById("btnRegister").addEventListener("click", fazerRegister);
document.getElementById("regPassword").addEventListener("keydown", e => { if (e.key === "Enter") fazerRegister(); });

async function fazerRegister() {
  const u = document.getElementById("regUsername").value.trim();
  const p = document.getElementById("regPassword").value.trim();
  const erroEl = document.getElementById("registerErro");
  const btn = document.getElementById("btnRegister");

  erroEl.textContent = "";
  if (!u || !p) { erroEl.textContent = "Preencha todos os campos."; return; }

  btn.disabled = true; btn.textContent = "Criando conta...";

  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro);

    salvarAuth(data.token, data.username);
    mostrarChat();
  } catch (err) {
    erroEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = "Criar conta";
  }
}

btnLogout.addEventListener("click", () => {
  localStorage.removeItem("sparkai_token");
  localStorage.removeItem("sparkai_username");
  token = null; username = null;
  mostrarAuth();
});

function salvarAuth(t, u) {
  token = t; username = u;
  localStorage.setItem("sparkai_token", t);
  localStorage.setItem("sparkai_username", u);
}

function mostrarAuth() {
  authScreen.classList.remove("hidden");
  chatScreen.classList.add("hidden");
}

function mostrarChat() {
  authScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  userNameDisplay.textContent = username;
  gerarSessionId();
  carregarSessoes();
}

function gerarSessionId() {
  sessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("open"));

btnNovoChat.addEventListener("click", () => {
  gerarSessionId();
  chatMensagens.innerHTML = "";
  chatMensagens.appendChild(boasVindas);
  boasVindas.style.display = "flex";
  chatTitulo.textContent = "Novo chat";
  tokensBadge.textContent = "";
  document.querySelectorAll(".sessao-item").forEach(el => el.classList.remove("active"));
  sidebar.classList.remove("open");
});

document.querySelectorAll(".sugestao-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    inputMensagem.value = btn.dataset.msg;
    enviarMensagem();
  });
});

inputMensagem.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensagem(); }
});
inputMensagem.addEventListener("input", () => {
  inputMensagem.style.height = "auto";
  inputMensagem.style.height = Math.min(inputMensagem.scrollHeight, 160) + "px";
});
btnEnviar.addEventListener("click", enviarMensagem);

async function enviarMensagem() {
  const texto = inputMensagem.value.trim();
  if (!texto || enviando) return;

  enviando = true;
  btnEnviar.disabled = true;
  inputMensagem.value = "";
  inputMensagem.style.height = "auto";
  boasVindas.style.display = "none";

  adicionarMensagem("user", texto);
  const typingEl = adicionarTyping();

  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ mensagem: texto, session_id: sessionId }),
    });

    const data = await res.json();
    typingEl.remove();

    if (res.status === 401) { fazerLogout(); return; }
    if (!res.ok) throw new Error(data.erro || "Erro desconhecido.");

    adicionarMensagem("assistant", data.resposta);
    if (data.tokens_usados) tokensBadge.textContent = `${data.tokens_usados} tokens`;
    if (chatTitulo.textContent === "Novo chat") chatTitulo.textContent = texto.slice(0, 50);

    carregarSessoes();
  } catch (err) {
    typingEl.remove();
    adicionarMensagem("assistant", `❌ ${err.message}`);
  } finally {
    enviando = false;
    btnEnviar.disabled = false;
    inputMensagem.focus();
  }
}

function adicionarMensagem(role, content) {
  const wrapper = document.createElement("div");
  wrapper.className = "msg-wrapper";
  const msg = document.createElement("div");
  msg.className = `msg msg-${role}`;
  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = role === "user" ? (username?.[0]?.toUpperCase() || "U") : "⚡";
  const balao = document.createElement("div");
  balao.className = "msg-balao";
  balao.textContent = content;
  msg.appendChild(avatar);
  msg.appendChild(balao);
  wrapper.appendChild(msg);
  chatMensagens.appendChild(wrapper);
  scrollParaBaixo();
  return wrapper;
}

function adicionarTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "msg-wrapper";
  const msg = document.createElement("div");
  msg.className = "msg msg-assistant";
  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = "⚡";
  const balao = document.createElement("div");
  balao.className = "msg-balao";
  balao.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  msg.appendChild(avatar); msg.appendChild(balao);
  wrapper.appendChild(msg);
  chatMensagens.appendChild(wrapper);
  scrollParaBaixo();
  return wrapper;
}

function scrollParaBaixo() {
  setTimeout(() => { chatMensagens.scrollTop = chatMensagens.scrollHeight; }, 50);
}

async function carregarSessoes() {
  try {
    const res = await fetch(`${API_URL}/sessoes`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    listaSessoes.innerHTML = "";

    if (!data.sessoes?.length) {
      listaSessoes.innerHTML = `<p style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-dim);padding:12px;text-align:center;">Nenhum chat ainda</p>`;
      return;
    }

    data.sessoes.forEach(sessao => {
      const item = document.createElement("div");
      item.className = "sessao-item" + (sessao.id === sessionId ? " active" : "");
      item.innerHTML = `<span class="sessao-titulo" title="${sessao.titulo}">${sessao.titulo}</span><button class="sessao-del">✕</button>`;
      item.querySelector(".sessao-titulo").addEventListener("click", () => {
        carregarConversa(sessao.id, sessao.titulo);
        sidebar.classList.remove("open");
      });
      item.querySelector(".sessao-del").addEventListener("click", async e => {
        e.stopPropagation();
        await fetch(`${API_URL}/sessoes/${sessao.id}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (sessao.id === sessionId) btnNovoChat.click();
        carregarSessoes();
      });
      listaSessoes.appendChild(item);
    });
  } catch (err) { console.error(err); }
}

async function carregarConversa(id, titulo) {
  try {
    const res = await fetch(`${API_URL}/sessoes/${id}/mensagens`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    sessionId = id;
    chatMensagens.innerHTML = "";
    boasVindas.style.display = "none";
    chatTitulo.textContent = titulo;
    tokensBadge.textContent = "";
    data.mensagens.forEach(m => adicionarMensagem(m.role, m.content));
    document.querySelectorAll(".sessao-item").forEach(el => {
      el.classList.toggle("active", el.querySelector(".sessao-titulo")?.title === titulo);
    });
  } catch (err) { console.error(err); }
}