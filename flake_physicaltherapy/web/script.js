/* globals fetch */
let configData = {};
let selectedLocation = null;
let isMaximized = false;
let originalRect = null;

/* ---- NUI open/close bridge ---- */
window.addEventListener('message', function (event) {
    const data = event.data;
    if (data.action === 'open') {
        configData = JSON.parse(JSON.stringify(data.config || {}));
        document.getElementById('app').style.display = 'flex';
        populateGeneral(configData);
        renderLocationList();
        selectTab('general');
    } else if (data.action === 'close') {
        closeUI();
    }
});

function closeUI() {
    document.getElementById('app').style.display = 'none';
    fetch(`https://${GetParentResourceName()}/closeUI`, { method: 'POST', body: '{}' });
}

/* ---- Traffic lights ---- */
document.getElementById('closeBtn').addEventListener('click', closeUI);
document.getElementById('minimizeBtn').addEventListener('click', () => {
    document.getElementById('app').classList.toggle('minimized');
});
document.getElementById('maximizeBtn').addEventListener('click', () => {
    const w = document.getElementById('app');
    const icon = document.querySelector('#maximizeBtn i');
    if (isMaximized) {
        // restore
        w.classList.remove('maximized');
        if (originalRect) {
            w.style.left = originalRect.left;
            w.style.top = originalRect.top;
            w.style.transform = originalRect.transform;
        }
        icon.className = 'fa-solid fa-expand';
        isMaximized = false;
    } else {
        // maximize
        originalRect = {
            left: w.style.left,
            top: w.style.top,
            transform: w.style.transform
        };
        w.classList.add('maximized');
        icon.className = 'fa-solid fa-compress';
        isMaximized = true;
    }
});

/* ---- Dragging (RAF-throttled) ---- */
const titleBar = document.getElementById('titleBar');
const app = document.getElementById('app');
let dragging = false;
let dragOffset = { x: 0, y: 0 };
let dragRaf = null, nextDragX = 0, nextDragY = 0;

titleBar.addEventListener('mousedown', (e) => {
    if (e.target.closest('.light')) return;
    if (isMaximized || app.classList.contains('minimized')) return;
    dragging = true;
    const rect = app.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    app.style.transform = 'none';
});

window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    nextDragX = e.clientX - dragOffset.x;
    nextDragY = e.clientY - dragOffset.y;
    if (!dragRaf) {
        dragRaf = requestAnimationFrame(() => {
            app.style.left = nextDragX + 'px';
            app.style.top = nextDragY + 'px';
            dragRaf = null;
        });
    }
});

window.addEventListener('mouseup', () => {
    if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = null; }
    dragging = false;
});

/* ---- Tabs ---- */
const tabButtons = document.querySelectorAll('.tab-btn');
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        selectTab(btn.dataset.tab);
    });
});

function selectTab(tab) {
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
}

/* ---- General Settings ---- */
function populateGeneral(cfg) {
    setToggle('debug', !!cfg.Debug);
    document.getElementById('distance').value = cfg.Distance ?? 2.0;
    const sysContainer = document.getElementById('system-select');
    sysContainer.innerHTML = '';
    sysContainer.appendChild(mkCustomSelect('system', [
        { value: 'textui',    text: 'textui' },
        { value: 'ox_target', text: 'ox_target' },
        { value: 'qb-target', text: 'qb-target' },
    ], cfg.System ?? 'textui'));
    setToggle('cooldownEnable', !!(cfg.Cooldown && cfg.Cooldown.enable));
    document.getElementById('cooldownTime').value = (cfg.Cooldown && cfg.Cooldown.time) ?? 600;
    setToggle('slipEnable', !!(cfg.DoctorSlipItem && cfg.DoctorSlipItem.enable));
    document.getElementById('slipItem').value = (cfg.DoctorSlipItem && cfg.DoctorSlipItem.item) || '';
    document.getElementById('emsCount').value = cfg.EMSCount ?? 0;
    document.getElementById('emsJobs').value = (cfg.EMSJobs || []).join(', ');
}

