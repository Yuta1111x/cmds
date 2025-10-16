# SecureAuth Update Server

🚀 Serwer do zarządzania aktualizacjami pluginu SecureAuth z automatycznym GitHub backup.

## Funkcje

- 📊 **Panel webowy** - zarządzanie wersjami przez przeglądarkę
- 🔄 **Auto-update API** - plugin automatycznie sprawdza aktualizacje
- 📋 **Historia wersji** - pełna historia z opisami zmian
- 📦 **GitHub Integration** - automatyczne commitowanie nowych wersji
- 🤖 **Keep-alive** - obsługa ping requestów z pluginu

## Deployment na Render.com

1. **Użyj repo** `https://github.com/Yuta1111x/cmds`
2. **Połącz z Render.com** jako Web Service
3. **Ustaw Root Directory** na `server/`
4. **Deploy** - Render automatycznie wykryje Node.js

### GitHub Repository
Wszystkie uploady są automatycznie commitowane do: `https://github.com/Yuta1111x/cmds`

### Zmienne środowiskowe

```bash
PORT=3000                              # Port serwera (domyślnie 3000)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx  # GitHub Personal Access Token (zalecane)
```

#### GitHub Token Setup:
1. Idź do GitHub → Settings → Developer settings → Personal access tokens
2. Wygeneruj nowy token z uprawnieniami `repo`
3. Dodaj token jako zmienną środowiskową `GITHUB_TOKEN` w Render.com

## API Endpoints

- `GET /api/version` - aktualna wersja pluginu
- `GET /api/download` - pobierz plik JAR
- `GET /api/history` - historia wersji (JSON)
- `GET /api/status` - status serwera

## GitHub Integration

Serwer automatycznie:
- Commituje każdy upload do GitHub
- Tworzy opisowe commit messages
- Przechowuje backup wszystkich wersji
- Synchronizuje z repozytorium

## Struktura plików

```
uploads/
├── SecureAuth.jar          # Aktualny plik pluginu
├── version.txt             # Aktualna wersja
└── version_history.json    # Historia wszystkich wersji
```

## Bezpieczeństwo

- Tylko pliki .jar są akceptowane
- Walidacja formatu wersji (x.y.z)
- Automatyczny backup do GitHub
- Keep-alive requests są ukryte

## Plugin Configuration

Plugin automatycznie łączy się z:
```
https://your-app.onrender.com/api/version
https://your-app.onrender.com/api/download
```

Sprawdza aktualizacje co 5 minut i wysyła keep-alive co 30 sekund.