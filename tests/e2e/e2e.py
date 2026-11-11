"""
End-to-end tests for Boardnom (real Chromium, two simulated users).

Run:   pip install playwright && playwright install chromium
       python3 tests/e2e/e2e.py

Covers the three reported bugs plus the thickness slider:
  BUG 1  pasted images can be selected and moved
  BUG 2  text created by one user cannot be moved/edited by another
  BUG 3  creating text never attaches to the cursor or blocks zoom / pan
"""
import os, subprocess, sys, time, signal
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 3101
BASE = f'http://localhost:{PORT}'
ROOM = 'e2e-room-1'
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('  PASS  ' if ok else '  FAIL  ') + name + (f'   [{detail}]' if detail and not ok else ''))


def join(ctx, name):
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))
    page.goto(f'{BASE}/b/{ROOM}')
    page.fill('#joinName', name)
    page.click('#joinForm button[type=submit]')
    page.wait_for_selector('#statusDot[data-state=online]', timeout=8000)
    return page


def to_page(page, wx, wy):
    """world coords -> absolute page coords"""
    return page.evaluate("""([wx, wy]) => { const a = window.__boardnom; const r = a.canvas.getBoundingClientRect();
        const s = a.camera.toScreen(wx, wy); return [r.left + s.x, r.top + s.y]; }""", [wx, wy])


def obj(page, oid):
    return page.evaluate("(id) => { const o = window.__boardnom.store.get(id); return o ? JSON.parse(JSON.stringify(o)) : null; }", oid)


def objects_of(page, typ):
    return page.evaluate("(t) => window.__boardnom.store.list().filter(o => o.type === t).map(o => o.id)", typ)


def pick_tool(page, tool):
    page.click(f'#toolbar [data-tool={tool}]')


def drag(page, p1, p2, steps=12):
    page.mouse.move(*p1)
    page.mouse.down()
    page.mouse.move(*p2, steps=steps)
    page.mouse.up()


def input_idle(page):
    return page.evaluate("""() => { const i = window.__boardnom.input;
        return i.pointers.size === 0 && !i.activeTool && !i.pan && !i.gesture && !i.blocked; }""")


PASTE_JS = """async () => {
  const c = document.createElement('canvas'); c.width = 240; c.height = 160;
  const g = c.getContext('2d'); g.fillStyle = '#e8590c'; g.fillRect(0, 0, 240, 160);
  g.fillStyle = '#fff'; g.fillRect(20, 20, 80, 50);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'shot.png', { type: 'image/png' });
  const dt = new DataTransfer(); dt.items.add(file);
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}"""