function setToggle(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
}

function readGeneral(cfg) {
    cfg.Debug = document.getElementById('debug').checked;
    cfg.Distance = parseFloat(document.getElementById('distance').value) || 2.0;
    cfg.System = getSelectValue('system');
    cfg.Cooldown = {
        enable: document.getElementById('cooldownEnable').checked,
        time: parseInt(document.getElementById('cooldownTime').value) || 600
    };
    cfg.DoctorSlipItem = {
        enable: document.getElementById('slipEnable').checked,
        item: document.getElementById('slipItem').value.trim()
    };
    cfg.EMSCount = parseInt(document.getElementById('emsCount').value) || 0;
    const jobs = document.getElementById('emsJobs').value.split(',').map(s => s.trim()).filter(Boolean);
    cfg.EMSJobs = jobs;
    return cfg;
}

/* ---- Locations list ---- */
const locList = document.getElementById('locationList');
function renderLocationList() {
    locList.innerHTML = '';
    const locs = configData.TherapyLocations || {};
    for (const [name, data] of Object.entries(locs)) {
        const li = document.createElement('li');
        li.className = 'loc-item' + (selectedLocation === name ? ' active' : '');

        const nameSpan = document.createElement('span');
        nameSpan.textContent = name;

        const actions = document.createElement('div');
        actions.className = 'loc-actions';

        const teleportBtn = document.createElement('i');
        teleportBtn.className = 'fa-solid fa-location-arrow loc-teleport';
        teleportBtn.title = 'Teleport to';
        teleportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const coords = data?.ped?.coords || data?.coords;
            if (coords) {
                fetch(`https://${GetParentResourceName()}/teleportToLocation`, {
                    method: 'POST', body: JSON.stringify({ coords })
                });
            }
        });

        const deleteBtn = document.createElement('i');
        deleteBtn.className = 'fa-solid fa-trash-can loc-delete';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            delete configData.TherapyLocations[name];
            if (selectedLocation === name) {
                selectedLocation = null;
                document.getElementById('locationEditor').innerHTML = '<div class="editor-placeholder">Select a location to edit</div>';
            }
            renderLocationList();
        });

        actions.appendChild(teleportBtn);
        actions.appendChild(deleteBtn);
        li.appendChild(nameSpan);
        li.appendChild(actions);

        li.addEventListener('click', () => {
            selectedLocation = name;
            renderLocationList();
            renderLocationEditor(name, data);
        });
        locList.appendChild(li);
    }
}

document.getElementById('addLocationBtn').addEventListener('click', () => {
    showNameModal('New Location Name', '', (name) => {
        if (!name) return;
        if (configData.TherapyLocations && configData.TherapyLocations[name]) {
            showToast('Location already exists', 'error');
            return;
        }
        if (!configData.TherapyLocations) configData.TherapyLocations = {};
        configData.TherapyLocations[name] = {
            coords: { x: 0, y: 0, z: 0, w: 0 },
            cost: 500,
            showBlip: true,
            ped: { model: 's_m_m_doctor_01', coords: { x: 0, y: 0, z: 0, w: 0 } },
            steps: [
                { coords: { x: 0, y: 0, z: 0, w: 0 }, progress: { duration: 20000, label: 'Step 1', canCancel: false, disable: { move: true, combat: true }, anim: { dict: '', clip: '', flag: 7 } } },
                { coords: { x: 0, y: 0, z: 0, w: 0 }, progress: { duration: 20000, label: 'Step 2', canCancel: false, disable: { move: true, combat: true }, anim: { dict: '', clip: '', flag: 7 } } },
                { coords: { x: 0, y: 0, z: 0, w: 0 }, progress: { duration: 20000, label: 'Step 3', canCancel: false, disable: { move: true, combat: true }, anim: { dict: '', clip: '', flag: 7 } } }
            ]
        };
        selectedLocation = name;
        renderLocationList();
        renderLocationEditor(name, configData.TherapyLocations[name]);
        selectTab('locations');
    });
});

