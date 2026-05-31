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

/* ---- Dragging ---- */
const titleBar = document.getElementById('titleBar');
const app = document.getElementById('app');
let dragging = false;
let dragOffset = { x: 0, y: 0 };

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
    let x = e.clientX - dragOffset.x;
    let y = e.clientY - dragOffset.y;
    app.style.left = x + 'px';
    app.style.top = y + 'px';
});

window.addEventListener('mouseup', () => {
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
    document.getElementById('system').value = cfg.System ?? 'textui';
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
    cfg.System = document.getElementById('system').value;
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
        li.innerHTML = `<span>${escapeHtml(name)}</span><i class="fa-solid fa-trash-can loc-delete"></i>`;
        li.addEventListener('click', (e) => {
            if (e.target.classList.contains('loc-delete')) {
                delete configData.TherapyLocations[name];
                if (selectedLocation === name) {
                    selectedLocation = null;
                    document.getElementById('locationEditor').innerHTML = '<div class="editor-placeholder">Select a location to edit</div>';
                }
                renderLocationList();
                return;
            }
            selectedLocation = name;
            renderLocationList();
            renderLocationEditor(name, data);
        });
        locList.appendChild(li);
    }
}

document.getElementById('addLocationBtn').addEventListener('click', () => {
    let name = prompt('Enter new location name:');
    if (!name) return;
    name = name.trim();
    if (!name) return;
    if (configData.TherapyLocations && configData.TherapyLocations[name]) {
        alert('Location already exists');
        return;
    }
    if (!configData.TherapyLocations) configData.TherapyLocations = {};
    configData.TherapyLocations[name] = {
        coords: { x: 0, y: 0, z: 0, w: 0 },
        cost: 500,
        showBlip: true,
        ped: { model: 's_m_m_doctor_01', coords: { x: 0, y: 0, z: 0, w: 0 } },
        steps: [
            {
                coords: { x: 0, y: 0, z: 0, w: 0 },
                progress: { duration: 20000, label: 'Step 1', canCancel: false, disable: { move: true, combat: true }, anim: { dict: '', clip: '', flag: 7 } }
            },
            {
                coords: { x: 0, y: 0, z: 0, w: 0 },
                progress: { duration: 20000, label: 'Step 2', canCancel: false, disable: { move: true, combat: true }, anim: { dict: '', clip: '', flag: 7 } }
            },
            {
                coords: { x: 0, y: 0, z: 0, w: 0 },
                progress: { duration: 20000, label: 'Step 3', canCancel: false, disable: { move: true, combat: true }, anim: { dict: '', clip: '', flag: 7 } }
            }
        ]
    };
    selectedLocation = name;
    renderLocationList();
    renderLocationEditor(name, configData.TherapyLocations[name]);
    selectTab('locations');
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

    // Coords
    const coords = data.coords || { x: 0, y: 0, z: 0, w: 0 };
    const locCoordRow = mkRow([
        fieldNum('X', 'locCX', coords.x),
        fieldNum('Y', 'locCY', coords.y),
        fieldNum('Z', 'locCZ', coords.z),
        fieldNum('W', 'locCW', coords.w)
    ]);
    form.appendChild(mkGroup('Location Coords', 'fa-solid fa-location-crosshairs', [mkUsePosBtn(['locCX','locCY','locCZ','locCW']), locCoordRow]));

    // Cost / Blip
    const metaRow = mkRow([
        fieldNum('Cost', 'locCost', data.cost),
        toggleField('Show Blip', 'locBlip', !!data.showBlip)
    ]);
    const blipSelector = buildBlipSelector('blipSelectorWrap', data.blipId ?? 0);
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
    const pedRow2 = mkRow([
        fieldNum('X', 'pedCX', pedCoords.x),
        fieldNum('Y', 'pedCY', pedCoords.y),
        fieldNum('Z', 'pedCZ', pedCoords.z),
        fieldNum('W', 'pedCW', pedCoords.w)
    ]);
    form.appendChild(mkGroup('Ped', 'fa-solid fa-user-doctor', [pedRow1, mkUsePosBtn(['pedCX','pedCY','pedCZ','pedCW']), pedRow2]));

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
    body.appendChild(mkUsePosBtn([`s${number}CX`, `s${number}CY`, `s${number}CZ`, `s${number}CW`]));
    body.appendChild(mkRow([
        fieldNum('X', `s${number}CX`, c.x),
        fieldNum('Y', `s${number}CY`, c.y),
        fieldNum('Z', `s${number}CZ`, c.z),
        fieldNum('W', `s${number}CW`, c.w)
    ]));
    body.appendChild(mkRow([
        fieldNum('Duration (ms)', `s${number}Dur`, p.duration),
        field('Label', 'text', p.label, { id: `s${number}Label` })
    ]));
    body.appendChild(mkRow([
        toggleField('Can Cancel', `s${number}Cancel`, !!p.canCancel),
        toggleField('Disable Move', `s${number}DisMove`, !!d.move),
        toggleField('Disable Combat', `s${number}DisCombat`, !!d.combat)
    ]));
    body.appendChild(mkRow([
        animSelect('Anim Dict', `s${number}Dict`, a.dict),
        animSelect('Anim Clip', `s${number}Clip`, a.clip),
        fieldNum('Anim Flag', `s${number}Flag`, a.flag)
    ]));

    card.appendChild(header);
    card.appendChild(body);
    return card;
}

/* ---- Blip Data ---- */
const BLIPS = [
    {id:0,name:'radar_higher'},{id:1,name:'radar_police'},{id:2,name:'radar_police_2'},{id:3,name:'radar_mp_police'},
    {id:4,name:'radar_mp_police_2'},{id:5,name:'radar_mp_police_3'},{id:6,name:'radar_mp_police_4'},{id:7,name:'radar_mp_police_5'},
    {id:8,name:'radar_mp_police_6'},{id:9,name:'radar_mp_police_7'},{id:10,name:'radar_mp_police_8'},{id:11,name:'radar_mp_police_9'},
    {id:12,name:'radar_mp_police_10'},{id:13,name:'radar_mp_police_11'},{id:14,name:'radar_mp_police_12'},{id:15,name:'radar_mp_police_13'},
    {id:16,name:'radar_mp_police_14'},{id:17,name:'radar_mp_police_15'},{id:18,name:'radar_mp_police_16'},{id:19,name:'radar_mp_police_17'},
    {id:20,name:'radar_mp_police_18'},{id:21,name:'radar_mp_police_19'},{id:22,name:'radar_mp_police_20'},{id:23,name:'radar_mp_police_21'},
    {id:24,name:'radar_mp_police_22'},{id:25,name:'radar_mp_police_23'},{id:26,name:'radar_mp_police_24'},{id:27,name:'radar_mp_police_25'},
    {id:28,name:'radar_mp_police_26'},{id:29,name:'radar_mp_police_27'},{id:30,name:'radar_mp_police_28'},{id:31,name:'radar_mp_police_29'},
    {id:32,name:'radar_mp_police_30'},{id:33,name:'radar_mp_police_31'},{id:34,name:'radar_mp_police_32'},{id:35,name:'radar_mp_police_33'},
    {id:36,name:'radar_mp_police_34'},{id:37,name:'radar_mp_police_35'},{id:38,name:'radar_mp_police_36'},{id:39,name:'radar_mp_police_37'},
    {id:40,name:'radar_hospital'},{id:41,name:'radar_airport'},{id:42,name:'radar_bar'},{id:43,name:'radar_base_camp'},
    {id:44,name:'radar_basketball'},{id:45,name:'radar_bikers'},{id:46,name:'radar_bowling'},{id:47,name:'radar_boxing'},
    {id:48,name:'radar_car_mod'},{id:49,name:'radar_cash_register'},{id:50,name:'radar_cinema'},{id:51,name:'radar_circle_red'},
    {id:52,name:'radar_clothes'},{id:53,name:'radar_crash'},{id:54,name:'radar_darts'},{id:55,name:'radar_default'},
    {id:56,name:'radar_drugs'},{id:57,name:'radar_ex_girlfriend'},{id:58,name:'radar_friend'},{id:59,name:'radar_golf'},
    {id:60,name:'radar_gun_shop'},{id:61,name:'radar_helicopter'},{id:62,name:'radar_hooker'},{id:63,name:'radar_hotel'},
    {id:64,name:'radar_information'},{id:65,name:'radar_jewels'},{id:66,name:'radar_marina'},{id:67,name:'radar_mc_business'},
    {id:68,name:'radar_north'},{id:69,name:'radar_package'},{id:70,name:'radar_parking'},{id:71,name:'radar_pay_and_spray'},
    {id:72,name:'radar_petrol_station'},{id:73,name:'radar_phone'},{id:74,name:'radar_police_car'},{id:75,name:'radar_bar_2'},
    {id:76,name:'radar_race_car'},{id:77,name:'radar_race_flag'},{id:78,name:'radar_random_character'},{id:79,name:'radar_random_female'},
    {id:80,name:'radar_random_male'},{id:81,name:'radar_reporter'},{id:82,name:'radar_rob'},{id:83,name:'radar_safe_house'},
    {id:84,name:'radar_shooting_range'},{id:85,name:'radar_skull'},{id:86,name:'radar_star'},{id:87,name:'radar_strip_club'},
    {id:88,name:'radar_tattoo'},{id:89,name:'radar_tennis'},{id:90,name:'radar_toilet'},{id:91,name:'radar_triathlon'},
    {id:92,name:'radar_unknown'},{id:93,name:'radar_wanted_radius'},{id:94,name:'radar_waypoint'},{id:95,name:'radar_yoga'},
    {id:96,name:'radar_police_station'},{id:97,name:'radar_fire_station'},{id:98,name:'radar_bike'},{id:99,name:'radar_bicycle'},
    {id:100,name:'radar_boat'},{id:101,name:'radar_cab'},{id:102,name:'radar_car'},{id:103,name:'radar_helicopter_2'},
    {id:104,name:'radar_plane'},{id:105,name:'radar_quad'},{id:106,name:'radar_tank'},{id:107,name:'radar_truck'},
    {id:108,name:'radar_van'},{id:109,name:'radar_bike_2'},{id:110,name:'radar_bicycle_2'},{id:111,name:'radar_boat_2'},
    {id:112,name:'radar_cab_2'},{id:113,name:'radar_car_2'},{id:114,name:'radar_helicopter_3'},{id:115,name:'radar_plane_2'},
    {id:116,name:'radar_quad_2'},{id:117,name:'radar_tank_2'},{id:118,name:'radar_truck_2'},{id:119,name:'radar_van_2'},
    {id:120,name:'radar_character_michael'},{id:121,name:'radar_character_franklin'},{id:122,name:'radar_character_trevor'},{id:123,name:'radar_character_mp'},
    {id:124,name:'radar_gtao_fm_events_apex'},{id:125,name:'radar_creator'},{id:126,name:'radar_creator_direction'},{id:127,name:'radar_abigail'},
    {id:128,name:'radar_rampage'},{id:129,name:'radar_hunt_the_beast'},{id:130,name:'radar_quarry'},{id:131,name:'radar_parachute_jump'},
    {id:132,name:'radar_swimming'},{id:133,name:'radar_number_1'},{id:134,name:'radar_number_2'},{id:135,name:'radar_number_3'},
    {id:136,name:'radar_number_4'},{id:137,name:'radar_number_5'},{id:138,name:'radar_number_6'},{id:139,name:'radar_number_7'},
    {id:140,name:'radar_number_8'},{id:141,name:'radar_number_9'},{id:142,name:'radar_number_10'},{id:143,name:'radar_number_11'},
    {id:144,name:'radar_number_12'},{id:145,name:'radar_number_13'},{id:146,name:'radar_number_14'},{id:147,name:'radar_number_15'},
    {id:148,name:'radar_number_16'},{id:149,name:'radar_number_17'},{id:150,name:'radar_number_18'},{id:151,name:'radar_number_19'},
    {id:152,name:'radar_number_20'},{id:153,name:'radar_number_21'},{id:154,name:'radar_number_22'},{id:155,name:'radar_number_23'},
    {id:156,name:'radar_number_24'},{id:157,name:'radar_number_25'},{id:158,name:'radar_number_26'},{id:159,name:'radar_number_27'},
    {id:160,name:'radar_number_28'},{id:161,name:'radar_number_29'},{id:162,name:'radar_number_30'},{id:163,name:'radar_number_31'},
    {id:164,name:'radar_number_32'},{id:165,name:'radar_number_33'},{id:166,name:'radar_number_34'},{id:167,name:'radar_number_35'},
    {id:168,name:'radar_number_36'},{id:169,name:'radar_number_37'},{id:170,name:'radar_number_38'},{id:171,name:'radar_number_39'},
    {id:172,name:'radar_number_40'},{id:173,name:'radar_number_41'},{id:174,name:'radar_number_42'},{id:175,name:'radar_number_43'},
    {id:176,name:'radar_number_44'},{id:177,name:'radar_number_45'},{id:178,name:'radar_number_46'},{id:179,name:'radar_number_47'},
    {id:180,name:'radar_number_48'},{id:181,name:'radar_number_49'},{id:182,name:'radar_number_50'},{id:183,name:'radar_number_51'},
    {id:184,name:'radar_number_52'},{id:185,name:'radar_number_53'},{id:186,name:'radar_number_54'},{id:187,name:'radar_number_55'},
    {id:188,name:'radar_number_56'},{id:189,name:'radar_number_57'},{id:190,name:'radar_number_58'},{id:191,name:'radar_number_59'},
    {id:192,name:'radar_number_60'},{id:193,name:'radar_mp_crew'},{id:194,name:'radar_gtao_deathmatch'},{id:195,name:'radar_gtao_survival'},
    {id:196,name:'radar_gtao_race_bike'},{id:197,name:'radar_gtao_race_boat'},{id:198,name:'radar_gtao_race_car'},{id:199,name:'radar_gtao_race_helicopter'},
    {id:200,name:'radar_gtao_race_parachute'},{id:201,name:'radar_gtao_race_plane'},{id:202,name:'radar_gtao_mission'},{id:203,name:'radar_gtao_freeroam'},
    {id:204,name:'radar_gtao_captured_bag'},{id:205,name:'radar_gtao_bag_dropped'},{id:206,name:'radar_gtao_delivery'},{id:207,name:'radar_gtao_package_steal'},
    {id:208,name:'radar_gtao_arm_wrestling'},{id:209,name:'radar_gtao_darts'},{id:210,name:'radar_gtao_shooting_range'},{id:211,name:'radar_gtao_tennis'},
    {id:212,name:'radar_gtao_triathlon'},{id:213,name:'radar_property_for_sale'},{id:214,name:'radar_property_taken'},{id:215,name:'radar_garage_for_sale'},
    {id:216,name:'radar_garage_taken'},{id:217,name:'radar_helipad_for_sale'},{id:218,name:'radar_helipad_taken'},{id:219,name:'radar_dock_for_sale'},
    {id:220,name:'radar_dock_taken'},{id:221,name:'radar_hangar_for_sale'},{id:222,name:'radar_hangar_taken'},{id:223,name:'radar_police_helicopter'},
    {id:224,name:'radar_boost'},{id:225,name:'radar_devin_weston'},{id:226,name:'radar_simeon'},{id:227,name:'radar_trevor'},
    {id:228,name:'radar_lamar'},{id:229,name:'radar_lester'},{id:230,name:'radar_ron'},{id:231,name:'radar_wade'},
    {id:232,name:'radar_martin_madrazo'},{id:233,name:'radar_solomon_richards'},{id:234,name:'radar_hao'},{id:235,name:'radar_chop'},
    {id:236,name:'radar_family'},{id:237,name:'radar_gang_1'},{id:238,name:'radar_gang_2'},{id:239,name:'radar_gang_3'},
    {id:240,name:'radar_gang_4'},{id:241,name:'radar_gang_5'},{id:242,name:'radar_gang_6'},{id:243,name:'radar_gang_7'},
    {id:244,name:'radar_gang_8'},{id:245,name:'radar_gang_9'},{id:246,name:'radar_gang_10'},{id:247,name:'radar_bikers_2'},
    {id:248,name:'radar_blimp'},{id:249,name:'radar_submarine'},{id:250,name:'radar_sub_jet'},{id:251,name:'radar_parachute'},
    {id:252,name:'radar_jetpack'},{id:253,name:'radar_race_start_line'},{id:254,name:'radar_race_car_2'},{id:255,name:'radar_race_bike_2'},
    {id:256,name:'radar_race_boat_2'},{id:257,name:'radar_race_helicopter_2'},{id:258,name:'radar_race_plane_2'},{id:259,name:'radar_race_parachute_2'},
    {id:260,name:'radar_amphibious_assault'},{id:261,name:'radar_bank'},{id:262,name:'radar_car_dealership'},{id:263,name:'radar_cinema_2'},
    {id:264,name:'radar_clothes_2'},{id:265,name:'radar_hair_salon'},{id:266,name:'radar_liquor_store'},{id:267,name:'radar_los_santos_customs'},
    {id:268,name:'radar_massage'},{id:269,name:'radar_nightclub'},{id:270,name:'radar_police_car_2'},{id:271,name:'radar_post_office'},
    {id:272,name:'radar_race_jetski'},{id:273,name:'radar_random_character_2'},{id:274,name:'radar_shooting_range_2'},{id:275,name:'radar_stadium'},
    {id:276,name:'radar_store'},{id:277,name:'radar_tattoo_2'},{id:278,name:'radar_yoga_2'},{id:279,name:'radar_gtao_property'},
    {id:280,name:'radar_gtao_garage'},{id:281,name:'radar_gtao_golf'},{id:282,name:'radar_gtao_basketball'},{id:283,name:'radar_gtao_tennis_2'},
    {id:284,name:'radar_gtao_swimming_2'},{id:285,name:'radar_gtao_bike_race'},{id:286,name:'radar_gtao_boat_race'},{id:287,name:'radar_gtao_car_race'},
    {id:288,name:'radar_gtao_helicopter_race'},{id:289,name:'radar_gtao_plane_race'},{id:290,name:'radar_gtao_parachute_race'},{id:291,name:'radar_gtao_mission_2'},
    {id:292,name:'radar_gtao_contact_mission'},{id:293,name:'radar_gtao_simeon_mission'},{id:294,name:'radar_gtao_lester_mission'},{id:295,name:'radar_gtao_ron_mission'},
    {id:296,name:'radar_gtao_trevor_mission'},{id:297,name:'radar_gtao_martin_mission'},{id:298,name:'radar_gtao_gerald_mission'},{id:299,name:'radar_gtao_lamar_mission'},
    {id:300,name:'radar_gtao_job_available'},{id:301,name:'radar_gtao_am_vehicle_spawn'},{id:302,name:'radar_gtao_am_vehicle_spawn_2'},{id:303,name:'radar_gtao_capture_the_flag'},
    {id:304,name:'radar_gtao_gta_races'},{id:305,name:'radar_gtao_jb_700_weapon'},{id:306,name:'radar_gtao_jb_700_weapon_2'},{id:307,name:'radar_gtao_last_team_standing'},
    {id:308,name:'radar_gtao_mission_3'},{id:309,name:'radar_gtao_versus_mission'},{id:310,name:'radar_gtao_rap_sheet'},{id:311,name:'radar_gtao_safe_house'},
    {id:312,name:'radar_gtao_yacht'},{id:313,name:'radar_gtao_gang_attack'},{id:314,name:'radar_gtao_gang_attack_2'},{id:315,name:'radar_gtao_gang_attack_3'},
    {id:316,name:'radar_gtao_gang_attack_4'},{id:317,name:'radar_gtao_gang_attack_5'},{id:318,name:'radar_gtao_tuner_race'},{id:319,name:'radar_gtao_stunt_race'},
    {id:320,name:'radar_gtao_rc_time_trial'},{id:321,name:'radar_gtao_time_trial'},{id:322,name:'radar_gtao_time_trial_2'},{id:323,name:'radar_gtao_time_trial_3'},
    {id:324,name:'radar_gtao_adversary_mode'},{id:325,name:'radar_gtao_special_race'},{id:326,name:'radar_gtao_king_of_the_castle'},{id:327,name:'radar_gunrunning_supply'},
    {id:328,name:'radar_gunrunning_sell'},{id:329,name:'radar_gunrunning_research'},{id:330,name:'radar_smuggler'},{id:331,name:'radar_smuggler_2'},
    {id:332,name:'radar_smuggler_3'},{id:333,name:'radar_import_export'},{id:334,name:'radar_import_export_2'},{id:335,name:'radar_bike_shop'},
    {id:336,name:'radar_mc_headquarters'},{id:337,name:'radar_mc_sell'},{id:338,name:'radar_mc_supply'},{id:339,name:'radar_mc_clubhouse'},
    {id:340,name:'radar_mc_weed'},{id:341,name:'radar_mc_meth'},{id:342,name:'radar_mc_cocaine'},{id:343,name:'radar_mc_forgery'},
    {id:344,name:'radar_mc_counterfeit_cash'},{id:345,name:'radar_office'},{id:346,name:'radar_office_2'},{id:347,name:'radar_warehouse'},
    {id:348,name:'radar_warehouse_2'},{id:349,name:'radar_vehicle_warehouse'},{id:350,name:'radar_vehicle_warehouse_2'},{id:351,name:'radar_gunrunning'},
    {id:352,name:'radar_bunker'},{id:353,name:'radar_bunker_2'},{id:354,name:'radar_facility'},{id:355,name:'radar_hangar'},
    {id:356,name:'radar_nightclub_2'},{id:357,name:'radar_casino'},{id:358,name:'radar_arena'},{id:359,name:'radar_arcade'},
    {id:360,name:'radar_auto_shop'},{id:361,name:'radar_car_meet'},{id:362,name:'radar_agency'},{id:363,name:'radar_freakshop'},
    {id:364,name:'radar_salvage_yard'},{id:365,name:'radar_chop_shop'},{id:366,name:'radar_bail_office'},{id:367,name:'radar_car_show'},
    {id:368,name:'radar_ammo'},{id:369,name:'radar_ammo_2'},{id:370,name:'radar_armored_truck'},{id:371,name:'radar_armored_truck_2'},
    {id:372,name:'radar_airstrike'},{id:373,name:'radar_coke'},{id:374,name:'radar_fib'},{id:375,name:'radar_fib_2'},
    {id:376,name:'radar_fib_3'},{id:377,name:'radar_fib_4'},{id:378,name:'radar_ped'},{id:379,name:'radar_ped_2'},
    {id:380,name:'radar_peyote'},{id:381,name:'radar_satellite'},{id:382,name:'radar_suitcase'},{id:383,name:'radar_suitcase_2'},
    {id:384,name:'radar_snitch'},{id:385,name:'radar_snitch_red'},{id:386,name:'radar_snitch_yellow'},{id:387,name:'radar_sport'},
    {id:388,name:'radar_sport_2'},{id:389,name:'radar_mission_start'},{id:390,name:'radar_race_finish'},{id:391,name:'radar_finish_line'},
    {id:392,name:'radar_respawn_point'},{id:393,name:'radar_gtao_deathmatch_2'},{id:394,name:'radar_gtao_versus_deathmatch'},{id:395,name:'radar_gtao_survivals'},
    {id:396,name:'radar_gtao_contact_mission_2'},{id:397,name:'radar_gtao_sports'},{id:398,name:'radar_gtao_sports_2'},{id:399,name:'radar_gtao_sports_3'},
    {id:400,name:'radar_gtao_fm_events'},{id:401,name:'radar_freemode_event'},{id:402,name:'radar_freemode_event_2'},{id:403,name:'radar_freemode_event_3'},
    {id:404,name:'radar_collection'},{id:405,name:'radar_collection_2'},{id:406,name:'radar_collection_3'},{id:407,name:'radar_collection_4'},
    {id:408,name:'radar_collection_5'},{id:409,name:'radar_collection_6'},{id:410,name:'radar_collection_7'},{id:411,name:'radar_collection_8'},
    {id:412,name:'radar_collection_9'},{id:413,name:'radar_collection_10'},{id:414,name:'radar_collection_11'},{id:415,name:'radar_collection_12'},
    {id:416,name:'radar_collection_13'},{id:417,name:'radar_collection_14'},{id:418,name:'radar_collection_15'},{id:419,name:'radar_collection_16'},
    {id:420,name:'radar_sale'},{id:421,name:'radar_sale_2'},{id:422,name:'radar_sale_3'},{id:423,name:'radar_sale_4'},
    {id:424,name:'radar_sale_5'},{id:425,name:'radar_sale_6'},{id:426,name:'radar_sale_7'},{id:427,name:'radar_sale_8'},
    {id:428,name:'radar_sale_9'},{id:429,name:'radar_sale_10'},{id:430,name:'radar_sale_11'},{id:431,name:'radar_sale_12'},
    {id:432,name:'radar_sale_13'},{id:433,name:'radar_sale_14'},{id:434,name:'radar_sale_15'},{id:435,name:'radar_sale_16'}
];

function buildBlipSelector(containerId, currentBlipId) {
    const wrap = document.createElement('div');
    wrap.className = 'blip-selector-wrap';
    wrap.id = containerId;

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
        const filtered = filter
            ? BLIPS.filter(b => b.name.includes(filter.toLowerCase()) || String(b.id) === filter)
            : BLIPS;
        filtered.forEach(b => {
            const item = document.createElement('div');
            item.className = 'blip-item' + (b.id === parseInt(hidden.value) ? ' selected' : '');
            item.title = `${b.id} - ${b.name}`;
            item.innerHTML = `<img src="https://docs.fivem.net/blips/${b.name}.png" alt="${escapeHtml(b.name)}" onerror="this.style.opacity='0.2'">
                <span>${escapeHtml(b.name.replace('radar_',''))}</span>`;
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

function animSelect(labelText, id, value) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    wrap.appendChild(lbl);

    const sel = document.createElement('select');
    sel.className = 'anim-select';
    sel.id = id;

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- Select Animation --';
    sel.appendChild(defaultOpt);

    for (const [dict, clips] of Object.entries(ANIMATIONS)) {
        const group = document.createElement('optgroup');
        group.label = dict;
        for (const clip of clips) {
            const opt = document.createElement('option');
            opt.value = dict + '|' + clip;
            opt.textContent = clip;
            if (dict === value) opt.selected = true;
            group.appendChild(opt);
        }
        sel.appendChild(group);
    }

    // If current value not in list, add it as custom
    if (value && !Object.keys(ANIMATIONS).includes(value)) {
        const custom = document.createElement('option');
        custom.value = value + '|';
        custom.textContent = value + ' (custom)';
        custom.selected = true;
        sel.insertBefore(custom, sel.children[1]);
    }

    sel.addEventListener('change', () => {
        const val = sel.value;
        if (val && val.includes('|')) {
            const parts = val.split('|');
            const dictId = id;
            const clipId = id.replace('Dict', 'Clip');
            const dictEl = document.getElementById(dictId);
            const clipEl = document.getElementById(clipId);
            if (dictEl) dictEl.value = parts[0];
            if (clipEl) clipEl.value = parts[1] || '';
        }
    });

    wrap.appendChild(sel);
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

function mkUsePosBtn(ids) {
    const btn = document.createElement('button');
    btn.className = 'use-pos-btn';
    btn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Use My Position & Heading';
    btn.addEventListener('click', async () => {
        try {
            const res = await fetch(`https://${GetParentResourceName()}/getPosition`, { method: 'POST', body: '{}' });
            const pos = await res.json();
            fillCoords(ids, pos);
        } catch (e) { console.error('getPosition failed', e); }
    });
    return btn;
}

async function fillCoords(ids, pos) {
    if (!ids || !pos) return;
    document.getElementById(ids[0]).value = (pos.x ?? 0).toFixed(4);
    document.getElementById(ids[1]).value = (pos.y ?? 0).toFixed(4);
    document.getElementById(ids[2]).value = (pos.z ?? 0).toFixed(4);
    document.getElementById(ids[3]).value = (pos.w ?? 0).toFixed(4);
}

/* ---- Read location data from DOM ---- */
function readLocationData() {
    if (!selectedLocation) return;
    const loc = configData.TherapyLocations[selectedLocation];
    if (!loc) return;

    const newName = document.getElementById('locName')?.value.trim() || selectedLocation;
    loc.coords = { x: floatVal('locCX'), y: floatVal('locCY'), z: floatVal('locCZ'), w: floatVal('locCW') };
    loc.cost = floatVal('locCost');
    loc.showBlip = !!document.getElementById('locBlip')?.checked;
    loc.blipId = parseInt(document.getElementById('locBlipId')?.value) || 0;
    loc.ped = {
        model: document.getElementById('pedModel')?.value || 's_m_m_doctor_01',
        coords: { x: floatVal('pedCX'), y: floatVal('pedCY'), z: floatVal('pedCZ'), w: floatVal('pedCW') }
    };

    const stepCards = document.querySelectorAll('#stepsWrap .step-card');
    loc.steps = [];
    stepCards.forEach(card => {
        const idx = parseInt(card.dataset.stepIndex);
        loc.steps.push({
            coords: {
                x: floatVal(`s${idx}CX`), y: floatVal(`s${idx}CY`),
                z: floatVal(`s${idx}CZ`), w: floatVal(`s${idx}CW`)
            },
            progress: {
                duration: intVal(`s${idx}Dur`),
                label: document.getElementById(`s${idx}Label`)?.value || 'Step',
                canCancel: !!document.getElementById(`s${idx}Cancel`)?.checked,
                disable: {
                    move: !!document.getElementById(`s${idx}DisMove`)?.checked,
                    combat: !!document.getElementById(`s${idx}DisCombat`)?.checked
                },
                anim: {
                    dict: document.getElementById(`s${idx}Dict`)?.value || '',
                    clip: document.getElementById(`s${idx}Clip`)?.value || '',
                    flag: intVal(`s${idx}Flag`)
                }
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
