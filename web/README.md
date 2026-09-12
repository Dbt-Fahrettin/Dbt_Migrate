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

| Ortam | Service.Api | Login.Api | Oturum |
|---|---|---|---|
| Local | `http://localhost:44305/api` | `login-test.unideva.com` | 30 gün |
| Test | `https://test.unideva.com/svc/api` | `login-test.unideva.com` | 30 gün |
| Prod | `https://hw.unideva.com/svc/api` | `login.unideva.com` | 12 saat |

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

**Sınanmayanlar — sizin doğrulamanız gereken dört şey:**

1. *Gerçek bir hesapla başarılı giriş.* Elimde kimlik bilgisi yok; başarı ölçütü ve uç, çalışan
   `Devatek.Admin` istemcisiyle birebir aynı.
2. *Yazma işlemleri.* `0-Migrate`, `1-Dbt-Migrate`, `2-Function Renew` ve `6-Update SalerId` canlı
   servise karşı çalıştırılmadı; hepsi sahte sunucuya karşı sınandı. Bir test paketinde
   (`Dbt_500292`) deneyin.
3. *APK'nin gerçek cihazda çalışması.* Derlendi ve içeriği doğrulandı ama bir telefona kurulup
   açılmadı. İlk kurulumda kontrol edilecekler: giriş ekranı açılıyor mu, `Local` ortamı listede
   görünmüyor mu, Test'e bağlanıyor mu.
4. *PWA kurulumu ve `deploy/nginx.conf`.* Service worker dosyası doğru servis ediliyor (200,
   `text/javascript`, geçerli workbox içeriği) ama kayıt, gömülü önizleme tarayıcısında
   başarısız oluyor — bu bağlamlarda service worker genelde kapalıdır. Gerçek Chrome/Edge'de
   "kur" düğmesinin çıktığını bir kez doğrulayın. nginx yapılandırması da bu makinede
   (Docker/nginx yok) çalıştırılamadı; ilk yayında `curl -I` ile önbellek başlıklarını kontrol edin.
