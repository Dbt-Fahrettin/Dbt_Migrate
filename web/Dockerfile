# Dbt Admin Console — statik yayın imajı.
#
# Çalıştırma zamanında .NET ya da Node gerekmiyor; çıktı düz statik dosyalar.
# APK bu imaja GİRMEZ: imzalı APK bir yayın çıktısıdır, kaynak ağacında durmaz.
# Dağıtırken /usr/share/nginx/html/dbt-admin.apk yoluna mount edin (bkz. README).

FROM node:24-alpine AS build

WORKDIR /app

# Bağımlılıklar ayrı katmanda: kaynak değişince npm ci yeniden koşmasın.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Yapı damgası git'ten okunuyor; imaj içinde .git yoksa "bilinmiyor" yazar.
# Damgayı doğru basmak için build arg ile geçirin: --build-arg GIT_SHA=$(git rev-parse --short HEAD)
ARG GIT_SHA=""
ENV GIT_SHA=${GIT_SHA}

RUN npm run build

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