/* ---- Location Editor ---- */
function renderLocationEditor(name, data) {
    const editor = document.getElementById('locationEditor');
    editor.innerHTML = '';

    const form = document.createElement('div');
    form.className = 'editor-form';

    // Name
    const nameRow = mkRow([
        field('Location Name', 'text', name, { id: 'locName' })
    ]);
    form.appendChild(mkGroup('Basic Info', 'fa-solid fa-circle-info', nameRow));

    // Cost / Blip
    const metaRow = mkRow([
        fieldNum('Cost', 'locCost', data.cost),
        toggleField('Show Blip', 'locBlip', !!data.showBlip)
    ]);
    form.appendChild(mkGroup('Meta', 'fa-solid fa-sliders', metaRow));

    // Ped
    const ped = data.ped || { model: '', coords: { x: 0, y: 0, z: 0, w: 0 } };
    const pedRow1 = mkRow([
        field('Ped Model', 'text', ped.model, { id: 'pedModel' })
    ]);
    const pedCoords = ped.coords || { x: 0, y: 0, z: 0, w: 0 };
    const pedCoordField = mkCoordGroup('Coords  (x, y, z, heading)', 'pedCoords', pedCoords.x, pedCoords.y, pedCoords.z, pedCoords.w);
    form.appendChild(mkGroup('Ped & Location (Blip)', 'fa-solid fa-user-doctor', [pedRow1, mkUsePosBtn('pedCoords'), pedCoordField]));

    // Steps
    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'steps-container';
    stepsWrap.id = 'stepsWrap';
    const steps = (Array.isArray(data.steps) ? data.steps : []).map((s, i) => renderStepCard(i + 1, s));
    stepsWrap.append(...steps);

    const addStep = document.createElement('button');
    addStep.className = 'add-step-btn';
    addStep.innerHTML = '<i class="fa-solid fa-plus"></i> Add Step';
    addStep.addEventListener('click', () => {
        if (!Array.isArray(data.steps)) data.steps = [];
        const idx = data.steps.length + 1;
        const stepData = {
            coords: { x: 0, y: 0, z: 0, w: 0 },
            progress: { duration: 20000, label: 'Step ' + idx, canCancel: false, disable: { move: true, combat: true }, anim: { dict: '', clip: '', flag: 7 } }
        };
        data.steps.push(stepData);
        const card = renderStepCard(idx, stepData);
        stepsWrap.appendChild(card);
    });

    const stepsGroup = mkGroup('Therapy Steps', 'fa-solid fa-list-ol', [stepsWrap, addStep]);
    form.appendChild(stepsGroup);

    editor.appendChild(form);
}

function renderStepCard(number, step) {
    const card = document.createElement('div');
    card.className = 'step-card';
    card.dataset.stepIndex = number;

    const c = step.coords || { x: 0, y: 0, z: 0, w: 0 };
    const p = step.progress || { duration: 20000, label: 'Step ' + number, canCancel: false, disable: { move: true, combat: true }, anim: { dict: '', clip: '', flag: 7 } };
    const a = p.anim || { dict: '', clip: '', flag: 7 };
    const d = p.disable || { move: true, combat: true };

    const header = document.createElement('div');
    header.className = 'step-header';
    header.innerHTML = `<strong>Step ${number}</strong><i class="fa-solid fa-trash-can step-remove"></i>`;
    header.querySelector('.step-remove').addEventListener('click', () => {
        const loc = configData.TherapyLocations[selectedLocation];
        if (!loc || !Array.isArray(loc.steps)) return;
        const idx = parseInt(card.dataset.stepIndex) - 1;
        loc.steps.splice(idx, 1);
        renderLocationEditor(selectedLocation, loc);
    });

    const body = document.createElement('div');
    const stepCoordField = mkCoordGroup('Coords  (x, y, z, heading)', `s${number}Coords`, c.x, c.y, c.z, c.w);
    body.appendChild(mkUsePosBtn(`s${number}Coords`));
    body.appendChild(stepCoordField);
    body.appendChild(mkRow([
        fieldNum('Duration (ms)', `s${number}Dur`, p.duration),
        field('Label', 'text', p.label, { id: `s${number}Label` })
    ]));
    body.appendChild(mkRow([
        toggleField('Can Cancel', `s${number}Cancel`, !!p.canCancel),
        toggleField('Disable Move', `s${number}DisMove`, !!d.move),
        toggleField('Disable Combat', `s${number}DisCombat`, !!d.combat)
    ]));
    const animField = document.createElement('div');
    animField.className = 'field';
    const animLabel = document.createElement('label');
    animLabel.textContent = 'Animation';
    animField.appendChild(animLabel);
    animField.appendChild(mkAnimSelect(`s${number}Anim`, a.dict, a.clip));
    const animRow = document.createElement('div');
    animRow.className = 'row';
    animRow.appendChild(animField);
    body.appendChild(animRow);

    card.appendChild(header);
    card.appendChild(body);
    return card;
}

