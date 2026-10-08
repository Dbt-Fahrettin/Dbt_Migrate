# Dbt Admin Console (React)

`D:\Unideva_2026\Dbt_Migrate` (WPF) aracının web + Android + iOS'ta çalışan hâli.
Service.Api'nin `master` / `dbtRenewal` uçlarını çağırıp Dbt paket veritabanlarında migration ve
bakım işlemleri başlatır, sonuçları izler.

## Durum

| Faz | Kapsam | Durum |
|---|---|---|
| 0 | Ortam/uç envanteri tek kaynağa | ✅ |
| 1 | İskelet + giriş ekranı + kalıcı oturum | ✅ |
| 2 | Kuyruk/izleme motoru + `0-Migrate`, `1-Dbt-Migrate` | ✅ |
| 3 | `2-Function Renew`, `6-Update SalerId`, `7-Migration Geçmişi`, `8-Migration Takip` | ✅ |
| 4 | Capacitor, Android APK, iOS PWA | ✅ |
| 5 | Yayın | ✅ |

## Geliştirme

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # tsc -b && vite build
npm run lint
npm test        # vitest run
npm run icons   # ikonları yeniden üretir (public/ + android/ mipmap)
npm run release # web + APK, release/ klasörüne paketler
```

`server.host` açık, yani aynı ağdaki telefondan `http://<makine-ip>:5173` ile bakılabilir.

## Yayın

```bash
npm run release
```

Üretilen `release/` klasörü:

```
release/
├── web/            statik site (index.html, assets/, manifest, sw.js) + dbt-admin.apk
├── dbt-admin.apk   Android paketi
└── SURUM.txt       sürüm, commit, tarih, APK imzalı mı
```

Sürüm numarasının tek kaynağı `package.json`. Script onu Android tarafına da yazar
(`versionName` = `1.0.0`, `versionCode` = `10000`), böylece web ile APK ayrışmaz. Sürüm yükseltmek
için `npm version patch|minor|major` yeterli.

**Yapı damgası ekranda görünür** — giriş ekranının altında ve konsolun sol sütununda
`v1.0.0 · 5b601b0 · 12.09.2026`. Araç üç yerden kullanılıyor (tarayıcı, kurulu PWA, APK) ve her biri
farklı sürümde takılı kalabiliyor; "hangi build'desiniz?" sorusunun cevabı ekranda yazmalı.

### Lokalde sürekli çalıştırma (`http://localhost/admin-console`)

Geliştirme sunucusundan (`npm run dev`) ayrı, makinede hep açık duran bir kurulum. Hot reload
yok — **değişiklik ancak yeniden derleyip servisi yeniden başlatınca** devreye girer; istenen
davranış bu.

```powershell
# bir kez: oturum açılışında başlayan görevi kur
powershell -ExecutionPolicy Bypass -File scripts\local-service.ps1 -Action install

# değişiklikten sonra: yeniden derle + yeniden başlat
powershell -ExecutionPolicy Bypass -File scripts\local-service.ps1 -Action deploy
```

Diğer eylemler: `start`, `stop`, `restart`, `status`, `uninstall`.

#### Günlük akış

| Ne yapıyorsunuz | Komut |
|---|---|
| Geliştirme (hot reload) | `npm run dev` → `http://localhost:5173` |
| Değişikliği lokal kuruluma almak | `… local-service.ps1 -Action deploy` |
| Yalnız yeniden başlatmak | `… -Action restart` |
| Durum | `… -Action status` |

`deploy` iki şey yapar: `build:local` ile `dist-local/`'u yeniden üretir, sonra servisi yeniden
başlatır. Tarayıcıda **tek yenileme** yeter.

> **Neden "tek yenileme" ayrıca söyleniyor:** service worker uygulama kabuğunu önbelleğe alıyor.
> Düzeltmeden önce ölçüldü (08.10.2026): deploy sonrası birinci yenileme ESKİ paketi, ancak
> ikincisi yenisini yüklüyordu — "değişikliği yaptım ama göremiyorum" durumu. `src/swReload.ts`
> yeni worker kontrolü devralır almaz sayfayı bir kez yeniliyor; ölçümle doğrulandı, artık tek
> yenileme yetiyor.

| Parça | Ne yapıyor |
|---|---|
| `scripts/build-local.mjs` | `npm run build:local` — base `/admin-console/`, çıktı **`dist-local/`** |
| `scripts/serve-local.mjs` | bağımlılıksız statik sunucu, port 80, SPA fallback, önbellek disiplini |
| `scripts/local-service.ps1` | Zamanlanmış Görev kurulumu ve yönetimi |

#### Neden böyle

- **Port 80 için yönetici gerekmiyor.** Windows'ta ayrıcalıklı port kısıtı yok; ölçtük, node
  yükseltilmemiş kullanıcıyla 80'e bağlanabiliyor. IIS kurmaya da gerek kalmadı (zaten kurulu değil).
- **Windows servisi yerine Zamanlanmış Görev.** Gerçek servis (sc.exe / nssm) yönetici hakkı ve
  ek araç ister. Görev aynı işi görüyor: oturum açılışında başlar, çökerse 3 kez yeniden denenir,
  script'ten durdurulup başlatılabilir. Tek farkı oturum kapalıyken çalışmaması. Oturumdan bağımsız
  gerekirse nssm ile gerçek servise taşınır, komut aynı: `node scripts\serve-local.mjs`.
- **Ayrı çıktı klasörü (`dist-local/`).** `npm run release` `dist/`'i base `/` ile üretiyor (APK ve
  normal web yayını). Aynı klasörü paylaşsalardı biri diğerini ezerdi: APK derlendikten sonra lokal
  sunucu kök tabanlı bir çıktıyı alt yoldan servis etmeye çalışır, uygulama bembeyaz açılırdı.
