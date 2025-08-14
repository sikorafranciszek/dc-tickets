
# dc-tickets

Aplikacja do zarządzania zgłoszeniami (tickets) na Discordzie, napisana w TypeScript z użyciem Node.js i Prisma.

## Funkcje
- Obsługa ticketów na Discordzie
- Integracja z bazą danych przez Prisma
- Komendy bota
- REST API

## Wymagania
- Node.js
- Bun (jeśli używasz bun.lock)
- Baza danych zgodna z Prisma (np. PostgreSQL, MySQL, SQLite)

## Instalacja
1. Sklonuj repozytorium:
	```sh
	git clone <adres-repozytorium>
	cd dc-tickets
	```
2. Zainstaluj zależności:
	```sh
	bun install
	```
	lub
	```sh
	npm install
	```
3. Skonfiguruj bazę danych w pliku `prisma/schema.prisma` i uruchom migracje:
	```sh
	npx prisma migrate dev
	```
4. Skonfiguruj plik `.env` z danymi dostępowymi do bazy i tokenem bota Discord.

## Uruchomienie
```sh
bun run src/index.ts
```
lub
```sh
npm run start
```

## Struktura projektu
- `src/` – kod źródłowy aplikacji
- `prisma/` – pliki konfiguracyjne Prisma
- `package.json` – zależności i skrypty
- `tsconfig.json` – konfiguracja TypeScript

## Licencja
MIT
