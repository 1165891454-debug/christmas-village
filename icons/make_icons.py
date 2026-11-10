# -*- coding: ascii -*-
# Generate simple placeholder PWA icons (red bg + white tree) using stdlib only.
import struct, zlib, os

def make_icon(size):
    W = H = size
    BG = (179, 40, 45)        # warm red
    TREE = (255, 255, 255)    # white tree
    TRUNK = (240, 200, 160)   # light trunk
    rows = []
    apex_y, base_y, halfw = 0.16, 0.74, 0.30
    for y in range(H):
        row = bytearray()
        ny = (y + 0.5) / H
        for x in range(W):
            nx = (x + 0.5) / W
            r, g, b = BG
            in_tree = False
            if apex_y <= ny <= base_y:
                t = (ny - apex_y) / (base_y - apex_y)
                if abs(nx - 0.5) <= halfw * t:
                    in_tree = True
            if in_tree:
                r, g, b = TREE
            elif abs(nx - 0.5) <= 0.05 and base_y < ny <= 0.86:
                r, g, b = TRUNK
            row += bytes((r, g, b))
        rows.append(bytes(row))
    raw = b''.join(b'\x00' + row for row in rows)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    png = (b'\x89PNG\r\n\x1a\n' +
           chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)) +
           chunk(b'IDAT', zlib.compress(raw, 9)) +
           chunk(b'IEND', b''))
    return png

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)))
for s in (192, 512):
    path = os.path.join(out_dir, 'icon-%d.png' % s)
    with open(path, 'wb') as f:
        f.write(make_icon(s))
    print('written', path)
