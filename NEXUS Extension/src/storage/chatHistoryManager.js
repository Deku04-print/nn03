// WorkLens Chat History Manager
// Stores all conversations for the current workspace in a single local JSON file.
// Each workspace/project folder gets its OWN independent history file so that
// conversations are always scoped to the project that is currently open.
'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const HISTORY_FILE_NAME = '.worklens-history.json';

class ChatHistoryManager {
    constructor() {
        this._cache = null;           // In-memory cache to avoid redundant reads
        this._cachedFolderPath = null; // Track which folder the cache belongs to
    }

    // ── File path ─────────────────────────────────────────────────────

    /**
     * Resolve the absolute path to the history file inside the current workspace.
     * Returns null if no workspace folder is open.
     * Automatically invalidates the cache whenever the workspace folder changes.
     * @returns {string|null}
     */
    _getHistoryFilePath() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) return null;

        const currentFolderPath = folders[0].uri.fsPath;

        // ── Cache invalidation on workspace switch ──────────────────
        if (this._cachedFolderPath !== currentFolderPath) {
            this._cache = null;
            this._cachedFolderPath = currentFolderPath;
        }

        return path.join(currentFolderPath, HISTORY_FILE_NAME);
    }

    /**
     * Returns the base name of the currently open workspace folder.
     * Falls back to 'this project' when no folder is open.
     * @returns {string}
     */
    getProjectName() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) return 'this project';
        return path.basename(folders[0].uri.fsPath);
    }

    // ── Read / Write ──────────────────────────────────────────────────

    /**
     * Load all conversations from disk.
     * Returns an empty array if the file is missing or corrupt.
     * @returns {Array}
     */
    loadHistory() {
        if (this._cache !== null) return this._cache;

        const filePath = this._getHistoryFilePath();
        if (!filePath) return [];

        try {
            if (!fs.existsSync(filePath)) {
                this._cache = [];
                return [];
            }
            const raw = fs.readFileSync(filePath, 'utf8');
            this._cache = JSON.parse(raw);
            if (!Array.isArray(this._cache)) this._cache = [];
        } catch (err) {
            console.warn('[WorkLens] Chat history file is corrupt — resetting.', err.message);
            this._cache = [];
        }
        return this._cache;
    }

    /**
     * Persist the current in-memory cache to disk.
     * @private
     */
    _flush() {
        const filePath = this._getHistoryFilePath();
        if (!filePath) return;
        try {
            fs.writeFileSync(filePath, JSON.stringify(this._cache, null, 2), 'utf8');
        } catch (err) {
            console.error('[WorkLens] Failed to write chat history:', err.message);
        }
    }

    // ── CRUD ──────────────────────────────────────────────────────────

    /**
     * Save or update a conversation.
     * If a conversation with the same `id` already exists, it is replaced.
     * Otherwise the conversation is prepended (newest first).
     *
     * @param {{
     *   id: string,
     *   title: string,
     *   createdAt: string,
     *   updatedAt: string,
     *   messages: Array,
     *   context: object
     * }} conversation
     */
    saveConversation(conversation) {
        if (!conversation || !conversation.id) return;

        // Ensure cache is loaded before mutating
        this.loadHistory();

        const idx = this._cache.findIndex(c => c.id === conversation.id);
        if (idx !== -1) {
            this._cache[idx] = conversation;
        } else {
            this._cache.unshift(conversation); // newest first
        }
        this._flush();
    }

    /**
     * Get a single conversation by ID.
     * @param {string} id
     * @returns {object|null}
     */
    getConversation(id) {
        const history = this.loadHistory();
        return history.find(c => c.id === id) || null;
    }

    /**
     * Return all conversations, sorted newest-first.
     * @returns {Array}
     */
    getAllConversations() {
        return this.loadHistory();
    }

    /**
     * Fast in-memory search over conversation title and all message content.
     * Case-insensitive substring match.
     *
     * @param {string} query
     * @returns {Array} Matching conversations (full objects)
     */
    searchConversations(query) {
        if (!query || query.trim() === '') return this.loadHistory();

        const lower = query.toLowerCase().trim();
        return this.loadHistory().filter(conv => {
            // Match on title
            if ((conv.title || '').toLowerCase().includes(lower)) return true;
            // Match on any message content
            if (Array.isArray(conv.messages)) {
                return conv.messages.some(m =>
                    (m.content || '').toLowerCase().includes(lower)
                );
            }
            return false;
        });
    }

    /**
     * Delete a single conversation by ID.
     * Returns true if found and removed, false otherwise.
     * @param {string} id
     * @returns {boolean}
     */
    deleteConversation(id) {
        if (!id) return false;
        this.loadHistory();
        const initialLen = this._cache.length;
        this._cache = this._cache.filter(c => c.id !== id);
        if (this._cache.length !== initialLen) {
            this._flush();
            return true;
        }
        return false;
    }

    /**
     * Delete all saved conversations for the current workspace.
     */
    clearAllHistory() {
        this._cache = [];
        this._flush();
    }

    /**
     * Invalidate the in-memory cache (e.g. after workspace folder change).
     * The next call to loadHistory() will re-read from the new folder.
     */
    invalidateCache() {
        this._cache = null;
        this._cachedFolderPath = null;
    }
}

module.exports = { ChatHistoryManager };