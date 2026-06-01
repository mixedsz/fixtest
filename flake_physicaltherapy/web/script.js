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
    } else if (data.action === 'pedPlacementResult') {
        const { name, ped, steps } = data;
        if (!configData.TherapyLocations) configData.TherapyLocations = {};
        // Default animations match the Pillbox location (users can edit after)
        const defaultAnims = [
            { dict: 'mini@triathlon',          clip: 'idle_e',           label: 'Leg Stretching...' },
            { dict: 'mini@triathlon',          clip: 'idle_f',           label: 'Arm Stretching...' },
            { dict: 'timetable@reunited@ig_2', clip: 'jimmy_getknocked', label: 'Exercising...'     },
        ];
        const mkStep = (c, i) => ({
            coords: c || { x: 0, y: 0, z: 0 },
            progress: { duration: 20000, label: defaultAnims[i].label, canCancel: false, disable: { move: true, combat: true }, anim: { dict: defaultAnims[i].dict, clip: defaultAnims[i].clip, flag: 7 } }
        });
        // Place interaction marker 1.5m in front of the ped based on heading
        const headRad = ((ped.w || 0) * Math.PI) / 180;
        const interactionCoords = {
            x: ped.x + (-Math.sin(headRad)) * 1.5,
            y: ped.y + Math.cos(headRad) * 1.5,
            z: ped.z,
            w: ped.w || 0,
        };
        configData.TherapyLocations[name] = {
            coords: interactionCoords,
            cost: 500,
            showBlip: true,
            ped: { model: 's_m_m_doctor_01', coords: { ...ped } },
            steps: [mkStep(steps[0], 0), mkStep(steps[1], 1), mkStep(steps[2], 2)]
        };
        document.getElementById('app').style.display = 'flex';
        selectedLocation = name;
        renderLocationList();
        renderLocationEditor(name, configData.TherapyLocations[name]);
        selectTab('locations');
    } else if (data.action === 'pedPlacementCancelled') {
        document.getElementById('app').style.display = 'flex';
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
        teleportBtn.setAttribute('data-title', 'Teleport to');
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
        deleteBtn.setAttribute('data-title', 'Delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showConfirmModal(`Delete "${name}"?`, 'This cannot be undone.', () => {
                delete configData.TherapyLocations[name];
                if (selectedLocation === name) {
                    selectedLocation = null;
                    document.getElementById('locationEditor').innerHTML = '<div class="editor-placeholder">Select a location to edit</div>';
                }
                renderLocationList();
            });
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
        // Hide UI and enter 3D ped placement mode in-world
        document.getElementById('app').style.display = 'none';
        fetch(`https://${GetParentResourceName()}/startPedPlacement`, {
            method: 'POST',
            body: JSON.stringify({ name })
        });
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
    const blipSelector = buildBlipSelector(data.blipId ?? 0);
    blipSelector.style.display = data.showBlip ? '' : 'none';
    const metaGroup = mkGroup('Meta', 'fa-solid fa-sliders', [metaRow, blipSelector]);
    form.appendChild(metaGroup);
    metaGroup.querySelector('#locBlip').addEventListener('change', function () {
        blipSelector.style.display = this.checked ? '' : 'none';
    });

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
        fieldNum('Duration (seconds)', `s${number}Dur`, p.duration / 1000),
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

