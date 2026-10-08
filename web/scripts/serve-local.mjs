/**
 * Lokal kalıcı sunucu: `http://localhost/admin-console`
 *
 * Neden ayrı bir script: `npm run dev` geliştirme sunucusudur (hot reload, kaynaktan servis).
 * Burada istenen tersi — derlenmiş çıktı sabit bir adreste durur, değişiklik ancak yeniden
 * derleyip servisi yeniden başlatınca devreye girer.
 *
 * Bağımlılık yok; Node'un kendi http modülü yeterli. Önbellek disiplini deploy/nginx.conf ile
 * aynı: hash'li varlıklar süresiz, index.html ve sw.js asla önbelleğe alınmaz (bayat index.html
 * silinmiş dosyalara bakar ve uygulama bembeyaz açılır; bayat sw.js kurulu PWA'ya güncellemeyi
 * hiç göstermez).
 *
 * Ortam değişkenleri:
 *   PORT      varsayılan 80      (Windows'ta ayrıcalıklı port kısıtı yok, yönetici gerekmez)
 *   BASE_PATH varsayılan /admin-console
 *   ROOT      varsayılan ../dist-local  (build:local çıktısı; dist/ APK ve web yayını için)
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const PORT = Number.parseInt(process.env.PORT || '80', 10);
const BASE_PATH = (process.env.BASE_PATH || '/admin-console').replace(/\/+$/, '');
const ROOT = resolve(process.env.ROOT || join(here, '..', 'dist-local'));

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.apk': 'application/vnd.android.package-archive',
};

/** Hash'li varlıklar süresiz; kabuk dosyaları hiç önbelleğe alınmaz. */
function cacheControl(pathname) {
    if (pathname.startsWith(`${BASE_PATH}/assets/`)) {
        return 'public, max-age=31536000, immutable';
    }

    return 'no-cache, must-revalidate';
}

function send(res, status, headers, stream) {
    res.writeHead(status, {
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
        ...headers,
    });

    if (stream) {
        stream.pipe(res);
    } else {
        res.end();
    }
}

function sendFile(res, filePath, pathname) {
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';

    send(
        res,
        200,
        {
            'Content-Type': type,
            'Content-Length': statSync(filePath).size,
            'Cache-Control': cacheControl(pathname),
        },
        createReadStream(filePath),
    );
}

const server = createServer((req, res) => {
    let pathname;

    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
        send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' });

        return;
    }

    // Kökü ve çıplak alt yolu uygulamaya yönlendir: "localhost" yazmak yetsin.
    if (pathname === '/' || pathname === BASE_PATH) {
        send(res, 302, { Location: `${BASE_PATH}/` });

        return;
    }

    if (!pathname.startsWith(`${BASE_PATH}/`)) {
        send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' });

        return;
    }

    const relative = pathname.slice(BASE_PATH.length + 1);

    // Dizin dışına çıkmayı engelle (../ ile).
    const candidate = resolve(ROOT, normalize(relative));

    if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
        send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' });

        return;
    }

    if (relative && existsSync(candidate) && statSync(candidate).isFile()) {
        sendFile(res, candidate, pathname);

        return;
    }

    // SPA fallback: bilinmeyen yollar index.html'e döner.
    const indexPath = join(ROOT, 'index.html');

    if (!existsSync(indexPath)) {
        send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, null);
        res.end(`Derleme çıktısı yok: ${ROOT}\nÖnce "npm run build:local" çalıştırın.\n`);

        return;
    }

    sendFile(res, indexPath, `${BASE_PATH}/index.html`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`HATA: ${PORT} portu kullanımda. Başka bir sunucu çalışıyor olabilir.`);
    } else if (error.code === 'EACCES') {
        console.error(`HATA: ${PORT} portuna bağlanılamadı (izin).`);
    } else {
        console.error('HATA:', error.message);
    }

    process.exit(1);
});

server.listen(PORT, () => {
    if (!existsSync(join(ROOT, 'index.html'))) {
        console.warn(`UYARI: ${ROOT} içinde index.html yok — önce "npm run build:local".`);
    }

    console.log(`Dbt Admin Console → http://localhost${PORT === 80 ? '' : `:${PORT}`}${BASE_PATH}/`);
    console.log(`kök: ${ROOT}`);
});