/* ---- Animation Data ---- */
const ANIMATIONS = {
    'mini@triathlon': ['idle_e','idle_f','idle_d','idle_c','idle_b','idle_a'],
    'timetable@reunited@ig_2': ['jimmy_getknocked','jimmy_base'],
    'amb@world_human_jog_standing@male@idle_a': ['idle_a','idle_b','idle_c'],
    'amb@world_human_push_ups@male@base': ['base'],
    'amb@world_human_sit_ups@male@base': ['base'],
    'amb@world_human_yoga@male@base': ['base_a','base_b','base_c'],
    'rcmepsilonism8': ['base_carrier','bag_handler_idle_a'],
    'mp_safehouse': ['lap_dance_girl','lap_dance_boy'],
    'anim@amb@nightclub@dancers@solomun_entourage@': ['mi_dance_facedj_17_v1_female^1'],
    'anim@amb@casino@mini@dance@dance_solo@female@var_a@': ['med_center'],
    'anim@amb@casino@mini@dance@dance_solo@male@var_a@': ['med_center'],
    'special_ped@mountain_dancer@monologue_3@monologue_3a': ['mnt_dnc_buttwag'],
    'special_ped@mountain_dancer@monologue_4@monologue_4a': ['mnt_dnc_verse'],
    'missfbi3_sniping': ['dance_m_default'],
    'move_clown@p_m_two_idles@': ['fidget_short_dance'],
    'move_clown@p_m_zero_idles@': ['fidget_short_dance'],
    'move_p_m_two_idles@generic': ['fidget_short_dance'],
    'anim@amb@nightclub@lazlow@hi_podium@': ['danceidle_hi_11_buttwiggle_b_laz'],
    'anim@amb@nightclub@mini@dance@dance_solo@female@var_b@': ['high_center'],
    'anim@amb@nightclub@mini@dance@dance_solo@male@var_b@': ['high_center'],
    'anim@amb@nightclub@dancers@crowddance_facedj@hi_intensity': ['hi_dance_facedj_09_v2_female^1'],
    'anim@amb@nightclub@dancers@crowddance_facedj@med_intensity': ['mi_dance_facedj_09_v1_male^1'],
    'timetable@ron@ig_3_couch': ['base'],
    'timetable@ron@ig_5_p3': ['ig_5_p3_base'],
    'timetable@reunited@ig_10': ['base_amanda'],
    'timetable@tracy@ig_14@': ['ig_14_base_tracy'],
    'anim@amb@business@bgen@bgen_no_work@': ['sit_phone_phoneputdown_idle_nowork'],
    'anim@amb@clubhouse@boardroom@crew@female@var_a@': ['base'],
    'anim@amb@clubhouse@boardroom@crew@male@var_b@': ['base'],
    'anim@amb@office@boss@female@': ['base'],
    'anim@amb@office@boss@male@': ['base'],
    'anim@heists@prison_heiststation@cop_reactions': ['cop_a_idle','cop_b_idle','cop_c_idle','cop_d_idle','cop_e_idle'],
    'amb@code_human_police_investigate@idle_a': ['idle_a','idle_b','idle_c'],
    'amb@code_human_police_crowd_control@idle_a': ['idle_a','idle_b','idle_c'],
    'amb@code_human_police_crowd_control@idle_b': ['idle_d','idle_e','idle_f'],
    'amb@code_human_wander_idles_cop@female@static': ['static'],
    'amb@code_human_wander_idles_cop@male@static': ['static'],
};

