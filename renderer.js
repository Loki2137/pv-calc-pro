const fs = require('fs');

// ═══════════════════════════════════════════
// CONFIG / API KEYS
// ═══════════════════════════════════════════
const GEMINI_API_KEY = 'AIzaSyC83ccd6_Odfr_nmSG-HNumglRBvJaXBvY';

// ═══════════════════════════════════════════════════════
// TABELA KROTNOŚCI k DLA WKŁADEK TOPIKOWYCH (t = 0,4 s)
// ═══════════════════════════════════════════════════════
const FUSE_K_TABLE = {
    4: 8.0, 6: 7.3, 10: 7.5, 16: 6.3, 20: 6.7, 25: 7.6,
    32: 7.8, 35: 8.3, 40: 8.1, 50: 9.1, 63: 9.1, 80: 10.0,
    100: 10.0, 125: 11.8, 160: 11.3, 200: 12.0, 224: 7.8,
    250: 11.9, 280: 8.4, 300: 8.4, 315: 13.4, 355: 9.1,
    400: 12.7, 425: 9.6, 450: 10.6, 500: 14.6, 560: 10.4,
    630: 15.1, 710: 10.1, 800: 16.9, 900: 10.9, 1000: 15.5, 1250: 20.0
};
function lookupK(In) { return FUSE_K_TABLE[In] ?? null; }

// ═══════════════════════════════════════════
// DOM refs
// ═══════════════════════════════════════════
const mpptInput          = document.getElementById('mppt-count');
const unInput            = document.getElementById('un-val');
const totalModulesIn     = document.getElementById('total-modules');
const modulePowerWIn     = document.getElementById('module-power-w');
const installedPowerEl   = document.getElementById('installed-power');

const protocolBody       = document.getElementById('protocol-body');
const mpptInsulationBody = document.getElementById('mppt-insulation-body');
const tabButtons         = document.querySelectorAll('.tab-btn');
const tabPanels          = document.querySelectorAll('.tab-panel');
const activeTabTitle     = document.getElementById('active-tab-title');
const copyBtn            = document.getElementById('copy-clipboard-btn');
const genZsBtn           = document.getElementById('gen-zs-btn');
const addIpzRowBtn       = document.getElementById('add-ipz-row-btn');
const ipzBody            = document.getElementById('ipz-body');
const genInsulationBtn   = document.getElementById('gen-insulation-btn');
const genDcParamsBtn     = document.getElementById('gen-dc-params-btn');

// AI / Module refs
const pdfDropZone        = document.getElementById('pdf-drop-zone');
const pdfFileInput       = document.getElementById('pdf-file-input');
const extractPdfBtn      = document.getElementById('extract-pdf-btn');
const aiStatus           = document.getElementById('ai-status');
const openaiKeyInput     = document.getElementById('openai-key');
const toggleKeyBtn       = document.getElementById('toggle-key-btn');
const saveKeyBtn         = document.getElementById('save-key-btn');
const keyStatus          = document.getElementById('key-status');
const simulateIvBtn      = document.getElementById('simulate-iv-btn');
const simStatus          = document.getElementById('sim-status');

// ═══════════════════════════════════════════
// Module Parameters Store
// ═══════════════════════════════════════════
let moduleParams = null;
let selectedPdfPath = null;

// Load saved API key
// Initial pre-fill with hardcoded key if not set
if (!localStorage.getItem('gemini_api_key')) {
    localStorage.setItem('gemini_api_key', GEMINI_API_KEY);
}
const savedKey = localStorage.getItem('gemini_api_key');
if (savedKey) { openaiKeyInput.value = savedKey; keyStatus.textContent = '✅ Klucz załadowany z konfiguracji'; }

// ═══════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabPanels.forEach(p => p.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        activeTabTitle.innerText = btn.innerText;
    });
});

// ═══════════════════════════════════════════
// Pomocnicze UI
// ═══════════════════════════════════════════
function ocenaSelect() {
    return `<select class="ocena-select">
        <option value="OK" selected>OK</option>
        <option value="Błąd">Błąd</option>
    </select>`;
}
function takNieHtml() {
    return `<span class="tak-nie-group">
        <span class="tak-nie-opt selected" data-val="NIE">NIE</span>
        <span class="tak-nie-sep"> / </span>
        <span class="tak-nie-opt" data-val="TAK">TAK</span>
    </span>`;
}
document.addEventListener('click', e => {
    if (e.target.classList.contains('tak-nie-opt')) {
        const group = e.target.closest('.tak-nie-group');
        group.querySelectorAll('.tak-nie-opt').forEach(opt => {
            opt.classList.toggle('selected', opt === e.target);
            opt.classList.toggle('struck',   opt !== e.target);
        });
    }
});

// ═══════════════════════════════════════════
// INSTALLED POWER CALCULATOR
// ═══════════════════════════════════════════
function updateInstalledPower() {
    const totalModules = parseInt(totalModulesIn.value) || 0;
    const modulePowerW = parseFloat(modulePowerWIn.value) || 0;
    if (totalModules <= 0 || modulePowerW <= 0) {
        installedPowerEl.textContent = '— kWp';
        return;
    }
    const totalPower = (totalModules * modulePowerW / 1000).toFixed(2);
    installedPowerEl.textContent = `${totalPower} kWp`;
    installedPowerEl.title = `${totalModules} szt. × ${modulePowerW} W`;
}

