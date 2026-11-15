"""Desde api/: uv run python lanzar_hls.py. Solo imprime estados, nunca tokens."""
import earthdata


def main():
    for lat, lon in ((8.1, -80.98), (14.8, -89.54), (-1.52, 37.26), (17.4, 78.5)):
        try:
            earthdata.appeears(lat, lon)
            with earthdata._db() as c:
                row = c.execute('select estado from tareas where clave=?', (f'hls:{lat},{lon}',)).fetchone()
            print(f'{lat},{lon}: {row[0] if row else "sin pedido"}')
        except Exception:
            print(f'{lat},{lon}: no se pudo consultar; reintenta más tarde')


if __name__ == '__main__':
    main()
