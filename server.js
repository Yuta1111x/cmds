// Załaduj zmienne środowiskowe z pliku .env
require('dotenv').config();

// Debug - sprawdź czy token został załadowany
console.log(`🔍 [${new Date().toISOString()}] Sprawdzanie zmiennych środowiskowych...`);
console.log(`🔑 GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? '✅ ZAŁADOWANY' : '❌ BRAK'}`);
console.log(`🌐 PORT: ${process.env.PORT || 3000}`);

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Konfiguracja multer dla uploadów
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Upewnij się że folder istnieje
        fs.ensureDirSync('uploads');
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Usuń stary plik jeśli istnieje
        const targetPath = path.join('uploads', 'SecureAuth.jar');
        try {
            if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
                console.log(`🗑️  Usunięto stary plik: ${targetPath}`);
            }
        } catch (error) {
            console.log(`⚠️  Nie można usunąć starego pliku: ${error.message}`);
        }
        cb(null, 'SecureAuth.jar');
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/java-archive' || file.originalname.endsWith('.jar')) {
            cb(null, true);
        } else {
            cb(new Error('Tylko pliki .jar są dozwolone!'), false);
        }
    }
});

// Upewnij się że foldery istnieją
console.log(`📁 Sprawdzanie folderów...`);
fs.ensureDirSync('uploads');
console.log(`✅ Folder uploads/ jest gotowy`);

// Plik z wersją
const VERSION_FILE = 'uploads/version.txt';
const JAR_FILE = 'uploads/SecureAuth.jar';

// Plik z historią wersji
const VERSION_HISTORY_FILE = 'uploads/version_history.json';

// NIE twórz domyślnych plików - wszystko ma być prawdziwe
// Pliki będą utworzone tylko przy pierwszym prawdziwym uploadzie