// ═══════════════════════════════════════════
// PROTOKÓŁ DC — budowanie tabeli
// ═══════════════════════════════════════════
function buildProtocolTable() {
    const mpptCount = parseInt(mpptInput.value) || 1;
    protocolBody.innerHTML = '';

    // ─ pusta nagłówkowa metadana (–) ─
    const rowHeader = document.createElement('tr');
    rowHeader.className = 'proto-subheader';
    rowHeader.innerHTML = `
        <td class="lp-cell" style="color:var(--text-dim)">–</td>
        <td class="desc-cell" style="color:var(--text-dim)">–</td>
        <td class="result-cell" style="color:var(--text-dim);text-align:center">–</td>
        <td class="ocena-cell" style="color:var(--text-dim);font-size:0.8rem">[OK/BŁĄD]</td>
    `;
    protocolBody.appendChild(rowHeader);

    // ─ 1. Polaryzacja ─
    const row1 = document.createElement('tr');
    row1.innerHTML = `
        <td class="lp-cell">1.</td>
        <td class="desc-cell">Sprawdzenie polaryzacji okablowania DC,</td>
        <td class="result-cell center-cell">${takNieHtml()}</td>
        <td class="ocena-cell">${ocenaSelect()}</td>
    `;
    protocolBody.appendChild(row1);

    // ─ 2. MPPT — rowspan na lp+opis, siatka V|A, osobna ocena każdy ─
    for (let i = 1; i <= mpptCount; i++) {
        const row = document.createElement('tr');
        const hdr = i === 1
            ? `<td class="lp-cell" rowspan="${mpptCount}">2.</td>
               <td class="desc-cell center-cell" rowspan="${mpptCount}">Pomiar napięć w obwodach DC&nbsp;/ Pomiar prądów w obwodach DC</td>`
            : '';

        row.innerHTML = `
            ${hdr}
            <td class="result-cell mppt-row-cell">
                <div class="mppt-dual-grid">
                    <div class="mppt-half">
                        <span class="mppt-label">MPPT ${i} –</span>
                        <input type="number" class="cell-input proto-input" placeholder="–">
                        <span class="unit">[V]</span>
                    </div>
                    <div class="mppt-half mppt-half-right">
                        <span class="mppt-label">MPPT ${i} –</span>
                        <input type="number" class="cell-input proto-input" placeholder="–">
                        <span class="unit">[A]</span>
                    </div>
                </div>
            </td>
            <td class="ocena-cell">${ocenaSelect()}</td>
        `;
        protocolBody.appendChild(row);
    }

    // ─ 3. Napięcia AC — trzy równe kolumny ─
    const row3 = document.createElement('tr');
    row3.innerHTML = `
        <td class="lp-cell">3.</td>
        <td class="desc-cell center-cell">Pomiar napięć w obwodach AC</td>
        <td class="result-cell">
            <div class="ac-three-grid">
                <div class="ac-col">L1: <input type="number" class="cell-input proto-input" placeholder="–"> <span class="unit">[V]</span></div>
                <div class="ac-col">L2: <input type="number" class="cell-input proto-input" placeholder="–"> <span class="unit">[V]</span></div>
                <div class="ac-col">L3: <input type="number" class="cell-input proto-input" placeholder="–"> <span class="unit">[V]</span></div>
            </div>
        </td>
        <td class="ocena-cell">${ocenaSelect()}</td>
    `;
    protocolBody.appendChild(row3);

    // ─ 4. Weryfikacja falownika (TAK/NIE + NR seryjny) ─
    const row4a = document.createElement('tr');
    row4a.innerHTML = `
        <td class="lp-cell" rowspan="2">4.</td>
        <td class="desc-cell center-cell" rowspan="2">Weryfikacja konfiguracji falownika,</td>
        <td class="result-cell center-cell">${takNieHtml()}</td>
        <td class="ocena-cell" rowspan="2">${ocenaSelect()}</td>
    `;
    protocolBody.appendChild(row4a);

    const row4b = document.createElement('tr');
    row4b.innerHTML = `
        <td class="result-cell center-cell">
            <span class="serial-label">NR seryjny:</span>
            <input type="text" class="cell-input proto-input serial-input" placeholder="Wpisz numer seryjny">
        </td>
    `;
    protocolBody.appendChild(row4b);

    // ─ 5. Połączenia wyrównawcze ─
    const row5 = document.createElement('tr');
    row5.innerHTML = `
        <td class="lp-cell">5.</td>
        <td class="desc-cell">Sprawdzenie ciągłości połączeń wyrównawczych</td>
        <td class="result-cell center-cell">${takNieHtml()}</td>
        <td class="ocena-cell">${ocenaSelect()}</td>
    `;
    protocolBody.appendChild(row5);
}

