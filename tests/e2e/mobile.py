"""Touch / phone checks (Chromium device emulation + raw touch events).  python3 tests/e2e/mobile.py"""
import os, subprocess, sys, time, signal
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 3102
results = []

def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('  PASS  ' if ok else '  FAIL  ') + name + (f'   [{detail}]' if detail and not ok else ''))

def run(p):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(f'http://localhost:{PORT}/b/mobile-room')
    page.fill('#joinName', 'Phone'); page.click('#joinForm button[type=submit]')
    page.wait_for_selector('#statusDot[data-state=online]', timeout=8000)
    cdp = ctx.new_cdp_session(page)

    def touch(kind, pts):
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})

    def swipe(a, b_, steps=10):
        touch('touchStart', [a])
        for i in range(1, steps + 1):
            touch('touchMove', [(a[0] + (b_[0] - a[0]) * i / steps, a[1] + (b_[1] - a[1]) * i / steps)])
        touch('touchEnd', [])

    state = lambda: page.evaluate("""() => { const a = window.__boardnom, i = a.input;
        return { strokes: a.store.list().filter(o => o.type === 'stroke').length, zoom: a.camera.zoom,
                 idle: i.pointers.size === 0 && !i.activeTool && !i.pan && !i.gesture && !i.blocked,
                 sel: String(window.getSelection()), scroll: [window.scrollX, window.scrollY],
                 tb: document.querySelector('#toolbar').getBoundingClientRect().top,
                 stage: document.querySelector('#stage').getBoundingClientRect().top }; }""")

    s0 = state()
    check('toolbar sits at the bottom on a phone', s0['tb'] > s0['stage'] + 300, str(s0))

    swipe((100, 300), (300, 380))
    s1 = state()
    check('one-finger swipe draws a stroke', s1['strokes'] == 1)
    check('touch input returns to idle', s1['idle'])

    # pinch out: two fingers moving apart must zoom and must NOT draw
    touch('touchStart', [(180, 400), (210, 400)])
    for i in range(1, 11):
        touch('touchMove', [(180 - 6 * i, 400), (210 + 6 * i, 400)])
    touch('touchEnd', [])
    s2 = state()
    check('two-finger pinch zooms in', s2['zoom'] > s1['zoom'] * 1.5, f"{s1['zoom']} -> {s2['zoom']}")
    check('pinch does not draw a stray stroke', s2['strokes'] == 1)
    check('input idle after pinch', s2['idle'])

    # a second finger landing mid-stroke cancels the stroke cleanly
    touch('touchStart', [(120, 500)])
    touch('touchMove', [(160, 520)])
    touch('touchStart', [(120, 500), (220, 560)])
    touch('touchMove', [(110, 500), (230, 560)])
    touch('touchEnd', [])
    s3 = state()
    check('second finger mid-stroke cancels the partial stroke', s3['strokes'] == 1 and s3['idle'])

    # draw + erase repeatedly - the page itself must never get selected or scroll
    page.click('#toolbar [data-tool=pen]')
    for k in range(4):
        swipe((80, 250 + k * 30), (320, 250 + k * 30))
    page.click('#toolbar [data-tool=eraser]')
    swipe((60, 270), (340, 270)); swipe((60, 330), (340, 330))
    s4 = state()
    check('erasing removed strokes', s4['strokes'] < 5)
    check('no page text selected after drawing/erasing', s4['sel'] == '', repr(s4['sel']))
    check('page did not scroll', s4['scroll'] == [0, 0])
    check('toolbar is still visible after draw/erase', page.locator('#toolbar').is_visible() and page.locator('#topbar').is_visible())

    # tap text tool -> editor -> type -> commit; pinch afterwards still works
    page.click('#toolbar [data-tool=text]')
    page.touchscreen.tap(150, 200)
    page.wait_for_selector('textarea.text-editor', timeout=3000)
    page.keyboard.type('phone text')
    page.keyboard.press('Escape')
    page.wait_for_function("window.__boardnom.store.list().some(o => o.type === 'text')")
    z_before = state()['zoom']
    touch('touchStart', [(180, 400), (210, 400)])
    for i in range(1, 8): touch('touchMove', [(180 - 5 * i, 400), (210 + 5 * i, 400)])
    touch('touchEnd', [])
    check('zoom works right after creating text (touch)', state()['zoom'] > z_before * 1.3)
    check('input idle after text + pinch', state()['idle'])

    # thickness slider is usable by touch and reachable on a phone
    page.click('#toolbar [data-tool=pen]')
    box = page.locator('#widthRange').bounding_box()
    check('thickness slider is on screen', box is not None and 0 <= box['x'] and box['x'] + box['width'] <= 390, str(box))
    check('no JS errors', not errs, str(errs))
    b.close()

if __name__ == '__main__':
    srv = subprocess.Popen(['node', 'server.js'], cwd=ROOT, env=dict(os.environ, PORT=str(PORT)), stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    try:
        time.sleep(1.5)
        with sync_playwright() as p:
            run(p)
    finally:
        srv.send_signal(signal.SIGTERM)
    failed = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
    if failed:
        print('FAILED:', failed); sys.exit(1)
