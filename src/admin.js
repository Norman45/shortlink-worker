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
  const targets = raw.split("\n").map(t => t.trim()).filter(Boolean);
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