- **`base` derleme zamanında seçilir** (`APP_BASE`, varsayılan `/`). Alt yol APK'yi bozar —
  Capacitor WebView'da kök dizinden servis eder. Bu yüzden APK için her zaman `npm run release`.
- **`stop` yalnız node süreçlerini kapatır.** Port 80'i node dışı bir şey tutuyorsa dokunmaz,
  uyarır.

#### Doğrulandı (08.10.2026)

- `http://localhost/admin-console/` → 200; `http://localhost/` → 302 ile alt yola yönleniyor
- Derin link (`/admin-console/olmayan-yol`) → 200 (SPA fallback)
- Önbellek: `index.html` `no-cache`, `assets/*` `immutable`
- Dizin dışına çıkma denemesi (`../../package.json`) → 404
- Chrome'da service worker **active**, kapsam `/admin-console/`; manifest `scope` ve `start_url`
  da `/admin-console/`
- `deploy` sonrası paket adı değişti ve servis edilen baytlar diskteki yeni derlemeyle birebir
  aynı (md5) — yani yeniden derle + yeniden başlat gerçekten devreye alıyor

> Oturum, kaynağa (origin) bağlıdır: `localhost:5173` ile `localhost` farklı kaynaklardır, yeni
> adreste bir kez giriş yapmanız gerekir.

### Statik sunucu

Tek koşul SPA fallback: bilinmeyen yollar `index.html`'e dönmeli. `deploy/nginx.conf` hazır —
fallback'in yanında önbellek disiplinini de kuruyor:

| | Önbellek | Neden |
|---|---|---|
| `/assets/*` | 1 yıl, immutable | Vite hash'li ad üretiyor; içerik değişince ad değişir |
| `index.html` | **no-cache** | hash'siz sabit ad; bayat kopya silinmiş dosyalara bakar, uygulama bembeyaz açılır |
| `sw.js` | **no-cache** | önbelleğe alınırsa kurulu PWA güncellemeyi hiç görmez |
| `/dbt-admin.apk` | no-cache | doğru MIME + indirme başlığı |

İki kullanım yolu var:

```bash
# 1) Docker imajı (nginx dahil)
docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD) -t dbt-admin-console .
docker run -p 8080:80 -v ./release/dbt-admin.apk:/usr/share/nginx/html/dbt-admin.apk dbt-admin-console

# 2) Mevcut bir nginx'e
#    release/web/ içeriğini root'a kopyalayın, deploy/nginx.conf'u örnek alın.
```

