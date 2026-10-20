const SESSION_TTL = 86400;

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>管理员登录</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#f5f5f7;color:#111;font-family:system-ui,-apple-system,sans-serif}
.wrap{max-width:360px;margin:80px auto;padding:0 16px}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:18px;margin:0 0 16px}
label{display:block;font-size:13px;margin:10px 0 4px;color:#555}
input{width:100%;padding:10px;border:1px solid #d0d0d5;border-radius:8px;font-size:14px}
button{margin-top:12px;width:100%;padding:10px;border:none;border-radius:8px;background:#000;color:#fff;font-size:14px;cursor:pointer}
button:hover{opacity:.9}
.msg{margin-top:10px;font-size:13px;color:#d32f2f}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <h1>管理员登录</h1>
    <form id="loginForm">
      <label>密码</label>
      <input id="pwd" type="password" placeholder="请输入管理员密码" />
      <button type="submit">登录</button>
      <div id="msg" class="msg"></div>
    </form>
  </div>
</div>
<script>
document.getElementById("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const pwd = document.getElementById("pwd").value;
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: pwd })
  });
  const data = await res.json();
  if (data.ok) {
    location.href = "/admin";
  } else {
    document.getElementById("msg").textContent = "密码错误";
  }
};
</script>
</body>
</html>`;

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>短链管理</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#f5f5f7;color:#111;font-family:system-ui,-apple-system,sans-serif}
.wrap{max-width:640px;margin:40px auto;padding:0 16px}
h1{font-size:20px;margin:0 0 16px}
.card{background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
label{display:block;font-size:13px;margin:10px 0 4px;color:#555}
input,textarea{width:100%;padding:10px;border:1px solid #d0d0d5;border-radius:8px;font-size:14px}
textarea{height:80px;resize:vertical}
button{margin-top:12px;padding:10px 18px;border:none;border-radius:8px;background:#000;color:#fff;font-size:14px;cursor:pointer}
button:hover{opacity:.9}
.msg{margin-top:10px;font-size:13px}
.ok{color:#1a7f37}
.err{color:#d32f2f}
table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}
th,td{padding:8px;border-bottom:1px solid #eee;text-align:left;word-break:break-all}
th{color:#666}
.actions button{margin:0 4px;padding:6px 10px;font-size:12px}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.topbar a{font-size:13px;color:#000;text-decoration:underline}
</style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <h1 style="margin:0">短链管理</h1>
    <a href="/api/logout">退出登录</a>
  </div>

  <div class="card">
    <label>短链后缀，例如 abc</label>
    <input id="slug" placeholder="abc" />

    <label>目标链接，每行一个</label>
    <textarea id="targets" placeholder="https://a.com\nhttps://b.com\nhttps://c.com"></textarea>

    <button id="addBtn">保存短链</button>
    <div id="msg" class="msg"></div>
  </div>

  <div class="card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <strong>已有短链</strong>
      <button id="refreshBtn" style="margin:0;padding:6px 12px;font-size:12px;background:#666">刷新</button>
    </div>
    <table>
      <thead><tr><th>短链</th><th>目标</th><th>当前索引</th><th>操作</th></tr></thead>
      <tbody id="list"></tbody>
    </table>
  </div>
</div>

<script>
const API = "/api/links";

async function load() {
  const res = await fetch(API);
  if (res.status === 401) { location.href = "/admin"; return; }
  const data = await res.json();
  const tbody = document.getElementById("list");
  tbody.innerHTML = "";
  for (const item of data) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + esc(item.slug) + "</td>" +
      "<td>" + esc(item.targets) + "</td>" +
      "<td>" + item.idx + "</td>" +
      '<td class="actions"><button data-slug="' + esc(item.slug) + '" data-action="reset">重置</button><button data-slug="' + esc(item.slug) + '" data-action="del" style="background:#d32f2f">删除</button></td>';
    tbody.appendChild(tr);
  }
  tbody.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const slug = btn.dataset.slug;
    const action = btn.dataset.action;
    if (action === "del") {
      if (!confirm("确定删除 " + slug + "？")) return;
      await fetch(API + "?slug=" + encodeURIComponent(slug), { method: "DELETE" });
    } else if (action === "reset") {
      await fetch(API + "?slug=" + encodeURIComponent(slug), { method: "PATCH" });
    }
    load();
  };
}

async function add() {
  const slug = document.getElementById("slug").value.trim();
  const raw = document.getElementById("targets").value.trim();
  const msg = document.getElementById("msg");
  if (!slug || !raw) { msg.textContent = "请填写短链和目标链接"; msg.className = "msg err"; return; }
  const targets = raw.split("\\n").map(t => t.trim()).filter(Boolean);
  if (targets.length === 0) { msg.textContent = "至少填写一个目标链接"; msg.className = "msg err"; return; }
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, targets })
  });
  const data = await res.json();
  if (data.ok) {
    msg.textContent = "保存成功";
    msg.className = "msg ok";
    document.getElementById("slug").value = "";
    document.getElementById("targets").value = "";
    load();
  } else {
    msg.textContent = data.error || "保存失败";
    msg.className = "msg err";
  }
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

document.getElementById("addBtn").onclick = add;
document.getElementById("refreshBtn").onclick = load;
load();
</script>
</body>
</html>`;

