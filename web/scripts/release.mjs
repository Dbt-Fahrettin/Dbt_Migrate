/**
 * Yayın paketi üretir: `release/web/` (statik site) + `release/dbt-admin-<surum>.apk`.
 *
 * Sürüm numarasının tek kaynağı package.json. Script onu Android tarafına da yazar, böylece
 * web ile APK'nin sürümü ayrışmaz — ayrıştığında "hangi build?" sorusu cevapsız kalır.
 *
 * Çalıştırma:  npm run release       tam paket (web + APK + release/)
 *              npm run mobile:apk    yalnız APK (--apk-only; release/ paketlenmez)
 * Ön koşullar: JDK 17+ (JAVA_HOME gerekmez — script arayıp bulur, aşağıya bakın),
 *              Android SDK (android/local.properties),
 *              imza için android/keystore.properties (yoksa APK imzasız üretilir ve uyarılırsınız).
 */

import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');
const androidDir = join(root, 'android');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

/**
 * `--apk-only`: web derlenir ve APK üretilir, `release/` paketlenmez.
 *
 * `npm run mobile:apk` bunu kullanıyor. Eskiden o komut gradlew'u doğrudan çağırıyordu ve
 * aşağıdaki JDK bulma adımını atladığı için Java 8'e düşüp derleme patlıyordu; APK üretmenin
 * tek yolu artık bu script.
 */
const apkOnly = process.argv.includes('--apk-only');
const stepCount = apkOnly ? 3 : 4;

let stepNo = 0;

function step(title) {
    stepNo += 1;

    if (stepNo > 1) {
        console.log('');
    }

    console.log(`[${stepNo}/${stepCount}] ${title}`);
}

/** 1.2.3 → 10203. Monoton artar; Android versionCode'un tek şartı budur. */
function versionCode(semver) {
    const [major, minor, patch] = semver.split('.').map((d) => Number.parseInt(d, 10) || 0);

    return major * 10000 + minor * 100 + patch;
}

function run(command, cwd = root, env = process.env) {
    console.log(`  $ ${command}`);

    // Tek dize + shell: args dizisiyle shell:true kullanmak Node'da uyarı veriyor
    // (argümanlar kaçırılmadan birleştiriliyor). Buradaki komutlar sabit, kullanıcı girdisi yok.
    execSync(command, { cwd, stdio: 'inherit', env });
}

/**
 * Gradle'ın koşacağı JDK'yi bulur.
 *
 * Neden gerekiyor: bu makinede PATH'teki `java` **8** (eski araçlar ona bağlı) ve `JAVA_HOME`
 * tanımlı değil. Android Gradle Plugin 8.x en az JVM 11 ister, o yüzden `npm run release`
 *   "Dependency requires at least JVM runtime version 11. This build uses a Java 8 JVM."
 * diye düşüyordu (09.10.2026). Bulunan JDK yalnız gradlew çağrısına verilir — makine genelindeki
 * JAVA_HOME'a dokunulmaz, Java 8'e bağlı araçlar etkilenmesin.
 *
 * JAVA_HOME tanımlıysa önce o denenir: kullanıcının seçimi aramanın önüne geçer. Yeterince yeni
 * değilse sessizce atlanır, yoksa hata aynı şekilde geri gelirdi.
 */
const MIN_JAVA_MAJOR = 17;

/** `<home>` bir JDK ise ana sürümünü döndürür, değilse 0. */
function javaMajorOf(javaHome) {
    const javaBin = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');

    if (!existsSync(javaBin)) {
        return 0;
    }

    try {
        // `java -version` çıktısını stderr'e yazar; execSync yalnız stdout döndürdüğü için
        // kabuk üzerinden birleştiriyoruz (cmd.exe de `2>&1` destekler).
        const output = execSync(`"${javaBin}" -version 2>&1`, { encoding: 'utf8' });
        const match = /version "(\d+)(?:\.(\d+))?/.exec(output);

        if (!match) {
            return 0;
        }

        // Eski biçim 1.8.0_503 → 8;  yeni biçim 21.0.8 → 21
        return match[1] === '1' ? Number.parseInt(match[2] || '0', 10) : Number.parseInt(match[1], 10);
    } catch {
        return 0;
    }
}

/** Bir kökün altındaki JDK klasörleri (macOS'ta gerçek home `Contents/Home` altındadır). */
function entriesUnder(dir) {
    if (!existsSync(dir)) {
        return [];
    }

    try {
        return readdirSync(dir).flatMap((name) => [join(dir, name), join(dir, name, 'Contents', 'Home')]);
    } catch {
        return [];
    }
}