/* ---- Blip Data ---- */
// IDs from GTA V / FiveM SetBlipSprite native. Images self-filter — entries
// with no matching PNG on docs.fivem.net are hidden automatically at runtime.
const BLIPS = [
    {id:0,name:'radar_higher',ext:'gif'},
    {id:1,name:'radar_level'},
    {id:2,name:'radar_lower',ext:'gif'},
    {id:3,name:'radar_police_ped',ext:'gif'},
    {id:4,name:'radar_wanted_radius'},
    {id:5,name:'radar_area_blip'},
    {id:6,name:'radar_centre'},
    {id:7,name:'radar_north'},
    {id:8,name:'radar_waypoint'},
    {id:9,name:'radar_radius_blip'},
    {id:10,name:'radar_radius_outline_blip'},
    {id:11,name:'radar_weapon_higher',ext:'gif'},
    {id:12,name:'radar_weapon_lower',ext:'gif'},
    {id:13,name:'radar_higher_ai',ext:'gif'},
    {id:14,name:'radar_lower_ai',ext:'gif'},
    {id:15,name:'radar_police_heli_spin',ext:'gif'},
    {id:16,name:'radar_police_plane_move'},
    {id:27,name:'radar_mp_crew'},
    {id:28,name:'radar_mp_friendlies'},
    {id:36,name:'radar_cable_car'},
    {id:37,name:'radar_activities'},
    {id:38,name:'radar_raceflag'},
    {id:40,name:'radar_safehouse'},
    {id:41,name:'radar_police',ext:'gif'},
    {id:42,name:'radar_police_chase',ext:'gif'},
    {id:43,name:'radar_police_heli'},
    {id:44,name:'radar_bomb_a'},
    {id:47,name:'radar_snitch'},
    {id:48,name:'radar_planning_locations'},
    {id:50,name:'radar_crim_carsteal'},
    {id:51,name:'radar_crim_drugs'},
    {id:52,name:'radar_crim_holdups'},
    {id:54,name:'radar_crim_player'},
    {id:56,name:'radar_cop_patrol'},
    {id:57,name:'radar_cop_player'},
    {id:58,name:'radar_crim_wanted'},
    {id:59,name:'radar_heist'},
    {id:60,name:'radar_police_station'},
    {id:61,name:'radar_hospital'},
    {id:62,name:'radar_assassins_mark'},
    {id:63,name:'radar_elevator'},
    {id:64,name:'radar_helicopter'},
    {id:66,name:'radar_random_character'},
    {id:67,name:'radar_security_van'},
    {id:68,name:'radar_tow_truck'},
    {id:70,name:'radar_illegal_parking'},
    {id:71,name:'radar_barber'},
    {id:72,name:'radar_car_mod_shop'},
    {id:73,name:'radar_clothes_store'},
    {id:75,name:'radar_tattoo'},
    {id:76,name:'radar_armenian_family'},
    {id:77,name:'radar_lester_family'},
    {id:78,name:'radar_michael_family'},
    {id:79,name:'radar_trevor_family'},
    {id:80,name:'radar_jewelry_heist'},
    {id:82,name:'radar_drag_race_finish'},
    {id:84,name:'radar_rampage'},
    {id:85,name:'radar_vinewood_tours'},
    {id:86,name:'radar_lamar_family'},
    {id:88,name:'radar_franklin_family'},
    {id:89,name:'radar_chinese_strand'},
    {id:90,name:'radar_flight_school'},
    {id:91,name:'radar_eye_sky'},
    {id:92,name:'radar_air_hockey'},
    {id:93,name:'radar_bar'},
    {id:94,name:'radar_base_jump'},
    {id:95,name:'radar_basketball'},
    {id:96,name:'radar_biolab_heist'},
    {id:99,name:'radar_cabaret_club'},
    {id:100,name:'radar_car_wash'},
    {id:102,name:'radar_comedy_club'},
    {id:103,name:'radar_darts'},
    {id:104,name:'radar_docks_heist'},
    {id:105,name:'radar_fbi_heist'},
    {id:106,name:'radar_fbi_officers_strand'},
    {id:107,name:'radar_finale_bank_heist'},
    {id:108,name:'radar_financier_strand'},
    {id:109,name:'radar_golf'},
    {id:110,name:'radar_gun_shop'},
    {id:111,name:'radar_internet_cafe'},
    {id:112,name:'radar_michael_family_exile'},
    {id:113,name:'radar_nice_house_heist'},
    {id:114,name:'radar_random_female'},
    {id:115,name:'radar_random_male'},
    {id:118,name:'radar_rural_bank_heist'},
    {id:119,name:'radar_shooting_range'},
    {id:120,name:'radar_solomon_strand'},
    {id:121,name:'radar_strip_club'},
    {id:122,name:'radar_tennis'},
    {id:123,name:'radar_trevor_family_exile'},
    {id:124,name:'radar_michael_trevor_family'},
    {id:126,name:'radar_triathlon'},
    {id:127,name:'radar_off_road_racing'},
    {id:128,name:'radar_gang_cops'},
    {id:129,name:'radar_gang_mexicans'},
    {id:130,name:'radar_gang_bikers'},
    {id:133,name:'radar_snitch_red'},
    {id:134,name:'radar_crim_cuff_keys'},
    {id:135,name:'radar_cinema'},
    {id:136,name:'radar_music_venue'},
    {id:137,name:'radar_police_station_blue'},
    {id:138,name:'radar_airport'},
    {id:139,name:'radar_crim_saved_vehicle'},
    {id:140,name:'radar_weed_stash'},
    {id:141,name:'radar_hunting'},
    {id:142,name:'radar_pool'},
    {id:143,name:'radar_objective_blue'},
    {id:144,name:'radar_objective_green'},
    {id:145,name:'radar_objective_red'},
    {id:146,name:'radar_objective_yellow'},
    {id:147,name:'radar_arms_dealing'},
    {id:148,name:'radar_mp_friend'},
    {id:149,name:'radar_celebrity_theft'},
    {id:150,name:'radar_weapon_assault_rifle'},
    {id:151,name:'radar_weapon_bat'},
    {id:152,name:'radar_weapon_grenade'},
    {id:153,name:'radar_weapon_health'},
    {id:154,name:'radar_weapon_knife'},
    {id:155,name:'radar_weapon_molotov'},
    {id:156,name:'radar_weapon_pistol'},
    {id:157,name:'radar_weapon_rocket'},
    {id:158,name:'radar_weapon_shotgun'},
    {id:159,name:'radar_weapon_smg'},
    {id:160,name:'radar_weapon_sniper'},
    {id:161,name:'radar_mp_noise',ext:'gif'},
    {id:162,name:'radar_poi'},
    {id:163,name:'radar_passive'},
    {id:164,name:'radar_usingmenu'},
    {id:171,name:'radar_gang_cops_partner'},
    {id:173,name:'radar_weapon_minigun'},
    {id:175,name:'radar_weapon_armour'},
    {id:176,name:'radar_property_takeover'},
    {id:177,name:'radar_gang_mexicans_highlight'},
    {id:178,name:'radar_gang_bikers_highlight'},
    {id:179,name:'radar_triathlon_cycling'},
    {id:180,name:'radar_triathlon_swimming'},
    {id:181,name:'radar_property_takeover_bikers'},
    {id:182,name:'radar_property_takeover_cops'},
    {id:183,name:'radar_property_takeover_vagos'},
    {id:184,name:'radar_camera'},
    {id:185,name:'radar_centre_red'},
    {id:186,name:'radar_handcuff_keys_bikers'},
    {id:187,name:'radar_handcuff_keys_vagos'},
    {id:188,name:'radar_handcuffs_closed_bikers'},
    {id:189,name:'radar_handcuffs_closed_vagos'},
    {id:192,name:'radar_camera_badger'},
    {id:193,name:'radar_camera_facade'},
    {id:194,name:'radar_camera_ifruit'},
    {id:197,name:'radar_yoga'},
    {id:198,name:'radar_taxi'},
    {id:205,name:'radar_shrink'},
    {id:206,name:'radar_epsilon'},
    {id:207,name:'radar_financier_strand_grey'},
    {id:208,name:'radar_trevor_family_grey'},
    {id:209,name:'radar_trevor_family_red'},
    {id:210,name:'radar_franklin_family_grey'},
    {id:211,name:'radar_franklin_family_blue'},
    {id:212,name:'radar_franklin_a'},
    {id:213,name:'radar_franklin_b'},
    {id:214,name:'radar_franklin_c'},
    {id:225,name:'radar_gang_vehicle'},
    {id:226,name:'radar_gang_vehicle_bikers'},
    {id:227,name:'radar_gang_vehicle_cops'},
    {id:228,name:'radar_gang_vehicle_vagos'},
    {id:229,name:'radar_guncar'},
    {id:230,name:'radar_driving_bikers'},
    {id:231,name:'radar_driving_cops'},
    {id:232,name:'radar_driving_vagos'},
    {id:233,name:'radar_gang_cops_highlight'},
    {id:234,name:'radar_shield_bikers'},
    {id:235,name:'radar_shield_cops'},
    {id:236,name:'radar_shield_vagos'},
    {id:237,name:'radar_custody_bikers'},
    {id:238,name:'radar_custody_vagos'},
    {id:251,name:'radar_arms_dealing_air'},
    {id:252,name:'radar_playerstate_arrested'},
    {id:253,name:'radar_playerstate_custody'},
    {id:254,name:'radar_playerstate_driving'},
    {id:255,name:'radar_playerstate_keyholder'},
    {id:256,name:'radar_playerstate_partner'},
    {id:262,name:'radar_ztype'},
    {id:263,name:'radar_stinger'},
    {id:264,name:'radar_packer'},
    {id:265,name:'radar_monroe'},
    {id:266,name:'radar_fairground'},
    {id:267,name:'radar_property'},
    {id:268,name:'radar_gang_highlight'},
    {id:269,name:'radar_altruist'},
    {id:270,name:'radar_ai'},
    {id:271,name:'radar_on_mission'},
    {id:272,name:'radar_cash_pickup'},
    {id:273,name:'radar_chop'},
    {id:274,name:'radar_dead'},
    {id:275,name:'radar_territory_locked'},
    {id:276,name:'radar_cash_lost'},
    {id:277,name:'radar_cash_vagos'},
    {id:278,name:'radar_cash_cops'},
    {id:279,name:'radar_hooker'},
    {id:280,name:'radar_friend'},
    {id:281,name:'radar_mission_2to4'},
    {id:282,name:'radar_mission_2to8'},
    {id:283,name:'radar_mission_2to12'},
    {id:284,name:'radar_mission_2to16'},
    {id:285,name:'radar_custody_dropoff'},
    {id:286,name:'radar_onmission_cops'},
    {id:287,name:'radar_onmission_lost'},
    {id:288,name:'radar_onmission_vagos'},
    {id:289,name:'radar_crim_carsteal_cops'},
    {id:290,name:'radar_crim_carsteal_bikers'},
    {id:291,name:'radar_crim_carsteal_vagos'},
    {id:292,name:'radar_band_strand'},
    {id:293,name:'radar_simeon_family'},
    {id:294,name:'radar_mission_1'},
    {id:295,name:'radar_mission_2'},
    {id:296,name:'radar_friend_darts'},
    {id:297,name:'radar_friend_comedyclub'},
    {id:298,name:'radar_friend_cinema'},
    {id:299,name:'radar_friend_tennis'},
    {id:300,name:'radar_friend_stripclub'},
    {id:301,name:'radar_friend_livemusic'},
    {id:302,name:'radar_friend_golf'},
    {id:303,name:'radar_bounty_hit'},
    {id:304,name:'radar_ugc_mission'},
    {id:305,name:'radar_horde'},
    {id:306,name:'radar_cratedrop'},
    {id:307,name:'radar_plane_drop'},
    {id:308,name:'radar_sub'},
    {id:309,name:'radar_race'},
    {id:310,name:'radar_deathmatch'},
    {id:311,name:'radar_arm_wrestling'},
    {id:312,name:'radar_mission_1to2'},
    {id:313,name:'radar_shootingrange_gunshop'},
    {id:314,name:'radar_race_air'},
    {id:315,name:'radar_race_land'},
    {id:316,name:'radar_race_sea'},
    {id:317,name:'radar_tow'},
    {id:318,name:'radar_garbage'},
    {id:319,name:'radar_drill'},
    {id:320,name:'radar_spikes'},
    {id:321,name:'radar_firetruck'},
    {id:322,name:'radar_minigun2'},
    {id:323,name:'radar_bugstar'},
    {id:324,name:'radar_submarine'},
    {id:325,name:'radar_chinook'},
    {id:326,name:'radar_getaway_car'},
    {id:327,name:'radar_mission_bikers_1'},
    {id:328,name:'radar_mission_bikers_1to2'},
    {id:329,name:'radar_mission_bikers_2'},
    {id:330,name:'radar_mission_bikers_2to4'},
    {id:331,name:'radar_mission_bikers_2to8'},
    {id:332,name:'radar_mission_bikers_2to12'},
    {id:333,name:'radar_mission_bikers_2to16'},
    {id:334,name:'radar_mission_cops_1'},
    {id:335,name:'radar_mission_cops_1to2'},
    {id:336,name:'radar_mission_cops_2'},
    {id:337,name:'radar_mission_cops_2to4'},
    {id:338,name:'radar_mission_cops_2to8'},
    {id:339,name:'radar_mission_cops_2to12'},
    {id:340,name:'radar_mission_cops_2to16'},
    {id:341,name:'radar_mission_vagos_1'},
    {id:342,name:'radar_mission_vagos_1to2'},
    {id:343,name:'radar_mission_vagos_2'},
    {id:344,name:'radar_mission_vagos_2to4'},
    {id:345,name:'radar_mission_vagos_2to8'},
    {id:346,name:'radar_mission_vagos_2to12'},
    {id:347,name:'radar_mission_vagos_2to16'},
    {id:348,name:'radar_gang_bike'},
    {id:349,name:'radar_gas_grenade'},
    {id:350,name:'radar_property_for_sale'},
    {id:351,name:'radar_gang_attack_package'},
    {id:352,name:'radar_martin_madrazzo'},
    {id:353,name:'radar_enemy_heli_spin',ext:'gif'},
    {id:354,name:'radar_boost'},
    {id:355,name:'radar_devin'},
    {id:356,name:'radar_dock'},
    {id:357,name:'radar_garage'},
    {id:358,name:'radar_golf_flag'},
    {id:359,name:'radar_hangar'},
    {id:360,name:'radar_helipad'},
    {id:361,name:'radar_jerry_can'},
    {id:362,name:'radar_mask'},
    {id:363,name:'radar_heist_prep'},
    {id:364,name:'radar_incapacitated'},
    {id:365,name:'radar_spawn_point_pickup'},
    {id:366,name:'radar_boilersuit'},
    {id:367,name:'radar_completed'},
    {id:368,name:'radar_rockets'},
    {id:369,name:'radar_garage_for_sale'},
    {id:370,name:'radar_helipad_for_sale'},
    {id:371,name:'radar_dock_for_sale'},
    {id:372,name:'radar_hangar_for_sale'},
    {id:373,name:'radar_placeholder_6'},
    {id:374,name:'radar_business'},
    {id:375,name:'radar_business_for_sale'},
    {id:376,name:'radar_race_bike'},
    {id:377,name:'radar_parachute'},
    {id:378,name:'radar_team_deathmatch'},
    {id:379,name:'radar_race_foot'},
    {id:380,name:'radar_vehicle_deathmatch'},
    {id:381,name:'radar_barry'},
    {id:382,name:'radar_dom'},
    {id:383,name:'radar_maryann'},
    {id:384,name:'radar_cletus'},
    {id:385,name:'radar_josh'},
    {id:386,name:'radar_minute'},
    {id:387,name:'radar_omega'},
    {id:388,name:'radar_tonya'},
    {id:389,name:'radar_paparazzo'},
    {id:390,name:'radar_aim'},
    {id:391,name:'radar_cratedrop_background'},
    {id:392,name:'radar_green_and_net_player1'},
    {id:393,name:'radar_green_and_net_player2'},
    {id:394,name:'radar_green_and_net_player3'},
    {id:395,name:'radar_green_and_friendly'},
    {id:396,name:'radar_net_player1_and_net_player2'},
    {id:397,name:'radar_net_player1_and_net_player3'},
    {id:398,name:'radar_creator'},
    {id:399,name:'radar_creator_direction'},
    {id:400,name:'radar_abigail'},
    {id:401,name:'radar_blimp'},
    {id:402,name:'radar_repair'},
    {id:403,name:'radar_testosterone'},
    {id:404,name:'radar_dinghy'},
    {id:405,name:'radar_fanatic'},
    {id:407,name:'radar_info_icon'},
    {id:408,name:'radar_capture_the_flag'},
    {id:409,name:'radar_last_team_standing'},
    {id:410,name:'radar_boat'},
    {id:411,name:'radar_capture_the_flag_base'},
    {id:412,name:'radar_mp_crew'},
    {id:413,name:'radar_capture_the_flag_outline'},
    {id:414,name:'radar_capture_the_flag_base_nobag'},
    {id:415,name:'radar_weapon_jerrycan'},
    {id:416,name:'radar_rp'},
    {id:417,name:'radar_level_inside'},
    {id:418,name:'radar_bounty_hit_inside'},
    {id:419,name:'radar_capture_the_usaflag'},
    {id:420,name:'radar_capture_the_usaflag_outline'},
    {id:421,name:'radar_tank'},
    {id:422,name:'radar_player_heli',ext:'gif'},
    {id:423,name:'radar_player_plane'},
    {id:424,name:'radar_player_jet'},
    {id:425,name:'radar_centre_stroke'},
    {id:426,name:'radar_player_guncar'},
    {id:427,name:'radar_player_boat'},
    {id:428,name:'radar_mp_heist'},
    {id:429,name:'radar_temp_1'},
    {id:430,name:'radar_temp_2'},
    {id:431,name:'radar_temp_3'},
    {id:432,name:'radar_temp_4'},
    {id:433,name:'radar_temp_5'},
    {id:434,name:'radar_temp_6'},
    {id:435,name:'radar_race_stunt'},
    {id:436,name:'radar_hot_property'},
    {id:437,name:'radar_urbanwarfare_versus'},
    {id:438,name:'radar_king_of_the_castle'},
    {id:439,name:'radar_player_king'},
    {id:440,name:'radar_dead_drop'},
    {id:441,name:'radar_penned_in'},
    {id:442,name:'radar_beast'},
    {id:443,name:'radar_edge_pointer'},
    {id:444,name:'radar_edge_crosstheline'},
    {id:445,name:'radar_mp_lamar'},
    {id:446,name:'radar_bennys'},
    {id:447,name:'radar_corner_number_1'},
    {id:448,name:'radar_corner_number_2'},
    {id:449,name:'radar_corner_number_3'},
    {id:450,name:'radar_corner_number_4'},
    {id:451,name:'radar_corner_number_5'},
    {id:452,name:'radar_corner_number_6'},
    {id:453,name:'radar_corner_number_7'},
    {id:454,name:'radar_corner_number_8'},
    {id:455,name:'radar_yacht'},
    {id:456,name:'radar_finders_keepers'},
    {id:457,name:'radar_assault_package'},
    {id:458,name:'radar_hunt_the_boss'},
    {id:459,name:'radar_sightseer'},
    {id:460,name:'radar_turreted_limo'},
    {id:461,name:'radar_belly_of_the_beast'},
    {id:462,name:'radar_yacht_location'},
    {id:463,name:'radar_pickup_beast'},
    {id:464,name:'radar_pickup_zoned'},
    {id:465,name:'radar_pickup_random'},
    {id:466,name:'radar_pickup_slow_time'},
    {id:467,name:'radar_pickup_swap'},
    {id:468,name:'radar_pickup_thermal'},
    {id:469,name:'radar_pickup_weed'},
    {id:470,name:'radar_weapon_railgun'},
    {id:471,name:'radar_seashark'},
    {id:472,name:'radar_pickup_hidden'},
    {id:473,name:'radar_warehouse'},
    {id:474,name:'radar_warehouse_for_sale'},
    {id:475,name:'radar_office'},
    {id:476,name:'radar_office_for_sale'},
    {id:477,name:'radar_truck'},
    {id:478,name:'radar_contraband'},
    {id:479,name:'radar_trailer'},
    {id:480,name:'radar_vip'},
    {id:481,name:'radar_cargobob'},
    {id:482,name:'radar_area_outline_blip'},
    {id:483,name:'radar_pickup_accelerator'},
    {id:484,name:'radar_pickup_ghost'},
    {id:485,name:'radar_pickup_detonator'},
    {id:486,name:'radar_pickup_bomb'},
    {id:487,name:'radar_pickup_armoured'},
    {id:488,name:'radar_stunt'},
    {id:489,name:'radar_weapon_lives'},
    {id:490,name:'radar_stunt_premium'},
    {id:491,name:'radar_adversary'},
    {id:492,name:'radar_biker_clubhouse'},
    {id:493,name:'radar_biker_caged_in'},
    {id:494,name:'radar_biker_turf_war'},
    {id:495,name:'radar_biker_joust'},
    {id:496,name:'radar_production_weed'},
    {id:497,name:'radar_production_crack'},
    {id:498,name:'radar_production_fake_id'},
    {id:499,name:'radar_production_meth'},
    {id:500,name:'radar_production_money'},
    {id:501,name:'radar_package'},
    {id:502,name:'radar_capture_1'},
    {id:503,name:'radar_capture_2'},
    {id:504,name:'radar_capture_3'},
    {id:505,name:'radar_capture_4'},
    {id:506,name:'radar_capture_5'},
    {id:507,name:'radar_capture_6'},
    {id:508,name:'radar_capture_7'},
    {id:509,name:'radar_capture_8'},
    {id:510,name:'radar_capture_9'},
    {id:511,name:'radar_capture_10'},
    {id:512,name:'radar_quad'},
    {id:513,name:'radar_bus'},
    {id:514,name:'radar_drugs_package'},
    {id:515,name:'radar_pickup_jump'},
    {id:516,name:'radar_adversary_4'},
    {id:517,name:'radar_adversary_8'},
    {id:518,name:'radar_adversary_10'},
    {id:519,name:'radar_adversary_12'},
    {id:520,name:'radar_adversary_16'},
    {id:521,name:'radar_laptop'},
    {id:522,name:'radar_pickup_deadline'},
    {id:523,name:'radar_sports_car'},
    {id:524,name:'radar_warehouse_vehicle'},
    {id:525,name:'radar_reg_papers'},
    {id:526,name:'radar_police_station_dropoff'},
    {id:527,name:'radar_junkyard'},
    {id:528,name:'radar_ex_vech_1'},
    {id:529,name:'radar_ex_vech_2'},
    {id:530,name:'radar_ex_vech_3'},
    {id:531,name:'radar_ex_vech_4'},
    {id:532,name:'radar_ex_vech_5'},
    {id:533,name:'radar_ex_vech_6'},
    {id:534,name:'radar_ex_vech_7'},
    {id:535,name:'radar_target_a'},
    {id:536,name:'radar_target_b'},
    {id:537,name:'radar_target_c'},
    {id:538,name:'radar_target_d'},
    {id:539,name:'radar_target_e'},
    {id:540,name:'radar_target_f'},
    {id:541,name:'radar_target_g'},
    {id:542,name:'radar_target_h'},
    {id:543,name:'radar_jugg'},
    {id:544,name:'radar_pickup_repair'},
    {id:545,name:'radar_steeringwheel'},
    {id:546,name:'radar_trophy'},
    {id:547,name:'radar_pickup_rocket_boost'},
    {id:548,name:'radar_pickup_homing_rocket'},
    {id:549,name:'radar_pickup_machinegun'},
    {id:550,name:'radar_pickup_parachute'},
    {id:551,name:'radar_pickup_time_5'},
    {id:552,name:'radar_pickup_time_10'},
    {id:553,name:'radar_pickup_time_15'},
    {id:554,name:'radar_pickup_time_20'},
    {id:555,name:'radar_pickup_time_30'},
    {id:556,name:'radar_supplies'},
    {id:557,name:'radar_property_bunker'},
    {id:558,name:'radar_gr_wvm_1'},
    {id:559,name:'radar_gr_wvm_2'},
    {id:560,name:'radar_gr_wvm_3'},
    {id:561,name:'radar_gr_wvm_4'},
    {id:562,name:'radar_gr_wvm_5'},
    {id:563,name:'radar_gr_wvm_6'},
    {id:564,name:'radar_gr_covert_ops'},
    {id:565,name:'radar_adversary_bunker'},
    {id:566,name:'radar_gr_moc_upgrade'},
    {id:567,name:'radar_gr_w_upgrade'},
    {id:568,name:'radar_sm_cargo'},
    {id:569,name:'radar_sm_hangar'},
    {id:570,name:'radar_tf_checkpoint'},
    {id:571,name:'radar_race_tf'},
    {id:572,name:'radar_sm_wp1'},
    {id:573,name:'radar_sm_wp2'},
    {id:574,name:'radar_sm_wp3'},
    {id:575,name:'radar_sm_wp4'},
    {id:576,name:'radar_sm_wp5'},
    {id:577,name:'radar_sm_wp6'},
    {id:578,name:'radar_sm_wp7'},
    {id:579,name:'radar_sm_wp8'},
    {id:580,name:'radar_sm_wp9'},
    {id:581,name:'radar_sm_wp10'},
    {id:582,name:'radar_sm_wp11'},
    {id:583,name:'radar_sm_wp12'},
    {id:584,name:'radar_sm_wp13'},
    {id:585,name:'radar_sm_wp14'},
    {id:586,name:'radar_nhp_bag'},
    {id:587,name:'radar_nhp_chest'},
    {id:588,name:'radar_nhp_orbit'},
    {id:589,name:'radar_nhp_veh1'},
    {id:590,name:'radar_nhp_base'},
    {id:591,name:'radar_nhp_overlay'},
    {id:592,name:'radar_nhp_turret'},
    {id:593,name:'radar_nhp_mg_firewall'},
    {id:594,name:'radar_nhp_mg_node'},
    {id:595,name:'radar_nhp_wp1'},
    {id:596,name:'radar_nhp_wp2'},
    {id:597,name:'radar_nhp_wp3'},
    {id:598,name:'radar_nhp_wp4'},
    {id:599,name:'radar_nhp_wp5'},
    {id:600,name:'radar_nhp_wp6'},
    {id:601,name:'radar_nhp_wp7'},
    {id:602,name:'radar_nhp_wp8'},
    {id:603,name:'radar_nhp_wp9'},
    {id:604,name:'radar_nhp_cctv'},
    {id:605,name:'radar_nhp_starterpack'},
    {id:606,name:'radar_nhp_turret_console'},
    {id:607,name:'radar_nhp_mg_mir_rotate'},
    {id:608,name:'radar_nhp_mg_mir_static'},
    {id:609,name:'radar_nhp_mg_proxy'},
    {id:610,name:'radar_acsr_race_target'},
    {id:611,name:'radar_acsr_race_hotring'},
    {id:612,name:'radar_acsr_wp1'},
    {id:613,name:'radar_acsr_wp2'},
    {id:614,name:'radar_bat_club_property'},
    {id:615,name:'radar_bat_cargo'},
    {id:616,name:'radar_bat_truck'},
    {id:617,name:'radar_bat_hack_jewel'},
    {id:618,name:'radar_bat_hack_gold'},
    {id:619,name:'radar_bat_keypad'},
    {id:620,name:'radar_bat_hack_target'},
    {id:621,name:'radar_pickup_dtb_health'},
    {id:622,name:'radar_pickup_dtb_blast_increase'},
    {id:623,name:'radar_pickup_dtb_blast_decrease'},
    {id:624,name:'radar_pickup_dtb_bomb_increase'},
    {id:625,name:'radar_pickup_dtb_bomb_decrease'},
    {id:626,name:'radar_bat_rival_club'},
    {id:627,name:'radar_bat_drone'},
    {id:628,name:'radar_bat_cash_reg'},
    {id:629,name:'radar_cctv'},
    {id:630,name:'radar_bat_assassinate'},
    {id:631,name:'radar_bat_pbus'},
    {id:632,name:'radar_bat_wp1'},
    {id:633,name:'radar_bat_wp2'},
    {id:634,name:'radar_bat_wp3'},
    {id:635,name:'radar_bat_wp4'},
    {id:636,name:'radar_bat_wp5'},
    {id:637,name:'radar_bat_wp6'},
    {id:638,name:'radar_blimp_2'},
    {id:639,name:'radar_oppressor_2'},
    {id:640,name:'radar_bat_wp7'},
    {id:641,name:'radar_arena_series'},
    {id:642,name:'radar_arena_premium'},
    {id:643,name:'radar_arena_workshop'},
    {id:644,name:'radar_race_wars'},
    {id:645,name:'radar_arena_turret'},
    {id:646,name:'radar_arena_rc_car'},
    {id:647,name:'radar_arena_rc_workshop'},
    {id:648,name:'radar_arena_trap_fire'},
    {id:649,name:'radar_arena_trap_flip'},
    {id:650,name:'radar_arena_trap_sea'},
    {id:651,name:'radar_arena_trap_turn'},
    {id:652,name:'radar_arena_trap_pit'},
    {id:653,name:'radar_arena_trap_mine'},
    {id:654,name:'radar_arena_trap_bomb'},
    {id:655,name:'radar_arena_trap_wall'},
    {id:656,name:'radar_arena_trap_brd'},
    {id:657,name:'radar_arena_trap_sbrd'},
    {id:658,name:'radar_arena_bruiser'},
    {id:659,name:'radar_arena_brutus'},
    {id:660,name:'radar_arena_cerberus'},
    {id:661,name:'radar_arena_deathbike'},
    {id:662,name:'radar_arena_dominator'},
    {id:663,name:'radar_arena_impaler'},
    {id:664,name:'radar_arena_imperator'},
    {id:665,name:'radar_arena_issi'},
    {id:666,name:'radar_arena_sasquatch'},
    {id:667,name:'radar_arena_scarab'},
    {id:668,name:'radar_arena_slamvan'},
    {id:669,name:'radar_arena_zr380'},
    {id:670,name:'radar_ap'},
    {id:671,name:'radar_comic_store'},
    {id:672,name:'radar_cop_car'},
    {id:673,name:'radar_rc_time_trials'},
    {id:674,name:'radar_king_of_the_hill'},
    {id:675,name:'radar_king_of_the_hill_teams'},
    {id:676,name:'radar_rucksack'},
    {id:677,name:'radar_shipping_container'},
    {id:678,name:'radar_agatha'},
    {id:679,name:'radar_casino'},
    {id:680,name:'radar_casino_table_games'},
    {id:681,name:'radar_casino_wheel'},
    {id:682,name:'radar_casino_concierge'},
    {id:683,name:'radar_casino_chips'},
    {id:684,name:'radar_casino_horse_racing'},
    {id:685,name:'radar_adversary_featured'},
    {id:686,name:'radar_roulette_1'},
    {id:687,name:'radar_roulette_2'},
    {id:688,name:'radar_roulette_3'},
    {id:689,name:'radar_roulette_4'},
    {id:690,name:'radar_roulette_5'},
    {id:691,name:'radar_roulette_6'},
    {id:692,name:'radar_roulette_7'},
    {id:693,name:'radar_roulette_8'},
    {id:694,name:'radar_roulette_9'},
    {id:695,name:'radar_roulette_10'},
    {id:696,name:'radar_roulette_11'},
    {id:697,name:'radar_roulette_12'},
    {id:698,name:'radar_roulette_13'},
    {id:699,name:'radar_roulette_14'},
    {id:700,name:'radar_roulette_15'},
    {id:701,name:'radar_roulette_16'},
    {id:702,name:'radar_roulette_17'},
    {id:703,name:'radar_roulette_18'},
    {id:704,name:'radar_roulette_19'},
    {id:705,name:'radar_roulette_20'},
    {id:706,name:'radar_roulette_21'},
    {id:707,name:'radar_roulette_22'},
    {id:708,name:'radar_roulette_23'},
    {id:709,name:'radar_roulette_24'},
    {id:710,name:'radar_roulette_25'},
    {id:711,name:'radar_roulette_26'},
    {id:712,name:'radar_roulette_27'},
    {id:713,name:'radar_roulette_28'},
    {id:714,name:'radar_roulette_29'},
    {id:715,name:'radar_roulette_30'},
    {id:716,name:'radar_roulette_31'},
    {id:717,name:'radar_roulette_32'},
    {id:718,name:'radar_roulette_33'},
    {id:719,name:'radar_roulette_34'},
    {id:720,name:'radar_roulette_35'},
    {id:721,name:'radar_roulette_36'},
    {id:722,name:'radar_roulette_0'},
    {id:723,name:'radar_roulette_00'},
    {id:724,name:'radar_limo'},
    {id:725,name:'radar_weapon_alien'},
    {id:726,name:'radar_race_open_wheel'},
    {id:727,name:'radar_rappel'},
    {id:728,name:'radar_swap_car'},
    {id:729,name:'radar_scuba_gear'},
    {id:730,name:'radar_cpanel_1'},
    {id:731,name:'radar_cpanel_2'},
    {id:732,name:'radar_cpanel_3'},
    {id:733,name:'radar_cpanel_4'},
    {id:734,name:'radar_snow_truck'},
    {id:735,name:'radar_buggy_1'},
    {id:736,name:'radar_buggy_2'},
    {id:737,name:'radar_zhaba'},
    {id:738,name:'radar_gerald'},
    {id:739,name:'radar_ron'},
    {id:740,name:'radar_arcade'},
    {id:741,name:'radar_drone_controls'},
    {id:742,name:'radar_rc_tank'},
    {id:743,name:'radar_stairs'},
    {id:744,name:'radar_camera_2'},
    {id:745,name:'radar_winky'},
    {id:746,name:'radar_mini_sub'},
    {id:747,name:'radar_kart_retro'},
    {id:748,name:'radar_kart_modern'},
    {id:749,name:'radar_military_quad'},
    {id:750,name:'radar_military_truck'},
    {id:751,name:'radar_ship_wheel'},
    {id:752,name:'radar_ufo'},
    {id:753,name:'radar_seasparrow2'},
    {id:754,name:'radar_dinghy2'},
    {id:755,name:'radar_patrol_boat'},
    {id:756,name:'radar_retro_sports_car'},
    {id:757,name:'radar_squadee'},
    {id:758,name:'radar_folding_wing_jet'},
    {id:759,name:'radar_valkyrie2'},
    {id:760,name:'radar_sub2'},
    {id:761,name:'radar_bolt_cutters'},
    {id:762,name:'radar_rappel_gear'},
    {id:763,name:'radar_keycard'},
    {id:764,name:'radar_password'},
    {id:765,name:'radar_island_heist_prep'},
    {id:766,name:'radar_island_party'},
    {id:767,name:'radar_control_tower'},
    {id:768,name:'radar_underwater_gate'},
    {id:769,name:'radar_power_switch'},
    {id:770,name:'radar_compound_gate'},
    {id:771,name:'radar_rappel_point'},
    {id:772,name:'radar_keypad'},
    {id:773,name:'radar_sub_controls'},
    {id:774,name:'radar_sub_periscope'},
    {id:775,name:'radar_sub_missile'},
    {id:776,name:'radar_painting'},
    {id:777,name:'radar_car_meet'},
    {id:778,name:'radar_car_test_area'},
    {id:779,name:'radar_auto_shop_property'},
    {id:780,name:'radar_docks_export'},
    {id:781,name:'radar_prize_car'},
    {id:782,name:'radar_test_car'},
    {id:783,name:'radar_car_robbery_board'},
    {id:784,name:'radar_car_robbery_prep'},
    {id:785,name:'radar_street_race_series'},
    {id:786,name:'radar_pursuit_series'},
    {id:787,name:'radar_car_meet_organiser'},
    {id:788,name:'radar_securoserv'},
    {id:789,name:'radar_bounty_collectibles'},
    {id:790,name:'radar_movie_collectibles'},
    {id:791,name:'radar_trailer_ramp'},
    {id:792,name:'radar_race_organiser'},
    {id:793,name:'radar_chalkboard_list'},
    {id:794,name:'radar_export_vehicle'},
    {id:795,name:'radar_train'},
    {id:796,name:'radar_heist_diamond'},
    {id:797,name:'radar_heist_doomsday'},
    {id:798,name:'radar_heist_island'},
    {id:799,name:'radar_slamvan2'},
    {id:800,name:'radar_crusader'},
    {id:801,name:'radar_construction_outfit'},
    {id:802,name:'radar_overlay_jammed'},
    {id:803,name:'radar_heist_island_unavailable'},
    {id:804,name:'radar_heist_diamond_unavailable'},
    {id:805,name:'radar_heist_doomsday_unavailable'},
    {id:806,name:'radar_placeholder_7'},
    {id:807,name:'radar_placeholder_8'},
    {id:808,name:'radar_placeholder_9'},
    {id:809,name:'radar_featured_series'},
    {id:810,name:'radar_vehicle_for_sale'},
    {id:811,name:'radar_van_keys'},
    {id:812,name:'radar_suv_service'},
    {id:813,name:'radar_security_contract'},
    {id:814,name:'radar_safe'},
    {id:815,name:'radar_ped_r'},
    {id:816,name:'radar_ped_e'},
    {id:817,name:'radar_payphone'},
    {id:818,name:'radar_patriot3'},
    {id:819,name:'radar_music_studio'},
    {id:820,name:'radar_jubilee'},
    {id:821,name:'radar_granger2'},
    {id:822,name:'radar_explosive_charge'},
    {id:823,name:'radar_deity'},
    {id:824,name:'radar_d_champion'},
    {id:825,name:'radar_buffalo4'},
    {id:826,name:'radar_agency'},
    {id:827,name:'radar_biker_bar'},
    {id:828,name:'radar_simeon_overlay'},
    {id:829,name:'radar_junk_skydive'},
    {id:830,name:'radar_luxury_car_showroom'},
    {id:831,name:'radar_car_showroom'},
    {id:832,name:'radar_car_showroom_simeon'},
    {id:833,name:'radar_flaming_skull'},
    {id:834,name:'radar_weapon_ammo'},
    {id:835,name:'radar_community_series'},
    {id:836,name:'radar_cayo_series'},
    {id:837,name:'radar_clubhouse_contract'},
    {id:838,name:'radar_agent_ulp'},
    {id:839,name:'radar_acid'},
    {id:840,name:'radar_acid_lab'},
    {id:841,name:'radar_dax_overlay'},
    {id:842,name:'radar_dead_drop_package'},
    {id:843,name:'radar_downtown_cab'},
    {id:844,name:'radar_gun_van'},
    {id:845,name:'radar_stash_house'},
    {id:846,name:'radar_tractor'},
    {id:847,name:'radar_warehouse_juggalo'},
    {id:848,name:'radar_warehouse_juggalo_dax'},
    {id:849,name:'radar_weapon_crowbar'},
    {id:850,name:'radar_duffel_bag'},
    {id:851,name:'radar_oil_tanker'},
    {id:852,name:'radar_acid_lab_tent'},
    {id:853,name:'radar_van_burrito'},
    {id:854,name:'radar_acid_boost'},
    {id:855,name:'radar_ped_gang_leader'},
    {id:856,name:'radar_multistorey_garage'},
    {id:857,name:'radar_seized_asset_sales'},
    {id:858,name:'radar_cayo_attrition'},
    {id:859,name:'radar_bicycle'},
    {id:860,name:'radar_bicycle_trial'},
    {id:861,name:'radar_raiju'},
    {id:862,name:'radar_conada2'},
    {id:863,name:'radar_overlay_ready_for_sell'},
    {id:864,name:'radar_overlay_missing_supplies'},
    {id:865,name:'radar_streamer216'},
    {id:866,name:'radar_signal_jammer'},
    {id:867,name:'radar_salvage_yard'},
    {id:868,name:'radar_robbery_prep_equipment'},
    {id:869,name:'radar_robbery_prep_overlay'},
    {id:870,name:'radar_yusuf'},
    {id:871,name:'radar_vincent'},
    {id:872,name:'radar_vinewood_garage'},
    {id:873,name:'radar_lstb'},
    {id:874,name:'radar_cctv_workstation'},
    {id:875,name:'radar_hacking_device'},
    {id:876,name:'radar_race_drag'},
    {id:877,name:'radar_race_drift'},
    {id:878,name:'radar_casino_prep'},
    {id:879,name:'radar_planning_wall'},
    {id:880,name:'radar_weapon_crate'},
    {id:881,name:'radar_weapon_snowball'},
    {id:882,name:'radar_train_signals_green'},
    {id:883,name:'radar_train_signals_red'},
    {id:884,name:'radar_office_transporter'},
    {id:885,name:'radar_yankton_survival'},
    {id:886,name:'radar_daily_bounty'},
    {id:887,name:'radar_bounty_target'},
    {id:888,name:'radar_filming_schedule'},
    {id:889,name:'radar_pizza_this'},
    {id:890,name:'radar_aircraft_carrier'},
    {id:891,name:'radar_weapon_emp'},
    {id:892,name:'radar_maude_eccles'},
    {id:893,name:'radar_bail_bonds_office'},
    {id:894,name:'radar_weapon_emp_mine'},
    {id:895,name:'radar_zombie_disease'},
    {id:896,name:'radar_zombie_proximity'},
    {id:897,name:'radar_zombie_fire'},
    {id:898,name:'radar_animal_possessed'},
    {id:899,name:'radar_mobile_phone'},
    {id:900,name:'radar_garment_factory'},
    {id:901,name:'radar_garment_factory_for_sale'},
    {id:902,name:'radar_garment_factory_equipment'},
    {id:903,name:'radar_field_hangar'},
    {id:904,name:'radar_field_hangar_for_sale'},
    {id:905,name:'radar_cargobob_ch53'},
    {id:906,name:'radar_chopper_lift_ammo'},
    {id:907,name:'radar_chopper_lift_armor'},
    {id:908,name:'radar_chopper_lift_explosives'},
    {id:909,name:'radar_chopper_lift_upgrade'},
    {id:910,name:'radar_chopper_lift_weapon'},
    {id:911,name:'radar_cargo_ship'},
    {id:912,name:'radar_submarine_missile'},
    {id:913,name:'radar_propeller_engine'},
    {id:914,name:'radar_shark'},
    {id:915,name:'radar_fast_travel'},
    {id:916,name:'radar_plane_duster2'},
    {id:917,name:'radar_plane_titan2'},
    {id:918,name:'radar_collectible'},
    {id:919,name:'radar_field_hangar_discount'},
    {id:920,name:'radar_garment_factory_discount'},
    {id:921,name:'radar_weapon_gusenberg_sweeper'},
    {id:922,name:'radar_weapon_tear_gas'},
    {id:923,name:'radar_dog'},
    {id:924,name:'radar_bobcat_security'},
    {id:925,name:'radar_smoke_shop'},
    {id:926,name:'radar_smoke_shop_for_sale'},
    {id:927,name:'radar_smoke_shop_attention'},
    {id:928,name:'radar_helitours'},
    {id:929,name:'radar_helitours_for_sale'},
    {id:930,name:'radar_helitours_attention'},
    {id:931,name:'radar_car_wash_business'},
    {id:932,name:'radar_car_wash_business_for_sale'},
    {id:933,name:'radar_car_wash_business_attention'},
    {id:934,name:'radar_attention'},
    {id:935,name:'radar_alarm'},
    {id:936,name:'radar_helitours_discount'},
    {id:937,name:'radar_smoke_shop_discount'},
    {id:938,name:'radar_car_wash_business_discount'},
    {id:939,name:'radar_real_estate'},
    {id:940,name:'radar_medical_courier'},
    {id:941,name:'radar_gruppe_sechs'},
    {id:942,name:'radar_fire_station'},
    {id:943,name:'radar_fire_truck'},
    {id:944,name:'radar_alpha_mail'},
    {id:945,name:'radar_ls_meteor'},
    {id:946,name:'radar_four20_survival'},
    {id:947,name:'radar_community_mission_series'},
    {id:948,name:'radar_property_mansion'},
    {id:949,name:'radar_ai_keypad'},
    {id:950,name:'radar_taxi_self_drive'},
    {id:951,name:'radar_train_subway'},
    {id:952,name:'radar_trashbag'},
    {id:953,name:'radar_mission_creator'},
    {id:954,name:'radar_cat'},
    {id:955,name:'radar_mansion_ai_m'},
    {id:956,name:'radar_mansion_ai_f'},
    {id:957,name:'radar_mansion_ai_gang'}
];

