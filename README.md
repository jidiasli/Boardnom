# Boardnom 2.0

A free, real-time collaborative whiteboard. Open a link, enter your name, draw together.

## Run it on your computer

Needs [Node.js](https://nodejs.org) 18 or newer (the LTS download is fine).

```
npm install
npm start
```

Open http://localhost:3000. Stop the server with `Ctrl + C`.

## Put it online (Render, free)

If your repo is already connected to Render, you only need to push the new files.
Render settings stay the same: **Build** `npm install`, **Start** `node server.js`, **Free** instance.

1. Replace everything in your project folder with the files from this ZIP
   (delete the old `public` folder and old `server.js` first so nothing stale is left).
2. In a terminal inside the project folder:
   ```
   git add .
   git commit -m "Boardnom 2.0 rebuild"
   git push
   ```
3. Render redeploys by itself in 2 to 5 minutes. When the log says "Your service is live", open your
   `https://<your-service>.onrender.com` link.

Free Render services sleep after about 15 minutes without visitors; the first visit afterwards takes
30 to 50 seconds. Boards live in server memory, so they reset when the server restarts or sleeps.
Use a browser's screenshot or print if you need to keep one.

## Share and collaborate

1. Open the site and enter your name. You land on a board with its own link, like `/b/3f9a1c07d2`.
2. Click **Share**, then **Copy link**, and send it to your friends.
3. Anyone who opens that link joins the same board instantly. Their cursors and names appear live.

The first person in a board is its **host**. In the Share dialog the host can choose who may change items:

- **Only the creator** of each item (default): you can move, edit and erase only what you made.
- **Everyone**: anyone can edit anything.

## How to use it

| Tool | Key | What it does |
|---|---|---|
| Select | V | Click to select, drag to move, drag handles to resize, drag on empty space to box-select. Shift adds to the selection. Double-click text to edit. |
| Hand | H | Pan the board. (Space + drag, or middle mouse, also pans.) |
| Pen / Highlight | P / M | Freehand drawing. |
| Eraser | E | Drag over your own items to remove them. |
| Rectangle, Ellipse, Line, Arrow | R, O, L, A | Drag to draw. Hold Shift for a square, circle or 45 degree line. |
| Text, Sticky | T, N | Click to type. Click anywhere else, or press Esc, to finish. |
| Upload | | Pick an image file from your device. |
| Paste | Ctrl+V | Paste an image or text from your clipboard. You can also drag image files onto the board. |
| Undo / Redo | Ctrl+Z / Ctrl+Shift+Z | Undo your own actions. |
| Clear | | Clear your items. The host can also clear everything. |

**Thickness** is a slider (1 to 60) with a live preview. It sets the thickness of the next thing you draw,
and if something of yours is selected it changes that item too.

**Zoom:** mouse wheel, pinch with two fingers, `+` / `-`, the zoom buttons, or `0` to fit everything.
Click the percentage to return to 100%. `Esc` always returns the board to a clean idle state.
Other shortcuts: `Delete` removes the selection, `Ctrl+D` duplicates, `Ctrl+A` selects all of your items.

## How it works

```
server.js                 entry point (keeps `node server.js` working on Render)
backend/
  app.js                  Express + Socket.IO setup
  rooms.js                room state and EVERY permission rule (pure logic, unit-tested)
  schema.js               validation: nothing from a client is stored unless whitelisted
  sockets.js              realtime events + identity
  assets.js               image upload / download (/api/rooms/:room/assets)
public/
  index.html, css/app.css
  js/
    main.js               wires the modules together
    store.js              client state (objects, local-only selection, presence)
    actions.js            the only place that changes shared state (apply, send, undo)
    net.js, sync.js       Socket.IO wrapper and "server event -> store" bindings
    renderer.js           draws everything on one canvas, at most once per frame
    objects.js            how each object type is drawn, measured and hit-tested
    selection.js          selection box, handles and resize math
    input.js              ALL pointer / wheel / keyboard input in one state machine
    editor.js             the text-editing overlay
    clipboard.js, images.js   paste, upload, drag-drop, downscale + upload
    tools/                select, pen, eraser, shape, text, pan
tests/
  unit/                   `npm test` (permission rules, geometry, camera)
  e2e/e2e.py, mobile.py   two-user and touch tests in a real browser (see below)
```

**Why this stack:** the board is one canvas, and the hard problems are shared state and permissions,
not UI components. Plain ES modules need no build step, so it deploys exactly like before.
Socket.IO gives reconnection and fallbacks that work behind proxies.

### Ownership and selection isolation

- The server is the single source of truth. Every object has an `ownerId` that the **server** sets
  from the connection's identity; a client-supplied owner is ignored.
- Identity: your browser keeps a random secret token. The server shares only a hash of it, so nobody can
  act as another user without that secret.
- Every change goes through `rooms.js`, which refuses edits and deletes from non-owners
  (unless the host switched the board to "Everyone"). A refused change sends the true object
  back to the sender, whose screen corrects itself.
- Selection, drag state, the text editor and your tool settings exist only in your own browser and are never sent.
  Objects you may not edit cannot be selected, so clicks pass straight through them.
- Only whitelisted fields can change after creation; stroke points, type and owner are immutable.

### Why the three bugs cannot come back

1. **Pasted images could not be moved.** Images, text, shapes and strokes are now one object model with a
   shared frame, handled by one Select tool on one canvas. There is no separate image/DOM code path.
2. **Text shared between users.** Ownership is enforced on the server and in the Select/Eraser tools (see above),
   and text is a normal owned object rather than a DOM element broadcast to everyone.
3. **Text stuck to the cursor and blocked zoom.** The text editor is a local textarea that never follows the
   pointer, and wheel zoom is bound to the whole stage independent of tool or editor. All interaction state
   lives in one place and is reset by `pointercancel`, lost pointer capture, window blur, tab hide, Escape and
   every tool change. The camera also refuses NaN/Infinity values.

## Tests

```
npm test                     # 29 unit tests, no extra setup
pip install playwright && playwright install chromium
python3 tests/e2e/e2e.py     # 55 checks, two simulated users in real Chromium
python3 tests/e2e/mobile.py  # 15 checks, touch + pinch on a phone-sized screen
```

## Known limitations and ideas for later

- Boards are in memory only: they reset when the server restarts or sleeps. A database (or Render disk)
  would make them permanent.
- Simultaneous edits to the same item (only possible in "Everyone" mode) are last-writer-wins.
- No rotation, grouping, layer ordering controls, or accounts yet.
- Undo is per person and is cleared if you reconnect.
- While offline you cannot draw (changes are not queued); the board reloads fully when you reconnect.
- Images are limited to 5 MB each and 64 MB per board, and animated GIFs become still images.
- There is no rate limiting on object edits yet and the link is the only access control, so
  treat board links like a password if the content matters.
