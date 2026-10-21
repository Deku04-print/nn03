'use strict';

const crypto = require('crypto');

/**
 * Generate the full HTML for the WorkLens mentor webview.
 *
 * @param {import('vscode').Uri}     cssUri   Webview-safe URI to worklens.css
 * @param {import('vscode').Uri}     jsUri    Webview-safe URI to worklens.js
 * @param {import('vscode').Webview} webview  Webview instance (for CSP source)
 * @returns {string}  Complete HTML document string
 */
function getWebviewContent(cssUri, jsUri, webview, logo1Uri, nameTagUri) {
  const nonce = getNonce();

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'nonce-${nonce}';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data:;
             font-src ${webview.cspSource};">
  <style nonce="${nonce}">
    .wl-settings-wrap { position: relative; display: inline-flex; }
    .wl-settings-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 140px;
      background: var(--vscode-menu-background, #252526);
      border: 1px solid var(--vscode-menu-border, #454545);
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      z-index: 999;
      overflow: hidden;
    }
    .wl-settings-item {
      display: flex;
      align-items: center;
      gap: 7px;
      width: 100%;
      padding: 8px 12px;
      background: none;
      border: none;
      color: var(--vscode-menu-foreground, #cccccc);
      font-size: 12px;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    }
    .wl-settings-item:hover {
      background: var(--vscode-menu-selectionBackground, rgba(255,255,255,0.08));
      color: var(--vscode-menu-selectionForeground, #fff);
    }
    .wl-theme-submenu {
      border-top: 1px solid var(--vscode-menu-border, #454545);
      border-bottom: 1px solid var(--vscode-menu-border, #454545);
    }
    .wl-theme-submenu .wl-settings-item {
      padding-left: 22px;
      font-size: 11.5px;
    }
  </style>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <link rel="stylesheet" href="${cssUri}">
  <title>WorkLens Mentor</title>
</head>
<body class="wl-not-signed-in">

  <!-- ── Header ─────────────────────────────────────────────── -->
  <header class="wl-header" role="banner">
    <div class="wl-logo" aria-label="WorkLens Logo">
      <svg class="wl-brand-svg-icon" width="22" height="22" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="3" y="3" width="34" height="34" rx="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="20" cy="20" r="10.5" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2 3" opacity="0.45"/>
        <path d="M16 15.5L11.5 20L16 24.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M24 15.5L28.5 20L24 24.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="20" cy="20" r="2.4" fill="currentColor"/>
        <line x1="20" y1="3" x2="20" y2="6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="20" y1="33.5" x2="20" y2="37" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="3" y1="20" x2="6.5" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="33.5" y1="20" x2="37" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span class="wl-brand-name">Work<span class="wl-brand-name-sub">Lens</span></span>
    </div>
    <div class="wl-header-actions" id="wl-header-actions">
      <button class="wl-icon-btn" id="wl-search-btn" title="Search conversations" aria-label="Search chat history">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
      <button class="wl-icon-btn" id="wl-new-chat-btn" title="New Chat" aria-label="New Chat">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="wl-icon-btn wl-danger-hover" id="wl-clear-chat-btn" title="Delete current conversation" aria-label="Delete current conversation">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
      <button class="wl-icon-btn" id="wl-header-agents-btn" title="Open Agent Chatplace" aria-label="Agent Chatplace">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><circle cx="8.5" cy="16" r="1" fill="currentColor"/><circle cx="15.5" cy="16" r="1" fill="currentColor"/></svg>
      </button>
      <button class="wl-icon-btn" id="wl-refresh-btn" title="Refresh" aria-label="Refresh">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      </button>
      <div class="wl-settings-wrap" id="wl-settings-wrap">
        <button class="wl-icon-btn" id="wl-settings-btn" title="Settings" aria-label="Settings" aria-haspopup="true" aria-expanded="false">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <div class="wl-settings-menu wl-hidden" id="wl-settings-menu" role="menu">
          <button class="wl-settings-item" id="wl-theme-btn" role="menuitem" aria-haspopup="true" aria-expanded="false">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            Theme
            <svg style="margin-left:auto" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <div class="wl-theme-submenu wl-hidden" id="wl-theme-submenu" role="group" aria-label="Theme options">
            <button class="wl-settings-item" id="wl-theme-light" role="menuitemradio" aria-checked="false">Light</button>
            <button class="wl-settings-item" id="wl-theme-dark"  role="menuitemradio" aria-checked="false">Dark</button>
          </div>
          <button class="wl-settings-item wl-danger-item" id="wl-clear-all-history-btn" role="menuitem">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Clear Project Chats
          </button>
          <button class="wl-settings-item" id="wl-logout-btn" role="menuitem">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- ── Tab bar with Agents Hub ───────────────────────── -->
  <nav class="wl-tabs" role="tablist" aria-label="WorkLens tabs">
    <button class="wl-tab wl-tab-active" id="wl-tab-chat" role="tab"
            aria-selected="true" aria-controls="wl-panel-chat">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:4px;margin-bottom:3px;vertical-align:-1px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      Chat
    </button>
    <button class="wl-tab" id="wl-tab-agents" role="tab"
            aria-selected="false" aria-controls="wl-panel-agents">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:4px;vertical-align:-1px;"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><circle cx="8.5" cy="16" r="1" fill="currentColor"/><circle cx="15.5" cy="16" r="1" fill="currentColor"/></svg>
      Agents
      <span class="wl-tab-badge">Active</span>
    </button>
  </nav>

  <!-- ── Chat Panel ──────────────────────────────────────────── -->
  <div class="wl-panel" id="wl-panel-chat" role="tabpanel" aria-labelledby="wl-tab-chat">

    <!-- IDLE — sign-in form -->
    <section class="wl-state" id="wl-state-idle" aria-label="Sign In">
      <div class="wl-login-card">
        <div class="wl-login-brand">
          <svg class="wl-login-brand-icon" width="48" height="48" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="3" y="3" width="34" height="34" rx="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="20" cy="20" r="10.5" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2 3" opacity="0.45"/>
            <path d="M16 15.5L11.5 20L16 24.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M24 15.5L28.5 20L24 24.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="20" cy="20" r="2.4" fill="currentColor"/>
            <line x1="20" y1="3" x2="20" y2="6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="20" y1="33.5" x2="20" y2="37" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="3" y1="20" x2="6.5" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="33.5" y1="20" x2="37" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <h1 class="wl-login-brand-title">Work<span class="wl-login-brand-title-sub">Lens</span></h1>
        </div>
        <p class="wl-login-subtitle">AI-powered developer mentor — guided debugging</p>
        <form id="wl-login-form" autocomplete="off">
          <label for="wl-login-email" class="wl-sr-only">Email</label>
          <input type="email" id="wl-login-email" class="wl-login-input"
                 placeholder="user@tcs.com" required />
          <label for="wl-login-password" class="wl-sr-only">Password</label>
          <input type="password" id="wl-login-password" class="wl-login-input"
                 placeholder="Password" required />
          <button type="submit" class="wl-btn wl-btn-primary wl-login-btn"
                  id="wl-signin-btn">Sign In</button>
          <p class="wl-login-error wl-hidden" id="wl-login-error"></p>
        </form>
      </div>
    </section>

    <!-- LOADING — thinking indicator -->
    <section class="wl-state wl-hidden" id="wl-state-loading"
             aria-label="Loading" aria-busy="true">
      <div class="wl-thinking" id="wl-thinking" role="progressbar"
           aria-label="Analyzing your code">
        <span></span><span></span><span></span>
      </div>
      <p class="wl-loading-text" id="wl-loading-text">Analyzing…</p>
    </section>

    <!-- ERROR -->
    <section class="wl-state wl-hidden" id="wl-state-error" aria-label="Error" role="alert">
      <div class="wl-error-icon" aria-hidden="true">⚠️</div>
      <p class="wl-error-text" id="wl-error-message">Something went wrong.</p>
      <div style="display:flex;gap:8px;width:100%;max-width:240px;justify-content:center;margin-top:6px;">
        <button class="wl-btn wl-btn-primary" id="wl-retry-btn"
                type="button" aria-label="Retry the last request" style="flex:1;">
          Try Again
        </button>
        <button class="wl-btn wl-btn-secondary" id="wl-back-chat-btn"
                type="button" aria-label="Back to chat" style="flex:1;">
          Back to Chat
        </button>
      </div>
    </section>

    <!-- ACTIVE MENTOR SESSION -->
    <section class="wl-state wl-hidden" id="wl-state-mentor" aria-label="Mentor session">

      <!-- Search panel moved to body-level overlay below -->

      <!-- ── Project-scoped chat history ──────────────────────── -->
      <div class="wl-project-history" id="wl-project-history" aria-label="Project chat history">
        <div class="wl-history-title" id="wl-project-history-heading">Previous Chats</div>
        <!-- Empty state: shown when no conversations exist for this project -->
        <div class="wl-project-history-empty wl-hidden" id="wl-project-history-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="opacity:0.35;margin-bottom:8px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <p id="wl-project-history-empty-text">No previous conversations for this project.</p>
        </div>
        <!-- Conversation list: shown when conversations exist -->
        <div class="wl-history-list" id="wl-project-history-list" role="list" aria-label="Previous project conversations"></div>
      </div>

      <!-- Captured Context card -->
      <div class="wl-context-card wl-hidden" id="wl-context-card" aria-label="Captured context">
        <div class="wl-context-card-header">
          <span class="wl-context-card-title">Captured Context</span>
          <button class="wl-icon-btn wl-copy-btn" id="wl-copy-context-btn"
                  title="Copy context" aria-label="Copy captured context">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
        <dl class="wl-context-meta">
          <div class="wl-context-row">
            <dt>File:</dt>
            <dd id="wl-ctx-file">—</dd>
          </div>
          <div class="wl-context-row">
            <dt>Language:</dt>
            <dd id="wl-ctx-lang">—</dd>
          </div>

        </dl>

      </div>

      <!-- Conversation thread -->
      <div class="wl-conversation" id="wl-conversation"
           role="log" aria-label="Mentor conversation" aria-live="polite">
      </div>

    </section>

    <!-- ── Bottom Input bar (always visible in chat panel) ─── -->
    <div class="wl-input-bar" id="wl-input-bar">
      <!-- Toolbar with mode toggle & quick actions -->
      <div class="wl-input-toolbar">
        <!-- Mode toggle -->
        <div class="wl-mode-toggle" id="wl-mode-toggle" role="group" aria-label="Analysis mode">
          <button class="wl-mode-btn wl-mode-active" id="wl-mode-simple" type="button" title="Simple mode — current file only">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/></svg>
            Simple
          </button>
          <button class="wl-mode-btn" id="wl-mode-enhanced" type="button" title="Enhanced mode — file dependency analysis">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Enhanced
          </button>
        </div>

        <div class="wl-input-actions-row">
          <!-- Mention @ File Button -->
          <button class="wl-tool-pill-btn" id="wl-mention-btn" type="button" title="Tag / mention a file from workspace (@)" aria-label="Mention file">
            <span class="wl-at-icon">@</span>
            <span>File</span>
          </button>
          <!-- Voice Dictation Button -->
          <button class="wl-tool-pill-btn wl-voice-btn" id="wl-voice-btn" type="button" title="Voice dictation (Speak to type)" aria-label="Voice typing">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
            <span id="wl-voice-label">Voice</span>
          </button>
        </div>
      </div>

      <!-- Tagged file chips container -->
      <div id="wl-tagged-files-bar" class="wl-tagged-files-bar wl-hidden" aria-label="Tagged files"></div>

      <!-- Autocomplete dropdown (rendered above the input row) -->
      <div class="wl-input-wrap">
        <div
          id="wl-autocomplete-dropdown"
          class="wl-autocomplete-dropdown wl-hidden"
          role="listbox"
          aria-label="Autocomplete suggestions"
        ></div>

        <!-- Voice dictation status floating pill -->
        <div id="wl-voice-status" class="wl-voice-status wl-hidden" role="status" aria-live="polite">
          <span class="wl-voice-dot"></span>
          <span id="wl-voice-status-text">Listening… Speak now or press Fn twice</span>
          <button id="wl-voice-status-close" class="wl-voice-status-close" type="button" title="Close" aria-label="Close voice">✕</button>
        </div>

        <div class="wl-input-row">
          <label for="wl-user-input" class="wl-sr-only">Ask WorkLens</label>
          <input
            type="text"
            id="wl-user-input"
            class="wl-input"
            placeholder="Ask WorkLens anything, or @mention file…"
            aria-label="Ask WorkLens"
            aria-autocomplete="list"
            aria-controls="wl-autocomplete-dropdown"
            autocomplete="off"
          />
          <!-- Inline mic button inside the input capsule -->
          <button class="wl-input-icon-btn wl-voice-btn" id="wl-inline-voice-btn" type="button" title="Voice dictation (Speak to type)" aria-label="Voice typing">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
          <button class="wl-send-btn" id="wl-submit-btn"
                  type="button" aria-label="Send message" title="Send message (Enter)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    </div>


  </div><!-- /wl-panel-chat -->

  <!-- ── Agent Hub & Chatplace Panel ──────────────────────────── -->
  <div class="wl-panel wl-hidden" id="wl-panel-agents" role="tabpanel" aria-labelledby="wl-tab-agents">
    
    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- VIEW 1: AGENT DIRECTORY / CARDS HUB                        -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div class="wl-agents-hub" id="wl-agents-hub-view">
      
      <div class="wl-hub-header">
        <div class="wl-hub-header-top">
          <h2 class="wl-hub-title">AI Agents Directory</h2>
          <span class="wl-hub-badge">4 Active Agents</span>
        </div>
        <p class="wl-hub-subtitle">Autonomous specialist engines for workspace analysis, infrastructure synthesis, testing, and terminal automation.</p>
      </div>

      <div class="wl-agent-cards-list">
        
        <!-- CARD 1: Document Generator Agent (ACTIVE) -->
        <div class="wl-agent-card wl-agent-card-active" id="wl-card-doc-generator">
          <div class="wl-card-top">
            <div class="wl-card-icon-wrap wl-icon-doc-gen">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div class="wl-card-meta">
              <div class="wl-card-title-row">
                <h3 class="wl-card-title">Document Generator Agent</h3>
                <span class="wl-status-pill"><span class="wl-status-dot"></span> Active</span>
              </div>
              <p class="wl-card-desc">Analyzes workspace code, structure, and dependencies to generate technical Markdown (.md), Mermaid architecture diagrams (.mmd), and ReportLab executive PDFs (.pdf).</p>
            </div>
          </div>

          <div class="wl-card-deliverables">
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>.md Tech Docs</span>
            </div>
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              <span>.mmd Flowchart</span>
            </div>
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2z"/><line x1="14" y1="2" x2="14" y2="8"/><line x1="14" y1="8" x2="20" y2="8"/></svg>
              <span>.pdf Executive Report</span>
            </div>
          </div>

          <div class="wl-card-footer">
            <button class="wl-btn wl-btn-primary wl-open-agent-btn" id="wl-open-doc-agent-btn" type="button">
              <span>Open Agent</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        <!-- CARD 2: Test Suite Generator Agent (ACTIVE) -->
        <div class="wl-agent-card wl-agent-card-active" id="wl-card-test-generator">
          <div class="wl-card-top">
            <div class="wl-card-icon-wrap wl-icon-test-gen">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M10 2v7.31L4.89 18.5A2 2 0 0 0 6.64 21h10.72a2 2 0 0 0 1.75-2.5L14 9.31V2"/>
                <line x1="8" y1="2" x2="16" y2="2"/>
                <line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
            </div>
            <div class="wl-card-meta">
              <div class="wl-card-title-row">
                <h3 class="wl-card-title">Test Suite Generator Agent</h3>
                <span class="wl-status-pill"><span class="wl-status-dot"></span> Active</span>
              </div>
              <p class="wl-card-desc">Analyzes files, components, and directories to synthesize production-ready unit test suites directly into respective <code>tests/</code> folders. Supports PyTest, Jest, Vitest, JUnit 5, and Karma.</p>
            </div>
          </div>

          <div class="wl-card-deliverables">
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              <span>PyTest (.py)</span>
            </div>
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              <span>Jest / Vitest (.test.jsx)</span>
            </div>
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
              <span>JUnit 5 (.java)</span>
            </div>
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>Karma (.spec.js)</span>
            </div>
          </div>

          <div class="wl-card-footer">
            <button class="wl-btn wl-btn-primary wl-open-agent-btn" id="wl-open-test-agent-btn" type="button">
              <span>Open Agent</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        <!-- CARD 3: Infrastructure & DevOps Generator Agent (ACTIVE) -->
        <div class="wl-agent-card wl-agent-card-active" id="wl-card-infra-generator">
          <div class="wl-card-top">
            <div class="wl-card-icon-wrap" style="background:rgba(14,165,233,0.12);color:#0ea5e9;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
            </div>
            <div class="wl-card-meta">
              <div class="wl-card-title-row">
                <h3 class="wl-card-title">Infrastructure & DevOps Agent</h3>
                <span class="wl-status-pill"><span class="wl-status-dot"></span> Active</span>
              </div>
              <p class="wl-card-desc">Analyzes project structure, .env configs, and frameworks to synthesize hardened Dockerfiles, docker-compose.yml, nginx.conf, and Kubernetes manifests.</p>
            </div>
          </div>

          <div class="wl-card-deliverables">
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
              <span>Dockerfiles</span>
            </div>
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              <span>Compose (.yml)</span>
            </div>
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
              <span>Nginx (.conf)</span>
            </div>
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg>
              <span>K8s (.yaml)</span>
            </div>
          </div>

          <div class="wl-card-footer">
            <button class="wl-btn wl-btn-primary wl-open-agent-btn" id="wl-open-infra-agent-btn" type="button">
              <span>Open Agent</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        <!-- CARD 4: Terminal Command Orchestrator Agent (ACTIVE) -->
        <div class="wl-agent-card wl-agent-card-active" id="wl-card-terminal-agent">
          <div class="wl-card-top">
            <div class="wl-card-icon-wrap" style="background:rgba(234,179,8,0.12);color:#eab308;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="4 17 10 11 4 5"/>
                              <line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
            </div>
            <div class="wl-card-meta">
              <div class="wl-card-title-row">
                <h3 class="wl-card-title">Terminal Orchestrator Agent</h3>
                <span class="wl-status-pill"><span class="wl-status-dot"></span> Active</span>
              </div>
              <p class="wl-card-desc">Auto-detects OS & shell to synthesize exact terminal commands with Human-in-the-loop protection: requires explicit Accept/Reject before execution.</p>
            </div>
          </div>

          <div class="wl-card-deliverables">
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              <span>Auto OS Detect</span>
            </div>
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Human in the Loop</span>
            </div>
            <div class="wl-card-pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>Safety Approval</span>
            </div>
          </div>

          <div class="wl-card-footer">
            <button class="wl-btn wl-btn-primary wl-open-agent-btn" id="wl-open-terminal-agent-btn" type="button">
              <span>Open Agent</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- VIEW 2: DOCUMENT GENERATOR AGENT CHATPLACE                 -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div class="wl-agent-chatplace wl-hidden" id="wl-agent-chatplace-view">
      
      <!-- Top Navigation bar with Back button -->
      <div class="wl-agent-nav-bar">
        <button class="wl-agent-back-btn" id="wl-agent-back-btn" type="button" title="Back to Agents Directory">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          <span>All Agents</span>
        </button>
        <span class="wl-agent-active-pill">
          <span class="wl-status-dot"></span>
          Document Generator Agent
        </span>
      </div>

      <!-- Agent Compact Hero -->
      <div class="wl-agent-hero">
        <div class="wl-agent-profile">
          <div class="wl-agent-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div class="wl-agent-meta">
            <h2 class="wl-agent-name">Document Generator Agent</h2>
            <p class="wl-agent-desc">Autonomous engine dedicated strictly to creating technical documentation, Mermaid architecture diagrams, and executive PDF reports.</p>
          </div>
        </div>

        <!-- Deliverables Badges (Icons only, no emojis) -->
        <div class="wl-agent-deliverables">
          <div class="wl-deliverable-badge" title="Markdown Documentation (.md)">
            <svg class="wl-badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="wl-badge-ext wl-ext-md">.md</span>
            <span class="wl-badge-label">Tech Docs</span>
          </div>
          <div class="wl-deliverable-badge" title="Mermaid Architecture Flowchart (.mmd)">
            <svg class="wl-badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            <span class="wl-badge-ext wl-ext-mmd">.mmd</span>
            <span class="wl-badge-label">Mermaid Flow</span>
          </div>
          <div class="wl-deliverable-badge" title="Executive PDF Report (.pdf)">
            <svg class="wl-badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2z"/><line x1="14" y1="2" x2="14" y2="8"/><line x1="14" y1="8" x2="20" y2="8"/></svg>
            <span class="wl-badge-ext wl-ext-pdf">.pdf</span>
            <span class="wl-badge-label">Executive PDF</span>
          </div>
        </div>

        <!-- Action Chips / Shortcuts (Clean SVG icons, no emojis) -->
        <div class="wl-agent-quick-actions">
          <button class="wl-agent-chip" id="wl-agent-chip-full" type="button">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Generate Full Docs (.md + .mmd + .pdf)</span>
          </button>
          <button class="wl-agent-chip" id="wl-agent-chip-diagram" type="button">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Architecture Flowchart (.mmd)</span>
          </button>
          <button class="wl-agent-chip" id="wl-agent-chip-specs" type="button">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>System Specs & APIs (.md)</span>
          </button>
        </div>
      </div>

      <!-- Agent Activity Stream & Chatplace -->
      <div class="wl-agent-stream" id="wl-agent-stream" role="log" aria-label="Agent activity log">
        <!-- Default Greeting / Workspace Inspection Card -->
        <div class="wl-agent-msg wl-agent-msg-bot">
          <div class="wl-agent-msg-header">
            <span class="wl-agent-msg-author">Document Generator Agent</span>
            <span class="wl-agent-msg-time">Ready</span>
          </div>
          <div class="wl-agent-msg-body">
            <p>Hello! I am your <strong>Document Generator Agent</strong>. I inspect your workspace files, dependencies, and code layers to synthesize comprehensive project documentation.</p>
            <div class="wl-agent-feature-list">
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div><strong>Technical Documentation (<code>.md</code>)</strong>: Architectural specs, directory structure, tech stack, and module breakdowns.</div>
              </div>
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                </div>
                <div><strong>Architecture Diagram (<code>.mmd</code>)</strong>: Multi-tier flowcharts and topology viewable with any Mermaid previewer.</div>
              </div>
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6a2 2 0 0 0-2 2z"/><line x1="14" y1="2" x2="14" y2="8"/><line x1="14" y1="8" x2="20" y2="8"/></svg>
                </div>
                <div><strong>Executive PDF (<code>.pdf</code>)</strong>: Executive technical summary compiled with ReportLab directly to <code>docs/</code>.</div>
              </div>
            </div>
            <p class="wl-agent-prompt-hint">Click <strong>Generate Full Docs</strong> above or type custom instructions below (e.g. <em>"Emphasize authentication and database models"</em>).</p>
          </div>
        </div>
      </div>

      <!-- Professional Agent Input Bar (identical layout to main chat) -->
      <div class="wl-agent-input-bar" id="wl-agent-input-bar">
        <div class="wl-input-capsule">
          <textarea
            id="wl-agent-user-input"
            class="wl-input wl-agent-textarea"
            placeholder="Instruct Document Generator Agent (e.g. Focus on API architecture)..."
            rows="1"
            aria-label="Instruct Document Generator Agent"
          ></textarea>
          <button class="wl-send-btn" id="wl-agent-submit-btn" type="button" title="Send (Enter)" aria-label="Send message">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="wl-agent-input-footer">
          <span class="wl-agent-scope-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Scope: Technical documentation, architecture diagrams, and PDF reports only.
          </span>
        </div>
      </div>

    </div><!-- /wl-agent-chatplace-view -->

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- VIEW 3: TEST SUITE GENERATOR AGENT CHATPLACE                -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div class="wl-agent-chatplace wl-hidden" id="wl-test-agent-chatplace-view">
      
      <!-- Top Navigation bar with Back button -->
      <div class="wl-agent-nav-bar">
        <button class="wl-agent-back-btn" id="wl-test-agent-back-btn" type="button" title="Back to Agents Directory">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          <span>All Agents</span>
        </button>
        <span class="wl-agent-active-pill">
          <span class="wl-status-dot"></span>
          Test Suite Generator Agent
        </span>
      </div>

      <!-- Agent Compact Hero -->
      <div class="wl-agent-hero">
        <div class="wl-agent-profile">
          <div class="wl-agent-avatar wl-test-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10 2v7.31L4.89 18.5A2 2 0 0 0 6.64 21h10.72a2 2 0 0 0 1.75-2.5L14 9.31V2"/>
              <line x1="8" y1="2" x2="16" y2="2"/>
              <line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
          </div>
          <div class="wl-agent-meta">
            <h2 class="wl-agent-name">Test Suite Generator Agent</h2>
            <p class="wl-agent-desc">Autonomous engine dedicated strictly to generating unit tests, mocking suites, and test runners in respective <code>tests/</code> folders.</p>
          </div>
        </div>

        <!-- Framework Badges -->
        <div class="wl-agent-deliverables">
          <div class="wl-deliverable-badge" title="PyTest Suite (.py)">
            <span class="wl-badge-ext wl-ext-py">PyTest</span>
            <span class="wl-badge-label">Python / Django</span>
          </div>
          <div class="wl-deliverable-badge" title="Jest & Vitest Suites (.test.jsx / .test.js)">
            <span class="wl-badge-ext wl-ext-jest">Jest / Vitest</span>
            <span class="wl-badge-label">React / Web</span>
          </div>
          <div class="wl-deliverable-badge" title="JUnit 5 (.java)">
            <span class="wl-badge-ext wl-ext-junit">JUnit 5</span>
            <span class="wl-badge-label">Java</span>
          </div>
          <div class="wl-deliverable-badge" title="Karma & Jasmine (.spec.js)">
            <span class="wl-badge-ext wl-ext-karma">Karma</span>
            <span class="wl-badge-label">Angular / Specs</span>
          </div>
        </div>

        <!-- Action Chips / Shortcuts (Clean SVG icons, no emojis) -->
        <div class="wl-agent-quick-actions">
          <button class="wl-agent-chip" id="wl-test-chip-active" type="button" title="Generate test suite for currently active file">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>Test Active File</span>
          </button>
          <button class="wl-agent-chip" id="wl-test-chip-frontend" type="button" title="Generate unit tests for Frontend folder">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            <span>Test Frontend Folder (Jest/Vitest)</span>
          </button>
          <button class="wl-agent-chip" id="wl-test-chip-backend" type="button" title="Generate unit tests for Backend folder">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            <span>Test Backend Folder (PyTest)</span>
          </button>
        </div>
      </div>

      <!-- Agent Activity Stream -->
      <div class="wl-agent-stream" id="wl-test-agent-stream" role="log" aria-label="Test agent activity log">
        <div class="wl-agent-msg wl-agent-msg-bot">
          <div class="wl-agent-msg-header">
            <span class="wl-agent-msg-author">Test Suite Generator Agent</span>
            <span class="wl-agent-msg-time">Ready</span>
          </div>
          <div class="wl-agent-msg-body">
            <p>Hello! I am your <strong>Test Suite Generator Agent</strong>. I analyze your functions, components, API routes, and modules to synthesize rigorous unit test suites.</p>
            <div class="wl-agent-feature-list">
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <div><strong>Respective <code>tests/</code> Storage</strong>: Test files are automatically created in the exact <code>tests/</code> folder of the targeted module or folder.</div>
              </div>
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <div><strong>Multi-Framework Support</strong>: PyTest, Jest, Vitest + React Testing Library, JUnit 5, and Karma/Jasmine.</div>
              </div>
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                </div>
                <div><strong>Comprehensive Coverage</strong>: Happy paths, error boundaries, edge cases, null validation, and dependency mocks.</div>
              </div>
            </div>
            <p class="wl-agent-prompt-hint">Click a quick action above or specify a target below (e.g. <em>"generate unit testcase for the whole frontend folder"</em> or <em>"test views.py"</em>).</p>
          </div>
        </div>
      </div>

      <!-- Professional Test Agent Input Bar -->
      <div class="wl-agent-input-bar" id="wl-test-agent-input-bar">
        <div class="wl-input-capsule">
          <textarea
            id="wl-test-agent-user-input"
            class="wl-input wl-agent-textarea"
            placeholder="Instruct Test Suite Generator (e.g. generate unit testcase for the whole frontend folder)..."
            rows="1"
            aria-label="Instruct Test Suite Generator Agent"
          ></textarea>
          <button class="wl-send-btn" id="wl-test-agent-submit-btn" type="button" title="Send (Enter)" aria-label="Send message">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="wl-agent-input-footer">
          <span class="wl-agent-scope-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Scope: Strictly unit tests, test suites, assertions, and mocks. No unrelated code or conversational text.
          </span>
        </div>
      </div>

    </div><!-- /wl-test-agent-chatplace-view -->

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- VIEW 4: INFRASTRUCTURE & DEVOPS GENERATOR AGENT CHATPLACE  -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div class="wl-agent-chatplace wl-hidden" id="wl-infra-agent-chatplace-view">
      
      <!-- Top Navigation bar with Back button -->
      <div class="wl-agent-nav-bar">
        <button class="wl-agent-back-btn" id="wl-infra-agent-back-btn" type="button" title="Back to Agents Directory">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          <span>All Agents</span>
        </button>
        <span class="wl-agent-active-pill">
          <span class="wl-status-dot"></span>
          Infrastructure & DevOps Agent
        </span>
      </div>

      <!-- Agent Compact Hero -->
      <div class="wl-agent-hero">
        <div class="wl-agent-profile">
          <div class="wl-agent-avatar" style="background:rgba(14,165,233,0.15);color:#0ea5e9;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6"/>
              <line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
          </div>
          <div class="wl-agent-meta">
            <h2 class="wl-agent-name">Infrastructure & DevOps Agent</h2>
            <p class="wl-agent-desc">Autonomous engine dedicated strictly to analyzing project structure, mapping <code>.env</code> keys, and synthesizing production Docker, Compose, Nginx, and Kubernetes manifests.</p>
          </div>
        </div>

        <!-- Deliverables Badges -->
        <div class="wl-agent-deliverables">
          <div class="wl-deliverable-badge" title="Service Dockerfiles">
            <span class="wl-badge-ext" style="background:rgba(14,165,233,0.2);color:#38bdf8;">Docker</span>
            <span class="wl-badge-label">Multi-Stage</span>
          </div>
          <div class="wl-deliverable-badge" title="Docker Compose Orchestration">
            <span class="wl-badge-ext" style="background:rgba(59,130,246,0.2);color:#60a5fa;">Compose</span>
            <span class="wl-badge-label">Multi-Service</span>
          </div>
          <div class="wl-deliverable-badge" title="Nginx Reverse Proxy">
            <span class="wl-badge-ext" style="background:rgba(16,185,129,0.2);color:#34d399;">Nginx</span>
            <span class="wl-badge-label">Reverse Proxy</span>
          </div>
          <div class="wl-deliverable-badge" title="Kubernetes Cluster Manifests">
            <span class="wl-badge-ext" style="background:rgba(139,92,246,0.2);color:#a78bfa;">K8s</span>
            <span class="wl-badge-label">Deploy & Ingress</span>
          </div>
        </div>

        <!-- Action Chips / Shortcuts -->
        <div class="wl-agent-quick-actions">
          <button class="wl-agent-chip" id="wl-infra-chip-full" type="button" title="Generate complete DevOps suite">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Generate Full DevOps (Docker + Compose + Nginx + K8s)</span>
          </button>
          <button class="wl-agent-chip" id="wl-infra-chip-compose" type="button" title="Synthesize docker-compose and nginx">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            <span>Docker Compose & Nginx Proxy Only</span>
          </button>
          <button class="wl-agent-chip" id="wl-infra-chip-k8s" type="button" title="Synthesize Kubernetes manifests">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg>
            <span>Kubernetes Manifests (k8s/)</span>
          </button>
        </div>
      </div>

      <!-- Agent Activity Stream -->
      <div class="wl-agent-stream" id="wl-infra-agent-stream" role="log" aria-label="Infrastructure agent activity log">
        <div class="wl-agent-msg wl-agent-msg-bot">
          <div class="wl-agent-msg-header">
            <span class="wl-agent-msg-author">Infrastructure & DevOps Agent</span>
            <span class="wl-agent-msg-time">Ready</span>
          </div>
          <div class="wl-agent-msg-body">
            <p>Hello! I am your <strong>Infrastructure & DevOps Generator Agent</strong>. I inspect your workspace structure, microservices, databases, and <code>.env</code> configurations to synthesize production-grade containerization and orchestration files.</p>
            <div class="wl-agent-feature-list">
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                </div>
                <div><strong>Service-Specific Dockerfiles</strong>: Multi-stage, non-root runner Dockerfiles placed cleanly inside respective service folders (e.g. <code>Frontend/Dockerfile</code>, <code>Backend/Dockerfile</code>).</div>
              </div>
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                </div>
                <div><strong>Root <code>docker-compose.yml</code></strong>: Orchestrates frontend, backend, databases (PostgreSQL/Redis/Mongo), persistent volumes, healthchecks, and internal networks.</div>
              </div>
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/></svg>
                </div>
                <div><strong>Nginx & Kubernetes Cluster</strong>: Reverse proxy with WebSocket support plus <code>k8s/</code> manifests (Deployments, Services, Ingress, ConfigMaps, Secrets).</div>
              </div>
            </div>
            <p class="wl-agent-prompt-hint">Click a quick action above or type custom deployment specifications below (e.g. <em>"Deploy on AWS EKS with Redis and PostgreSQL"</em>).</p>
          </div>
        </div>
      </div>

      <!-- Professional Infra Agent Input Bar -->
      <div class="wl-agent-input-bar" id="wl-infra-agent-input-bar">
        <div class="wl-input-capsule">
          <textarea
            id="wl-infra-agent-user-input"
            class="wl-input wl-agent-textarea"
            placeholder="Instruct Infrastructure Agent (e.g. Include Redis cache and production Nginx)..."
            rows="1"
            aria-label="Instruct Infrastructure & DevOps Agent"
          ></textarea>
          <button class="wl-send-btn" id="wl-infra-agent-submit-btn" type="button" title="Send (Enter)" aria-label="Send message">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="wl-agent-input-footer">
          <span class="wl-agent-scope-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Scope: Strictly Docker, container orchestration, Nginx, and Kubernetes manifests.
          </span>
        </div>
      </div>

    </div><!-- /wl-infra-agent-chatplace-view -->

    <!-- ══════════════════════════════════════════════════════════ -->
    <!-- VIEW 5: TERMINAL COMMAND ORCHESTRATOR CHATPLACE             -->
    <!-- ══════════════════════════════════════════════════════════ -->
    <div class="wl-agent-chatplace wl-hidden" id="wl-terminal-agent-chatplace-view">
      
      <!-- Top Navigation bar with Back button -->
      <div class="wl-agent-nav-bar">
        <button class="wl-agent-back-btn" id="wl-terminal-agent-back-btn" type="button" title="Back to Agents Directory">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          <span>All Agents</span>
        </button>
        <span class="wl-agent-active-pill">
          <span class="wl-status-dot" style="background:#eab308;"></span>
          Terminal Command Orchestrator
        </span>
      </div>

      <!-- Agent Compact Hero -->
      <div class="wl-agent-hero">
        <div class="wl-agent-profile">
          <div class="wl-agent-avatar" style="background:rgba(234,179,8,0.15);color:#eab308;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="4 17 10 11 4 5"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
          </div>
          <div class="wl-agent-meta">
            <h2 class="wl-agent-name">Terminal Command Orchestrator</h2>
            <p class="wl-agent-desc">Autonomous engine with strict <strong>Human-in-the-Loop protection</strong>. Auto-detects OS and shell, synthesizes exact commands, and never executes without your explicit Accept approval.</p>
          </div>
        </div>

        <!-- Protection Badges -->
        <div class="wl-agent-deliverables">
          <div class="wl-deliverable-badge" title="Auto OS & Shell Detection">
            <span class="wl-badge-ext" style="background:rgba(234,179,8,0.2);color:#facc15;">Auto-OS</span>
            <span class="wl-badge-label">macOS · Linux · Windows</span>
          </div>
          <div class="wl-deliverable-badge" title="Strict Human-in-the-Loop Gate">
            <span class="wl-badge-ext" style="background:rgba(16,185,129,0.2);color:#34d399;">Gatekeeper</span>
            <span class="wl-badge-label">Accept / Reject</span>
          </div>
          <div class="wl-deliverable-badge" title="Safety & Risk Level">
            <span class="wl-badge-ext" style="background:rgba(59,130,246,0.2);color:#60a5fa;">Safety</span>
            <span class="wl-badge-label">Risk Assessment</span>
          </div>
        </div>

        <!-- Action Chips / Shortcuts -->
        <div class="wl-agent-quick-actions">
          <button class="wl-agent-chip" id="wl-term-chip-react" type="button" title="Create React app and install modules">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
            <span>Create React App and install node modules</span>
          </button>
          <button class="wl-agent-chip" id="wl-term-chip-migrate" type="button" title="Run database migrations">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            <span>Run database migrations</span>
          </button>
          <button class="wl-agent-chip" id="wl-term-chip-dev" type="button" title="Start dev server">
            <svg class="wl-chip-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Start development server</span>
          </button>
        </div>
      </div>

      <!-- Agent Activity Stream -->
      <div class="wl-agent-stream" id="wl-terminal-agent-stream" role="log" aria-label="Terminal agent activity log">
        <div class="wl-agent-msg wl-agent-msg-bot">
          <div class="wl-agent-msg-header">
            <span class="wl-agent-msg-author">Terminal Command Orchestrator</span>
            <span class="wl-agent-msg-time">Ready</span>
          </div>
          <div class="wl-agent-msg-body">
            <p>Hello! I am your <strong>Terminal Command Orchestrator Agent</strong>. I formulate exact, cross-platform terminal commands for your environment with strict Human-in-the-Loop protection.</p>
            <div class="wl-agent-feature-list">
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div><strong>Zero Unauthorized Execution</strong>: Commands are <em>never</em> executed automatically. You review the exact command and click <strong>Accept & Run</strong> or <strong>Reject</strong>.</div>
              </div>
              <div class="wl-feature-item">
                <div class="wl-feature-icon-wrap">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                </div>
                <div><strong>Environment-Aware</strong>: Auto-detects macOS/Linux/Windows, active shell (zsh/bash/pwsh), target folder, and package manager.</div>
              </div>
            </div>
            <p class="wl-agent-prompt-hint">Click a quick action above or prompt below (e.g. <em>"create a react app and install the node modules"</em> or <em>"install tailwindcss and initialize config"</em>).</p>
          </div>
        </div>
      </div>

      <!-- Professional Terminal Agent Input Bar -->
      <div class="wl-agent-input-bar" id="wl-terminal-agent-input-bar">
        <div class="wl-input-capsule">
          <textarea
            id="wl-terminal-agent-user-input"
            class="wl-input wl-agent-textarea"
            placeholder="Instruct Terminal Orchestrator (e.g. create a react app and install the node modules)..."
            rows="1"
            aria-label="Instruct Terminal Command Orchestrator"
          ></textarea>
          <button class="wl-send-btn" id="wl-terminal-agent-submit-btn" type="button" title="Send (Enter)" aria-label="Send message">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="wl-agent-input-footer">
          <span class="wl-agent-scope-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Scope: Strictly terminal command synthesis and execution. Protected by explicit Human-in-the-Loop approval.
          </span>
        </div>
      </div>

    </div><!-- /wl-terminal-agent-chatplace-view -->

  </div><!-- /wl-panel-agents -->

  <!-- Details panel removed —data still processed by backend -->

  <!-- ── Search Modal Overlay ───────────────────────────────────── -->
  <div class="wl-search-overlay wl-hidden" id="wl-search-overlay" aria-hidden="true"></div>
  <div class="wl-search-panel wl-hidden" id="wl-search-panel" role="dialog" aria-label="Search chat history" aria-modal="true">
    <div class="wl-search-input-wrap">
      <svg class="wl-search-input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="wl-search-input" class="wl-search-input" placeholder="Search chats and projects" autocomplete="off" aria-label="Search chats and projects" />
      <button class="wl-search-close-btn" id="wl-search-close-btn" title="Close" aria-label="Close search">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="wl-search-divider"></div>
    <div class="wl-search-results" id="wl-search-results" role="list" aria-label="Search results"></div>
    <div class="wl-search-empty wl-hidden" id="wl-search-empty">No conversations found.</div>
  </div>

  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

/**
 * Generate a cryptographically strong 32-character nonce.
 * @returns {string} 32-char hex nonce
 */
function getNonce() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { getWebviewContent };