/* ---- Custom Select ---- */
document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
});

function mkCustomSelect(id, options, currentValue) {
    const wrap = document.createElement('div');
    wrap.className = 'custom-select';
    wrap.dataset.selectId = id;
    wrap.dataset.value = currentValue || '';

    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    const label = document.createElement('span');
    label.className = 'cs-label';
    const chevron = document.createElement('i');
    chevron.className = 'fa-solid fa-chevron-down cs-chevron';
    trigger.appendChild(label);
    trigger.appendChild(chevron);

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';

    function findLabel(val) {
        for (const opt of options) {
            if (opt.value === val) return opt.text;
        }
        return val || '— Select —';
    }

    function select(val) {
        wrap.dataset.value = val;
        label.textContent = findLabel(val);
        dropdown.querySelectorAll('.cs-opt').forEach(o => o.classList.toggle('active', o.dataset.value === val));
        wrap.classList.remove('open');
    }

    for (const opt of options) {
        const el = document.createElement('div');
        el.className = 'cs-opt' + (opt.value === currentValue ? ' active' : '');
        el.dataset.value = opt.value;
        el.textContent = opt.text;
        el.addEventListener('click', e => { e.stopPropagation(); select(opt.value); });
        dropdown.appendChild(el);
    }

    label.textContent = findLabel(currentValue);

    trigger.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = wrap.classList.contains('open');
        document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
        if (!isOpen) wrap.classList.add('open');
    });

    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);
    return wrap;
}

function getSelectValue(id) {
    const el = document.querySelector(`.custom-select[data-select-id="${id}"]`);
    return el ? el.dataset.value : '';
}

function mkAnimSelect(id, dictValue, clipValue) {
    const currentValue = (dictValue && clipValue) ? `${dictValue}|${clipValue}` : '';
    const wrap = document.createElement('div');
    wrap.className = 'custom-select';
    wrap.dataset.selectId = id;
    wrap.dataset.value = currentValue;

    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    const label = document.createElement('span');
    label.className = 'cs-label';
    label.textContent = currentValue ? `${dictValue} › ${clipValue}` : '— Select Animation —';
    const chevron = document.createElement('i');
    chevron.className = 'fa-solid fa-chevron-down cs-chevron';
    trigger.appendChild(label);
    trigger.appendChild(chevron);

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-select-dropdown';

    function select(val, dictName, clipName) {
        wrap.dataset.value = val;
        label.textContent = val ? `${dictName} › ${clipName}` : '— Select Animation —';
        dropdown.querySelectorAll('.cs-opt').forEach(o => o.classList.toggle('active', o.dataset.value === val));
        wrap.classList.remove('open');
    }

    for (const [dict, clips] of Object.entries(ANIMATIONS)) {
        const grp = document.createElement('div');
        grp.className = 'cs-group-label';
        grp.textContent = dict;
        dropdown.appendChild(grp);
        for (const clip of clips) {
            const val = `${dict}|${clip}`;
            const el = document.createElement('div');
            el.className = 'cs-opt' + (val === currentValue ? ' active' : '');
            el.dataset.value = val;
            el.textContent = clip;
            el.addEventListener('click', e => { e.stopPropagation(); select(val, dict, clip); });
            dropdown.appendChild(el);
        }
    }

    trigger.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = wrap.classList.contains('open');
        document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
        if (!isOpen) wrap.classList.add('open');
    });

    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);
    return wrap;
}