function buildBlipSelector(currentBlipId) {
    const wrap = document.createElement('div');
    wrap.className = 'blip-selector-wrap';

    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = 'Search blips...';
    search.className = 'blip-search';
    wrap.appendChild(search);

    const grid = document.createElement('div');
    grid.className = 'blip-grid';
    wrap.appendChild(grid);

    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.id = 'locBlipId';
    hidden.value = currentBlipId ?? 0;
    wrap.appendChild(hidden);

    function renderGrid(filter) {
        grid.innerHTML = '';
        const lc = filter ? filter.toLowerCase() : '';
        const filtered = lc
            ? BLIPS.filter(b => b.name.includes(lc) || String(b.id) === lc)
            : BLIPS;
        filtered.forEach(b => {
            const item = document.createElement('div');
            item.className = 'blip-item' + (b.id === parseInt(hidden.value) ? ' selected' : '');
            item.style.display = 'none'; // hidden until image confirms it loads
            item.title = `${b.id} - ${b.name}`;
            const img = document.createElement('img');
            img.src = `https://docs.fivem.net/blips/${b.name}.png`;
            img.alt = b.name;
            img.onload  = () => { item.style.display = ''; };
            img.onerror = () => { item.remove(); };
            const lbl = document.createElement('span');
            lbl.textContent = b.name.replace('radar_', '');
            item.appendChild(img);
            item.appendChild(lbl);
            item.addEventListener('click', () => {
                hidden.value = b.id;
                grid.querySelectorAll('.blip-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
            });
            grid.appendChild(item);
        });
    }

    renderGrid('');
    search.addEventListener('input', () => renderGrid(search.value.trim()));
    return wrap;
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
            { tag: 'label', cls: 'toggle-wrap', children: [
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
    loc.blipId = parseInt(document.getElementById('locBlipId')?.value) || 0;
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
                duration: intVal(`s${idx}Dur`) * 1000,
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

/* ---- ESC to close UI ---- */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeUI();
});

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

function showConfirmModal(title, subtitle, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const box = document.createElement('div');
    box.className = 'modal-box';

    const heading = document.createElement('p');
    heading.className = 'modal-title';
    heading.textContent = title;

    if (subtitle) {
        const sub = document.createElement('p');
        sub.className = 'modal-subtitle';
        sub.textContent = subtitle;
        box.appendChild(heading);
        box.appendChild(sub);
    } else {
        box.appendChild(heading);
    }

    const btns = document.createElement('div');
    btns.className = 'modal-btns';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal-btn cancel';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'modal-btn danger';
    confirmBtn.textContent = 'Delete';

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => { overlay.classList.add('visible'); confirmBtn.focus(); });

    function close() { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 150); }
    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', () => { close(); onConfirm(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
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
