function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function navLink(href, label, currentPath) {
  const active = currentPath === href ? "nav-link active" : "nav-link";
  return `<a class="${active}" href="${href}">${label}</a>`;
}

export function layout({ currentPath, title, content }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - VVCloud Ops UI</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --card: #ffffff;
      --line: #d7dfec;
      --text: #18212f;
      --muted: #5b687c;
      --accent: #0f6fff;
      --accent-soft: #e9f1ff;
      --success: #117d4b;
      --warning: #9b6b00;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "SF Pro Display", "Segoe UI", "PingFang SC", sans-serif;
      background:
        radial-gradient(circle at top left, #fef1d8 0, transparent 28%),
        radial-gradient(circle at top right, #ddeeff 0, transparent 24%),
        var(--bg);
      color: var(--text);
    }
    .shell {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr);
      min-height: 100vh;
    }
    .sidebar {
      padding: 24px 18px;
      border-right: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(12px);
    }
    .brand {
      margin: 0 0 20px;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .brand span {
      display: block;
      margin-top: 4px;
      font-size: 12px;
      color: var(--muted);
      font-weight: 500;
    }
    .nav {
      display: grid;
      gap: 8px;
    }
    .nav-link {
      display: block;
      padding: 10px 12px;
      border-radius: 10px;
      color: var(--text);
      text-decoration: none;
      font-weight: 600;
    }
    .nav-link.active {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .main {
      padding: 28px;
    }
    .page-title {
      margin: 0 0 18px;
      font-size: 28px;
      line-height: 1.2;
    }
    .muted {
      color: var(--muted);
    }
    .grid {
      display: grid;
      gap: 16px;
    }
    .grid.cols-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 10px 30px rgba(20, 36, 65, 0.04);
    }
    .stat-value {
      margin: 8px 0 0;
      font-size: 32px;
      font-weight: 700;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #fff;
      color: var(--text);
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
    .button.primary {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 12px 10px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .tag {
      display: inline-flex;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .tag.high { background: #e8fff3; color: var(--success); }
    .tag.low { background: #fff7e3; color: var(--warning); }
    .tag.enabled { background: #e9f1ff; color: var(--accent); }
    .tag.disabled { background: #f4f4f5; color: var(--muted); }
    .form-grid {
      display: grid;
      gap: 14px;
    }
    label {
      display: grid;
      gap: 6px;
      font-weight: 600;
    }
    input, select, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 14px;
      font: inherit;
      background: #fff;
    }
    textarea {
      min-height: 140px;
      resize: vertical;
    }
    .row {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .flash {
      margin-bottom: 16px;
      padding: 12px 14px;
      border-radius: 12px;
      background: #fff5db;
      color: #815f00;
      border: 1px solid #f4dd96;
    }
    .mono {
      font-family: "SF Mono", "Menlo", monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    @media (max-width: 960px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { border-right: none; border-bottom: 1px solid var(--line); }
      .grid.cols-3, .row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <h1 class="brand">VVCloud Ops<span>Lightweight Control Panel</span></h1>
      <nav class="nav">
        ${navLink("/", "Dashboard", currentPath)}
        ${navLink("/systems", "Systems", currentPath)}
        ${navLink("/modules", "Modules", currentPath)}
        ${navLink("/services", "Services", currentPath)}
        ${navLink("/rule-sets", "Rule Sets", currentPath)}
        ${navLink("/knowledge-bases", "Knowledge Bases", currentPath)}
        ${navLink("/logs/matches", "Match Logs", currentPath)}
        ${navLink("/logs/errors", "Error Logs", currentPath)}
      </nav>
    </aside>
    <main class="main">${content}</main>
  </div>
</body>
</html>`;
}

export function page({ currentPath, title, description = "", flash = "", body }) {
  return layout({
    currentPath,
    title,
    content: `
      <h2 class="page-title">${escapeHtml(title)}</h2>
      ${description ? `<p class="muted">${escapeHtml(description)}</p>` : ""}
      ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ""}
      ${body}
    `,
  });
}

export function escape(value) {
  return escapeHtml(value);
}