APK imaja **girmez** — imzalı bir yayın çıktısıdır, kaynak ağacında durmaz. Dağıtımda mount edin
ya da `release/web/` klasörünü olduğu gibi kopyalayın (script APK'yi oraya da koyuyor).

### Nereye yayınlanmalı

Bu bir iç yönetim aracı ve `master` uçları kimlik doğrulaması istemiyor (bkz. **Güvenlik**).
Bu yüzden **iç ağ / VPN arkası** öneriliyor. Unideva altyapısında yayınlanacaksa
`und-web-prod` deseni (nginx statik pod) doğrudan uygulanabilir; ayrı bir host ve mümkünse
IP kısıtı verin.

CI/CD kurulmadı — `npm run release` elle koşuyor. GitHub Actions'a taşımak isterseniz tek iş yeter
(node + JDK 17 + Android SDK kurup script'i çalıştırmak); keystore'u repository secret olarak
verip `keystore.properties`'i iş içinde üretin.

## Dağıtım hedefleri

Tek kod tabanı, üç hedef:

| Hedef | Nasıl | Ne gerekiyor |
|---|---|---|
| Windows / tarayıcı | `dist/` statik dosyaları + SPA fallback | — |
| Windows / kurulu uygulama | Chrome-Edge'de adres çubuğundaki "kur" (PWA) | — |
| Android | imzalı APK (Capacitor) | JDK 17+, Android SDK |
| iOS | Safari → "Ana Ekrana Ekle" (PWA) | — |

### iOS neden native değil

Uygulama hiçbir native yetenek kullanmıyor (kamera, dosya, bildirim yok). Buna karşılık native iOS
dağıtımı Mac + Xcode + Apple Developer hesabı ($99/yıl) ve yenileme döngüsü demek: TestFlight
build'leri 90 günde bir, Ad Hoc sertifikaları yılda bir yenilenmeli. PWA aynı işi bu maliyetlerin
hiçbiri olmadan görüyor. Bu yüzden `npx cap add ios` **bilerek çalıştırılmadı**.

Karar değişirse: `npx cap add ios` + macOS runner'lı bir CI (GitHub Actions `macos-latest`) yeterli;
paylaşılan kodun hiçbirini değiştirmez.

### Android APK

```bash
npm run mobile:sync    # build + cap sync
npm run mobile:apk     # build + sync + assembleRelease
npm run mobile:open    # Android Studio'da aç
```

Çıktı: `android/app/build/outputs/apk/release/`.

**İmzalama.** Keystore bilgileri depoya girmez; `android/keystore.properties` dosyasından okunur ve
o dosya `.gitignore`'dadır. Dosya yoksa release derlemesi çalışır ama `app-release-unsigned.apk`
üretir ve gradle uyarı verir.

Keystore'u bir kez üretin (parolayı parola yöneticinize koyun, buraya yazmayın):

```bash
keytool -genkey -v -keystore dbt-admin.jks -keyalg RSA -keysize 4096 -validity 10000 -alias dbt-admin
```

Sonra `android/keystore.properties`:

```properties
storeFile=dbt-admin.jks
storePassword=...
keyAlias=dbt-admin
keyPassword=...
```

> Keystore'u kaybetmeyin. Aynı `applicationId` için farklı anahtarla imzalanmış APK, cihazdaki
> mevcut kurulumun üzerine yüklenemez — kullanıcılar uygulamayı silip yeniden kurmak zorunda kalır.

**Play Store'a koymayın.** İç yönetim aracı ve prod veritabanlarında geri dönüşü olmayan işlemler
başlatıyor; imzalı APK'yi web dağıtımının yanına koyup indirme linki verin.

**Cleartext (http) trafiğe izin verilmedi ve gerek de yok:** native pakette yalnız Test ve Prod
görünür, ikisi de https. `Local` (http://localhost:44305) telefondan zaten erişilemediği için
gizleniyor (`src/config/platform.ts`). Bir gün http bir ortam eklenirse `android:usesCleartextTraffic`
ile topyekûn açmak yerine yalnız o host için `network_security_config.xml` istisnası yazın.

**CapacitorHttp açık:** native pakette `fetch` çağrıları native HTTP katmanına gider. İki kazancı
var: WebView'ın CORS kısıtları uygulanmaz (Service.Api'de CORS bir gün daraltılsa mobil taraf
etkilenmez) ve mixed-content engeli yoktur. Tarayıcı sürümünde ikisi de geçerli olmaya devam eder.

**`android/` klasörü depoda.** AndroidManifest, gradle ayarları ve imza yapılandırması orada yaşıyor.
Üretilen dosyaları `android/.gitignore` dışlıyor (build çıktıları, `local.properties`,
`assets/public`, `keystore.properties`). `local.properties` makineye özeldir; yoksa
`sdk.dir=C:/Users/<siz>/AppData/Local/Android/Sdk` satırıyla oluşturun.

### İkonlar

`npm run icons` — `scripts/generate-icons.mjs` hem PWA ikonlarını (`public/`) hem Android launcher
ikonlarını (5 yoğunluk × legacy/round/adaptive) üretir. Dış bağımlılık yok; PNG, Node'un zlib'iyle
elle kodlanıyor. İkon değişecekse script'teki renkleri/şekli düzenleyip yeniden çalıştırın.

## Ortamlar

`src/config/environments.ts` — tek kaynak. Kod içinde başka yerde url kurmayın.

| Ortam | Service.Api | Gib.Api | Login.Api | Oturum |
|---|---|---|---|---|
| Local | `http://localhost:44305/api` | `http://localhost:5225/api` | `login-test.unideva.com` | 30 gün |
| Test | `https://test.unideva.com/svc/api` | `https://test.unideva.com/gib/api` | `login-test.unideva.com` | 30 gün |
| Prod | `https://hw.unideva.com/svc/api` | `https://hw.unideva.com/gib/api` | `login.unideva.com` | 12 saat |

`Pre Test` ve `PreProd` 12.09.2026'da kaldırıldı: Pre Test kullanılmıyor, PreProd zaten Test ile
aynı adrese gidiyordu.

## Giriş

`POST {loginApi}/token/login2`, gövde `{ loginNameOrEmail, password, prgType: 20 }`.

`20` = `ProgramTypeEnum.DbtAdmin_Web`. **Değiştirmeyin:** `TokenService.GetToken` bu program
tipinde bakım penceresi kontrolünü atlar, yani konsol sistem bakımdayken de giriş yapabilir —
bir yönetim aracı için doğru davranış.

Yanıt yorumlama:

- `404` → "Kullanıcı adı ya da şifre yanlış"
- gövdede `mit` dolu → "Sistem bakımda: {mit}"
- `id != Guid.Empty` → başarı, ardından rol kontrolü (`rl >= 9`, yani Devatek)

Parola **düz metin** gider, özeti sunucu üretir → Login.Api'ye https şart. Local ortamda bile
login'in `login-test.unideva.com`'a gitmesinin sebebi budur.

### Ortam seçimi giriş ekranındadır

Login.Api ortama göre değiştiği için hangi ortama girileceği kimlik doğrulamadan önce belli olmalı.

Oturum anahtarı **ortam adı değil, Login.Api adresidir**: Local ve Test aynı adresi kullandığı için
oturumları ortaktır (aralarında geçerken tekrar giriş istenmez), Prod ayrı adres olduğu için ayrı
oturum ister. Test'ten Prod'a geçmek yeniden giriş demektir — yanlış ortamda işlem başlatmaya karşı
kasıtlı bir kilit.

### "Beni hatırla"

- **Saklanan:** giriş yanıtı + son kullanma zamanı + Login.Api adresi, `localStorage`'da.
- **Saklanmayan:** şifre.
- Açılışta süre kontrolü **ve** yetki kuralı tekrar uygulanır; kural daraltıldığında eski oturumlar
  kendiliğinden düşer.

## Güvenlik — okunması gereken kısım

> Service.Api'nin `master` uçları **kimlik doğrulaması istemiyor** (`MasterController`'da
> `[Authorize]` yok, `Startup.cs`'te global authorize filter yok, CORS `SetIsOriginAllowed(_ => true)`).
> Giriş *kişiyi* doğrular, *api çağrılarını korumaz* — uç adreslerini bilen biri konsolu hiç açmadan
> aynı işlemleri tetikler.

Kalıcı oturum bu yüzden bir güvenlik sınırı değil, yalnız kolaylıktır; cihaza erişen biri konsolu
açabilir. Prod oturumunun 12 saatle sınırlı olmasının tek gerekçesi budur.

Gerçek koruma için ikisinden biri gerekir: konsolu yalnız iç ağda/VPN arkasında yayınlamak, ya da
`master` uçlarına kimlik doğrulama eklemek. İkincisi yapılırsa girişte alınan `lat` belirteci
çağrılara eklenebilir (`LoginResponse.lat` bu yüzden saklanıyor). CI/CD bu uçları çağırmıyor, yani
auth eklemenin maliyeti düşük.

## Kuyruk + izleme motoru

`src/operations/queuedOperation.ts` — aracın kalbi. Her hedef için sunucuda arka plan işi açar
(`*-bg` uçları), jobId toplar, `master/dbt-migrate-status-bulk`'a periyodik POST atar ve biten
hedefin satırını **yerinde** günceller. Uzun migration'larda HTTP zaman aşımına düşülmemesinin
sebebi bu.

Kuyruğa alma ve izleme **eşzamanlı** koşar: binlerce paketlik listede kuyruğa alma dakikalar sürer,
bu sürede biten işlerin görünmesi gerekir. İki döngü aynı değişkenleri paylaşır; JavaScript tek iş
parçacıklı olduğu için kilide gerek yok.

Sabitler (Blazor sürümüyle aynı):

| | Değer | Neden |
|---|---|---|
| İzlemenin başlama eşiği | 50 iş | kuyruğa almanın bitmesini beklemek tamamlananları dakikalarca gizliyordu |
| Toplu durum partisi | 200 jobId | sunucu sınırı 500 |
| İzleme turu arası | 3 sn | |
| Bekleyen iş tavanı | 200 | Hangfire kuyruğu şişmesin; durdurulduğunda geri dönüşü olmayan yığın oluşmasın |

**"Durdur" yalnız yeni iş kuyruğa almayı keser.** Sunucuda koşan işler iptal edilmez, izleme onlar
bitene kadar sürer. Ekranda da böyle yazıyor.

### Ekran yenileme

`src/operations/operationLog.ts` satırları biriktirir, ekran ~200 ms'de bir toplu yenilenir. Satır
başına `setState` çağırmak binlerce paketlik akışta render fırtınası yaratırdı. Liste ayrıca
sanallaştırılmıştır (`@tanstack/react-virtual`) — Blazor sürümü aynı sebeple listeyi 2000 satırda
kesiyordu, burada kesmeye gerek yok.

## Ekranlar

Giriş sonrası **menü** açılır; iki bölüm var:

| Bölüm | Ne yapar | Hangi servis |
|---|---|---|
| Migration İşlemleri | paket veritabanlarında migration/bakım | Service.Api `master`, `dbtRenewal` |
| GİB API İşlemleri | gece sorgusu anahtarları, paket yeniden sorgu, XML kolon boşaltma | Gib.Api `GibInvoiceQuery`, `GibXmlStore` |

Router kullanılmadı: üç ekran var, derin bağlantı ihtiyacı yok ve Capacitor paketinde adres
çubuğu da yok (`src/navigation.ts`). Başlıktaki geri oku menüye döndürür.

### GİB API İşlemleri

İki ayrı anahtar yönetiliyor:

| Anahtar | Ne yapar | Düğmeler |
|---|---|---|
| **Gece servisi** (`IsEnabled`) | ana şalter; kapalıyken gece sorgusu hiç koşmaz | Aç / Kapat |
| **AutoStart** (`AutoStartEnabled`) | pencere açıldığında gece sorgusu kendiliğinden açılsın mı | Aç / Kapat |

Ayrıca **Durum Kontrolü** düğmesi. Ekran açılır açılmaz durum sorgulanır; düğme yenilemek için.

Gösterilenler: iki anahtarın açık/kapalı durumu, pencere içinde mi (18:00–07:00), şu an ne koşuyor
(`Night` / `Daytime` / `Idle`), sorgulanan gün, son sayaç, güncellenme zamanı.

> Durum **veritabanında** tutulur (`GibInv.NightlyQueryControls`, tek satır, küme geneli) ve
> yeniden başlatmayı aşar. Tablo ilk kurulduğunda satır **kapalı** varsayılanla yazılır — yani yeni
> bir kurulumda ikisi de kapalı başlar. (18.09.2026'dan önce durum bellekteydi; bu README o
> dönemde yazılmıştı, güncellendi.)

#### Sunucudaki iki sessiz bağlantı kuralı

`SetNightlyQueryState` gönderilen alanları yazar, ama iki örtük kuralı vardır (`GibDbRepo`,
"Bellek icindeki eski davranisin aynisi"):

1. `autoStartEnabled: true` **tek başına** gelirse `IsEnabled` de açılır.
2. `isEnabled: false` **tek başına** gelirse `AutoStartEnabled` de kapanır.

Birincisi "AutoStart Aç" düğmesinin istemeden gece servisini başlatmasına yol açardı. Bu yüzden
**AutoStart düğmeleri `isEnabled`'ı da açıkça gönderir** (`src/features/gib/nightlyActions.ts`),
böylece düğme yazdığı şeyi yapar. İkinci kural sunucunun kasıtlı davranışı; korunuyor ve ekranda
yazılı — "Gece servisini kapatmak AutoStart'ı da kapatır".

Prod'da dört işlem de onay ister (`AC` / `KAPAT` yazdırarak): kapatmak o gecenin faturalarının
hiç çekilmemesi demek, açmak GİB'e yük bindirmek, AutoStart ise yeniden başlatma davranışını
değiştirmek.

### Paket Yeniden Sorgu

`GibInvoiceQuery/RequeryPackInvoices` — paketin mükelleflerini verilen tarihten itibaren gece
sorgusundan bağımsız yeniden sorgular. İçeriği alınmış faturalar atlanır; yeni gelen ya da içeriği
alınamamış olanların içeriği güncel kurallarla istenir. **Damga yazmaz**, yani gece turunun
ilerleyişini etkilemez.

Ekrandan girilenler: **paket no**, **başlangıç tarihi**, **bitiş tarihi** (boş = verisi hazır en
yeni gün). Gelişmiş ayarlarda: tek mükellef (VKN/TCKN), parça gün (1-31), çağrı bütçesi (30-480 sn).

#### İlerleme neden izlenebiliyor

İş uzun, bu yüzden sunucu onu **imleçle parçalıyor**: her çağrı `BudgetSeconds` kadar birim işliyor
ve kaldığı yeri `NextCursor` ile dönüyor; istemci `HasMore` bitene dek imleci geri gönderiyor
(sunucuda ayrıca 540 sn sert sınır var). Döngü `src/features/gib/requeryLoop.ts` içinde ve React'ten
bağımsız — kuralları DOM'suz testleniyor.

İlerleme hesabı: `TotalUnitCount` işin tamamındaki birim sayısı (payda, her çağrıda aynı gelir),
`ProcessedUnitCount` ise **yalnız o çağrıda** işlenen birim sayısı. İmleç sıfırdan başladığı için
çağrıların toplamı mutlak konumu veriyor. Ekranda ilerleme çubuğu, sayaçlar (mükellef, fatura,
önbellekten, yeni içerik, içeriksiz, hatalı birim, çağrı, süre), atlanan mükellefler ve birim birim
sonuç dökümü var.

Çağrı bütçesi varsayılanı burada **60 sn** (sunucu varsayılanı 240): küçük bütçe = daha sık ilerleme
bildirimi ve "Durdur"a daha çabuk cevap. Gelişmiş ayarlardan değiştirilebilir.

### XML Kolon Boşaltma

`GibXmlStore/purge-job` (GET durum · `start` · `stop`) — fatura XML'leri nesne deposuna
taşındıktan sonra `gib_inv.gib_invoices.xml_content` kolonunda kalan veriyi boşaltan **sunucu
tarafı arka plan işi**. Konsol yalnız durumu okur ve anahtarı çevirir; boşaltmayı Gib.Api içindeki
servis yapar.

İşin kendisi: en yeni satırdan eskiye, küçük partiler hâlinde, **her satır silinmeden önce
depodan indirilip kolonla birebir karşılaştırılarak**. Durum veritabanında
(`gib_inv.xml_purge_controls`), pod yeniden başlasa da kaldığı yerden sürer; iki pod'dan yalnız
kiralamayı alan koşar. WAL birikimi sınırı aşarsa kendiliğinden bekler.

Ekranda: açık/kapalı + çalışan pod, durum mesajı, boşaltılan satır, boşalan hacim, parti sayısı,
imleç, WAL birikimi/sınır, son parti zamanı, başlangıç ve parti ayarları.

**Hız** sunucudan gelmiyor; iki yoklama arasındaki `clearedCount`/`freedBytes` farkından
istemcide hesaplanıyor (satır/sn ve GB/saat). İlk okumada görünmez. Sayaç geriye giderse
(`restart`, ya da başka pod devralmış) hız gösterilmez — uydurulmuş bir sayı yanıltıcı olurdu.

Durum 15 saniyede bir kendiliğinden yenilenir (react-query `refetchInterval`), ayrıca elle
"Yenile" var.

#### Güvenlik şeritleri

- **Başlat geri alınamaz.** Onay kutusu Test'te `BOSALT`, Prod'da `PROD BOSALT` yazdırır ve
  metinde "GERÇEK ve GERİ ALINAMAZ boşaltma" açıkça yazar; Prod'da düğme kırmızı.
- **Durdur da onaylı** ve imlecin korunduğunu söyler.
- İş zaten açıkken "Başlat", kapalıyken "Durdur" devre dışı.
- Yapılandırmada `PurgeEnabled`/`ReadEnabled`/`StoreOnly` üçlüsünden biri kapalıysa uyarı çıkar
  ve "Başlat" devre dışı kalır (sunucu zaten 409 dönerdi).
- `blockedIds` doluysa kırmızı panel: kanıtlanamayan satır id'leri, kopyalanabilir.
- **"Durmuş olabilir" uyarısı:** iş açık görünüyor ama son parti üzerinden 3 dakikadan fazla
  geçtiyse. "Açık" rozeti tek başına bunu göstermiyor — WAL beklemesi, düşen pod ya da sessiz
  durma hepsi aynı görünüyor. Karşılaştırma referansı `Date.now()` değil **yoklama anı**
  (`dataUpdatedAt`): render sırasında `Date.now()` çağırmak sonucu her render'da oynatırdı.

#### Sonsuz döngü korumaları

Sunucu hata durumunda `NextCursor`'ı **aynı** döndürüp `HasMore: true` diyor ("ayni Cursor ile
yeniden cagirabilirsiniz"). Kalıcı bir hatada bu sonsuz döngü demek. Üç koruma var:

- art arda 3 başarısız çağrıdan sonra durulur (araya başarı girerse sayaç sıfırlanır),
- `401`'de hiç yeniden denenmez — belirteç kendiliğinden tazelenmiyor,
- sunucu "devam var" deyip imleci ilerletmezse döngü kesilir.

"Durdur" yeni çağrı açmayı keser; koşan çağrı kendi bütçesini tamamlar. Ekrandan çıkmak da döngüyü
sonlandırır.

#### Yetki

Bu iki uç kaynak kodda `[Authorize]` altında — Service.Api'nin master uçlarından farklı olarak.
İstekler girişte alınan belirteçle (`LoginResponse.lat`) imzalanıyor; Login.Api ve Gib.Api aynı
JWT anahtarını paylaştığı için (ortam bazında `AppSettings:Secret` karşılaştırılarak doğrulandı)
belirteç burada geçerlidir.

**Belirteç ömrü oturum ömründen kısa:** Login.Api belirteci 2 gün üretiyor, konsol oturumu
Test/Local'de 30 gün. Yani üçüncü gün Migration ekranı çalışmaya devam eder (master uçları kimlik
istemiyor) ama GİB ekranı 401 alır. Bu yüzden ekranda belirtecin kalan süresi yazıyor ve 401
"süresi dolmuş olabilir, çıkış yapıp tekrar girin" olarak açıklanıyor. Oturumu belirtecin ömrüne
kısaltmak bilinçli olarak yapılmadı: ana kullanım olan Migration işlemlerinin belirtece ihtiyacı yok.

> **Çözüldü (01.10.2026):** 17.09'da her iki ortam da `Authorization` başlığı olmadan 200
> dönüyordu, yani dağıtımdaki sürümler `[Authorize]` değişikliğinden eskiydi. Bugün ikisi de
> **401** dönüyor — koruma yürürlükte.

## İşlemler

| | İşlem | Nasıl koşar | Alanlar |
|---|---|---|---|
| 0 | Migrate | kuyruk + izleme | Start, End, aralık modu |
| 1 | Dbt-Migrate | kuyruk + izleme | + Dbt Migrate Name |
| 2 | Function Renew | senkron, 6 eşzamanlı | Start, End, Function Name |
| 6 | Update SalerId | senkron, sıralı (500 ms ara) | Start, End, evrak tarih aralığı |
| 7 | Migration Geçmişi | tek istek, **salt okuma** | Start = tam paket no |
| 8 | Migration Takip | tek istek, **salt okuma** | Start = ön ek, Dbt Migrate Name, yalnız eksik/hatalı |

Form işleme göre değişir: `7` ve `8`'de End kutusu yoktur (kullanılmaz), sayaçlar
"Kayıt / Uygulanmış / Eksik-Hatalı" olur, ve **Prod'da yazma onayı istenmez** — salt okuma için
paket aralığını elle yazdırmak onayı refleks hâline getirir, o zaman gerçekten tehlikeli işlemde
de düşünmeden onaylanır.

### Update SalerId ve tarih biçimi

Evrak tarihleri `<input type="date">` ile alınır, yani değer her zaman `yyyy-MM-dd`. Bu bilinçli:
sunucu tarafında `DbtRenewalDbRepo.UpdateSalerPackCompanies` tarihi `DateTime.Parse(orderStartDate)`
ile çözüyor — **kültüre bağlı**. `01.09.2026` gibi yerel biçim gönderilirse ay/gün karışabilir ya da
parse hatası alınır. ISO biçimi her iki kültürde de tek anlamlıdır.

## Dbt migration adları: iki aile

`master/get-dbt-migrations` iki farklı şey döndürüyor ve ayrımı `src/operations/dbtMigrationNames.ts`
yapıyor:

1. **Sürüm migration'ları (Path A)** — `20260910160000_SuitSMrpPlans` gibi 14 haneli zaman
   damgasıyla başlayanlar; EF migration'ına bağlı, kronolojik sırası var.
2. **Bağımsız işlemler (Path B)** — `AllFunctions`, `ModelIndexes`, `MigrationHistoryInit` gibi
   tekrar koşturulabilen bakım migration'ları; kronolojik sırası yok.

Listeyi düz alfabetik sıralayıp "sonuncusu en günceldir" demek **yanlış**: harfle başlayan adlar
rakamla başlayanlardan sonra gelir, yani "en güncel" olarak `SempVoucherSettingsRekey` seçilirdi.
Açılır listede iki grup ayrı gösterilir ve otomatik seçilen değer, en güncel **sürüm** migration'ıdır.

## Taşırken kaybedilmemesi gerekenler

`Dbt_Admin_Console` (Blazor, `D:\Unideva_2026\dbt\utils`) WPF'teki gerçek hataları bulup düzeltmişti.
Faz 2/3'te port ederken referans **`MainWindow.xaml.cs` değil, `Dbt.Admin.Console.Core`** olmalı:

- `Connection: keep-alive` / `Keep-Alive: 600` başlıkları eklenmez — tarayıcı fetch'i yasaklı başlık
  sayar, üstelik HTTP/1.1'de zaten varsayılan. (`src/api/http.ts`'te not düşüldü.)
