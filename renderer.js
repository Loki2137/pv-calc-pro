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
    const modulesPerStr  = 10; // Placeholder
    const stringsPerMppt = 1;

    const irradFactor = irradiance / 1000;
    const deltaT = tempModule - 25;

    const VmpCorr = vmp * modulesPerStr * (1 + (beta / 100) * deltaT);
    const ImpCorr = imp * stringsPerMppt * irradFactor * (1 + (alpha / 100) * deltaT);

    const vNoise = 1 + gaussian() * 0.004;
    const iNoise = 1 + gaussian() * 0.004;

    return {
        V: Math.max(0, parseFloat((VmpCorr * vNoise).toFixed(2))),
        I: Math.max(0, parseFloat((ImpCorr * iNoise).toFixed(2)))
    };
}

function simulateACVoltages(unNominal) {
    const base = unNominal || 230;
    const offset = gaussian() * 2;
    return [
        parseFloat((base + offset + gaussian() * 1.2).toFixed(2)),
        parseFloat((base + offset + gaussian() * 1.2).toFixed(2)),
        parseFloat((base + offset + gaussian() * 1.2).toFixed(2))
    ];
}

simulateIvBtn.addEventListener('click', () => {
    if (!moduleParams) {
        setSimStatus('❌ Najpierw uzupełnij parametry modułu PV', 'err');
        return;
    }

    const irradiance  = parseFloat(document.getElementById('sim-irradiance').value) || 950;
    const tempModule  = parseFloat(document.getElementById('sim-temp').value) || 40;
    const mpptCount   = parseInt(mpptInput.value) || 1;
    const Un          = parseFloat(unInput.value) || 230;

    const mpptCells = document.querySelectorAll('.mppt-row-cell');
    mpptCells.forEach(cell => {
        const inputs = cell.querySelectorAll('input');
        const result = simulateOneMPPT(moduleParams, irradiance, tempModule);
        if (inputs[0]) inputs[0].value = result.V;
        if (inputs[1]) inputs[1].value = result.I;
        cell.querySelectorAll('input').forEach(inp => {
            inp.style.borderColor = '#10b981';
            setTimeout(() => { inp.style.borderColor = ''; }, 900);
        });
    });

    const acInputs = document.querySelectorAll('.ac-three-grid input');
    const acVols = simulateACVoltages(Un);
    acInputs.forEach((inp, idx) => {
        inp.value = acVols[idx] || acVols[0];
        inp.style.borderColor = '#10b981';
        setTimeout(() => { inp.style.borderColor = ''; }, 900);
    });

    setSimStatus(`✅ Symulacja zakończona`, 'ok');
});

function randomStr(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let res = '';
    for(let i=0; i<len; i++) res += chars.charAt(Math.floor(Math.random()*chars.length));
    return res;
}

genDcParamsBtn.addEventListener('click', () => {
    if (moduleParams) {
        simulateIvBtn.click();
        return;
    }
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
    if (!selectedPdfPath) {
        setAiStatus('❌ Najpierw wczytaj plik PDF', 'err');
        return;
    }

    let apiKey = GEMINI_API_KEY;
    localStorage.setItem('gemini_api_key', GEMINI_API_KEY);
    
    extractPdfBtn.disabled = true;
    setAiStatus('⏳ Analiza PDF...', 'loading');
    document.getElementById('variant-selection-container').style.display = 'none';

    try {
        const rawText = await ipcRenderer.invoke('extract-pdf-text', selectedPdfPath);

        if (!rawText || rawText.length < 50) {
            setAiStatus('❌ Błąd odczytu PDF.', 'err');
            return;
        }

        setAiStatus('⏳ Analiza Gemini (wiele wariantów)…', 'loading');
        const data = await extractParamsViaGemini(rawText, apiKey);
        
        if (data && data.variants && data.variants.length > 0) {
            setAiStatus('✅ Wykryto warianty mocy!', 'ok');
            showVariantSelection(data);
        } else {
            throw new Error('Nie znaleziono wariantów mocy.');
        }

    } catch (err) {
        console.error(err);
        setAiStatus(`❌ Błąd: ${err.message}`, 'err');
    } finally {
        extractPdfBtn.disabled = false;
    }
});