// ═══════════════════════════════════════════
// IZOLACJA DC
// ═══════════════════════════════════════════
function buildInsulationTable() {
    const mpptCount = parseInt(mpptInput.value) || 1;
    mpptInsulationBody.innerHTML = '';
    for (let i = 1; i <= mpptCount; i++) {
        ['+', '-'].forEach(pol => {
            const r = document.createElement('tr');
            r.innerHTML = `
                <td>MPPT ${i}</td>
                <td>(${pol}) do PE</td>
                <td>> 1.1 MΩ</td>
                <td><input type="number" class="cell-input ins-val" placeholder="—"></td>
                <td>1000 V</td>
                <td class="status-cell">—</td>
            `;
            mpptInsulationBody.appendChild(r);
        });
    }
}
genInsulationBtn.addEventListener('click', () => {
    mpptInsulationBody.querySelectorAll('tr').forEach(row => {
        const val = (Math.random() * 899 + 100).toFixed(0);
        const inp = row.querySelector('.ins-val');
        inp.value = val;
        inp.style.borderColor = '#10b981';
        const sc = row.querySelector('.status-cell');
        sc.innerText = 'OK'; sc.className = 'status-cell status-ok';
        setTimeout(() => { inp.style.borderColor = ''; }, 900);
    });
});

// ═══════════════════════════════════════════
// PHYSICS SIMULATION ENGINE (I-V Model)
// ═══════════════════════════════════════════

// Gaussian random (Box–Muller transform)
function gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Simulate one MPPT measurement based on module parameters
function simulateOneMPPT(params, irradiance, tempModule) {
    const { vmp, imp, beta = -0.29, alpha = 0.04 } = params;
    const modulesPerStr  = parseInt(modulesPerStringIn.value) || 20;
    const stringsPerMppt = parseInt(stringsPerMpptIn.value)   || 1;

    const irradFactor = irradiance / 1000;
    const deltaT = tempModule - 25;

    // Temperature + irradiance correction
    const VmpCorr = vmp * modulesPerStr * (1 + (beta / 100) * deltaT);
    const ImpCorr = imp * stringsPerMppt * irradFactor * (1 + (alpha / 100) * deltaT);

    // Realistic instrument noise — Gaussian sigma ~0.4%
    const vNoise = 1 + gaussian() * 0.004;
    const iNoise = 1 + gaussian() * 0.004;

    return {
        V: Math.max(0, parseFloat((VmpCorr * vNoise).toFixed(2))),
        I: Math.max(0, parseFloat((ImpCorr * iNoise).toFixed(2)))
    };
}

// Simulate AC voltages (nominal ±1–3V with slight asymmetry between phases)
function simulateACVoltages(unNominal) {
    const base = unNominal || 230;
    // Realistic variation: ±2% from nominal, slight asymmetry
    const offset = gaussian() * 2; // common mode
    return [
        parseFloat((base + offset + gaussian() * 1.2).toFixed(2)),
        parseFloat((base + offset + gaussian() * 1.2).toFixed(2)),
        parseFloat((base + offset + gaussian() * 1.2).toFixed(2))
    ];
}

// ─ Run full physics simulation ─
simulateIvBtn.addEventListener('click', () => {
    if (!moduleParams) {
        setSimStatus('❌ Najpierw uzupełnij parametry modułu PV w zakładce "Moduł PV / AI"', 'err');
        return;
    }

    const irradiance  = parseFloat(document.getElementById('sim-irradiance').value) || 950;
    const tempModule  = parseFloat(document.getElementById('sim-temp').value) || 40;
    const mpptCount   = parseInt(mpptInput.value) || 1;
    const Un          = parseFloat(unInput.value) || 230;

    // Fill MPPT cells
    const mpptCells = document.querySelectorAll('.mppt-row-cell');
    mpptCells.forEach(cell => {
        const inputs = cell.querySelectorAll('input');
        const result = simulateOneMPPT(moduleParams, irradiance, tempModule);
        if (inputs[0]) inputs[0].value = result.V;
        if (inputs[1]) inputs[1].value = result.I;
        // Flash green
        cell.querySelectorAll('input').forEach(inp => {
            inp.style.borderColor = '#10b981';
            setTimeout(() => { inp.style.borderColor = ''; }, 900);
        });
    });

    // Fill AC voltages
    const acInputs = document.querySelectorAll('.ac-three-grid input');
    const acVols = simulateACVoltages(Un);
    acInputs.forEach((inp, idx) => {
        inp.value = acVols[idx] || acVols[0];
        inp.style.borderColor = '#10b981';
        setTimeout(() => { inp.style.borderColor = ''; }, 900);
    });

    // Serial number
    const serialInput = document.querySelector('.serial-input');
    if (serialInput && !serialInput.value) serialInput.value = randomStr(12);

    setSimStatus(`✅ Symulacja zakończona — ${moduleParams.manufacturer || ''} ${moduleParams.model || ''} @ ${irradiance} W/m², ${tempModule}°C`, 'ok');

    // Switch to DC Params tab to show results
    setTimeout(() => {
        tabButtons.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));
        document.querySelector('[data-tab="dc-params"]').classList.add('active');
        document.getElementById('dc-params').classList.add('active');
        activeTabTitle.innerText = 'Parametry DC';
    }, 700);
});

