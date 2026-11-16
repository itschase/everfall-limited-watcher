import { CarListing } from "./scraper";
import { SessionUser } from "./admin";
import { EF_LOGO_BASE64 } from "./assets";
import { MonitorStatus } from "./kv";

export function renderLandingPage(
  appId: string,
  cars: CarListing[] = [],
  currentUser: SessionUser | null = null,
  creatorProfile: { username: string; avatarUrl: string } = {
    username: "xchasex",
    avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
  },
  monitorStatus: MonitorStatus | null = null
): Response {
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${appId}&permissions=8462865837583424&integration_type=0&scope=bot+applications.commands`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Everfall Limited Watcher – Discord Bot</title>
  <meta name="description" content="Automated stock monitoring and instant Discord alerts for Everfall limited car drops.">
  <link rel="icon" type="image/webp" href="${EF_LOGO_BASE64}">
  <link rel="shortcut icon" type="image/webp" href="${EF_LOGO_BASE64}">
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
      user-select: none;
      -webkit-user-select: none;
    }

    input, textarea, select, option, .commands, .commands * {
      user-select: text;
      -webkit-user-select: text;
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
      max-width: 1120px;
      margin: 0 auto;
      padding: 0 24px;
      width: 100%;
      position: relative;
      z-index: 1;
    }

    header {
      padding: 28px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
    }
    .logo-group {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 800;
      font-size: 1.2rem;
      color: #fff;
      text-decoration: none;
    }
    .logo-badge {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .header-nav {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      color: var(--success);
      font-size: 0.82rem;
      font-weight: 700;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 10px var(--success);
      animation: pulse 2s infinite ease-in-out;
    }
    .btn-login {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 18px;
      border-radius: 10px;
      background: var(--primary);
      color: #fff;
      font-size: 0.9rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
      box-shadow: 0 4px 14px rgba(88, 101, 242, 0.35);
    }
    .btn-login:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
    }
    .user-nav-badge {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 12px 4px 6px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 30px;
    }
    .user-nav-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      border: 1px solid var(--primary);
    }
    .user-nav-name {
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--text-main);
    }
    .user-nav-link {
      color: #93C5FD;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      padding-left: 6px;
      border-left: 1px solid var(--border);
    }
    .user-nav-link:hover {
      text-decoration: underline;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .hero {
      padding: 80px 0 48px;
      text-align: center;
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

    /* Live Drops Showcase Section */
    .showcase {
      padding: 40px 0 60px;
    }
    .showcase-header {
      text-align: center;
      margin-bottom: 32px;
    }
    .showcase-header h2 {
      font-size: 2rem;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .showcase-header p {
      color: var(--text-muted);
      font-size: 1rem;
    }

    .drops-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(460px, 1fr));
      gap: 28px;
    }
    @media (max-width: 580px) {
      .drops-grid {
        grid-template-columns: 1fr;
      }
    }

    .car-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: all 0.25s ease;
      box-shadow: 0 8px 30px rgba(0,0,0,0.3);
    }
    .car-card:hover {
      border-color: var(--border-focus);
      transform: translateY(-3px);
      box-shadow: 0 12px 38px rgba(0,0,0,0.45);
    }
    .car-hero-img-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 16/9;
      background: #000;
      overflow: hidden;
    }
    .car-hero-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: opacity 0.2s ease;
    }
    .car-badge {
      position: absolute;
      top: 14px;
      left: 14px;
      background: rgba(11, 14, 20, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: var(--accent);
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .car-body {
      padding: 24px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .car-title-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 12px;
    }
    .car-title {
      font-size: 1.4rem;
      font-weight: 800;
      color: #fff;
    }
    .car-meta-tag {
      font-size: 0.8rem;
      color: #34D399;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 600;
    }
    .car-meta-tag.out-of-stock {
      color: #F87171;
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.35);
    }
    .car-detected {
      color: var(--text-muted);
      font-size: 0.78rem;
      margin: -4px 0 14px;
    }
    .car-desc {
      color: var(--text-muted);
      font-size: 0.92rem;
      line-height: 1.5;
      margin-bottom: 18px;
      flex: 1;
    }
    
    /* Interactive Gallery Strip */
    .gallery-strip-wrap {
      margin-bottom: 20px;
    }
    .gallery-label {
      font-size: 0.78rem;
      color: var(--text-muted);
      font-weight: 600;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
    }
    .gallery-strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .gallery-strip::-webkit-scrollbar {
      height: 4px;
    }
    .gallery-strip::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.15);
      border-radius: 4px;
    }
    .gallery-thumb {
      width: 72px;
      height: 46px;
      border-radius: 6px;
      object-fit: cover;
      cursor: pointer;
      border: 2px solid transparent;
      opacity: 0.65;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }
    .gallery-thumb:hover, .gallery-thumb.active {
      opacity: 1;
      border-color: var(--primary);
      transform: scale(1.05);
    }

    .car-actions {
      display: flex;
      gap: 12px;
    }
    .btn-store {
      width: 100%;
      background: linear-gradient(135deg, rgba(88, 101, 242, 0.2), rgba(139, 92, 246, 0.2));
      border: 1px solid rgba(88, 101, 242, 0.4);
      color: #93C5FD;
      padding: 10px 18px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.92rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .btn-store:hover {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
    }

    /* Pagination controls if more than 3 */
    .pagination-bar {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      margin-top: 32px;
    }
    .page-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text-main);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.9rem;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s ease;
    }
    .page-btn:hover:not(:disabled) {
      background: var(--bg-surface-elevated);
      border-color: var(--border-focus);
    }
    .page-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
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

    /* Footer styling with creator badge & legal disclaimer */
    footer {
      margin-top: auto;
      padding: 48px 0 36px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .footer-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
    }
    .footer-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 1rem;
      color: var(--text-main);
    }
    .creator-badge-container {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .creator-link {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 6px 14px 6px 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      border-radius: 30px;
      text-decoration: none;
      color: var(--text-main);
      transition: all 0.2s ease;
    }
    .creator-link:hover {
      background: rgba(88, 101, 242, 0.15);
      border-color: rgba(88, 101, 242, 0.4);
      transform: translateY(-2px);
    }
    .creator-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--primary);
      box-shadow: 0 0 10px rgba(88, 101, 242, 0.4);
    }
    .creator-name {
      font-weight: 700;
      font-size: 0.92rem;
      color: #fff;
    }
    .creator-tag {
      font-size: 0.72rem;
      font-weight: 700;
      background: rgba(88, 101, 242, 0.25);
      color: #93C5FD;
      padding: 2px 8px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .footer-disclaimer {
      font-size: 0.8rem;
      color: #6B7280;
      line-height: 1.6;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      padding-top: 20px;
      text-align: center;
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
          <img src="${EF_LOGO_BASE64}" alt="EF Logo" style="width:26px; height:26px; object-fit:contain;">
        </div>
        <span>Everfall Watcher</span>
      </a>
      <div class="header-nav">
        <div class="status-pill">
          <span class="status-dot"></span>
          <span>Online</span>
        </div>

        ${
          currentUser
            ? `
          <div class="user-nav-badge">
            <img src="${currentUser.avatarUrl}" alt="${currentUser.username}" class="user-nav-avatar">
            <span class="user-nav-name">${currentUser.username}</span>
            <a href="/dashboard" class="user-nav-link">Dashboard</a>
            <a href="/logout" class="user-nav-link" style="color:#EF4444;">Log Out</a>
          </div>`
            : `
          <a href="/login" class="btn-login">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Login with Discord
          </a>`
        }
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="hero-eyebrow">
          ⚡ 24/7 Store Monitoring
        </div>
        <h1>Never Miss an Everfall Limited Drop</h1>
        <p>Continuous vehicle stock monitoring, multi-angle gallery views, and targeted role pings for your Discord community.</p>
        <div class="hero-cta">
          <a href="${inviteUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Add to Discord
          </a>
          <a href="#showcase" class="btn btn-secondary">Preview Drops</a>
        </div>
      </section>

      <!-- Active & Recent Drops Showcase (Live Preview) -->
      <section class="showcase" id="showcase">
        <div class="showcase-header">
          <div class="hero-eyebrow" style="margin-bottom:12px;">🔥 Live Bot Alerts Preview</div>
          <h2>Featured Limited Vehicle Drops</h2>
          <p>Most recently discovered releases, with availability tracked over time.${
            monitorStatus
              ? ` ${monitorStatus.authoritative ? "Last verified" : "Last attempted (store verification was blocked)"} ${new Date(monitorStatus.checkedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET.`
              : ""
          }</p>
        </div>

        <div class="drops-grid" id="dropsGrid">
          ${cars.length === 0
            ? `<div class="card" style="grid-column:1/-1; text-align:center;">
                <h3>Waiting for the first verified discovery</h3>
                <p style="color:var(--text-muted); margin-top:8px;">Listings will appear here after a successful authoritative store check.</p>
               </div>`
            : cars
            .map(
              (car) => `
          <div class="car-card" data-car-id="${car.id}">
            <div class="car-hero-img-wrap">
              <span class="car-badge">⚡ Limited Drop</span>
              <img id="hero-${car.id}" class="car-hero-img" src="${car.images[0] || ""}" alt="${car.name}">
            </div>
            <div class="car-body">
              <div class="car-title-row">
                <div class="car-title">${car.name}</div>
                <span class="car-meta-tag ${car.isAvailable === false ? "out-of-stock" : ""}">
                  ${
                    car.isAvailable === false
                      ? "🔴 Out of Stock"
                      : car.detectedAt && Date.now() - car.detectedAt <= 24 * 60 * 60 * 1000
                        ? "🆕 Newly Discovered"
                        : "🟢 Available"
                  }
                </span>
              </div>
              <div class="car-detected">Discovered by Everfall Watcher: ${
                car.detectedAt
                  ? new Date(car.detectedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET"
                  : "Awaiting first recorded check"
              }</div>
              <div class="car-desc">${car.description.split("\n\n")[0] || car.description}</div>
              
              ${
                car.images && car.images.length > 1
                  ? `
              <div class="gallery-strip-wrap">
                <div class="gallery-label">
                  <span>📸 Vehicle Angles (${car.images.length} photos)</span>
                  <span style="font-size:0.72rem; color:var(--text-muted);">Click to inspect</span>
                </div>
                <div class="gallery-strip">
                  ${car.images
                    .map(
                      (img, iIdx) => `
                    <img class="gallery-thumb ${iIdx === 0 ? "active" : ""}" 
                         src="${img}" 
                         alt="${car.name} photo ${iIdx + 1}"
                         onclick="selectCarThumb('${car.id}', '${img}', this)">
                  `
                    )
                    .join("")}
                </div>
              </div>`
                  : ""
              }

              <div class="car-actions">
                <a href="${car.url}" target="_blank" rel="noopener noreferrer" class="btn-store">
                  🛒 View Package on Tebex Store &rarr;
                </a>
              </div>
            </div>
          </div>
          `
            )
            .join("")}
        </div>

        ${
          cars.length > 3
            ? `
        <div class="pagination-bar">
          <button class="page-btn" id="prevPage" onclick="changePage(-1)">◀ Previous</button>
          <span id="pageIndicator" style="font-size:0.9rem; font-weight:600; color:var(--text-muted);">1 / ${Math.ceil(
            cars.length / 3
          )}</span>
          <button class="page-btn" id="nextPage" onclick="changePage(1)">Next ▶</button>
        </div>`
            : ""
        }
      </section>

      <section class="features">
        <div class="card">
          <div class="card-icon">🏎️</div>
          <h3>One-Time Accurate Broadcasts</h3>
          <p>Every newly detected vehicle drop is posted once to each configured server, preventing duplicate spam.</p>
        </div>
        <div class="card">
          <div class="card-icon">🖼️</div>
          <h3>Multi-Image Discord Gallery</h3>
          <p>Seamlessly presents all store vehicle angles together in one rich embed grid right inside Discord chat.</p>
        </div>
        <div class="card">
          <div class="card-icon">👥</div>
          <h3>Active Role Mentions</h3>
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
            <span class="cmd-desc">Runs an on-demand audit and automatically posts all active store listings to your alert channel.</span>
          </div>
          <div class="command-row">
            <span class="cmd-name">/help</span>
            <span class="cmd-desc">Opens the private interactive Control Center with quick action controls.</span>
          </div>
        </div>
      </section>
    </main>

    <footer>
      <div class="footer-top">
        <div class="footer-brand">
          <img src="${EF_LOGO_BASE64}" alt="EF Logo" style="width:24px; height:24px; object-fit:contain;">
          <span>Everfall Limited Watcher</span>
        </div>
        <div class="creator-badge-container">
          <span style="font-size:0.85rem; color:var(--text-muted);">Managed by</span>
          <a href="https://discord.com/users/151037568484507648" target="_blank" rel="noopener noreferrer" class="creator-link">
            <img src="${creatorProfile.avatarUrl}" alt="${creatorProfile.username}" class="creator-avatar">
            <span class="creator-name">${creatorProfile.username}</span>
            
          </a>
        </div>
      </div>
      <div class="footer-disclaimer">
        <b>Disclaimer:</b> Everfall Limited Watcher is an independent, community-created utility. It is not affiliated with, endorsed by, sponsored by, or powered by Everfall or Tebex.
      </div>
    </footer>
  </div>

  <script>
    function selectCarThumb(carId, imgUrl, el) {
      const hero = document.getElementById('hero-' + carId);
      if (hero) {
        hero.style.opacity = '0.3';
        setTimeout(() => {
          hero.src = imgUrl;
          hero.style.opacity = '1';
        }, 150);
      }
      const parent = el.parentElement;
      if (parent) {
        const thumbs = parent.getElementsByClassName('gallery-thumb');
        for (let t of thumbs) {
          t.classList.remove('active');
        }
        el.classList.add('active');
      }
    }

    let currentPage = 1;
    const pageSize = 3;
    const cards = Array.from(document.querySelectorAll('.car-card'));
    const totalPages = Math.ceil(cards.length / pageSize);

    function updatePagination() {
      if (cards.length <= pageSize) return;
      cards.forEach((card, idx) => {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        card.style.display = (idx >= start && idx < end) ? 'flex' : 'none';
      });
      const pageIndicator = document.getElementById('pageIndicator');
      if (pageIndicator) pageIndicator.innerText = currentPage + ' / ' + totalPages;
      const prevBtn = document.getElementById('prevPage');
      const nextBtn = document.getElementById('nextPage');
      if (prevBtn) prevBtn.disabled = currentPage === 1;
      if (nextBtn) nextBtn.disabled = currentPage === totalPages;
    }

    function changePage(delta) {
      currentPage = Math.max(1, Math.min(currentPage + delta, totalPages));
      updatePagination();
    }

    if (cards.length > pageSize) {
      updatePagination();
    }
  </script>
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
