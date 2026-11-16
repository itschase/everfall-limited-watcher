export function renderLandingPage(appId: string): Response {
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${appId}&permissions=8462865837583424&integration_type=0&scope=bot+applications.commands`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Everfall Limited Watcher – Discord Bot</title>
  <meta name="description" content="Automated stock monitoring and instant Discord alerts for Everfall limited car drops.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #0B0E14;
      --bg-surface: #141824;
      --bg-surface-elevated: #1B2132;
      --border: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(99, 102, 241, 0.4);
      --text-main: #F3F4F6;
      --text-muted: #9CA3AF;
      --primary: #5865F2;
      --primary-hover: #4752C4;
      --accent: #F59E0B;
      --accent-glow: rgba(245, 158, 11, 0.15);
      --success: #10B981;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-base);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.6;
      overflow-x: hidden;
    }

    .ambient-glow {
      position: absolute;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      filter: blur(120px);
      pointer-events: none;
      z-index: 0;
      opacity: 0.25;
    }
    .glow-1 {
      top: -150px;
      left: 50%;
      transform: translateX(-50%);
      background: radial-gradient(circle, #5865F2 0%, transparent 70%);
    }
    .glow-2 {
      bottom: 100px;
      right: -100px;
      background: radial-gradient(circle, #F59E0B 0%, transparent 70%);
      opacity: 0.12;
    }

    .container {
      max-width: 1080px;
      margin: 0 auto;
      padding: 0 24px;
      width: 100%;
      position: relative;
      z-index: 1;
    }

    header {
      padding: 32px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
    }
    .logo-group {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 1.15rem;
      color: #fff;
      text-decoration: none;
    }
    .logo-badge {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, #5865F2, #8B5CF6);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(88, 101, 242, 0.35);
    }
    .header-nav {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--success);
      box-shadow: 0 0 8px var(--success);
    }
    .nav-admin-link {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
      padding: 6px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      transition: all 0.2s;
    }
    .nav-admin-link:hover {
      color: #fff;
      background: var(--bg-surface-elevated);
      border-color: var(--border-focus);
    }

    .hero {
      padding: 88px 0 64px;
      text-align: center;
      max-width: 800px;
      margin: 0 auto;
    }
    .hero-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      background: var(--accent-glow);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: 999px;
      color: var(--accent);
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 24px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .hero h1 {
      font-size: clamp(2.4rem, 5vw, 3.8rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin-bottom: 20px;
      background: linear-gradient(180deg, #FFFFFF 0%, #D1D5DB 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .hero p {
      font-size: 1.15rem;
      color: var(--text-muted);
      margin-bottom: 36px;
      max-width: 620px;
      margin-left: auto;
      margin-right: auto;
    }

    .hero-cta {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 14px 28px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1rem;
      text-decoration: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: pointer;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
      box-shadow: 0 4px 20px rgba(88, 101, 242, 0.4);
    }
    .btn-primary:hover {
      background: var(--primary-hover);
      transform: translateY(-2px);
      box-shadow: 0 6px 26px rgba(88, 101, 242, 0.5);
    }
    .btn-secondary {
      background: var(--bg-surface);
      color: var(--text-main);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: var(--bg-surface-elevated);
      border-color: var(--border-focus);
      transform: translateY(-2px);
    }

    .features {
      padding: 48px 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
    }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      transition: all 0.25s ease;
    }
    .card:hover {
      border-color: var(--border-focus);
      transform: translateY(-3px);
      background: var(--bg-surface-elevated);
    }
    .card-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 20px;
      font-size: 1.25rem;
    }
    .card h3 {
      font-size: 1.2rem;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .card p {
      font-size: 0.95rem;
      color: var(--text-muted);
    }

    .commands {
      padding: 48px 0 80px;
    }
    .section-title {
      text-align: center;
      margin-bottom: 36px;
    }
    .section-title h2 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .section-title p {
      color: var(--text-muted);
    }

    .command-list {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }
    .command-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 24px;
      border-bottom: 1px solid var(--border);
      gap: 16px;
      flex-wrap: wrap;
    }
    .command-row:last-child {
      border-bottom: none;
    }
    .cmd-name {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.95rem;
      font-weight: 600;
      color: #93C5FD;
      background: rgba(147, 197, 253, 0.1);
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(147, 197, 253, 0.2);
    }
    .cmd-desc {
      color: var(--text-muted);
      font-size: 0.92rem;
      flex: 1;
      min-width: 240px;
    }

    footer {
      margin-top: auto;
      padding: 40px 0;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.88rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
  </style>
</head>
<body>
  <div class="ambient-glow glow-1"></div>
  <div class="ambient-glow glow-2"></div>

  <div class="container">
    <header>
      <a href="/" class="logo-group">
        <div class="logo-badge">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            <circle cx="7" cy="17" r="2"/>
            <path d="M9 17h6"/>
            <circle cx="17" cy="17" r="2"/>
          </svg>
        </div>
        <span>Everfall Watcher</span>
      </a>
      <div class="header-nav">
        <div class="status-pill">
          <span class="status-dot"></span>
          <span>Edge Live</span>
        </div>
        <a href="/admin" class="nav-admin-link">⚙️ Admin Portal</a>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="hero-eyebrow">
          ⚡ 24/7 Store Monitoring
        </div>
        <h1>Never Miss an Everfall Limited Drop</h1>
        <p>Continuous vehicle stock monitoring, gallery image pagination, and targeted role pings for your Discord community.</p>
        <div class="hero-cta">
          <a href="${inviteUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Add to Discord
          </a>
          <a href="#commands" class="btn btn-secondary">Command Menu</a>
        </div>
      </section>

      <section class="features">
        <div class="card">
          <div class="card-icon">🏎️</div>
          <h3>One-Time Accurate Broadcasts</h3>
          <p>Every newly detected vehicle drop is posted once to all configured servers, preventing duplicate spam.</p>
        </div>
        <div class="card">
          <div class="card-icon">🖼️</div>
          <h3>Paginated Image Gallery</h3>
          <p>Interactive Next/Previous buttons allow users to browse through all available vehicle screenshots directly inside Discord.</p>
        </div>
        <div class="card">
          <div class="card-icon">👥</div>
          <h3>Role Mentions in Chat</h3>
          <p>Configured role pings are sent in message chat rather than inside the embed, ensuring Discord triggers notifications.</p>
        </div>
      </section>

      <section class="commands" id="commands">
        <div class="section-title">
          <h2>Slash Commands</h2>
          <p>Easily manage drop alerts directly from Discord</p>
        </div>
        <div class="command-list">
          <div class="command-row">
            <span class="cmd-name">/setup &lt;#channel&gt;</span>
            <span class="cmd-desc">Sets the Discord channel where new vehicle drops and alerts will be posted.</span>
          </div>
          <div class="command-row">
            <span class="cmd-name">/add-role &lt;@role&gt;</span>
            <span class="cmd-desc">Adds a server role to be pinged when an exclusive or limited vehicle drops.</span>
          </div>
          <div class="command-row">
            <span class="cmd-name">/remove-role &lt;@role&gt;</span>
            <span class="cmd-desc">Removes a role from future drop notifications.</span>
          </div>
          <div class="command-row">
            <span class="cmd-name">/check</span>
            <span class="cmd-desc">Runs an on-demand audit and displays all currently available vehicle listings.</span>
          </div>
          <div class="command-row">
            <span class="cmd-name">/help</span>
            <span class="cmd-desc">Opens the private interactive Control Center with quick action controls.</span>
          </div>
        </div>
      </section>
    </main>

    <footer>
      <p>Everfall Limited Watcher • Powered by Cloudflare Workers & Discord API</p>
      <a href="/admin" style="color:var(--text-muted); text-decoration:none;">Owner Dashboard &rarr;</a>
    </footer>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