- Update SalerId başarı kontrolü **alan olarak** okunmalı; WPF gövdede ham metin `"isOk": true,`
  arıyordu, boşluksuz JSON gelse her paket hatalı görünürdü.
- Ortam değişince çekilmiş listeler (DatNames, Dbt migration adları, fonksiyon adları) temizlenmeli.
- `master/get-res-functions` hem Test hem Prod'da **boş dizi** dönüyor → Function Name serbest metin
  kalmalı (`src/features/console/ConsolePage.tsx` içinde not düşüldü). Dbt Migrate Name ise açılır
  liste olmalı.
- Eşzamanlılık sınırı 6.
- `Local` ortamı mobil pakette gizlenir (`desktopOnly`) — localhost telefondan erişilemez.

## Doğrulanan davranışlar (12.09.2026, Test ortamı)

**Giriş ve oturum**

- Geçersiz hesapla giriş → `404` → doğru mesaj, şifre alanı temizlendi, oturum yazılmadı
  (CORS'un tarayıcıdan çalıştığı da bu adımda doğrulandı)
- Kayıtlı oturumla açılış → konsol; rol `9` kabul, rol `5` (Bayi) **reddedildi ve bayat oturum silindi**
- Test → Prod geçişi giriş ekranına düşürdü ve Login.Api `login.unideva.com`'a döndü;
  Test'e dönünce oturum korunmuş halde konsola girildi
- Mobil genişlikte (375×812) giriş ve konsol düzeni okunur

**Konsol (gerçek servise karşı, salt okuma)**

- `master/test` → HTTP 200
- `master/get-dbtdatnames/5` → Start/End otomatik `500292` / `500494` olarak doldu (2 paket)
- `master/get-dbt-migrations` → 16 kayıt; 6 sürüm + 10 bağımsız olarak ayrıldı, en güncel sürüm
  (`20260910160000_SuitSMrpPlans`) otomatik seçildi, tarihler okunur biçimde göründü
- Doğrulama: Start boşken "Çalıştır" → uyarı, çağrı yapılmadı
- Onay kutusu: işlem/paket/migration/servis özeti göründü, yanlış metinde "Çalıştır" devre dışı,
  doğru metinde aktif oldu (Test ortamına geçici olarak `requiresConfirmation` verilerek sınandı,
  sonra geri alındı)

**Salt okuma raporları (gerçek servise karşı)**

- `7-Migration Geçmişi` · `Dbt_500292` → `takip kaydı yok` + MigrationHistoryInit önerisi
- `8-Migration Takip` · ön ek `5`, `AllFunctions`, yalnız eksik/hatalı → iki paket de
  `TAKİP YOK (MigrationHistoryInit koşturulmalı)`; sayaçlar Kayıt 2 / Uygulanmış 0 / Eksik-Hatalı 2
- Formun işleme göre değişmesi: `0` → aralık modu, `1` → migration adı, `2` → fonksiyon adı,
  `6` → iki tarih kutusu, `7`/`8` → End kutusu yok

> **Bulgu:** Test ortamındaki iki paketin (`Dbt_500292`, `Dbt_500494`) hiçbirinde
> `__dbt_migrations_history` takip kaydı yok. Takip ekranlarının anlamlı çıktı vermesi için önce
> `1-Dbt-Migrate` ile `MigrationHistoryInit` koşturulmalı.

**Motor (sahte sunucuya karşı, `npm test` — 47 test)**

Kuyruk/izleme akışının gerçek uçlara karşı sınanması canlı paketlerde migration başlatmak demek
olurdu; bu yüzden `fetch` taklit edilerek sınandı:

- kuyruğa alma → izleme → satırın yerinde "tamamlandı" olarak değişmesi
- başarılı / atlanan (`skippedCount > 0 && okCount === 0`) / hatalı ayrımı ve sayaçlar
- kuyruğa alınamayan hedefin hata sayılıp akışın sürmesi
- `isFound: false` (Hangfire kaydı yok) → hata + bekleyenlerden düşme
- "Durdur" → kuyruğa alma kesilir, kuyruğa girmiş iş izlenmeye devam eder
- hedef yoksa hiç çağrı yapılmaması
- `resolvePackTargets` kuralları (Start=0 → Dbt_Temp, ön ek modu, 6 hane filtresi, aralık)
- `isOkResponse`: boşluksuz JSON, farklı harf düzeni, alanın olmaması, JSON olmayan gövde
- `forEachBounded`: her öğe bir kez işlenir, eşzamanlılık 6'yı aşmaz
- `runFunctionRenew` / `runUpdateSalerId`: ISO tarihlerin url'ye doğru girmesi, `isOk:false`'un
  HTTP 200'de bile hata sayılması, durdurulduğunda kalan paketlerin işlenmemesi
- `formatHistoryLine` / `formatPackStateLine`: OK/HATA, TAKİP YOK, UYGULANMADI, OKUNAMADI dalları
- `validateRequest`: her işlemin kendi zorunlu alanları

**Paketleme (Faz 4)**

- `npx cap add android` → `com.devatek.dbtadmin`, minSdk 24, targetSdk 36
- `assembleDebug` → `app-debug.apk` (4.2 MB); `assembleRelease` keystore yokken
  `app-release-unsigned.apk` (3.2 MB) üretti ve uyarı verdi — tasarlanan davranış
- APK içeriği doğrulandı: `assets/public/index.html` + JS/CSS gömülü, izinler yalnız `INTERNET`,
  cleartext izni yok, uygulama adı "Dbt Admin Console"
- PWA build'i manifest + service worker üretiyor (16 dosya önbelleğe alınıyor); api çağrıları
  önbelleğe **alınmıyor**
- Mobil (375×812) ve masaüstü (1280×800) yerleşimi ölçüldü: yatay kaydırma yok, kenar boşlukları
  16 px, masaüstünde iki kolon + yalnız iç alanlar kayıyor

**Yayın (Faz 5)**

- `npm run release` uçtan uca koştu: web derlendi, Android sürümü `package.json`'a eşitlendi
  (`versionName 1.0.0` / `versionCode 10000`), APK derlendi, `release/` paketlendi
- Keystore yokken script APK'yi **İMZASIZ** diye işaretledi ve `SURUM.txt`'ye de yazdı
- `release/web/` statik olarak servis edilip doğrulandı: kök 200, **derin link `/olmayan-yol` → 200**
  (SPA fallback), `manifest.webmanifest` doğru MIME ile 200, `sw.js` 200 (`text/javascript`),
  `/dbt-admin.apk` 200 / 3.19 MB
- Üretim derlemesi tarayıcıda açıldı, yapı damgası göründü: `v1.0.0 · 5b601b0 · 12.09.2026`

**Menü ve GİB ekranı (17.09.2026)**

- Giriş sonrası menü, iki kart, bölüme giriş ve başlıktaki geri oku ile menüye dönüş
- GİB ekranı Test'e bağlanıp gerçek durumu okudu (KAPALI, pencere dışında, sayaç 0);
  Prod okuması da yapıldı (AÇIK)
- `Authorization: Bearer` başlığı gönderiliyor, belirteçsizken eklenmiyor (test)
- Mobilde (375×812) kartlar tam genişlik, yatay kaydırma yok

**AutoStart (01.10.2026)**

- Beş düğme (Durum / Gece servisi Aç-Kapat / AutoStart Aç-Kapat) üç satırda gruplanıyor
- İki durum rozeti ayrı ayrı okunuyor; `Mode` alanı varsa gösteriliyor (eski dağıtımda yoksa gizli)
- Zaten açık/kapalı olan anahtarın düğmesi devre dışı kalıyor
- Geçersiz belirteçle 401 yolu doğrulandı: "Yetki reddedildi (401)… çıkış yapıp tekrar girin"
- `buildPatch` testleri AutoStart düğmelerinin `isEnabled`'ı açıkça gönderdiğini koruyor —
  bu olmadan "AutoStart Aç" sessizce gece servisini de başlatırdı
- Mobilde beş düğme tam genişlik, yatay kaydırma yok

**Paket yeniden sorgu (02.10.2026)**

- Form doğrulaması: boş paket no, eksik başlangıç tarihi, ters tarih aralığı, parça gün ve
  bütçe sınırları (test)
- İmleç döngüsü sahte uca karşı: çok sayfalı koşu, imlecin geri gönderilmesi, sayaçların
  birikmesi, atlanan mükelleflerin tekrarsız toplanması, 500 satır sınırı, "Durdur", art arda
  hata sınırı, 401'de denememe, imleç ilerlemeyince kesme (10 test)
- Tarayıcıda uçtan uca: üç sayfalık bir koşuda ilerleme çubuğu %40 → %100, sayaçlar doğru
  toplandı (fatura 24, önbellek 8, yeni 15), hatalı birim satırı kırmızı ve mesajıyla göründü
- Mobilde (375×812) alanlar tam genişlik, yatay kaydırma yok

> **Uç henüz dağıtılmadı (02.10.2026):** `RequeryPackInvoices` Test ve Prod'da **404** dönüyor
> (korumalı uçlar 401 döndüğü için bu ayrım güvenilir). Gib.Api yayınlandığında çalışır; o güne
> kadar ekran "Yetki reddedildi"/404 hatası gösterir.

**XML kolon boşaltma (02.10.2026)**

- `describeGibFailure` 404'ü "sunucu sürümü bu ucu içermiyor — yayın bekleniyor", 409'u
  sunucunun düz metin gerekçesiyle gösteriyor (test); 404 yorumu **gerçek (henüz yayınlanmamış)
  uca karşı** doğrulandı
- Hız hesabı: iki örnekten satır/sn ve GB/saat, ilk örnekte yok, sayaç geriye giderse yok,
  ilerleme yoksa yok (test)
- "Durmuş olabilir" eşiği: kapalı işte yok, son parti yakınsa yok, eskiyse var, hiç parti
  yoksa başlangıca bakıyor (test)
- Tarayıcıda taslanmış yanıtla: açık/kapalı panelleri, hız, WAL sınırı aşımı (kırmızı),
  `blockedIds` paneli + kopyala, yapılandırma kapalı uyarısı, düğmelerin devre dışı kalması,
  Durdur onay kutusu
- **Başlat ucu hiçbir ortamda çağrılmadı.** Doğrulama sırasında `purge-job` içeren tüm istekler
  taslandı; sayaç 3 GET / **0 POST** gösterdi.

**Sınanmayanlar — sizin doğrulamanız gereken yedi şey:**

1. *Gerçek bir hesapla başarılı giriş.* Elimde kimlik bilgisi yok; başarı ölçütü ve uç, çalışan
   `Devatek.Admin` istemcisiyle birebir aynı.
2. *Yazma işlemleri.* `0-Migrate`, `1-Dbt-Migrate`, `2-Function Renew` ve `6-Update SalerId` canlı
   servise karşı çalıştırılmadı; hepsi sahte sunucuya karşı sınandı. Bir test paketinde
   (`Dbt_500292`) deneyin.
3. *APK'nin gerçek cihazda çalışması.* Derlendi ve içeriği doğrulandı ama bir telefona kurulup
   açılmadı. İlk kurulumda kontrol edilecekler: giriş ekranı açılıyor mu, `Local` ortamı listede
   görünmüyor mu, Test'e bağlanıyor mu.
4. *Gece servisini aç/kapat.* Yalnız okuma yolu canlıya karşı sınandı; **yazma yolu (aç/kapat)
   çalıştırılmadı** — gerçek bir servisin durumunu değiştirmek sizin kararınız. Test ortamında
   bir kez deneyip sonra eski hâline getirin.
5. *Paket yeniden sorgunun gerçek koşusu.* Uç dağıtılmadığı için yalnız sahte uca karşı sınandı.
   Gib.Api yayınlandıktan sonra bir test paketinde küçük bir tarih aralığıyla deneyin.
6. *XML kolon boşaltmanın gerçek koşusu.* Uçlar dağıtılmadı (Test ve Prod'da 404) ve başlat ucu
   bilerek hiç çağrılmadı. Yayından sonra önce GET ile durumu okuyun; başlatmayı küçük bir parti
   ve düşük WAL sınırıyla deneyin.
7. *PWA kurulumu ve `deploy/nginx.conf`.* Service worker dosyası doğru servis ediliyor (200,
   `text/javascript`, geçerli workbox içeriği) ama kayıt, gömülü önizleme tarayıcısında
   başarısız oluyor — bu bağlamlarda service worker genelde kapalıdır. Gerçek Chrome/Edge'de
   "kur" düğmesinin çıktığını bir kez doğrulayın. nginx yapılandırması da bu makinede
   (Docker/nginx yok) çalıştırılamadı; ilk yayında `curl -I` ile önbellek başlıklarını kontrol edin.
