# SyncPull — Intelligent GitHub Synchronization Assistant

[![Version](https://img.shields.io/badge/version-1.0.0-emerald.svg)](https://github.com/bidut04/gitplus)
[![Git Intelligence](https://img.shields.io/badge/git--intelligence-active-blue.svg)](https://github.com/bidut04/gitplus)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/bidut04/gitplus)

> **Stay in sync. Never miss a commit.**  
> Proactive GitHub collaboration and synchronization intelligence directly in Visual Studio Code.

---

## ⚡ What is SyncPull?

Like **GitLens** and **Git Blame**, SyncPull deeply understands your Git repository—with a dedicated focus on: **Proactive Remote Synchronization Intelligence**.

In team projects, developers frequently start coding without pulling the latest changes. SyncPull monitors your upstream tracking branches, detects new teammate pushes in real-time, inspects your working tree safety, and recommends safe synchronization actions before merge conflicts happen.

---

## ✨ Key Features

### 1. Status Bar Synchronization Radar
Always visible in your bottom status bar:
* `$(check) SyncPull: main (In Sync)` — When your working copy is completely up to date.
* `$(cloud-download) SyncPull: main (5 behind - Safe)` — When remote commits are waiting and your working tree is clean. Safe to pull!
* `$(alert) SyncPull: main (3 behind - Dirty)` — Warns you when you have uncommitted edits, blocking accidental overwrites.

### 2. Dedicated Activity Bar Tree View
A complete dashboard pane on your left sidebar:
* **Repository:** Track active remote and local clone state.
* **Behind / Ahead Counters:** Live commit difference vectors (`git rev-list --left-right --count`).
* **Working Tree Safety:** Instant indicator of clean vs. dirty working trees.
* **Safe Action Recommender:** One-click safe pull (`git pull --ff-only`).

### 3. Safe Non-Destructive Invariant
SyncPull **never** executes destructive commands (`git reset --hard`, `git clean -fd`, or forced branch replacements). Fetch operations update remote-tracking information without touching your active files or stashes.

---

## 🚀 Available Commands

Open your Command Palette (`Ctrl + Shift + P` or `Cmd + Shift + P`) and search:

| Command | Description |
|---|---|
| `SyncPull: Check Synchronization Status` | Open interactive synchronization inspection quick-pick |
| `SyncPull: Safe Non-Destructive Fetch` | Background fetch remote tracking refs without altering working tree |
| `SyncPull: Open Morning Sync Report` | Consolidate and display synchronization status across your clones |

---

## 🛠️ How to View in VS Code

1. Press `Ctrl + Shift + X` to open the **Extensions** view.
2. Type `@installed syncpull` into the search box.
3. Click on **SyncPull** to view this complete documentation, settings, and commands!
