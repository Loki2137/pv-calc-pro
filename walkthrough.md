# Walkthrough - Gemini API & PDF Parsing Integration

I have successfully resolved the issues with PDF extraction and Gemini API integration.

## Changes Made

### 1. PDF Parsing (Main Process)
Moved `pdf-parse` logic to `main.js` to avoid Electron Renderer worker errors.
- [main.js](file:///c:/Users/Kuba/.gemini:antigravity:scratch:pv_calc_pro:main.js) (IPC Handler)
- [renderer.js](file:///c:/Users/Kuba/.gemini:antigravity:scratch:pv_calc_pro:renderer.js) (IPC Call)

### 2. Gemini API Fixes
- **Model Switch**: Switched to `gemini-2.5-flash` after diagnostic tests showed it's the only model available and working for the new key (Status 200).
- **Quota Fix**: Resolved the "limit: 0" error by identifying the correct working model.
- **Syntax**: Applied Option A (`responseMimeType`) and `v1beta` endpoint.
- **Safety**: Added a regex cleaner to handle AI responses wrapped in markdown code blocks.

### Multi-variant AI Extraction
- **Prompt**: Gemini now extracts an array of all power variants found in the STC columns of the datasheet.
- **UI**: Added a dynamic selection area that appears after extraction, showing found power levels (e.g., 470Wp, 475Wp).
- **Automation**: Choosing a variant automatically fills the technical form and updates the "Moc modułów" field in the sidebar, refreshing all calculations.

### Security & Key Protection
- **Hardcoding Removed**: The Gemini API key is no longer stored in the source code.
- **Local Storage**: Keys are now stored safely in the user's browser `localStorage` and never sent to GitHub.
- **Git Protection**: Added `.gitignore` to prevent accidental commits of sensitive configuration or log files.
- **UI Restoration**: Re-enabled the API Key management field in the "Moduł PV / AI" tab for secure user input.

### Simulation Logic Fix
- **Control Fields**: Added "Modułów w szeregu" and "Szeregów na MPPT" to the sidebar to allow precise simulation control.
- **Physics Model**: Updated the simulation engine to use these new parameters when calculating V and I for each MPPT.
- **Auto-Update**: The simulation results are now correctly calculated and the UI switches to the results tab automatically after simulation finishes.

### Charakterystyki PV (Nowość 🌟)
- **Model Matematyczny**: Implementacja aproksymacji krzywej I-V i P-V na podstawie parametrów STC modułu.
- **Wizualizacja**: Nowy modal z wykresami generowanymi dynamicznie przez `Chart.js`.
- **Eksport**: Możliwość pobrania wykresu jako plik PNG do wykorzystania w dokumentacji zewnętrznej.
- **Optymalizacja**: Usunięto zbędne funkcje generowania losowego (fallbacki) na rzecz ujednoliconego modelu fizycznego.

### Konfiguracja Granularna MPPT (Ulepszenie ⚡)
- **Niezależne łańcuchy**: Usunięto globalne ustawienie "Szeregów na MPPT". Każdy wiersz MPPT w tabeli posiada teraz własny wybór (1, 2 lub 3 stringi).
- **Precyzyjna Symulacja**: Model fizyczny uwzględnia konkretne ustawienie dla każdego trackera z osobna, sumując prądy tam, gdzie faktycznie podłączono więcej łańcuchów.
- **Przejrzystość**: Sidebar służy teraz tylko do danych ogólnych, a specyfika konfiguracji dachu jest definiowana bezpośrednio w protokole.

### Rozdzielenie Funkcji Generowania (Usprawnienie 🛠️)
- **Niezależność**: Przycisk "Generuj pomiary DC/AC" (zakładka główna) nie wymaga już danych z AI. Działa jako szybki generator losowych, ale technicznie poprawnych wartości.
- **Specjalizacja**: Przycisk "Symuluj pomiary" (zakładka AI) pozostaje zaawansowanym narzędziem fizycznym, generującym wyniki na podstawie konkretnego modelu modułu i pogody.

### GitHub Backup (Update)
- Created a new branch named `wersja-1.6` in the repository `Loki2137/pv-calc-pro`.
- Pushed the latest set of changes individually to ensure a stable backup:
  - `index.html` (Removal of global MPPT config)
  - `renderer.js` (Granular MPPT simulation logic & decoupled generator)
  - `style.css` (Styles for per-MPPT configurations)
  - `task.md` & `walkthrough.md` (Updated documentation)

The project is now safely backed up as "Wersja 1.6" on GitHub.

## Verification Results
- **Self-Diagnostic Test**: Confirmed `gemini-2.5-flash` returns 200 OK with the current key.
- **MPPT Configuration**: Verified that 1, 2, or 3 strings can be selected per MPPT row and that simulation correctly utilizes these values.
- **Logic Separation**: Confirmed "Generuj" and "Symuluj" buttons operate independently as requested.

## Final Status
Version 1.6 is deployed and backed up. All user requests regarding granular MPPT control and simulation decoupling have been implemented.