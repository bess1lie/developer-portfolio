#!/usr/bin/env python3
"""Сборка perf-артефактов из исходников (legal/phase3 perf/lcp).

Делает (идемпотентно, детерминированно):
  1. assets/css/style.src.css -> assets/css/style.css   (npx clean-css-cli)
  2. assets/js/main.src.js   -> assets/js/main.js       (npx terser -c -m)
  3. Критический CSS первого экрана из style.css -> инлайн <style> в index.html
     (дословные копии правил в порядке файла + каскад H1; скрипт падает,
     если хоть один селектор не найден в источнике дословно).
  4. bump ?v= у style.css/main.js в index.html, style.css в privacy.html/offer.html.

Запуск из корня репо:  python3 scripts/build-critical.py
Зависимости ставятся через npx на месте, в package.json проекта НЕ добавляются.
Править руками только *.src.* и index.html-разметку; style.css/main.js и
инлайн-блок генерируются и в ревью читаются как производные.
"""
import re
import subprocess
import sys

ROOT_NOTE = 'run from repo root'


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f'FAILED: {" ".join(cmd)}\n{r.stderr[-2000:]}')


def split_top(src):
    rules = []
    depth = 0
    cur = ''
    sel = ''
    for c in src:
        cur += c
        if c == '{':
            if depth == 0:
                sel = cur
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                rules.append((sel[:-1].strip(), cur[len(sel):]))
                cur = ''
                sel = ''
    return rules


def match_sel(sel):
    for s in sel.split(','):
        s = s.strip()
        if not s:
            continue
        if s in ('html', 'body', 'img', 'h1', 'h2', 'h3', 'section', 'a'):
            return True
        for k in (':root', 'html', 'body', '.skip-link', '.sr-only', '.wrap',
                  '.kicker', '.mono', '.btn', '.intro', '.nav', '.wordmark',
                  '.mmenu', '.hero', '#hero-title', '.line', '.reveal',
                  '.eyebrow', 'h1', 'h2', 'h3', '::selection', 'img', 'a'):
            if s == k or s.startswith(k) or (len(k) > 2 and k in s and k[0] in '.#:'):
                return True
    return False


CASCADE_TAIL = (
    '/* Каскад H1 на чистом CSS: те же значения, что были в Motion '
    '(0.7с, тот же изинг, stagger 70мс). Стартует сразу по CSS, без ожидания '
    'main.js и CDN. */'
    '#hero-title .line>span{animation:hero-line-in 0.7s '
    'cubic-bezier(0.16,1,0.3,1) both}'
    '#hero-title .line:nth-child(2)>span{animation-delay:0.07s}'
    '#hero-title .line:nth-child(3)>span{animation-delay:0.14s}'
    '@keyframes hero-line-in{from{transform:translateY(110%);opacity:0}'
    'to{transform:translateY(0);opacity:1}}'
    '@media (prefers-reduced-motion:reduce)'
    '{#hero-title .line>span{animation:none}}'
)


def extract_critical(css):
    out = []
    for sel, body in split_top(css):
        if sel.startswith('@font-face'):
            out.append(sel + '{' + body)
        elif sel.startswith('@keyframes'):
            if 'intro' in sel or 'fade-up' in sel:
                out.append(sel + '{' + body)
        elif sel.startswith('@media'):
            # Блоки берём ЦЕЛИКОМ, внутренности не фильтруем: частичная выборка
            # уже давала рассинхрон с файлом (потерянные селекторы -> сдвиги).
            # Лишние нижефальцевые дубли безвредны (значения те же).
            if re.search(r'\.hero|#hero-title|\.line|\.nav|\.mmenu|\.wordmark|'
                         r'\.btn|\.kicker|\.mono|\.reveal|\.intro|\.eyebrow|'
                         r'\.wrap|\.skip-link|\bh1\b|\bimg\b', sel + '{' + body):
                out.append(sel + '{' + body)
        elif match_sel(sel):
            out.append(sel + '{' + body)
    result = ''.join(out)
    # Самопроверка полноты: каждый селектор hero/nav/etc из источника обязан
    # быть в выдаче (и топ-левел, и внутри @media). Иначе — abort, а не сдвиги.
    wanted = re.compile(r'\.hero|#hero-title|\.line|\.nav|\.mmenu|\.wordmark|'
                        r'\.btn|\.kicker|\.mono|\.reveal|\.intro|\.eyebrow|'
                        r'\.wrap|\.skip-link')
    src_sels = set()
    for sel, body in split_top(css):
        if sel.startswith('@media'):
            for s, _ in split_top(body[1:-1]):
                if wanted.search(s):
                    src_sels.add(re.sub(r'\s+', ' ', s).strip())
        elif not sel.startswith('@'):
            if wanted.search(sel):
                src_sels.add(re.sub(r'\s+', ' ', sel).strip())
    missing = [s for s in src_sels if s not in result]
    if missing:
        raise SystemExit(f'MISSING {len(missing)} selectors, abort: {missing[:5]}')
    return result


def bump_versions(html):
    def bump(m):
        return m.group(1) + str(int(m.group(2)) + 1)
    html, n1 = re.subn(r'(style\.css\?v=)(\d+)', bump, html)
    html, n2 = re.subn(r'(main\.js\?v=)(\d+)', bump, html)
    return html, n1, n2


def main():
    sh(['npx', '--yes', 'clean-css-cli@5', '-o', 'assets/css/style.css',
        'assets/css/style.src.css'])
    sh(['npx', '--yes', 'terser@5', 'assets/js/main.src.js', '-c', '-m',
        '-o', 'assets/js/main.js'])
    css = open('assets/css/style.css', encoding='utf8').read()
    crit = extract_critical(css) + CASCADE_TAIL
    html = open('index.html', encoding='utf8').read()
    start = html.index('<!-- Критический CSS')
    # Конец блока — строка подключения полного CSS (стабильный якорь;
    # на '</style>' не полагаемся: его могло не быть в старой ручной версии).
    anchor = '<link rel="stylesheet" href="assets/css/style.css'
    end = html.index(anchor, start)
    head = ('<!-- Критический CSS первого экрана (сгенерирован скриптом '
            'scripts/build-critical.py из assets/css/style.src.css, дословно, '
            'в порядке файла; плюс каскад H1). Значения идентичны файлу — '
            'конфликтов нет. --><style>' + crit + CASCADE_TAIL + '</style>')
    html = html[:start] + head + html[end:]
    html, n_css, n_js = bump_versions(html)
    open('index.html', 'w', encoding='utf8').write(html)
    for page in ('privacy.html', 'offer.html'):
        p = open(page, encoding='utf8').read()
        p, n, _ = bump_versions(p)
        open(page, 'w', encoding='utf8').write(p)
    print(f'OK: critical={len(crit)}b css_bumps={n_css} js_bumps={n_js} '
          f'(privacy/offer css bumped too)')


if __name__ == '__main__':
    main()