function html(body) {
  return new Response(body, { headers: { "content-type": "text/html;charset=utf-8" } });
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function randomToken() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function setSessionCookie(token) {
  return "admin_session=" + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + SESSION_TTL;
}

function clearSessionCookie() {
  return "admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

async function checkAuth(request, env) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/admin_session=([a-f0-9]+)/);
  if (!match) return false;
  const token = match[1];
  const row = await env.DB.prepare("SELECT expires_at FROM sessions WHERE token = ?").bind(token).first();
  if (!row) return false;
  if (Date.now() > row.expires_at) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return false;
  }
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS links (
        slug TEXT PRIMARY KEY,
        targets TEXT NOT NULL,
        idx INTEGER NOT NULL DEFAULT 0
      )
    `);

    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      )
    `);

    // 检查是否配置了密码
    if (!env.ADMIN_PASSWORD) {
      return json({ error: "请先通过 wrangler secret put ADMIN_PASSWORD 设置密码" }, 500);
    }

    // 登录页
    if (url.pathname === "/admin") {
      if (await checkAuth(request, env)) return html(ADMIN_HTML);
      return html(LOGIN_HTML);
    }

    // 登录接口
    if (url.pathname === "/api/login" && request.method === "POST") {
      const body = await request.json();
      if (body.password !== env.ADMIN_PASSWORD) {
        return json({ ok: false, error: "密码错误" }, 401);
      }
      const token = randomToken();
      const expiresAt = Date.now() + SESSION_TTL * 1000;
      await env.DB
        .prepare("INSERT INTO sessions (token, expires_at) VALUES (?, ?)")
        .bind(token, expiresAt)
        .run();
      return json({ ok: true }, 200, {
        "set-cookie": setSessionCookie(token)
      });
    }

    // 退出登录
    if (url.pathname === "/api/logout") {
      const cookie = request.headers.get("cookie") || "";
      const match = cookie.match(/admin_session=([a-f0-9]+)/);
      if (match) {
        await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(match[1]).run();
      }
      return new Response(null, {
        status: 302,
        headers: {
          location: "/admin",
          "set-cookie": clearSessionCookie()
        }
      });
    }

    // 管理接口都需要登录
    if (url.pathname.startsWith("/api/links")) {
      if (!(await checkAuth(request, env))) return json({ error: "未登录" }, 401);

      if (request.method === "GET") {
        const { results } = await env.DB
          .prepare("SELECT slug, targets, idx FROM links ORDER BY rowid DESC")
          .all();
        return json(results);
      }

      if (request.method === "POST") {
        const body = await request.json();
        const { slug, targets } = body;
        if (!slug || !Array.isArray(targets) || targets.length === 0) {
          return json({ error: "slug 和 targets 必填，targets 为数组" }, 400);
        }
        await env.DB
          .prepare(
            `INSERT INTO links (slug, targets, idx)
             VALUES (?, ?, 0)
             ON CONFLICT(slug) DO UPDATE SET targets 