// ─ Generator DC/AC (fallback — random, no module params) ─
function randomStr(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let res = '';
    for(let i=0; i<len; i++) res += chars.charAt(Math.floor(Math.random()*chars.length));
    return res;
}

genDcParamsBtn.addEventListener('click', () => {
    if (moduleParams) {
        // Delegate to physics simulation
        simulateIvBtn.click();
        return;
    }

    // Fallback: simple random
    document.querySelectorAll('.mppt-row-cell').forEach(cell => {
        const inputs = cell.querySelectorAll('input');
        if (inputs[0]) inputs[0].value = (Math.random() * 400 + 300).toFixed(0);
        if (inputs[1]) inputs[1].value = (Math.random() * 5 + 9).toFixed(1);
    });

    document.querySelectorAll('.ac-three-grid input').forEach(inp => {
        inp.value = (Math.random() * 26 + 223).toFixed(0);
    });

    const serialInput = document.querySelector('.serial-input');
    if (serialInput) serialInput.value = randomStr(12);

    genDcParamsBtn.style.background = '#10b981';
    setTimeout(() => { genDcParamsBtn.style.background = ''; }, 600);
});

// ═══════════════════════════════════════════
// PDF DROP ZONE
// ═══════════════════════════════════════════
pdfDropZone.addEventListener('click', () => pdfFileInput.click());

pdfDropZone.addEventListener('dragover', e => {
    e.preventDefault();
    pdfDropZone.classList.add('drag-over');
});

pdfDropZone.addEventListener('dragleave', () => pdfDropZone.classList.remove('drag-over'));

pdfDropZone.addEventListener('drop', e => {
    e.preventDefault();
    pdfDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.pdf')) {
        handlePdfFile(file);
    }
});

pdfFileInput.addEventListener('change', () => {
    if (pdfFileInput.files[0]) handlePdfFile(pdfFileInput.files[0]);
});

function handlePdfFile(file) {
    selectedPdfPath = file.path;
    pdfDropZone.querySelector('.pdf-drop-text').textContent = `📄 ${file.name}`;
    pdfDropZone.classList.add('pdf-loaded');
    extractPdfBtn.disabled = false;
    setAiStatus(`✅ Wczytano plik: ${file.name}`, 'ok');
}

// ═══════════════════════════════════════════
// API KEY MANAGEMENT
// ═══════════════════════════════════════════
toggleKeyBtn.addEventListener('click', () => {
    openaiKeyInput.type = openaiKeyInput.type === 'password' ? 'text' : 'password';
    toggleKeyBtn.textContent = openaiKeyInput.type === 'password' ? '👁' : '🙈';
});

saveKeyBtn.addEventListener('click', () => {
    const key = openaiKeyInput.value.trim();
    if (!key.startsWith('AIza')) {
        keyStatus.textContent = '❌ Nieprawidłowy klucz';
        keyStatus.style.color = 'var(--danger)';
        return;
    }
    localStorage.setItem('gemini_api_key', key);
    keyStatus.textContent = '✅ Klucz zapisany';
    keyStatus.style.color = 'var(--accent)';
});

// ═══════════════════════════════════════════
const { ipcRenderer, clipboard } = require('electron');

// PDF TEXT EXTRACTION + AI PARAMETER PARSING
// ═══════════════════════════════════════════
extractPdfBtn.addEventListener('click', async () => {
    // Priority: hardcoded key (GEMINI_API_KEY) unless it is a placeholder
    let apiKey = GEMINI_API_KEY;
    
    // If user has a custom key in localStorage that is different, we can keep it, 
    // but the error "expired" suggests we need to force the new one.
    // Forcing the hardcoded key as requested:
    localStorage.setItem('gemini_api_key', GEMINI_API_KEY);
    
    if (!apiKey || !apiKey.startsWith('AIza')) {
        setAiStatus('❌ Wprowadź i zapisz klucz Gemini API', 'err');
        return;
    }
    if (!selectedPdfPath) {
        setAiStatus('❌ Najpierw wczytaj plik PDF', 'err');
        return;
    }

    extractPdfBtn.disabled = true;
    setAiStatus('⏳ Czytam plik PDF…', 'loading');

    try {
        // Extract text via Main Process to avoid worker error in Electron Renderer
        const rawText = await ipcRenderer.invoke('extract-pdf-text', selectedPdfPath);

        if (!rawText || rawText.length < 50) {
            setAiStatus('❌ Nie udało się odczytać tekstu z PDF. Plik może być zeskanowany.', 'err');
            extractPdfBtn.disabled = false;
            return;
        }

        setAiStatus('⏳ Wysyłam do Gemini…', 'loading');

        const extracted = await extractParamsViaGemini(rawText, apiKey);
        fillModuleParams(extracted);
        moduleParams = extracted;
        updateInstalledPower();
        setAiStatus(`✅ Parametry wyodrębnione: ${extracted.manufacturer || ''} ${extracted.model || ''} ${extracted.pmax || '—'} Wp`, 'ok');

    } catch (err) {
        console.error(err);
        setAiStatus(`❌ Błąd: ${err.message}`, 'err');
    }

    extractPdfBtn.disabled = false;
});

