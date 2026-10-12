#!/usr/bin/env python3
"""
serve.py — локальный сервер для игры вместо `python -m http.server`.

Зачем свой сервер. Стандартный `http.server` не отдаёт заголовки кэширования,
и браузер кэширует ES-модули «на глазок» — по эвристике от даты изменения файла.
Из-за этого после правок игрок получает старый код: страница внешне работает
(меню, кнопки), а конкретное исправление не приезжает. Ровно так дважды подряд
терялась починка кнопки «Начать смену».

Этот сервер отдаёт всё с `Cache-Control: no-store`, поэтому после перезагрузки
страницы всегда исполняется свежий код. Для игры на платформе такой сервер не
нужен: там сборку отдаёт Яндекс Играм их собственный хостинг.

Запуск:
    python3 tools/serve.py            # порт 8000
    python3 tools/serve.py 8080       # другой порт
"""

import functools
import http.server
import socketserver
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Отдаёт файлы как есть, но запрещает браузеру их кэшировать."""

    def end_headers(self):
        # no-store — самый жёсткий вариант: копию нельзя сохранять вообще.
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        # Игровые модули — обычный текст; так их видно и в отладчике.
        super().end_headers()

    def log_message(self, fmt, *args):
        # Короткий лог без даты: в песочнице он нужен только чтобы видеть запросы.
        sys.stderr.write('  %s\n' % (fmt % args))


def main():
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print('Порт должен быть числом, например: python3 tools/serve.py 8000')
            return 2

    handler = functools.partial(NoCacheHandler, directory='.')
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.ThreadingTCPServer(('0.0.0.0', port), handler) as httpd:
            print(f'Игра «Катьме: Смена» на http://localhost:{port}/')
            print('Кэширование отключено — перезагрузка страницы всегда даёт свежий код.')
            print('Остановить: Ctrl+C')
            httpd.serve_forever()
    except OSError as err:
        print(f'Не удалось занять порт {port}: {err}')
        print('Порт уже занят? Остановите прошлый сервер или возьмите другой порт.')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
