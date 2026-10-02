/**
 * Uygulama ikonlarını üretir (PWA manifest + Android launcher + apple-touch-icon).
 *
 * Neden script: ikonlar depoya ikili dosya olarak girmek yerine buradan yeniden üretilebilsin.
 * Dış bağımlılık yok — PNG, Node'un kendi zlib'i ile elle kodlanıyor.
 *
 * Çalıştırma:  node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

/** slate-950 — konsolun koyu zemini. */
const BACKGROUND = [15, 23, 42];
/** sky-500 — Test ortamının ve "çalışıyor" durumunun rengi. */
const MARK = [14, 165, 233];

const CRC_TABLE = (() => {
    const table = new Int32Array(256);

    for (let n = 0; n < 256; n += 1) {
        let c = n;

        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }

        table[n] = c;
    }

    return table;
})();

function crc32(buffer) {
    let c = 0xffffffff;

    for (const byte of buffer) {
        c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    }

    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);

    length.writeUInt32BE(data.length);

    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);

    crc.writeUInt32BE(crc32(typeAndData));

    return Buffer.concat([length, typeAndData, crc]);
}

/** RGBA pikselleri PNG'ye çevirir. */
function encodePng(width, height, pixels) {
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);

    for (let y = 0; y < height; y += 1) {
        raw[y * (stride + 1)] = 0; // filtre: none
        pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    const ihdr = Buffer.alloc(13);

    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit derinliği
    ihdr[9] = 6; // renk tipi: RGBA

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/**
 * İkon: koyu zemin üzerinde veritabanı silindiri (üst elips + gövde + alt kenar).
 * "Paket veritabanı" aracı olduğu için silindir; renk konsolun kendi paletinden.
 *
 * @param padding 0..0.5 — maskable/adaptive ikonlarda kenarlardan pay bırakmak için.
 * @param options.transparent Zemin saydam olsun (Android adaptive icon foreground katmanı).
 * @param options.circle Daire dışını saydam bırak (Android ic_launcher_round).
 */
function drawIcon(size, padding, options = {}) {
    const pixels = Buffer.alloc(size * size * 4);

    const inner = size * (1 - padding * 2);
    const offset = size * padding;

    // Silindir ölçüleri (inner kutuya göre)
    const cx = size / 2;
    const rx = inner * 0.3;
    const ry = inner * 0.11;
    const topY = offset + inner * 0.22;
    const bottomY = offset + inner * 0.72;

    const inEllipse = (x, y, centerY) => ((x - cx) / rx) ** 2 + ((y - centerY) / ry) ** 2 <= 1;

    const radius = size / 2;

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            let color = BACKGROUND;
            let alpha = options.transparent ? 0 : 255;

            const inBody = Math.abs(x - cx) <= rx && y >= topY && y <= bottomY;

            if (inEllipse(x, y, topY) || inEllipse(x, y, bottomY) || inBody) {
                color = MARK;
                alpha = 255;
            }

            // Gövdedeki iki ayırıcı şerit — "katman" hissi.
            for (const ratio of [0.42, 0.62]) {
                const bandY = offset + inner * ratio;

                if (inBody && Math.abs(y - bandY) < Math.max(1, size * 0.012)) {
                    color = BACKGROUND;
                    alpha = options.transparent ? 0 : 255;
                }
            }

            // ic_launcher_round: daire dışı saydam.
            if (options.circle && (x - radius + 0.5) ** 2 + (y - radius + 0.5) ** 2 > radius ** 2) {
                alpha = 0;
            }

            const index = (y * size + x) * 4;

            pixels[index] = color[0];
            pixels[index + 1] = color[1];
            pixels[index + 2] = color[2];
            pixels[index + 3] = alpha;
        }
    }

    return encodePng(size, size, pixels);
}

mkdirSync(publicDir, { recursive: true });

const outputs = [
    ['pwa-192.png', 192, 0.12],
    ['pwa-512.png', 512, 0.12],
    // Maskable: Android ikonu daire/squircle'a kırpar, kenarlardan daha çok pay gerekir.
    ['pwa-maskable-512.png', 512, 0.22],
    // iOS ana ekran ikonu: şeffaflık ve maskeleme yok, kendi payını kendi bırakır.
    ['apple-touch-icon.png', 180, 0.14],
];

for (const [name, size, padding] of outputs) {
    writeFileSync(join(publicDir, name), drawIcon(size, padding));

    console.log(`public/${name} (${size}x${size})`);
}

/**
 * Android launcher ikonları.
 *
 * - `ic_launcher` / `ic_launcher_round`: eski (v25 ve altı) cihazlar için hazır ikon.
 * - `ic_launcher_foreground`: adaptive icon'un ön katmanı — 108dp tuvalin dış %33'ü maskelenir,
 *   bu yüzden payı (0.3) belirgin şekilde daha büyük ve zemini saydam.
 *
 * Zemin rengi `values/ic_launcher_background.xml` içinde ayrıca ayarlanıyor.
 */
const androidRoot = join(here, '..', 'android', 'app', 'src', 'main', 'res');

const densities = [
    ['mdpi', 48, 108],
    ['hdpi', 72, 162],
    ['xhdpi', 96, 216],
    ['xxhdpi', 144, 324],
    ['xxxhdpi', 192, 432],
];

if (existsSync(androidRoot)) {
    for (const [density, legacySize, adaptiveSize] of densities) {
        const dir = join(androidRoot, `mipmap-${density}`);

        mkdirSync(dir, { recursive: true });

        writeFileSync(join(dir, 'ic_launcher.png'), drawIcon(legacySize, 0.12));
        writeFileSync(join(dir, 'ic_launcher_round.png'), drawIcon(legacySize, 0.12, { circle: true }));
        writeFileSync(
            join(dir, 'ic_launcher_foreground.png'),
            drawIcon(adaptiveSize, 0.3, { transparent: true }),
        );
    }

    const hex = BACKGROUND.map((d) => d.toString(16).padStart(2, '0')).join('');

    const backgroundXml = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<resources>',
        `    <color name="ic_launcher_background">#${hex}</color>`,
        '</resources>',
        '',
    ].join('\n');

    writeFileSync(join(androidRoot, 'values', 'ic_launcher_background.xml'), backgroundXml);

    console.log(`android: ${densities.length} yoğunluk × 3 ikon + zemin rengi`);
} else {
    console.log('android/ yok - launcher ikonları atlandı (npx cap add android)');
}
