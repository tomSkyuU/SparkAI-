require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const JWT_SECRET = process.env.JWT_SECRET || "sparkai_secret_local_2024";

// ===== BANCO =====
const db = new Database("sparkai.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessoes (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    titulo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessoes(id)
  );
`);

// Statements
const criarUsuario     = db.prepare("INSERT INTO usuarios (username, password) VALUES (?, ?)");
const buscarUsuario    = db.prepare("SELECT * FROM usuarios WHERE username = ?");
const criarSessao      = db.prepare("INSERT OR IGNORE INTO sessoes (id, user_id, titulo) VALUES (?, ?, ?)");
const listarSessoes    = db.prepare("SELECT s.id, s.titulo, s.created_at, COUNT(m.id) as total FROM sessoes s LEFT JOIN mensagens m ON m.session_id = s.id WHERE s.user_id = ? GROUP BY s.id ORDER BY s.created_at DESC LIMIT 30");
const buscarMensagens  = db.prepare("SELECT role, content FROM mensagens WHERE session_id = ? ORDER BY created_at ASC");
const inserirMensagem  = db.prepare("INSERT INTO mensagens (session_id, role, content) VALUES (?, ?, ?)");
const deletarMensagens = db.prepare("DELETE FROM mensagens WHERE session_id = ?");
const deletarSessao    = db.prepare("DELETE FROM sessoes WHERE id = ? AND user_id = ?");
const buscarSessao     = db.prepare("SELECT * FROM sessoes WHERE id = ? AND user_id = ?");

// ===== VALIDAÇÃO =====
if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY não encontrada no .env");
  process.exit(1);
}
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ===== MIDDLEWARE AUTH =====
function autenticar(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Não autorizado." });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}

// ===== SYSTEM PROMPT =====
const SYSTEM_PROMPT = `Você é o SparkAI, um assistente criativo especializado em ideias de projetos de tecnologia.

Você ajuda com:
- Geração de ideias para sites, apps, jogos, design e projetos tech
- Detalhamento de funcionalidades e arquitetura
- Sugestão de tecnologias e stacks
- Refinamento e expansão de ideias
- Brainstorm e criatividade aplicada

Seja direto, criativo e entusiasmado. Use emojis com moderação.
Quando gerar uma ideia de projeto, sempre inclua: nome, descrição, problema que resolve, funcionalidades e tecnologias sugeridas.
Responda sempre em português brasileiro.`;

// ===== ROTAS AUTH =====

app.post("/auth/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ erro: "Username e senha são obrigatórios." });
  }
  if (username.length < 3) {
    return res.status(400).json({ erro: "Username deve ter pelo menos 3 caracteres." });
  }
  if (password.length < 6) {
    return res.status(400).json({ erro: "Senha deve ter pelo menos 6 caracteres." });
  }

  const existente = buscarUsuario.get(username.toLowerCase());
  if (existente) {
    return res.status(409).json({ erro: "Username já está em uso." });
  }

  const hash = await bcrypt.hash(password, 10);
  criarUsuario.run(username.toLowerCase(), hash);

  const user = buscarUsuario.get(username.toLowerCase());
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });

  console.log(`✅ Novo usuário: ${username}`);
  res.json({ token, username: user.username });
});

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ erro: "Username e senha são obrigatórios." });
  }

  const user = buscarUsuario.get(username.toLowerCase());
  if (!user) {
    return res.status(401).json({ erro: "Username ou senha incorretos." });
  }

  const valido = await bcrypt.compare(password, user.password);
  if (!valido) {
    return res.status(401).json({ erro: "Username ou senha incorretos." });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });

  console.log(`🔑 Login: ${username}`);
  res.json({ token, username: user.username });
});

// ===== ROTAS CHAT =====

app.get("/sessoes", autenticar, (req, res) => {
  const sessoes = listarSessoes.all(req.user.id);
  res.json({ sessoes });
});

app.get("/sessoes/:id/mensagens", autenticar, (req, res) => {
  const sessao = buscarSessao.get(req.params.id, req.user.id);
  if (!sessao) return res.status(404).json({ erro: "Sessão não encontrada." });
  const mensagens = buscarMensagens.all(req.params.id);
  res.json({ mensagens });
});

app.delete("/sessoes/:id", autenticar, (req, res) => {
  const sessao = buscarSessao.get(req.params.id, req.user.id);
  if (!sessao) return res.status(404).json({ erro: "Sessão não encontrada." });
  deletarMensagens.run(req.params.id);
  deletarSessao.run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post("/chat", autenticar, async (req, res) => {
  const { mensagem, session_id } = req.body;

  if (!mensagem?.trim()) return res.status(400).json({ erro: "Mensagem vazia." });
  if (!session_id) return res.status(400).json({ erro: "session_id obrigatório." });

  try {
    criarSessao.run(session_id, req.user.id, mensagem.slice(0, 60));
    inserirMensagem.run(session_id, "user", mensagem);

    const historico = buscarMensagens.all(session_id);
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...historico.map(m => ({ role: m.role, content: m.content }))
    ];

    console.log(`💬 [${req.user.username}] ${mensagem.slice(0, 50)}`);

    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      temperature: 0.85,
      max_tokens: 1024,
    });

    const resposta = response.choices[0].message.content;
    inserirMensagem.run(session_id, "assistant", resposta);

    res.json({ resposta, tokens_usados: response.usage?.total_tokens || null });

  } catch (error) {
    console.error("❌ Erro:", error.message);
    if (error.status === 429) return res.status(429).json({ erro: "Limite de requisições atingido." });
    res.status(500).json({ erro: "Erro interno." });
  }
});

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ SparkAI rodando em http://localhost:${PORT}`);
});