async function extractParamsViaGemini(text, apiKey) {
    const prompt = `Jesteś ekspertem od fotowoltaiki. Wyodrębnij parametry elektryczne modułu PV z poniższej karty katalogowej. Zwróć WYŁĄCZNIE poprawny JSON, bez żadnego dodatkowego tekstu, komentarzy ani markdown.

Format JSON (wszystkie wartości numeryczne jako liczby, nie stringi):
{
  "manufacturer": "string — producent",
  "model": "string — model/oznaczenie",
  "pmax": number (moc szczytowa Wp),
  "vmp": number (napięcie przy Pmax, V),
  "imp": number (prąd przy Pmax, A),
  "voc": number (napięcie obwodu otwartego, V),
  "isc": number (prąd zwarcia, A),
  "beta": number (temp. wsp. Voc, %/°C, wartość ujemna np. -0.25),
  "alpha": number (temp. wsp. Isc, %/°C, wartość dodatnia np. 0.045)
}

Karta katalogowa:
${text.substring(0, 15000)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    let content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Zapobieganie błędom: usuwanie markdown ```json ... ``` jeśli AI je dodało
    content = content.replace(/```json\n?|```/g, '').trim();
    
    try {
        return JSON.parse(content);
    } catch (e) {
        console.error('JSON Parse Error. Raw content:', content);
        throw new Error('AI zwróciło nieprawidłowy format danych. Spróbuj ponownie.');
    }
}

function fillModuleParams(params) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined && val !== null) el.value = val;
    };
    set('mod-manufacturer', params.manufacturer);
    set('mod-model',        params.model);
    set('mod-pmax',         params.pmax);
    set('mod-vmp',          params.vmp);
    set('mod-imp',          params.imp);
    set('mod-voc',          params.voc);
    set('mod-isc',          params.isc);
    set('mod-beta',         params.beta);
    set('mod-alpha',        params.alpha);
}

// Read module params from form inputs
function readModuleParamsFromForm() {
    const g = id => parseFloat(document.getElementById(id).value);
    const s = id => document.getElementById(id).value;
    const p = {
        manufacturer: s('mod-manufacturer'),
        model:        s('mod-model'),
        pmax:         g('mod-pmax'),
        vmp:          g('mod-vmp'),
        imp:          g('mod-imp'),
        voc:          g('mod-voc'),
        isc:          g('mod-isc'),
        beta:         g('mod-beta'),
        alpha:        g('mod-alpha'),
    };
    if (!p.vmp || !p.imp) return null;
    return p;
}

// Listen for manual changes in module params form
document.querySelectorAll('#pv-module input').forEach(inp => {
    inp.addEventListener('input', () => {
        moduleParams = readModuleParamsFromForm();
        updateInstalledPower();
    });
});

function setAiStatus(msg, type) {
    aiStatus.textContent = msg;
    aiStatus.className = `ai-status-msg ${type === 'err' ? 'ai-err' : type === 'ok' ? 'ai-ok' : 'ai-loading'}`;
}

function setSimStatus(msg, type) {
    simStatus.textContent = msg;
    simStatus.className = `ai-status-msg ${type === 'err' ? 'ai-err' : type === 'ok' ? 'ai-ok' : 'ai-loading'}`;
}

// ═══════════════════════════════════════════
// IPZ
// ═══════════════════════════════════════════
function calcRowIPZ(row) {
    const Un    = parseFloat(unInput.value) || 230;
    const In    = parseFloat(row.querySelector('.In-val').value)     || 0;
    const kFuse = parseFloat(row.querySelector('.k-fuse-val').value) || 0;
    const ia    = parseFloat((In * kFuse).toFixed(2));
    const zsMax = ia > 0 ? (Un / ia).toFixed(3) : '—';
    row.querySelector('.ia-calc').innerText     = ia || '—';
    row.querySelector('.zs-max-calc').innerText = zsMax;
    evaluateIPZRow(row, zsMax);
}

function evaluateIPZRow(row, zsMax) {
    const zsM = parseFloat(row.querySelector('.zs-m-val').value);
    const sc  = row.querySelector('.ipz-status');
    if (isNaN(zsM) || row.querySelector('.zs-m-val').value === '') {
        sc.innerText = '—'; sc.className = 'status-cell ipz-status';
    } else if (zsM <= parseFloat(zsMax)) {
        sc.innerText = 'OK ✓'; sc.className = 'status-cell ipz-status status-ok';
    } else {
        sc.innerText = 'BŁĄD ✗'; sc.className = 'status-cell ipz-status status-err';
    }
}
function recalcAllIPZ() { ipzBody.querySelectorAll('tr').forEach(row => calcRowIPZ(row)); }

const defaultCircuits = ['L1 – PE (Falownik)', 'L2 – PE (Falownik)', 'L3 – PE (Falownik)'];

function createIPZRow(circuitName = 'Obwód AC', type = 'WT', In = 16) {
    const kDefault = lookupK(In) ?? '';
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text"   class="cell-input circuit-name" value="${circuitName}"></td>
        <td><input type="text"   class="cell-input fuse-type" value="${type}" style="width:60px"></td>
        <td><input type="number" class="cell-input In-val" value="${In}" min="1" max="1250"></td>
        <td><div class="k-fuse-wrap">
            <input type="number" step="0.1" class="cell-input k-fuse-val" value="${kDefault}" style="width:60px">
            <span class="k-fuse-hint" title="Auto z tabeli PN t=0,4s">⚙</span>
        </div></td>
        <td class="ia-calc">—</td>
        <td class="zs-max-calc">—</td>
        <td><input type="number" step="0.001" class="cell-input zs-m-val" placeholder="wpisz lub generuj"></td>
        <td class="status-cell ipz-status">—</td>
    `;

    row.querySelector('.In-val').addEventListener('input', e => {
        const newVal = e.target.value;
        const kFound = lookupK(parseInt(newVal));
        ipzBody.querySelectorAll('tr').forEach(r => {
            const inInput = r.querySelector('.In-val');
            const kInput  = r.querySelector('.k-fuse-val');
            inInput.value = newVal;
            if (kFound !== null) {
                kInput.value = kFound;
                kInput.style.borderColor = '#10b981';
                setTimeout(() => { kInput.style.borderColor = ''; }, 1000);
            }
            calcRowIPZ(r);
        });
    });

    return row;
}