/* ---- Helpers ---- */
function mkGroup(title, iconClass, content) {
    const g = document.createElement('div');
    g.className = 'editor-group';
    const h4 = document.createElement('h4');
    h4.innerHTML = `<i class="${iconClass}"></i> ${escapeHtml(title)}`;
    g.appendChild(h4);
    if (Array.isArray(content)) {
        content.forEach(el => g.appendChild(el));
    } else {
        g.appendChild(content);
    }
    return g;
}

function mkRow(fields) {
    const row = document.createElement('div');
    row.className = 'row';
    fields.forEach(f => row.appendChild(buildNode(f)));
    return row;
}

function field(label, type, value, opts = {}) {
    const id = opts.id || ('fld_' + Math.random().toString(36).slice(2));
    return {
        tag: 'div', cls: 'field', children: [
            { tag: 'label', text: label },
            { tag: 'input', attrs: { type, value: value ?? '', id } }
        ]
    };
}

function fieldNum(label, id, value) {
    return {
        tag: 'div', cls: 'field', children: [
            { tag: 'label', text: label },
            { tag: 'input', attrs: { type: 'number', step: 'any', value: value ?? 0, id } }
        ]
    };
}

function toggleField(label, id, checked) {
    return {
        tag: 'div', cls: 'field', children: [
            { tag: 'label', text: label },
            { tag: 'div', cls: 'toggle-wrap', children: [
                { tag: 'input', attrs: { type: 'checkbox', id, checked: !!checked } },
                { tag: 'span', cls: 'toggle-track' },
                { tag: 'span', cls: 'toggle-label', text: checked ? 'On' : 'Off' }
            ]}
        ]
    };
}