// Funkcja do pobierania historii wersji
function getVersionHistory() {
    try {
        if (fs.existsSync(VERSION_HISTORY_FILE)) {
            return JSON.parse(fs.readFileSync(VERSION_HISTORY_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Błąd odczytu historii wersji:', error);
    }
    return { versions: [] };
}

// Funkcja do dodawania nowej wersji do historii
function addVersionToHistory(version, description = '') {
    try {
        const history = getVersionHistory();
        history.versions.unshift({
            version: version,
            uploadDate: new Date().toISOString(),
            description: description || `Aktualizacja do wersji ${version}`
        });

        // Zachowaj tylko ostatnie 20 wersji
        if (history.versions.length > 20) {
            history.versions = history.versions.slice(0, 20);
        }

        fs.writeFileSync(VERSION_HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Błąd zapisu historii wersji:', error);
    }
}

// Funkcja do automatycznego sugerowania następnej wersji
function suggestNextVersion(currentVersion) {
    // Jeśli nie ma aktualnej wersji, zacznij od 1.0.0
    if (!currentVersion || currentVersion === 'Brak') {
        return '1.0.0';
    }

    try {
        const parts = currentVersion.split('.');
        if (parts.length === 3) {
            const major = parseInt(parts[0]);
            const minor = parseInt(parts[1]);
            const patch = parseInt(parts[2]);

            // Sugeruj zwiększenie patch
            return `${major}.${minor}.${patch + 1}`;
        }
    } catch (error) {
        // Fallback
    }
    return '1.0.0';
}

// Funkcja do commitowania do GitHub
async function commitToGitHub(version, description) {
    const startTime = Date.now();
    console.log(`\n🔄 [${new Date().toISOString()}] Rozpoczynam commitowanie wersji ${version} do GitHub...`);

    try {
        // Sprawdź czy mamy GitHub token
        const githubToken = process.env.GITHUB_TOKEN;
        if (!githubToken) {
            console.log(`⚠️  GITHUB_TOKEN nie jest ustawiony - używam podstawowej autoryzacji`);
        } else {
            console.log(`🔑 Używam GitHub token dla autoryzacji`);
        }

        // Konfiguracja git
        console.log(`📝 Konfiguracja git user...`);
        try {
            execSync('git config user.name "Yuta1111x"', { stdio: 'pipe' });
            execSync('git config user.email "yoyuta1111x@gmail.com"', { stdio: 'pipe' });
            console.log(`✅ Git user skonfigurowany`);
        } catch (configError) {
            console.log(`⚠️  Błąd konfiguracji git user: ${configError.message}`);
        }

        // Sprawdź status git
        console.log(`📊 Sprawdzanie statusu git...`);
        try {
            const status = execSync('git status --porcelain', { encoding: 'utf8' });
            if (status.trim()) {
                console.log(`📁 Znalezione zmiany do commitowania:`);
                console.log(status);
            } else {
                console.log(`ℹ️  Brak zmian do commitowania`);
                return true;
            }
        } catch (statusError) {
            console.log(`⚠️  Błąd sprawdzania statusu: ${statusError.message}`);
        }

        // Dodaj pliki do staging
        console.log(`➕ Dodawanie plików do staging...`);
        execSync('git add uploads/', { stdio: 'pipe' });
        console.log(`✅ Pliki dodane do staging`);

        // Sprawdź co zostało dodane
        try {
            const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' });
            if (staged.trim()) {
                console.log(`📋 Pliki w staging:`);
                staged.trim().split('\n').forEach(file => console.log(`   - ${file}`));
            }
        } catch (e) {
            console.log(`⚠️  Nie można sprawdzić staged files`);
        }

        // Commit z opisem
        const commitMessage = `🚀 SecureAuth v${version}: ${description || 'Nowa wersja'}`;
        console.log(`💾 Tworzenie commit: "${commitMessage}"`);
        execSync(`git commit -m "${commitMessage}"`, { stdio: 'pipe' });
        console.log(`✅ Commit utworzony`);

        // Konfiguracja remote URL z tokenem (jeśli dostępny)
        if (githubToken) {
            try {
                console.log(`🔗 Konfiguracja remote URL z tokenem...`);
                const targetUrl = `https://${githubToken}@github.com/Yuta1111x/cmds.git`;
                execSync(`git remote set-url origin "${targetUrl}"`, { stdio: 'pipe' });
                console.log(`🔑 Remote URL ustawiony na: https://github.com/Yuta1111x/cmds.git`);
            } catch (remoteError) {
                console.log(`⚠️  Błąd konfiguracji remote URL: ${remoteError.message}`);
            }
        } else {
            // Bez tokenu - ustaw podstawowy URL
            try {
                const basicUrl = 'https://github.com/Yuta1111x/cmds.git';
                execSync(`git remote set-url origin "${basicUrl}"`, { stdio: 'pipe' });
                console.log(`🔗 Remote URL ustawiony na: ${basicUrl}`);
            } catch (remoteError) {
                console.log(`⚠️  Błąd ustawiania remote URL: ${remoteError.message}`);
            }
        }

        // Push do origin main
        console.log(`🚀 Pushowanie do GitHub...`);
        const pushOutput = execSync('git push origin main', { encoding: 'utf8', stdio: 'pipe' });
        console.log(`📤 Push output: ${pushOutput}`);

        const duration = Date.now() - startTime;
        console.log(`✅ [${new Date().toISOString()}] Wersja ${version} została pomyślnie commitowana do GitHub! (${duration}ms)`);
        return true;

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`\n❌ [${new Date().toISOString()}] Błąd commitowania do GitHub (${duration}ms):`);
        console.error(`   Wersja: ${version}`);
        console.error(`   Błąd: ${error.message}`);

        if (error.stdout) {
            console.error(`   STDOUT: ${error.stdout}`);
        }
        if (error.stderr) {
            console.error(`   STDERR: ${error.stderr}`);
        }

        // Dodatkowe debugowanie
        try {
            const gitStatus = execSync('git status', { encoding: 'utf8' });
            console.error(`   Git Status:\n${gitStatus}`);
        } catch (e) {
            console.error(`   Nie można pobrać git status: ${e.message}`);
        }

        return false;
    }
}

// Funkcja do inicjalizacji git repo (jeśli potrzebne)
function initializeGitRepo() {
    console.log(`\n🔧 [${new Date().toISOString()}] Inicjalizacja Git repository...`);

    try {
        // Sprawdź czy to już repo git
        execSync('git status', { stdio: 'ignore' });
        console.log('📁 Git repo już istnieje');

        // Sprawdź konfigurację
        try {
            const userName = execSync('git config user.name', { encoding: 'utf8' }).trim();
            const userEmail = execSync('git config user.email', { encoding: 'utf8' }).trim();
            console.log(`👤 Git user: ${userName} <${userEmail}>`);
        } catch (e) {
            console.log('⚠️  Git user nie jest skonfigurowany');
        }

        // Sprawdź remote
        try {
            const remoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
            const githubToken = process.env.GITHUB_TOKEN;
            const displayUrl = githubToken ? remoteUrl.replace(githubToken, '***TOKEN***') : remoteUrl;
            console.log(`🔗 Remote origin: ${displayUrl}`);
        } catch (e) {
            console.log('⚠️  Remote origin nie jest skonfigurowany');
        }

        // Sprawdź branch
        try {
            const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
            console.log(`🌿 Aktualny branch: ${currentBranch}`);
        } catch (e) {
            console.log('⚠️  Nie można określić aktualnego branch');
        }

    } catch (error) {
        console.log('📂 Git repo nie istnieje - inicjalizacja...');

        try {
            // Inicjalizuj repo
            console.log('🔨 git init...');
            execSync('git init', { stdio: 'pipe' });

            // Ustaw główny branch na main
            console.log('🌿 Ustawianie branch main...');
            execSync('git branch -M main', { stdio: 'pipe' });

            // Konfiguruj user
            console.log('👤 Konfiguracja git user...');
            execSync('git config user.name "Yuta1111x"', { stdio: 'pipe' });
            execSync('git config user.email "yoyuta1111x@gmail.com"', { stdio: 'pipe' });

            // Dodaj remote origin do Twojego repo
            const githubToken = process.env.GITHUB_TOKEN;
            const repoUrl = githubToken
                ? `https://${githubToken}@github.com/Yuta1111x/cmds.git`
                : 'https://github.com/Yuta1111x/cmds.git';

            console.log('🔗 Dodawanie remote origin...');
            execSync(`git remote add origin "${repoUrl}"`, { stdio: 'pipe' });
            console.log('✅ Remote origin dodany: https://github.com/Yuta1111x/cmds.git');

            console.log('✅ Git repo zainicjalizowane pomyślnie');

        } catch (initError) {
            console.error('❌ Błąd inicjalizacji git:');
            console.error(`   ${initError.message}`);
            if (initError.stderr) {
                console.error(`   STDERR: ${initError.stderr}`);
            }
        }
    }

    // Sprawdź czy mamy GitHub token
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
        console.log('🔑 GitHub token jest dostępny');
    } else {
        console.log('⚠️  GITHUB_TOKEN nie jest ustawiony');
        console.log('💡 Ustaw GITHUB_TOKEN w zmiennych środowiskowych dla lepszej autoryzacji');
    }
}

// API Endpoints

// Pobierz aktualną wersję
app.get('/api/version', (req, res) => {
    try {
        if (fs.existsSync(VERSION_FILE)) {
            const version = fs.readFileSync(VERSION_FILE, 'utf8').trim();
            res.send(version);
        } else {
            // Jeśli nie ma pliku wersji, zwróć domyślną wersję 0.0.0
            // Plugin będzie myślał że ma nowszą wersję i nie będzie próbował aktualizować
            res.send('0.0.0');
        }
    } catch (error) {
        res.status(500).send('Błąd serwera');
    }
});

// Pobierz plik JAR
app.get('/api/download', (req, res) => {
    try {
        if (fs.existsSync(JAR_FILE)) {
            res.download(JAR_FILE, 'SecureAuth.jar');
        } else {
            res.status(404).send('Plik nie znaleziony');
        }
    } catch (error) {
        res.status(500).send('Błąd serwera');
    }
});

// Panel administracyjny - strona główna
app.get('/', (req, res) => {
    // Sprawdź czy to sekretny keep-alive request
    if (req.headers['x-keep-alive'] === 'secret') {
        // Sekretny ping - odpowiedz szybko i dyskretnie
        return res.status(200).send('OK');
    }
    const currentVersion = fs.existsSync(VERSION_FILE) ? fs.readFileSync(VERSION_FILE, 'utf8').trim() : 'Brak';
    const jarExists = fs.existsSync(JAR_FILE);
    const jarSize = jarExists ? (fs.statSync(JAR_FILE).size / 1024).toFixed(2) + ' KB' : 'Brak pliku';
    const suggestedVersion = suggestNextVersion(currentVersion);
    const versionHistory = getVersionHistory();

    res.send(`
    <!DOCTYPE html>
    <html lang="pl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SecureAuth Update Server</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }
            .container { 
                max-width: 800px; 
                margin: 0 auto; 
                background: white; 
                border-radius: 15px; 
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header { 
                background: linear-gradient(135deg, #ff6b6b, #ee5a24);
                color: white; 
                padding: 30px; 
                text-align: center; 
            }
            .header h1 { font-size: 2.5em; margin-bottom: 10px; }
            .header p { opacity: 0.9; font-size: 1.1em; }
            .content { padding: 40px; }
            .status-card { 
                background: #f8f9fa; 
                border-radius: 10px; 
                padding: 25px; 
                margin-bottom: 30px;
                border-left: 5px solid #28a745;
            }
            .status-item { 
                display: flex; 
                justify-content: space-between; 
                margin-bottom: 15px;
                font-size: 1.1em;
            }
            .status-item:last-child { margin-bottom: 0; }
            .status-label { font-weight: 600; color: #495057; }
            .status-value { 
                color: #28a745; 
                font-weight: 700;
                background: #d4edda;
                padding: 5px 12px;
                border-radius: 20px;
                font-size: 0.9em;
            }
            .upload-section { 
                background: #fff; 
                border: 2px dashed #dee2e6; 
                border-radius: 10px; 
                padding: 30px; 
                text-align: center;
                transition: all 0.3s ease;
            }
            .upload-section:hover { 
                border-color: #007bff; 
                background: #f8f9ff;
            }
            .form-group { margin-bottom: 25px; }
            .form-group label { 
                display: block; 
                margin-bottom: 8px; 
                font-weight: 600; 
                color: #495057;
                font-size: 1.1em;
            }
            .form-control { 
                width: 100%; 
                padding: 12px 15px; 
                border: 2px solid #dee2e6; 
                border-radius: 8px; 
                font-size: 1em;
                transition: border-color 0.3s ease;
            }
            .form-control:focus { 
                outline: none; 
                border-color: #007bff; 
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            .btn { 
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white; 
                padding: 15px 30px; 
                border: none; 
                border-radius: 8px; 
                cursor: pointer; 
                font-size: 1.1em;
                font-weight: 600;
                transition: all 0.3s ease;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .btn:hover { 
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(0,123,255,0.3);
            }
            .success { 
                background: #d4edda; 
                color: #155724; 
                padding: 15px; 
                border-radius: 8px; 
                margin: 20px 0;
                border-left: 5px solid #28a745;
            }
            .error { 
                background: #f8d7da; 
                color: #721c24; 
                padding: 15px; 
                border-radius: 8px; 
                margin: 20px 0;
                border-left: 5px solid #dc3545;
            }
            .api-info {
                background: #e3f2fd;
                border-radius: 10px;
                padding: 25px;
                margin-top: 30px;
                border-left: 5px solid #2196f3;
            }
            .api-info h3 { 
                color: #1976d2; 
                margin-bottom: 15px;
                font-size: 1.3em;
            }
            .api-endpoint { 
                background: #fff; 
                padding: 12px 15px; 
                border-radius: 6px; 
                margin: 10px 0;
                font-family: 'Courier New', monospace;
                border: 1px solid #bbdefb;
                color: #1565c0;
                font-weight: 600;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔐 SecureAuth</h1>
                <p>Panel zarządzania aktualizacjami pluginu</p>
            </div>
            
            <div class="content">
                <div class="status-card">
                    <h2 style="margin-bottom: 20px; color: #495057;">📊 Status Serwera</h2>
                    <div class="status-item">
                        <span class="status-label">Aktualna wersja:</span>
                        <span class="status-value">${currentVersion}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Plik JAR:</span>
                        <span class="status-value">${jarExists ? '✅ Dostępny' : '❌ Brak'}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Rozmiar pliku:</span>
                        <span class="status-value">${jarSize}</span>
                    </div>
                </div>

                <div style="background: #f8f9fa; border-radius: 10px; padding: 25px; margin-bottom: 30px; border-left: 5px solid #17a2b8;">
                    <h2 style="margin-bottom: 20px; color: #495057;">📋 Historia Wersji</h2>
                    <div style="max-height: 300px; overflow-y: auto;">
                        ${versionHistory.versions.map((v, index) => `
                            <div style="background: white; padding: 15px; margin-bottom: 10px; border-radius: 8px; border-left: 3px solid ${index === 0 ? '#28a745' : '#dee2e6'};">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <span style="font-weight: 600; color: #495057; font-size: 1.1em;">
                                        ${index === 0 ? '🟢' : '⚪'} v${v.version}
                                        ${index === 0 ? '<span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 8px;">AKTUALNA</span>' : ''}
                                    </span>
                                    <span style="color: #6c757d; font-size: 0.9em;">
                                        ${new Date(v.uploadDate).toLocaleString('pl-PL')}
                                    </span>
                                </div>
                                <div style="color: #6c757d; font-size: 0.95em;">
                                    ${v.description || 'Brak opisu'}
                                </div>
                            </div>
                        `).join('')}
                        ${versionHistory.versions.length === 0 ? '<p style="color: #6c757d; text-align: center; margin: 20px 0;">Brak historii wersji</p>' : ''}
                    </div>
                </div>

                <div class="upload-section">
                    <h2 style="margin-bottom: 25px; color: #495057;">🚀 Wgraj nową wersję</h2>
                    
                    <form action="/upload" method="post" enctype="multipart/form-data">
                        <div class="form-group">
                            <label for="version">Numer wersji:</label>
                            <input type="text" id="version" name="version" class="form-control" 
                                   value="${suggestedVersion}" placeholder="np. 1.0.2" required pattern="[0-9]+\\.[0-9]+\\.[0-9]+">
                            <small style="color: #666; margin-top: 5px; display: block;">
                                💡 Sugerowana następna wersja: <strong>${suggestedVersion}</strong>
                            </small>
                        </div>
                        
                        <div class="form-group">
                            <label for="description">Opis zmian (opcjonalnie):</label>
                            <input type="text" id="description" name="description" class="form-control" 
                                   placeholder="np. Naprawiono błędy, dodano nowe funkcje...">
                        </div>
                        
                        <div class="form-group">
                            <label for="jarfile">Plik JAR:</label>
                            <input type="file" id="jarfile" name="jarfile" class="form-control" 
                                   accept=".jar" required>
                        </div>
                        
                        <button type="submit" class="btn">📤 Wgraj aktualizację</button>
                    </form>
                </div>

                <div class="api-info">
                    <h3>🔗 Endpointy API</h3>
                    <div class="api-endpoint">GET /api/version</div>
                    <div class="api-endpoint">GET /api/download</div>
                    <div class="api-endpoint">GET /api/history</div>
                    <div class="api-endpoint">GET /api/status</div>
                    <p style="margin-top: 15px; color: #666;">
                        Plugin automatycznie sprawdza te endpointy co 5 minut w poszukiwaniu aktualizacji.
                    </p>
                </div>

                <div style="background: #e8f5e8; border-radius: 10px; padding: 25px; margin-top: 30px; border-left: 5px solid #28a745;">
                    <h3 style="color: #155724; margin-bottom: 15px;">📦 GitHub Integration</h3>
                    <p style="color: #155724; margin-bottom: 10px;">
                        <strong>✅ Automatyczne commitowanie:</strong> Każdy upload jest automatycznie commitowany do GitHub
                    </p>
                    <p style="color: #155724; margin-bottom: 10px;">
                        <strong>🔄 Backup:</strong> Wszystkie wersje są bezpiecznie przechowywane w repozytorium
                    </p>
                    <p style="color: #155724; margin-bottom: 10px;">
                        <strong>📝 Historia:</strong> Commit messages zawierają wersję i opis zmian
                    </p>
                    <p style="color: #155724; margin-bottom: 10px;">
                        <strong>🔑 Token:</strong> ${process.env.GITHUB_TOKEN ? '✅ Skonfigurowany' : '⚠️ Nie ustawiony (ustaw GITHUB_TOKEN)'}
                    </p>
                    <p style="color: #155724; margin: 0;">
                        <strong>📂 Repository:</strong> <a href="https://github.com/Yuta1111x/cmds" target="_blank" style="color: #155724; text-decoration: underline;">github.com/Yuta1111x/cmds</a>
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `);
});

// Upload nowej wersji
app.post('/upload', upload.single('jarfile'), (req, res) => {
    console.log(`\n📤 [${new Date().toISOString()}] Otrzymano request upload:`);
    console.log(`   Method: ${req.method}`);
    console.log(`   URL: ${req.url}`);
    console.log(`   Content-Type: ${req.headers['content-type']}`);
    console.log(`   Body keys: ${Object.keys(req.body)}`);
    console.log(`   File: ${req.file ? req.file.originalname : 'BRAK'}`);
    
    try {
        const { version, description } = req.body;
        console.log(`   Wersja z body: ${version}`);
        console.log(`   Opis z body: ${description}`);

        if (!version || !req.file) {
            console.log(`❌ Walidacja nie powiodła się:`);
            console.log(`   Wersja: ${version}`);
            console.log(`   Plik: ${req.file ? 'OK' : 'BRAK'}`);
            return res.status(400).send(`
        <script>
          alert('Błąd: Brak wersji lub pliku!');
          window.location.href = '/';
        </script>
      `);
        }
        
        // Sprawdź czy plik rzeczywiście istnieje
        const uploadedFilePath = req.file.path;
        if (!fs.existsSync(uploadedFilePath)) {
            console.log(`❌ Plik nie istnieje: ${uploadedFilePath}`);
            return res.status(500).send(`
        <script>
          alert('Błąd: Plik nie został poprawnie wgrany!');
          window.location.href = '/';
        </script>
      `);
        }
        
        console.log(`✅ Plik wgrany pomyślnie: ${uploadedFilePath}`);

        // Zapisz nową wersję
        fs.writeFileSync(VERSION_FILE, version.trim());

        // Dodaj do historii wersji
        addVersionToHistory(version.trim(), description?.trim());

        console.log(`\n📦 [${new Date().toISOString()}] Nowa wersja wgrana:`);
        console.log(`   Wersja: ${version}`);
        console.log(`   Opis: ${description || 'Brak opisu'}`);
        console.log(`   Plik: ${req.file.originalname} (${(req.file.size / 1024).toFixed(2)} KB)`);

        // Commituj do GitHub (asynchronicznie)
        setTimeout(async () => {
            console.log(`\n⏰ [${new Date().toISOString()}] Rozpoczynam GitHub commit po opóźnieniu...`);
            const success = await commitToGitHub(version.trim(), description?.trim());
            if (success) {
                console.log(`🎉 Wersja ${version} została pomyślnie zapisana w GitHub!`);
            } else {
                console.log(`💥 Nie udało się zapisać wersji ${version} w GitHub`);
            }
        }, 1000); // Opóźnienie 1 sekunda żeby pliki się zapisały

        res.send(`
      <script>
        alert('✅ Sukces! Wersja ${version} została wgrana.');
        window.location.href = '/';
      </script>
    `);

    } catch (error) {
        console.error(`\n❌ [${new Date().toISOString()}] Błąd uploadu:`);
        console.error(`   Błąd: ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
        console.error(`   Request body: ${JSON.stringify(req.body)}`);
        console.error(`   Request file: ${req.file ? JSON.stringify(req.file) : 'BRAK'}`);
        
        res.status(500).send(`
      <script>
        alert('❌ Błąd serwera: ${error.message}');
        window.location.href = '/';
      </script>
    `);
    }
});

// Endpoint do pobierania historii wersji
app.get('/api/history', (req, res) => {
    try {
        const history = getVersionHistory();
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: 'Błąd pobierania historii wersji' });
    }
});

// Endpoint do sprawdzenia statusu serwera
app.get('/api/status', (req, res) => {
    const version = fs.existsSync(VERSION_FILE) ? fs.readFileSync(VERSION_FILE, 'utf8').trim() : null;
    const jarExists = fs.existsSync(JAR_FILE);

    res.json({
        version: version,
        jarAvailable: jarExists,
        serverTime: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Start serwera
app.listen(PORT, () => {
    console.log(`🚀 SecureAuth Update Server działa na porcie ${PORT}`);
    console.log(`📱 Panel: http://localhost:${PORT}`);
    console.log(`🔗 API Version: http://localhost:${PORT}/api/version`);
    console.log(`📦 API Download: http://localhost:${PORT}/api/download`);

    // Inicjalizuj git repo jeśli potrzebne
    initializeGitRepo();
});

// Obsługa błędów
app.use((error, req, res, next) => {
    console.error(`\n💥 [${new Date().toISOString()}] Błąd middleware:`);
    console.error(`   URL: ${req.url}`);
    console.error(`   Method: ${req.method}`);
    console.error(`   Error type: ${error.constructor.name}`);
    console.error(`   Error message: ${error.message}`);
    
    if (error instanceof multer.MulterError) {
        console.error(`   Multer error code: ${error.code}`);
        return res.status(400).send(`
      <script>
        alert('Błąd uploadu: ${error.message}');
        window.location.href = '/';
      </script>
    `);
    }

    res.status(500).send(`
    <script>
      alert('Błąd serwera: ${error.message}');
      window.location.href = '/';
    </script>
  `);
});