function initIPZTable() {
    ipzBody.innerHTML = '';
    defaultCircuits.forEach(name => { const r = createIPZRow(name,'WT',16); ipzBody.appendChild(r); });
    recalcAllIPZ();
}

genZsBtn.addEventListener('click', () => {
    ipzBody.querySelectorAll('tr').forEach(row => {
        const zsMax = parseFloat(row.querySelector('.zs-max-calc').innerText);
        if (isNaN(zsMax) || zsMax <= 0) return;
        const inp = row.querySelector('.zs-m-val');
        inp.value = (zsMax * (0.40 + Math.random() * 0.45)).toFixed(3);
        inp.style.borderColor = '#10b981';
        setTimeout(() => { inp.style.borderColor = ''; }, 1000);
        evaluateIPZRow(row, zsMax);
    });
});
addIpzRowBtn.addEventListener('click', () => {
    const row = createIPZRow('Obwód dodatkowy','WT',16); ipzBody.appendChild(row); calcRowIPZ(row);
});

// ═══════════════════════════════════════════
// Delegowany listener zmiany pól
// ═══════════════════════════════════════════
document.addEventListener('input', e => {
    const t = e.target;
    if (t === mpptInput) {
        buildProtocolTable();
        buildInsulationTable();
    }
    if (t === totalModulesIn || t === modulePowerWIn) {
        updateInstalledPower();
    }
    if (t === unInput) recalcAllIPZ();
    if (t.classList.contains('k-fuse-val') || t.classList.contains('zs-m-val')) {
        const row = t.closest('tr');
        if (row && row.closest('#ipz-body')) calcRowIPZ(row);
    }
    if (t.classList.contains('ins-val')) {
        const row = t.closest('tr'); const val = parseFloat(t.value); const sc = row.querySelector('.status-cell');
        if (isNaN(val)) { sc.innerText='—'; sc.className='status-cell'; }
        else if (val >= 1.1) { sc.innerText='OK'; sc.className='status-cell status-ok'; }
        else { sc.innerText='BŁĄD'; sc.className='status-cell status-err'; }
    }
    if (t.classList.contains('res-val')) {
        const row = t.closest('tr'); const val = parseFloat(t.value); const sc = row.querySelector('.status-cell');
        sc.innerText = val >= 1.0 ? 'OK' : 'BŁĄD';
        sc.className  = val >= 1.0 ? 'status-cell status-ok' : 'status-cell status-err';
    }
});