function buildNode(spec) {
    if (spec.nodeType === 1) return spec;
    const el = document.createElement(spec.tag);
    if (spec.cls) el.className = spec.cls;
    if (spec.attrs) {
        for (const [k, v] of Object.entries(spec.attrs)) {
            if (k === 'checked') { el.checked = !!v; } else if (k === 'value') { el.value = v; } else { el.setAttribute(k, v); }
        }
    }
    if (spec.text) el.textContent = spec.text;
    if (spec.children) spec.children.forEach(c => el.appendChild(buildNode(c)));
    return el;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* ---- Combined vec4 coord field ---- */
function mkCoordGroup(labelText, id, x, y, z, w) {
    const wrap = document.createElement('div');
    wrap.className = 'coord-field';
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    const inp = document.createElement('input');
    inp.className = 'coord-input';
    inp.id = id;
    inp.type = 'text';
    inp.placeholder = 'x, y, z, heading';
    inp.value = [x, y, z, w].map(v => parseFloat(v || 0).toFixed(4)).join(', ');
    wrap.appendChild(inp);
    return wrap;
}

function parseCoordField(id) {
    const el = document.getElementById(id);
    if (!el) return { x: 0, y: 0, z: 0, w: 0 };
    const parts = el.value.split(',').map(s => parseFloat(s.trim()) || 0);
    return { x: parts[0] ?? 0, y: parts[1] ?? 0, z: parts[2] ?? 0, w: parts[3] ?? 0 };
}

function mkUsePosBtn(coordId) {
    const btn = document.createElement('button');
    btn.className = 'use-pos-btn';
    btn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Use My Position & Heading';
    btn.addEventListener('click', async () => {
        try {
            const res = await fetch(`https://${GetParentResourceName()}/getPosition`, { method: 'POST', body: '{}' });
            const pos = await res.json();
            const el = document.getElementById(coordId);
            if (el) el.value = [pos.x, pos.y, pos.z, pos.w].map(v => parseFloat(v || 0).toFixed(4)).join(', ');
        } catch (e) { console.error('getPosition failed', e); }
    });
    return btn;
}

/* ---- Read location data from DOM ---- */
function readLocationData() {
    if (!selectedLocation) return;
    const loc = configData.TherapyLocations[selectedLocation];
    if (!loc) return;

    const newName = document.getElementById('locName')?.value.trim() || selectedLocation;
    const pedC = parseCoordField('pedCoords');
    loc.coords = { ...pedC };
    loc.cost = floatVal('locCost');
    loc.showBlip = !!document.getElementById('locBlip')?.checked;
    loc.ped = {
        model: document.getElementById('pedModel')?.value || 's_m_m_doctor_01',
        coords: parseCoordField('pedCoords')
    };

    const stepCards = document.querySelectorAll('#stepsWrap .step-card');
    loc.steps = [];
    stepCards.forEach(card => {
        const idx = parseInt(card.dataset.stepIndex);
        loc.steps.push({
            coords: parseCoordField(`s${idx}Coords`),
            progress: {
                duration: intVal(`s${idx}Dur`),
                label: document.getElementById(`s${idx}Label`)?.value || 'Step',
                canCancel: !!document.getElementById(`s${idx}Cancel`)?.checked,
                disable: {
                    move: !!document.getElementById(`s${idx}DisMove`)?.checked,
                    combat: !!document.getElementById(`s${idx}DisCombat`)?.checked
                },
                anim: (() => {
                    const v = getSelectValue(`s${idx}Anim`);
                    const p = v ? v.split('|') : ['', ''];
                    return { dict: p[0] || '', clip: p[1] || '', flag: 7 };
                })()
            }
        });
    });

    if (newName !== selectedLocation) {
        configData.TherapyLocations[newName] = loc;
        delete configData.TherapyLocations[selectedLocation];
        selectedLocation = newName;
        renderLocationList();
    }
}

function floatVal(id) { const el = document.getElementById(id); return el ? parseFloat(el.value) || 0 : 0; }
function intVal(id)   { const el = document.getElementById(id); return el ? parseInt(el.value) || 0 : 0; }

/* ---- Custom modal (replaces prompt/alert — blocked in FiveM CEF) ---- */
function showNameModal(title, defaultVal, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const box = document.createElement('div');
    box.className = 'modal-box';

    const heading = document.createElement('p');
    heading.className = 'modal-title';
    heading.textContent = title;

    const input = document.createElement('input');
    input.className = 'modal-input';
    input.type = 'text';
    input.value = defaultVal || '';
    input.placeholder = 'Enter name...';

    const btns = document.createElement('div');
    btns.className = 'modal-btns';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn cancel';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'modal-btn confirm';
    confirmBtn.textContent = 'Create';

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    box.appendChild(heading);
    box.appendChild(input);
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => { overlay.classList.add('visible'); input.focus(); });

    function close() { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 150); }

    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', () => {
        const val = input.value.trim();
        close();
        if (val) onConfirm(val);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmBtn.click();
        if (e.key === 'Escape') close();
    });
}

function showToast(msg, type) {
    const t = document.createElement('div');
    t.className = 'ui-toast' + (type === 'error' ? ' error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('visible'));
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 2500);
}

/* ---- Save ---- */
document.getElementById('saveBtn').addEventListener('click', async () => {
    readLocationData();
    readGeneral(configData);
    const status = document.getElementById('statusText');
    status.textContent = 'Saving...';

    try {
        const resp = await fetch(`https://${GetParentResourceName()}/saveConfig`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ config: configData })
        });
        const json = await resp.json();
        if (json.success) {
            status.textContent = 'Saved successfully';
            status.style.color = '#28c840';
        } else {
            status.textContent = 'Save failed: ' + (json.error || 'unknown');
            status.style.color = '#ff5f57';
        }
    } catch (e) {
        status.textContent = 'Save error: ' + e.message;
        status.style.color = '#ff5f57';
    }

    setTimeout(() => {
        status.style.color = 'rgba(255,255,255,0.4)';
        status.textContent = 'Ready';
    }, 3000);
});
