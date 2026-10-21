const SESSION_TTL = 86400;

async function getAsset(env, path) {
  const name = path.replace(/^\//, "");
  if (!env.ASSETS) return null;
  try {
    return await env.ASSETS.fetch(new Request(new URL(path, "http://assets")));
  } catch {
    return null;
  }
}

function html(body) {
  return new Response(body, { headers: { "content-type": "text/html;charset=utf-8" } });
}

function js(body) {
  return new Response(body, { headers: { "content-type": "application/javascript;charset=utf-8" } });
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

    if (!env.ADMIN_PASSWORD) {
      return json({ error: "请先配置 ADMIN_PASSWORD 环境变量" }, 500);
    }

    // 静态资源
    if (url.pathname === "/admin.js") {
      const resp = await getAsset(env, "/admin.js");
      if (resp) return resp;
    }

    // 登录页
    if (url.pathname === "/admin") {
      if (await checkAuth(request, env)) {
        const resp = await getAsset(env, "/admin.html");
        if (resp) return resp;
      }
      const resp = await getAsset(env, "/login.html");
      if (resp) return resp;
      return html("<h1>login.html not found</h1>");
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

    // 管理接口
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
             ON CONFLICT(slug) DO UPDATE SET targets = excluded.targets, idx = 0`
          )
          .bind(slug, targets.join(","))
          .run();
        return json({ ok: true, slug, targets });
      }

      if (request.method === "DELETE") {
        const slug = url.searchParams.get("slug");
        if (!slug) return json({ error: "缺少 slug" }, 400);
        await env.DB.prepare("DELETE FROM links WHERE slug = ?").bind(slug).run();
        return json({ ok: true });
      }

      if (request.method === "PATCH") {
        const slug = url.searchParams.get("slug");
        if (!slug) return json({ error: "缺少 slug" }, 400);
        await env.DB.prepare("UPDATE links SET idx = 0 WHERE slug = ?").bind(slug).run();
        return json({ ok: true });
      }
    }

    // 短链跳转
    const slug = url.pathname.slice(1);
    if (slug) {
      const { results } = await env.DB
        .prepare("SELECT targets, idx FROM links WHERE slug = ?")
        .bind(slug)
        .all();

      if (!results || results.length === 0) {
        return new Response("Link not found", { status: 404 });
      }

      const row = results[0];
      const targets = row.targets.split(",").map((t) => t.trim()).filter(Boolean);
      if (targets.length === 0) {
        return new Response("No targets", { status: 500 });
      }

      let index = Number(row.idx ?? 0);
      if (index < 0 || index >= targets.length) index = 0;

      const target = targets[index];
      const nextIndex = (index + 1) % targets.length;

      await env.DB
        .prepare("UPDATE links SET idx = ? WHERE slug = ?")
        .bind(nextIndex, slug)
        .run();

      return new Response(null, {
        status: 302,
        headers: { Location: target },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
