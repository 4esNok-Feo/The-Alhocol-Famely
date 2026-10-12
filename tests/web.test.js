/**
 * web.test.js — проверка «проводов» браузерной сборки.
 *
 * Проект собирается без бандлера: браузер сам загружает ES-модули по путям из
 * html. Значит, любая опечатка в пути к файлу или лишняя внешняя ссылка ломает
 * игру у игрока. Этот тест ловит такое до загрузки на платформу.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

/** Все относительные import/import() из файла. */
function collectImports(source) {
  const out = new Set();
  const patterns = [
    /import\s+[^'"]*from\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source))) out.add(m[1]);
  }
  return [...out];
}

test('index.html ссылается только на существующие модули', () => {
  const html = read('index.html');
  const imports = collectImports(html).filter((p) => p.startsWith('.'));
  assert.ok(imports.length >= 2, 'страница должна подключать игру и платформу');
  for (const rel of imports) {
    const file = resolve(ROOT, rel.replace('./', ''));
    assert.ok(existsSync(file), `нет файла по пути ${rel}`);
  }
});

test('оболочка Яндекс Игр подключает SDK и модули игры', () => {
  const html = read('web/shell.html');
  assert.ok(html.includes('src="/sdk.js"'), 'SDK подключается платформой');
  const imports = collectImports(html).filter((p) => p.startsWith('.'));
  for (const rel of imports) {
    const file = resolve(ROOT, rel.replace('./', ''));
    assert.ok(existsSync(file), `нет файла по пути ${rel}`);
  }
});

test('сборка не тянет внешние ресурсы', () => {
  const shipped = [
    'index.html', 'web/shell.html', 'web/platform.js', 'src/game.js',
    'src/core/run.js', 'src/core/career.js', 'src/core/config.js',
    'src/render/world.js', 'src/ui/hud.js', 'src/ui/screens.js',
    'src/audio/audio.js', 'src/render/draw2d.js',
  ];
  for (const rel of shipped) {
    const text = read(rel);
    const externals = text.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
    // Разрешены только ссылки внутри комментариев на локальные адреса.
    const bad = externals.filter((url) => !url.startsWith('http://localhost')
      && !url.includes('dejavu-fonts') && !url.includes('w3.org'));
    assert.deepEqual(bad, [], `${rel}: найдены внешние ресурсы ${bad.join(', ')}`);
  }
});

test('все модули игры импортируются без ошибок', async () => {
  const modules = [
    'src/core/config.js', 'src/core/util.js', 'src/core/run.js', 'src/core/career.js',
    'src/core/input.js', 'src/ai/bot.js', 'src/audio/audio.js', 'src/render/draw2d.js',
    'src/render/effects.js', 'src/render/world.js', 'src/ui/hud.js', 'src/ui/screens.js',
    'src/game.js', 'web/platform.js',
  ];
  for (const rel of modules) {
    const mod = await import(`../${rel}`);
    assert.ok(Object.keys(mod).length > 0, `${rel}: модуль пуст`);
  }
});

test('физические клавиши управления заданы и раскладка не важна', async () => {
  const { ACTION_MAP, MOVE_MAP, InputManager } = await import('../src/core/input.js');
  // В раскладке по умолчанию используются коды (KeyW, Space и т.п.), а не буквы.
  for (const code of Object.values(MOVE_MAP).flat()) {
    assert.match(code, /^(Key|Arrow)/, `${code} должен быть физическим кодом`);
  }
  for (const code of Object.values(ACTION_MAP).flat()) {
    assert.match(code, /^(Key|Space|Enter|Digit|Numpad|Escape|Shift)/, `${code} — физический код`);
  }
  const input = new InputManager(null);
  input.heldCodes.add('KeyW');
  input.pressedCodes.add('Space');
  assert.deepEqual(input.moveVector(), { dx: 0, dy: -1 });
  assert.equal(input.pressed('scan'), true);
  assert.equal(input.pressed('action'), false);
});

test('сборщик архивов проверяет оболочку с SDK и кладёт index.html в корень', () => {
  const script = read('tools/package.py');
  assert.ok(script.includes('web/shell.html'), 'оболочка с SDK берётся из проекта');
  assert.ok(script.includes('"/sdk.js"') || script.includes("b'/sdk.js'"), 'проверяется подключение SDK');
  assert.ok(script.includes('"index.html" in names'), 'index.html проверяется в корне архива');
  assert.ok(script.includes('def verify_web_archive'), 'есть встроенная проверка');
  // Шрифты обязаны ехать вместе с игрой.
  assert.ok(script.includes('assets/fonts/DejaVuSans.ttf'));
});

test('оболочка для платформы и рабочая страница согласованы', () => {
  const shell = read('web/shell.html');
  const page = read('index.html');
  for (const marker of ['id="game"', 'new Game(', '{ platform }', 'game.boot()']) {
    assert.ok(shell.includes(marker), `в оболочке есть ${marker}`);
    assert.ok(page.includes(marker), `в рабочей странице есть ${marker}`);
  }
  assert.ok(page.includes('__KATME__'), 'страница отдаёт диагностику');
});

test('шрифты из архива действительно подключаются страницами', () => {
  // Шрифты лежат в сборке не «на всякий случай»: без @font-face браузер
  // берёт системный шрифт, и кириллица на канвасе выглядит иначе.
  for (const page of ['index.html', 'web/shell.html']) {
    const html = readFileSync(resolve(ROOT, page), 'utf8');
    assert.ok(/@font-face/.test(html), `${page}: есть @font-face`);
    assert.ok(/DejaVu Sans/.test(html), `${page}: семейство DejaVu Sans`);
    for (const font of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
      assert.ok(html.includes(`assets/fonts/${font}`), `${page}: ссылка на ${font}`);
      assert.ok(existsSync(resolve(ROOT, 'assets/fonts', font)), `${font} лежит на месте`);
    }
  }
  const game = readFileSync(resolve(ROOT, 'src/game.js'), 'utf8');
  assert.ok(/waitForFonts/.test(game), 'загрузка шрифтов ожидается перед первым кадром');
});

test('версия сборки указана в одном виде во всех местах', () => {
  // Версия живёт в config.js, дублируется в package.json и в диагностике
  // страниц. Расхождение сбивает с толку при выпуске обновления.
  const version = read('src/core/config.js').match(/export const VERSION = '([^']+)'/)?.[1];
  assert.ok(version, 'VERSION объявлен в config.js');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, version, 'версия в package.json совпадает');
  for (const page of ['index.html', 'web/shell.html']) {
    assert.ok(read(page).includes(version), `${page} знает версию ${version}`);
  }
});