function javaHomeCandidates() {
    const candidates = [];

    if (process.env.JAVA_HOME) {
        candidates.push(process.env.JAVA_HOME);
    }

    if (process.platform === 'win32') {
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const localAppData = process.env.LOCALAPPDATA;

        // Android Studio kendi JDK'siyle gelir; Android derlemesi için en güvenli seçim odur.
        candidates.push(join(programFiles, 'Android', 'Android Studio', 'jbr'));

        if (localAppData) {
            candidates.push(join(localAppData, 'Programs', 'Android Studio', 'jbr'));
        }

        for (const parent of ['Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'Amazon Corretto']) {
            candidates.push(...entriesUnder(join(programFiles, parent)));
        }
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home');
        candidates.push(...entriesUnder('/Library/Java/JavaVirtualMachines'));
    } else {
        candidates.push('/opt/android-studio/jbr');
        candidates.push(...entriesUnder('/usr/lib/jvm'));
    }

    return candidates;
}

/** Uygun JDK'nin yolu, yoksa boş dize. */
function resolveJavaHome() {
    for (const candidate of javaHomeCandidates()) {
        if (javaMajorOf(candidate) >= MIN_JAVA_MAJOR) {
            return candidate;
        }
    }

    return '';
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
step('Web derleniyor');
run('npm run build');

// 2) Android sürümü + senkron
step('Android senkronu');

const hasAndroid = syncAndroidVersion();

if (!hasAndroid) {
    console.log('  android/ yok — APK adımı atlanacak (npx cap add android)');
} else {
    run('npx cap sync android');
}

// 3) APK
let apkPath = '';

if (hasAndroid) {
    step('APK derleniyor');

    const javaHome = resolveJavaHome();

    if (!javaHome) {
        console.error(`\n  HATA: JDK ${MIN_JAVA_MAJOR}+ bulunamadı — Gradle bu JDK olmadan derleyemez.`);
        console.error('  Android Studio kuruluysa kendi JDK\'siyle gelir; değilse bir JDK kurup');
        console.error('  JAVA_HOME ile gösterin. Aranan yerler: scripts/release.mjs > javaHomeCandidates\n');

        process.exit(1);
    }

    console.log(`  jdk: ${javaHome} (Java ${javaMajorOf(javaHome)})`);

    // Tam yol: shell üzerinden çağrıldığında çalışma dizini PATH'te sayılmıyor.
    const gradlew = join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

    run(`"${gradlew}" assembleRelease`, androidDir, { ...process.env, JAVA_HOME: javaHome });

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
    step('APK atlandı');
}

if (apkOnly) {
    if (!apkPath) {
        console.error('\nAPK üretilmedi.');

        process.exit(1);
    }

    console.log(`\nHazır: ${apkPath}`);
    console.log(`  ${version} (${gitSha()}) — ${apkPath.endsWith('app-release.apk') ? 'imzalı' : 'İMZASIZ, cihaza kurulamaz'}\n`);

    process.exit(0);
}

// 4) Paketleme
step('release/ hazırlanıyor');

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });

cpSync(join(root, 'dist'), join(releaseDir, 'web'), { recursive: true });

const isSigned = apkPath.endsWith('app-release.apk');

/**
 * Dosya adında sürüm: elde biriken APK'ler birbirinden ayırt edilebilsin.
 * İmzasızsa adında da yazsın — o dosya cihaza kurulamaz, karışmasın.
 */
const apkFileName = `dbt-admin-${version}${isSigned ? '' : '-IMZASIZ'}.apk`;

if (apkPath) {
    copyFileSync(apkPath, join(releaseDir, apkFileName));

    // web/ kopyası BİLEREK sabit adlı: nginx.conf indirme yolunu `/dbt-admin.apk` olarak
    // sunuyor. Sürümle değişseydi her yayında nginx yapılandırmasını düzenlemek gerekirdi.
    copyFileSync(apkPath, join(releaseDir, 'web', 'dbt-admin.apk'));
}

writeFileSync(
    join(releaseDir, 'SURUM.txt'),
    [
        `Dbt Admin Console ${version}`,
        `commit : ${gitSha()}`,
        `tarih  : ${new Date().toISOString()}`,
        `apk    : ${apkPath ? (isSigned ? 'imzalı' : 'İMZASIZ — cihaza kurulamaz') : 'üretilmedi'}`,
        '',
        'web/  → statik dosyalar (nginx: deploy/nginx.conf, SPA fallback şart)',
        `${apkFileName} → Android paketi`,
        'web/dbt-admin.apk → aynı paket, indirme linki için sabit adlı kopya',
        '',
    ].join('\n'),
);

console.log(`\nHazır: ${releaseDir}`);
console.log(`  web/           statik site`);

if (apkPath) {
    console.log(`  ${apkFileName}  ${isSigned ? 'imzalı' : 'İMZASIZ'}`);
}

console.log('');