function showVariantSelection(data) {
    const container = document.getElementById('variant-selection-container');
    const list = document.getElementById('variant-buttons-list');
    container.style.display = 'block';
    list.innerHTML = '';

    data.variants.sort((a, b) => a.pmax - b.pmax).forEach((v, index) => {
        const btn = document.createElement('button');
        btn.className = 'variant-select-btn';
        btn.innerHTML = `
            <span class="variant-btn-pmax">${v.pmax}Wp</span>
            <span class="variant-btn-label">Wybierz</span>
        `;
        btn.onclick = () => {
            document.querySelectorAll('.variant-select-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const params = {
                manufacturer: data.manufacturer,
                model: `${data.modelFamily} (${v.pmax}W)`,
                pmax: v.pmax,
                vmp: v.vmp,
                imp: v.imp,
                voc: v.voc,
                isc: v.isc,
                beta: data.coefficients?.beta,
                alpha: data.coefficients?.alpha
            };
            fillModuleParams(params);
            moduleParams = params;
            updateInstalledPower();
        };
        list.appendChild(btn);
    });

    if (list.firstChild) list.firstChild.click();
}

async function extractParamsViaGemini(text, apiKey) {
    const prompt = `Jesteś ekspertem ds. fotowoltaiki. Przeanalizuj tekst z karty katalogowej modułu PV i wyodrębnij parametry techniczne dla WSZYSTKICH wariantów mocy (kolumn STC) znalezionych w tabeli specyfikacji.

Zwróć wynik WYŁĄCZNIE jako JSON o strukturze:
{
  "manufacturer": "Producent (np. Jinko Solar)",
  "modelFamily": "Rodzina modeli (np. JKMxxxN-60HL4)",
  "variants": [
    {
      "pmax": 470,
      "vmp": 35.69,
      "imp": 13.17,
      "voc": 43.30,
      "isc": 13.69
    }
  ],
  "coefficients": {
    "beta": -0.25,  // Wsp. temp. Voc (%/°C)
    "alpha": 0.045  // Wsp. temp. Isc (%/°C)
  }
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

    const globalPowerInput = document.getElementById('module-power-w');
    if (globalPowerInput && params.pmax) {
        globalPowerInput.value = Math.round(params.pmax);
        if (typeof updateCalculations === 'function') updateCalculations();
    }
}

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

function createIPZRow(circuitName = 'Obwód AC', type = 'WT', In = 16) {
    const kDefault = lookupK(In) ?? '';
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" class="cell-input circuit-name" value="${circuitName}"></td>
        <td><input type="text" class="cell-input fuse-type" value="${type}"></td>
        <td><input type="number" class="cell-input In-val" value="${In}"></td>
        <td><input type="number" class="cell-input k-fuse-val" value="${kDefault}"></td>
        <td class="ia-calc">—</td>
        <td class="zs-max-calc">—</td>
        <td><input type="number" class="cell-input zs-m-val"></td>
        <td class="status-cell ipz-status">—</td>
    `;
    return row;
}

initIPZTable();
function initIPZTable() {
    ipzBody.innerHTML = '';
    ['L1', 'L2', 'L3'].forEach(name => {
        ipzBody.appendChild(createIPZRow(name,'WT',16));
    });
    recalcAllIPZ();
}

genZsBtn.addEventListener('click', () => {
    ipzBody.querySelectorAll('tr').forEach(row => {
        const zsMax = parseFloat(row.querySelector('.zs-max-calc').innerText);
        if (isNaN(zsMax)) return;
        row.querySelector('.zs-m-val').value = (zsMax * 0.7).toFixed(3);
        calcRowIPZ(row);
    });
});
addIpzRowBtn.addEventListener('click', () => {
    ipzBody.appendChild(createIPZRow('Dodatkowy','WT',16));
});

document.addEventListener('input', e => {
    const t = e.target;
    if (t === mpptInput) { buildProtocolTable(); buildInsulationTable(); }
    if (t === totalModulesIn || t === modulePowerWIn) updateInstalledPower();
    if (t === unInput) recalcAllIPZ();
    if (t.classList.contains('In-val') || t.classList.contains('k-fuse-val') || t.classList.contains('zs-m-val')) {
        const row = t.closest('tr');
        if (row) calcRowIPZ(row);
    }
});