// ═══════════════════════════════════════════════════════════════════════
// KOPIUJ DO SCHOWKA — export Word z zagnieżdżonymi tabelami
// ═══════════════════════════════════════════════════════════════════════
const WS = {
    tbl:  'border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:10pt;mso-para-margin:0pt;margin:0;line-height:normal;',
    th:   'background:#e0e0e0;font-weight:bold;padding:7px 10px;border:1px solid #000;text-align:center;vertical-align:middle;mso-para-margin:0pt;margin:0;line-height:normal;',
    td:   'padding:7px 10px;border:1px solid #000;vertical-align:middle;font-family:Arial,sans-serif;font-size:10pt;text-align:center;mso-para-margin:0pt;margin:0;line-height:normal;',
    tdC:  'padding:7px 10px;border:1px solid #000;vertical-align:middle;font-family:Arial,sans-serif;font-size:10pt;text-align:center;mso-para-margin:0pt;margin:0;line-height:normal;',
    tdO:  'padding:7px 10px;border:1px solid #000;vertical-align:middle;font-family:Arial,sans-serif;font-size:10pt;text-align:center;font-weight:bold;mso-para-margin:0pt;margin:0;line-height:normal;',
    tdLp: 'padding:7px 10px;border:1px solid #000;vertical-align:middle;font-family:Arial,sans-serif;font-size:10pt;text-align:center;width:40px;mso-para-margin:0pt;margin:0;line-height:normal;',
    inner:'border-collapse:collapse;width:100%;mso-para-margin:0pt;margin:0;line-height:normal;',
    innerTd: 'padding:6px 8px;border:none;border-right:1px solid #000;font-family:Arial,sans-serif;font-size:10pt;text-align:center;mso-para-margin:0pt;margin:0;line-height:normal;',
    innerTdL:'padding:6px 8px;border:none;font-family:Arial,sans-serif;font-size:10pt;text-align:center;mso-para-margin:0pt;margin:0;line-height:normal;',
};

function getTakNieText(group) {
    const sel = group.querySelector('.tak-nie-opt.selected');
    if (!sel) return 'NIE / TAK';
    const selected = sel.dataset.val;
    const S = `text-decoration:line-through;mso-text-strike:single;color:#888;`;
    if (selected === 'NIE') {
        return `NIE / <span style="${S}">TAK</span>`;
    } else {
        return `<span style="${S}">NIE</span> / TAK`;
    }
}

function getOcenaText(cell) {
    const sel = cell.querySelector('.ocena-select');
    return sel ? sel.options[sel.selectedIndex].value : (cell.innerText || '');
}

function buildWordProtocolTable() {
    const mpptCount = parseInt(mpptInput.value) || 1;
    let rows = '';

    const tbl = (inner) => `<table style="${WS.inner}">${inner}</table>`;
    const td  = (content, style, extra='') =>
        `<td style="${style}" ${extra}>${content}</td>`;

    rows += `<tr>
        ${td('Lp.', WS.th + 'width:45px;')}
        ${td('Próba / sprawdzenie / pomiar', WS.th + 'width:200px;')}
        ${td('Potwierdzenie sprawdzenia / wynik pomiaru', WS.th)}
        ${td('Ocena', WS.th + 'width:80px;')}
    </tr>`;

    rows += `<tr>
        ${td('–', WS.tdC + 'color:#888;')}
        ${td('–', WS.tdC + 'color:#888;')}
        ${td('–', WS.tdC + 'color:#888;')}
        ${td('[OK/BŁĄD]', WS.tdC + 'font-size:9pt;color:#888;')}
    </tr>`;

    const row1Group = document.querySelector('#protocol-body tr:nth-child(2) .tak-nie-group');
    const row1Ocena = document.querySelector('#protocol-body tr:nth-child(2) .ocena-cell');
    rows += `<tr>
        ${td('1.', WS.tdLp)}
        ${td('Sprawdzenie polaryzacji okablowania DC,', WS.td)}
        ${td(row1Group ? getTakNieText(row1Group) : 'NIE / TAK', WS.tdC)}
        ${td(row1Ocena ? getOcenaText(row1Ocena) : 'OK', WS.tdO)}
    </tr>`;

    const mpptRows = document.querySelectorAll('#protocol-body .mppt-row-cell');
    const mpptOceny= document.querySelectorAll('#protocol-body .mppt-row-cell + .ocena-cell');

    let mpptBody = '';
    mpptRows.forEach((cell, idx) => {
        const inputs = cell.querySelectorAll('input');
        const vVal   = inputs[0]?.value || '';
        const aVal   = inputs[1]?.value || '';
        const ocena  = mpptOceny[idx] ? getOcenaText(mpptOceny[idx]) : 'OK';
        const n = idx + 1;

        const innerTable = tbl(`<tr>
            <td style="${WS.innerTd}width:50%;border-right:1px solid #000;">MPPT ${n} – ${vVal} [V]</td>
            <td style="${WS.innerTdL}width:50%;">MPPT ${n} – ${aVal} [A]</td>
        </tr>`);

        const lpCell = idx === 0
            ? `<td style="${WS.tdLp}" rowspan="${mpptCount}">2.</td>
               <td style="${WS.td}width:200px;" rowspan="${mpptCount}">Pomiar napięć w obwodach DC / Pomiar prądów w obwodach DC</td>`
            : '';

        mpptBody += `<tr>${lpCell}<td style="${WS.td}padding:0;">${innerTable}</td>
            <td style="${WS.tdO}">${ocena}</td></tr>`;
    });
    rows += mpptBody;

    const acInputs = document.querySelectorAll('#protocol-body .ac-three-grid input');
    const acOcena  = document.querySelector('#protocol-body .ac-three-grid')?.closest('tr')?.querySelector('.ocena-cell');
    const l1 = acInputs[0]?.value || '';
    const l2 = acInputs[1]?.value || '';
    const l3 = acInputs[2]?.value || '';

    const acInner = tbl(`<tr>
        <td style="${WS.innerTd}width:33.3%;border-right:1px solid #000;">L1: ${l1} [V]</td>
        <td style="${WS.innerTd}width:33.3%;border-right:1px solid #000;">L2: ${l2} [V]</td>
        <td style="${WS.innerTdL}width:33.4%;">L3: ${l3} [V]</td>
    </tr>`);

    rows += `<tr>
        ${td('3.', WS.tdLp)}
        ${td('Pomiar napięć w obwodach AC', WS.td)}
        <td style="${WS.td}padding:0;">${acInner}</td>
        ${td(acOcena ? getOcenaText(acOcena) : 'OK', WS.tdO)}
    </tr>`;

    const allRows = document.querySelectorAll('#protocol-body tr');
    let row4aEl, row4bEl;
    allRows.forEach(r => {
        if (r.querySelector('.desc-cell') && r.querySelector('.desc-cell').textContent.includes('konfiguracji')) {
            row4aEl = r;
            row4bEl = r.nextElementSibling;
        }
    });
    const werTN = row4aEl?.querySelector('.tak-nie-group');
    const werOcena = row4aEl?.querySelector('.ocena-cell');
    const werSerial = row4bEl?.querySelector('input[type="text"]');

    rows += `<tr>
        <td style="${WS.tdLp}" rowspan="2">4.</td>
        <td style="${WS.td}width:200px;" rowspan="2">Weryfikacja konfiguracji falownika,</td>
        ${td(werTN ? getTakNieText(werTN) : 'NIE / TAK', WS.tdC + 'border-bottom:none;')}
        <td style="${WS.tdO}" rowspan="2">${werOcena ? getOcenaText(werOcena) : 'OK'}</td>
    </tr>
    <tr>
        ${td(`NR seryjny: ${werSerial?.value || ''}`, WS.tdC + 'border-top:1px solid #000;')}
    </tr>`;

    let row5El;
    allRows.forEach(r => {
        if (r.querySelector('.desc-cell') && r.querySelector('.desc-cell').textContent.includes('wyrównawcz')) row5El = r;
    });
    const pol5TN = row5El?.querySelector('.tak-nie-group');
    const pol5Ocena = row5El?.querySelector('.ocena-cell');

    rows += `<tr>
        ${td('5.', WS.tdLp)}
        ${td('Sprawdzenie ciągłości połączeń wyrównawczych', WS.td)}
        ${td(pol5TN ? getTakNieText(pol5TN) : 'NIE / TAK', WS.tdC)}
        ${td(pol5Ocena ? getOcenaText(pol5Ocena) : 'OK', WS.tdO)}
    </tr>`;

    return `<table border="1" cellpadding="0" cellspacing="0" style="${WS.tbl}">${rows}</table>`;
}