def run(p):
    browser = p.chromium.launch()
    ctxA = browser.new_context(viewport={'width': 1280, 'height': 800})
    ctxB = browser.new_context(viewport={'width': 1280, 'height': 800})
    A = join(ctxA, 'Alice')   # first in => host
    B = join(ctxB, 'Bob')
    A.wait_for_function("window.__boardnom.store.users.size >= 1")

    # ------------------------------------------------------------------ BUG 1
    print('\nBUG 1 - pasted image can be selected and moved')
    A.evaluate(PASTE_JS)
    A.wait_for_function("window.__boardnom.store.list().some(o => o.type === 'image')", timeout=8000)
    img_id = objects_of(A, 'image')[0]
    check('image appears on the board after paste', obj(A, img_id) is not None)
    check('pasted image is auto-selected', A.evaluate("(id) => window.__boardnom.store.selection.has(id)", img_id))
    check('select tool is active after paste', A.evaluate("window.__boardnom.tool.id") == 'select')

    B.wait_for_function("(id) => !!window.__boardnom.store.get(id)", arg=img_id, timeout=8000)
    check('other user receives the pasted image', obj(B, img_id) is not None)
    B.wait_for_function("(id) => window.__boardnom.images.get(window.__boardnom.store.get(id).assetId).status === 'ready'", arg=img_id, timeout=8000)
    check('other user can actually load the image pixels', True)

    before = obj(A, img_id)
    cx, cy = to_page(A, before['x'] + before['w'] / 2, before['y'] + before['h'] / 2)
    drag(A, (cx, cy), (cx + 180, cy + 90))
    after = obj(A, img_id)
    check('image moved by the drag (x)', abs((after['x'] - before['x']) - 180) < 3, f"dx={after['x'] - before['x']}")
    check('image moved by the drag (y)', abs((after['y'] - before['y']) - 90) < 3, f"dy={after['y'] - before['y']}")
    B.wait_for_function("([id, x]) => Math.abs(window.__boardnom.store.get(id).x - x) < 0.5", arg=[img_id, after['x']], timeout=5000)
    check('other user sees the image in its new position', True)

    # resize via corner handle
    sb = A.evaluate("""() => { const a = window.__boardnom; const o = a.store.selected()[0];
        const pad = 6 / a.camera.zoom; const s = a.camera.toScreen(o.x + o.w + pad, o.y + o.h + pad);
        const r = a.canvas.getBoundingClientRect(); return [r.left + s.x, r.top + s.y]; }""")
    w0 = obj(A, img_id)['w']
    drag(A, tuple(sb), (sb[0] + 80, sb[1] + 60))
    o2 = obj(A, img_id)
    check('image can be resized with the corner handle', o2['w'] > w0 + 20, f"w {w0} -> {o2['w']}")
    check('resize keeps the aspect ratio', abs(o2['w'] / o2['h'] - 240 / 160) < 0.02, f"{o2['w'] / o2['h']}")

    # undo the resize + move
    A.keyboard.press('Control+z'); A.keyboard.press('Control+z')
    check('undo restores the original position', abs(obj(A, img_id)['x'] - before['x']) < 0.5)
    A.keyboard.press('Control+Shift+z'); A.keyboard.press('Control+Shift+z')
    check('redo re-applies the move', abs(obj(A, img_id)['x'] - after['x']) < 0.5)

    # ------------------------------------------------------------------ BUG 2
    print('\nBUG 2 - text is owned by its creator')
    pick_tool(A, 'text')
    sx, sy = to_page(A, -300, -200)
    A.mouse.click(sx, sy)
    A.wait_for_selector('textarea.text-editor')
    A.keyboard.type('Alice owns this')
    A.keyboard.press('Escape')
    A.wait_for_function("window.__boardnom.store.list().some(o => o.type === 'text')")
    text_id = objects_of(A, 'text')[0]
    t = obj(A, text_id)
    check('text object created with the right content', t['text'] == 'Alice owns this')
    A.wait_for_function("() => window.__boardnom.store.me && true")
    a_user = A.evaluate("window.__boardnom.store.me.userId")
    check('text is owned by its creator', t['ownerId'] == a_user)
    B.wait_for_function("(id) => !!window.__boardnom.store.get(id)", arg=text_id, timeout=5000)

    # Bob tries to drag Alice's text with the mouse
    pick_tool(B, 'select')
    tcx, tcy = to_page(B, t['x'] + t['w'] / 2, t['y'] + t['h'] / 2)
    drag(B, (tcx, tcy), (tcx + 200, tcy + 120))
    B.wait_for_timeout(400)
    check("Bob's drag does not move Alice's text (on Bob)", abs(obj(B, text_id)['x'] - t['x']) < 0.5)
    check("Bob's drag does not move Alice's text (on Alice)", abs(obj(A, text_id)['x'] - t['x']) < 0.5)
    check("Bob cannot even select Alice's text", B.evaluate("window.__boardnom.store.selection.size") == 0)

    # Bob double-clicks it - must not open an editor
    B.mouse.dblclick(tcx, tcy)
    B.wait_for_timeout(300)
    check("Bob cannot open an editor on Alice's text", B.locator('textarea.text-editor').count() == 0)

    # Bob erases over it
    pick_tool(B, 'eraser')
    drag(B, (tcx - 40, tcy), (tcx + 40, tcy), steps=8)
    B.wait_for_timeout(400)
    check("Bob's eraser does not delete Alice's text", obj(A, text_id) is not None and obj(B, text_id) is not None)

    # Bob forges raw protocol messages
    B.evaluate("""(id) => { const s = window.__boardnom.net.socket;
        s.emit('obj:patch', { id, patch: { x: 9999, y: 9999, text: 'hijacked' } });
        s.emit('obj:delete', { ids: [id] }); }""", text_id)
    B.wait_for_timeout(500)
    check('forged patch/delete from Bob is rejected by the server', obj(A, text_id)['text'] == 'Alice owns this' and abs(obj(A, text_id)['x'] - t['x']) < 0.5)
    check("Bob's screen is corrected back to the real state", obj(B, text_id) is not None and obj(B, text_id)['text'] == 'Alice owns this')

    # Alice CAN move her own text, and Bob sees it
    pick_tool(A, 'select')
    acx, acy = to_page(A, t['x'] + t['w'] / 2, t['y'] + t['h'] / 2)
    drag(A, (acx, acy), (acx + 150, acy + 100))
    moved = obj(A, text_id)
    check('Alice can move her own text', abs(moved['x'] - t['x'] - 150) < 3)
    B.wait_for_function("([id, x]) => Math.abs(window.__boardnom.store.get(id).x - x) < 0.5", arg=[text_id, moved['x']], timeout=5000)
    check('Bob sees the move live', True)

    # Alice (host) opens the board to everyone -> Bob can now move it
    A.evaluate("window.__boardnom.net.setPolicy('open')")
    B.wait_for_function("window.__boardnom.store.policy === 'open'", timeout=5000)
    pick_tool(B, 'select')
    bx, by = to_page(B, moved['x'] + moved['w'] / 2, moved['y'] + moved['h'] / 2)
    drag(B, (bx, by), (bx - 100, by))
    B.wait_for_function("([id, x]) => Math.abs(window.__boardnom.store.get(id).x - x) > 50", arg=[text_id, moved['x']], timeout=5000)
    check('with policy "open" Bob CAN move it (host-controlled)', True)
    # a non-host cannot flip policy
    B.evaluate("window.__boardnom.net.setPolicy('owner')")
    B.wait_for_timeout(400)
    check('non-host cannot change the policy', A.evaluate("window.__boardnom.store.policy") == 'open')
    A.evaluate("window.__boardnom.net.setPolicy('owner')")
    B.wait_for_function("window.__boardnom.store.policy === 'owner'", timeout=5000)
    check('host can switch back to owner-only', True)

    # ------------------------------------------------------------------ BUG 3
    print('\nBUG 3 - text never attaches to the cursor, zoom/pan never lock')
    pick_tool(A, 'text')
    px, py = to_page(A, 100, 100)
    A.mouse.click(px, py)
    A.wait_for_selector('textarea.text-editor')
    z0 = A.evaluate("window.__boardnom.camera.zoom")
    A.mouse.move(px + 200, py + 100)
    A.mouse.wheel(0, -300)          # zoom in WHILE the editor is open
    A.wait_for_timeout(120)
    z1 = A.evaluate("window.__boardnom.camera.zoom")
    check('wheel zoom works while the text editor is open', z1 > z0 * 1.1, f'{z0} -> {z1}')
    A.keyboard.type('zoom test')
    editor_ok = A.evaluate("""() => { const ta = document.querySelector('textarea.text-editor'); const a = window.__boardnom;
        const r = a.canvas.getBoundingClientRect(); const ed = a.editor.active; const s = a.camera.toScreen(ed.x, ed.y);
        const b = ta.getBoundingClientRect(); return Math.abs((b.left - r.left) - s.x) < 1.5 && Math.abs((b.top - r.top) - s.y) < 1.5; }""")
    check('editor stays glued to its spot while zooming', editor_ok)
    A.keyboard.press('Escape')
    A.wait_for_function("window.__boardnom.store.list().filter(o => o.type === 'text').length === 2")
    check('editor is gone after commit', A.locator('textarea.text-editor').count() == 0)
    check('input state is idle after creating text', input_idle(A))

    new_text = [i for i in objects_of(A, 'text') if i != text_id][0]
    pos0 = obj(A, new_text)
    for i in range(10):                                  # wander with NO buttons pressed
        A.mouse.move(300 + i * 40, 250 + i * 25)
    pos1 = obj(A, new_text)
    check('text does NOT follow the cursor', pos0['x'] == pos1['x'] and pos0['y'] == pos1['y'])

    zb = A.evaluate("window.__boardnom.camera.zoom")
    A.mouse.move(640, 400)
    for _ in range(6): A.mouse.wheel(0, 200)             # rapid zoom out
    for _ in range(6): A.mouse.wheel(0, -200)            # rapid zoom in
    za = A.evaluate("window.__boardnom.camera.zoom")
    check('rapid zoom in/out stays responsive and finite', 0.05 <= za <= 16 and za == za)
    A.mouse.wheel(0, 250)
    zc = A.evaluate("window.__boardnom.camera.zoom")
    check('zoom still responds afterwards', zc < za)

    pick_tool(A, 'pan')
    cam0 = A.evaluate("({x: window.__boardnom.camera.x, y: window.__boardnom.camera.y})")
    drag(A, (500, 400), (620, 460))
    cam1 = A.evaluate("({x: window.__boardnom.camera.x, y: window.__boardnom.camera.y})")
    check('pan (Hand tool) moves the view', abs((cam1['x'] - cam0['x']) - 120) < 2 and abs((cam1['y'] - cam0['y']) - 60) < 2)

    # Space+drag pan after text creation
    pick_tool(A, 'pen')
    A.keyboard.down('Space')
    drag(A, (500, 400), (540, 420))
    A.keyboard.up('Space')
    cam2 = A.evaluate("({x: window.__boardnom.camera.x})")
    check('Space+drag pans', abs((cam2['x'] - cam1['x']) - 40) < 2)

    # Interruptions: pointercancel and window blur mid-stroke must reset cleanly
    A.mouse.move(500, 300); A.mouse.down(); A.mouse.move(560, 340, steps=5)
    A.evaluate("document.querySelector('#board').dispatchEvent(new PointerEvent('pointercancel', {pointerId: 1, bubbles: true}))")
    check('pointercancel mid-stroke returns to idle', input_idle(A))
    A.mouse.up()
    A.mouse.move(500, 300); A.mouse.down(); A.mouse.move(560, 340, steps=5)
    A.evaluate("window.dispatchEvent(new Event('blur'))")
    check('window blur mid-stroke returns to idle', input_idle(A))
    A.mouse.up()

    n0 = len(objects_of(A, 'stroke'))
    A.mouse.move(400, 500); A.mouse.down(); A.mouse.move(520, 560, steps=8); A.mouse.up()
    check('drawing still works after all of that', len(objects_of(A, 'stroke')) == n0 + 1)

    # Escape hatch buttons
    A.click('#zoomFit'); A.click('#zoomPct')
    check('Reset-zoom button restores 100%', abs(A.evaluate("window.__boardnom.camera.zoom") - 1) < 0.001)

    # ------------------------------------------------------------ thickness
    print('\nThickness - continuous slider')
    info = A.evaluate("""() => { const r = document.querySelector('#widthRange'); return {type: r.type, min: +r.min, max: +r.max, step: +r.step}; }""")
    check('thickness control is an <input type=range>', info['type'] == 'range')
    check('range is continuous (step <= 0.5)', info['step'] <= 0.5, str(info))
    check('presets are gone (no preset buttons)', A.locator('.swbtn, .width-preset').count() == 0)

    pick_tool(A, 'pen')
    for v in ('1', '7.3', '23.8', '60'):
        A.evaluate("""(v) => { const r = document.querySelector('#widthRange'); r.value = v; r.dispatchEvent(new Event('input', {bubbles: true})); }""", v)
        got = A.evaluate("window.__boardnom.store.settings.width")
        check(f'slider value {v} is applied exactly', abs(got - float(v)) < 1e-9, str(got))
    A.evaluate("""() => { const r = document.querySelector('#widthRange'); r.value = '7.3'; r.dispatchEvent(new Event('input', {bubbles: true})); }""")
    A.mouse.move(300, 600); A.mouse.down(); A.mouse.move(420, 640, steps=6); A.mouse.up()
    last = obj(A, objects_of(A, 'stroke')[-1])
    check('a stroke is drawn with the fractional thickness (7.3)', abs(last['width'] - 7.3) < 1e-9, str(last['width']))
    B.wait_for_function("([id, w]) => window.__boardnom.store.get(id) && Math.abs(window.__boardnom.store.get(id).width - w) < 1e-9", arg=[last['id'], 7.3], timeout=5000)
    check('other user receives the same thickness', True)

    # change thickness of an existing stroke through the slider
    pick_tool(A, 'select')
    sx2, sy2 = to_page(A, last['x'] + last['w'] / 2, last['y'] + last['h'] / 2)
    A.mouse.click(sx2, sy2)
    check('stroke selected for restyling', A.evaluate("window.__boardnom.store.selection.size") == 1)
    A.evaluate("""() => { const r = document.querySelector('#widthRange'); r.value = '31.4'; r.dispatchEvent(new Event('input', {bubbles: true})); r.dispatchEvent(new Event('change', {bubbles: true})); }""")
    check('slider restyles the selected stroke', abs(obj(A, last['id'])['width'] - 31.4) < 1e-9)
    B.wait_for_function("([id]) => Math.abs(window.__boardnom.store.get(id).width - 31.4) < 1e-9", arg=[last['id']], timeout=5000)
    A.keyboard.press('Control+z')
    check('restyle is undoable', abs(obj(A, last['id'])['width'] - 7.3) < 1e-9)

    # ------------------------------------------------------------ misc
    print('\nOther behaviour')
    C = join(browser.new_context(viewport={'width': 1280, 'height': 800}), 'Carol')
    C.wait_for_function("(id) => !!window.__boardnom.store.get(id)", arg=img_id, timeout=8000)
    C.wait_for_function("(id) => window.__boardnom.images.get(window.__boardnom.store.get(id).assetId).status === 'ready'", arg=img_id, timeout=8000)
    check('late joiner receives existing objects and image pixels', True)
    check('toolbar shows a label for every tool', A.locator('#toolbar .tlabel').count() == 16)
    check('Upload and Paste buttons exist', A.locator('[data-action=upload]').count() == 1 and A.locator('[data-action=paste]').count() == 1)

    pick_tool(C, 'text')
    # Carol (not host) cannot clear everything; "clear mine" only removes her own
    C.evaluate("window.__boardnom.net.clear('all', r => window.__clearRes = r)")
    C.wait_for_function("window.__clearRes !== undefined")
    check('non-host cannot clear the whole board', C.evaluate("window.__clearRes.ok") is False)
    browser.close()


if __name__ == '__main__':
    errors = []
    env = dict(os.environ, PORT=str(PORT))
    srv = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    try:
        time.sleep(1.5)
        with sync_playwright() as p:
            run(p)
    finally:
        srv.send_signal(signal.SIGTERM)
    failed = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
    if errors:
        print('JS page errors:', errors)
    if failed or errors:
        print('FAILED:', failed)
        sys.exit(1)
