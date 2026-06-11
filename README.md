# ⬡ Boardnom — Free Collaborative Whiteboard

A Miro-inspired real-time collaborative whiteboard. Free forever. No account needed.

---

## 🚀 Quick Start (Run Locally)

### Requirements
- [Node.js](https://nodejs.org) v16 or higher
- npm (comes with Node.js)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
```

Open your browser at **http://localhost:3000**

> For auto-restart on file changes during development: `npm run dev`

---

## 🌐 Share Online (Free Hosting Options)

### Option A — Glitch.com (Easiest, Instant)
1. Go to [glitch.com](https://glitch.com) → click **New Project → Import from GitHub**
2. Or click **New Project → glitch-hello-node**, then replace the files with yours
3. Upload `server.js`, `package.json`, and `public/index.html`
4. Your board is live at `https://your-project-name.glitch.me`
5. Share that URL with your friends!

### Option B — Render.com (Most Reliable Free Hosting)
1. Push your project to a GitHub repo
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Set **Start Command**: `node server.js`
5. Set **Environment**: Node
6. Click **Deploy** — your URL is `https://your-app.onrender.com`

### Option C — Railway.app
1. Go to [railway.app](https://railway.app)
2. Click **New Project → Deploy from GitHub Repo**
3. Connect your repo → it auto-detects Node.js
4. Click **Deploy** — free $5/month credit included

---

## 🎨 How to Use Boardnom

### Joining a Board
- Open the URL in your browser
- Enter your name and click **Enter Board →**
- A unique room is created automatically
- The room ID is added to the URL (e.g. `http://localhost:3000/#ABC123`)

### Sharing with Friends
- Click the **Share** button in the top-right
- Copy the link and send it to your team
- Anyone who opens that link joins the same board instantly
- **No account required** — just share the link!

---

## 🛠 Tools Reference

| Tool         | Shortcut | What it does                              |
|-------------|----------|-------------------------------------------|
| Select       | `V`      | Click to select, drag to move elements    |
| Pan          | `H`      | Drag to pan the canvas (also: Space+drag) |
| Pen          | `P`      | Smooth freehand drawing                   |
| Marker       | —        | Thick freehand marker                     |
| Highlighter  | —        | Semi-transparent highlighter              |
| Eraser       | `E`      | Erase elements by touching them           |
| Rectangle    | `R`      | Draw rectangles                           |
| Ellipse      | `O`      | Draw circles and ovals                    |
| Line         | `L`      | Draw straight lines                       |
| Arrow        | `A`      | Draw arrows                               |
| Text         | `T`      | Click to add text (double-click to edit)  |
| Sticky Note  | `S`      | Add a colorful sticky note                |

### Keyboard Shortcuts
| Shortcut           | Action              |
|--------------------|---------------------|
| `Ctrl + Z`         | Undo                |
| `Ctrl + Y`         | Redo                |
| `Ctrl + A`         | Select All          |
| `Delete / Backspace` | Delete selected   |
| `Escape`           | Deselect / Cancel   |
| `Space + Drag`     | Pan the canvas      |
| `+` / `-`          | Zoom in / out       |
| `0`                | Fit to screen       |
| Scroll Wheel       | Zoom in / out       |
| Middle Click Drag  | Pan the canvas      |

### Canvas Navigation
- **Zoom**: Scroll wheel, or `+` / `-` keys
- **Pan**: Hold `Space` and drag, or use the Pan tool
- **Fit**: Click the `⊡` button or press `0`
- **Reset zoom**: Click the percentage display

### Collaboration Features
- **Live cursors**: See your teammates' cursors with their names
- **Real-time drawing**: See everyone drawing simultaneously
- **User avatars**: Top-right shows all connected users
- **Toast notifications**: Get notified when someone joins or leaves

---

## 📁 Project Structure

```
boardnom/
├── server.js          ← Node.js + Socket.io backend
├── package.json       ← Dependencies
├── README.md          ← This file
└── public/
    └── index.html     ← Complete frontend (HTML + CSS + JS)
```

---

## 🔧 Configuration

Edit `server.js` to change:
- **Port**: Change `PORT` variable (default: `3000`)
- **Room persistence**: Currently rooms are in-memory (reset on server restart)

---

## 💡 Tips

- **Double-click** on empty canvas (with Select tool) to quickly add text
- **Right-click** anywhere for a context menu
- Sticky notes save text automatically as you type
- Elements are synced in real-time to all room participants
- The board URL is shareable — bookmark it to return to the same room

---

## 🆓 Free Forever

Boardnom is completely free:
- No user accounts
- No subscription
- No ads
- Unlimited rooms
- Unlimited collaborators

---

*Built with Node.js, Socket.io, and HTML5 Canvas*
