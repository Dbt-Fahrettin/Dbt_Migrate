/**
 * Yayın paketi üretir: `release/web/` (statik site) + `release/dbt-admin.apk`.
 *
 * Sürüm numarasının tek kaynağı package.json. Script onu Android tarafına da yazar, böylece
 * web ile APK'nin sürümü ayrışmaz — ayrıştığında "hangi build?" sorusu cevapsız kalır.
 *
 * Çalıştırma:  npm run release
 * Ön koşullar: JDK 17+ (JAVA_HOME), Android SDK (android/local.properties),
 *              imza için android/keystore.properties (yoksa APK imzasız üretilir ve uyarılırsınız).
 */

import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');
const androidDir = join(root, 'android');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

/** 1.2.3 → 10203. Monoton artar; Android versionCode'un tek şartı budur. */
function versionCode(semver) {
    const [major, minor, patch] = semver.split('.').map((d) => Number.parseInt(d, 10) || 0);

    return major * 10000 + minor * 100 + patch;
}

function run(command, cwd = root) {
    console.log(`  $ ${command}`);

    // Tek dize + shell: args dizisiyle shell:true kullanmak Node'da uyarı veriyor
    // (argümanlar kaçırılmadan birleştiriliyor). Buradaki komutlar sabit, kullanıcı girdisi yok.
    execSync(command, { cwd, stdio: 'inherit' });
}

function gitSha() {
    try {
        return execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
    } catch {
        return 'bilinmiyor';
    }
}

/** android/app/build.gradle içindeki versionName/versionCode'u package.json'a eşitler. */
function syncAndroidVersion() {
    const gradlePath = join(androidDir, 'app', 'build.gradle');

    if (!existsSync(gradlePath)) {
        return false;
    }

    const original = readFileSync(gradlePath, 'utf8');

    const updated = original
        .replace(/versionCode\s+\d+/, `versionCode ${versionCode(version)}`)
        .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);

    if (updated !== original) {
        writeFileSync(gradlePath, updated);
    }

    console.log(`  android: versionName ${version}, versionCode ${versionCode(version)}`);

    return true;
}

console.log(`\nDbt Admin Console — yayın paketi v${version} (${gitSha()})\n`);

// 1) Web
console.log('[1/4] Web derleniyor');
run('npm run build');

// 2) Android sürümü + senkron
console.log('\n[2/4] Android senkronu');

const hasAndroid = syncAndroidVersion();

if (!hasAndroid) {
    console.log('  android/ yok — APK adımı atlanacak (npx cap add android)');
} else {
    run('npx cap sync android');
}

// 3) APK
let apkPath = '';

if (hasAndroid) {
    console.log('\n[3/4] APK derleniyor');

    // Tam yol: shell üzerinden çağrıldığında çalışma dizini PATH'te sayılmıyor.
    const gradlew = join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

    run(`"${gradlew}" assembleRelease`, androidDir);

    const signed = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    const unsigned = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');

    if (existsSync(signed)) {
        apkPath = signed;
    } else if (existsSync(unsigned)) {
        apkPath = unsigned;

        console.log('\n  UYARI: APK İMZASIZ. android/keystore.properties yok — bu dosya cihaza kurulamaz.');
        console.log('  Ayrıntı için README > Android APK > İmzalama.\n');
    }
} else {
    console.log('\n[3/4] APK atlandı');
}

// 4) Paketleme
console.log('\n[4/4] release/ hazırlanıyor');

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });

cpSync(join(root, 'dist'), join(releaseDir, 'web'), { recursive: true });

if (apkPath) {
    const target = join(releaseDir, 'dbt-admin.apk');

    copyFileSync(apkPath, target);

    // nginx.conf indirme yolunu /dbt-admin.apk olarak sunuyor; web kökünde de dursun ki
    // tek klasörü kopyalamak yeterli olsun.
    copyFileSync(apkPath, join(releaseDir, 'web', 'dbt-admin.apk'));
}

const isSigned = apkPath.endsWith('app-release.apk');

writeFileSync(
    join(releaseDir, 'SURUM.txt'),
    [
        `Dbt Admin Console ${version}`,
        `commit : ${gitSha()}`,
        `tarih  : ${new Date().toISOString()}`,
        `apk    : ${apkPath ? (isSigned ? 'imzalı' : 'İMZASIZ — cihaza kurulamaz') : 'üretilmedi'}`,
        '',
        'web/  → statik dosyalar (nginx: deploy/nginx.conf, SPA fallback şart)',
        'dbt-admin.apk → Android paketi',
        '',
    ].join('\n'),
);

console.log(`\nHazır: ${releaseDir}`);
console.log(`  web/           statik site`);

if (apkPath) {
    console.log(`  dbt-admin.apk  ${isSigned ? 'imzalı' : 'İMZASIZ'}`);
}

console.log('');
