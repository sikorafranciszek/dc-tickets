
# dc-tickets


Aplikacja do zarządzania zgłoszeniami (tickets) na Discordzie, napisana w TypeScript z użyciem Node.js, Bun, Prisma oraz Discord.js. Pozwala na obsługę ticketów, panel webowy do podglądu transkrypcji, integrację z S3/R2 (Cloudflare lub AWS) do archiwizacji załączników oraz REST API do zarządzania zgłoszeniami.


## Funkcje
- Obsługa ticketów na Discordzie (otwieranie, zamykanie, panel do zarządzania)
- Panel webowy do podglądu transkrypcji zgłoszeń (`/ticket/:id`)
- Integracja z bazą danych przez Prisma (MySQL domyślnie)
- Komendy slash `/tickets` do zarządzania panelami i rolami
- REST API (autoryzacja przez x-api-key)
- Archiwizacja załączników do S3/R2 (Cloudflare/AWS) – opcjonalnie


## Wymagania
- Node.js (zalecane >=18)
- Bun (zalecane, ale można użyć npm)
- Baza danych zgodna z Prisma (MySQL domyślnie, można zmienić w `prisma/schema.prisma`)
- Discord bot (token, clientId, guildId)


## Instalacja
1. Sklonuj repozytorium:
	```sh
	git clone <adres-repozytorium>
	cd dc-tickets
	```
2. Zainstaluj zależności:
	```sh
	bun install
	# lub
	npm install
	```
3. Skonfiguruj bazę danych w pliku `prisma/schema.prisma` oraz plik `.env` (patrz `.env.example`):
	```sh
	cp .env.example .env
	# Edytuj .env i ustaw wymagane dane
	```
4. Wykonaj migracje bazy danych:
	```sh
	npx prisma migrate dev
	```
5. (Opcjonalnie) Skonfiguruj integrację z S3/R2 (Cloudflare lub AWS) w `.env`, aby archiwizować załączniki z ticketów.


## Uruchomienie

### Tryb produkcyjny
```sh
bun run src/index.ts
# lub
npm run start
```

### Tryb developerski (watch mode)
```sh
bun run dev
```


## Struktura projektu
- `src/` – kod źródłowy aplikacji (bot, serwer, komendy, konfiguracja)
- `prisma/` – pliki konfiguracyjne Prisma i migracje
- `views/` – szablony EJS do panelu webowego
- `package.json` – zależności i skrypty
- `tsconfig.json` – konfiguracja TypeScript


## Przykład pliku `.env`

```env
# MySQL
DATABASE_URL="mysql://user:password@host:3306/database?schema=public"

# Discord (https://discord.com/developers)
DISCORD_TOKEN=""
DISCORD_CLIENT_ID=""
DISCORD_GUILD_ID=""

# Kategoria i kanał panelu (ID z Discorda)
TICKETS_CATEGORY_ID=""
PANEL_CHANNEL_ID=""

# Domyślne role managerów (po przecinku)
MANAGER_ROLE_IDS=""

# Express
PORT=3000
API_KEY="supersecretkey"
BASE_URL="http://localhost:3000"

# R2/S3 (opcjonalnie)
R2_ENDPOINT=
R2_BUCKET_NAME=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BASE_URL=
```

## Komendy

- `bun run src/index.ts` – uruchomienie bota i serwera
- `bun run dev` – tryb developerski (watch mode)
- `npm run start` – uruchomienie przez npm
- `npx prisma migrate dev` – migracje bazy danych
- `npx prisma studio` – panel do podglądu bazy

## REST API

Wybrane endpointy:
- `GET /api/health` – sprawdzenie działania API
- `GET /api/tickets` – lista ticketów (wymaga nagłówka `x-api-key`)
- `GET /ticket/:id` – publiczny podgląd transkrypcji ticketu

## Integracja z S3/R2 (Cloudflare lub AWS)

Jeśli chcesz archiwizować załączniki z ticketów, skonfiguruj sekcję R2/S3 w `.env`. Obsługiwane są Cloudflare R2 oraz AWS S3 (endpoint, klucze, bucket, publiczny URL).

## Licencja
MIT