function buildWordGenericTable(table) {
    const clone = table.cloneNode(true);
    clone.querySelectorAll('input').forEach(inp => {
        const s = document.createElement('span'); s.innerText = inp.value||''; inp.parentNode.replaceChild(s,inp);
    });
    clone.querySelectorAll('.ocena-select, select').forEach(sel => {
        const s = document.createElement('span'); s.innerText = sel.options[sel.selectedIndex].text; sel.parentNode.replaceChild(s,sel);
    });
    clone.querySelectorAll('.del-row-btn,.k-fuse-hint').forEach(b => b.remove());
    clone.querySelectorAll('th').forEach(th => th.setAttribute('style', WS.th));
    clone.querySelectorAll('td').forEach(td => {
        const isOcena = td.classList.contains('ipz-status');
        td.setAttribute('style', isOcena ? WS.tdO : WS.td);
    });
    return `<table border="1" cellpadding="0" cellspacing="0" style="${WS.tbl}">${clone.innerHTML}</table>`;
}

copyBtn.addEventListener('click', () => {
    const activePanel = document.querySelector('.tab-panel.active');
    const activeTabId = activePanel.id;

    let html;
    if (activeTabId === 'dc-params') {
        html = buildWordProtocolTable();
    } else {
        const table = activePanel.querySelector('table');
        if (!table) return;
        html = buildWordGenericTable(table);
    }

    const wordDoc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:w="urn:schemas-microsoft-com:office:word"
        xmlns="http://www.w3.org/TR/REC-html40">
    <head>
        <meta charset="utf-8">
        <style>
            @font-face { font-family: Arial; }
            body { font-family: Arial, sans-serif; font-size: 10pt; }
            td, th { mso-para-margin: 0pt; margin: 0; padding: 7px 10px; line-height: normal; }
            del, s, .struck { text-decoration: line-through; mso-text-strike: single; }
        </style>
    </head>
    <body>${html}</body></html>`;

    clipboard.writeHTML(wordDoc);

    const orig = copyBtn.innerText;
    copyBtn.innerText = '✅ Skopiowano!';
    copyBtn.style.background = '#2563eb';
    setTimeout(() => { copyBtn.innerText = orig; copyBtn.style.background = ''; }, 2000);
});

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
buildProtocolTable();
buildInsulationTable();
initIPZTable();
updateInstalledPower();
