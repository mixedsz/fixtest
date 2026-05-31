Config = {}
Config.Debug = true

Config.ESXgetSharedObject  = 'es_extended'
Config.QBCoreGetCoreObject = 'qb-core'

Config.Distance = 2.0

Config.System = 'textui'  -- 'ox_target' | 'qb-target' | 'textui'

Config.Cooldown = {
    enable = true,
    time   = 600  -- seconds
}

Config.DoctorSlipItem = {
    enable = true,
    item   = 'docslip'
    -- If the player has this item when starting therapy:
    --   the item is consumed and they are NOT charged the cost.
    -- If they do NOT have the item, the normal cost is deducted from cash.
}

Config.EMSJobs = {
    'ambulance',
    'ems',
}

Config.EMSCount = 0  -- minimum EMS online required (0 = always available)

-- Admin panel permission system
-- Add the ACE group names you want to allow. These map to `group.<name>`.
-- Default: {'owner', 'admin'} — allows group.owner and group.admin.
Config.AdminPanelRoles = {
    'owner',
    'admin',
}

-- Set to true to ALSO require the custom ACE `flake_physicaltherapy.admin`.
-- Default: false — so only the group roles above are checked.
Config.AdminPanelRequireACE = false

Config.TherapyLocations = {
    Pillbox = {
        coords   = vec4(318.9512, -589.0149, 43.2841, 341.6656),
        cost     = 500,
        showBlip = true,
        ped = {
            model  = 's_m_m_doctor_01',
            coords = vec4(319.1278, -588.3556, 43.2841, 160.5713),
        },
        steps = {
            {
                coords = vec4(322.3745, -592.3754, 43.2841, 68.9359),
                progress = {
                    duration  = 20000,
                    label     = 'Leg Stretching...',
                    canCancel = false,
                    disable   = { move = true, combat = true },
                    anim = {
                        dict = 'mini@triathlon',
                        clip = 'idle_e',
                        flag = 7,
                    },
                },
            },
            {
                coords = vec4(319.3133, -593.7554, 43.2841, 344.1032),
                progress = {
                    duration  = 20000,
                    label     = 'Arm Stretching...',
                    canCancel = false,
                    disable   = { move = true, combat = true },
                    anim = {
                        dict = 'mini@triathlon',
                        clip = 'idle_f',
                        flag = 7,
                    },
                },
            },
            {
                coords = vec4(316.1853, -592.1685, 43.2841, 333.1860),
                progress = {
                    duration  = 20000,
                    label     = 'Exercising...',
                    canCancel = false,
                    disable   = { move = true, combat = true },
                    anim = {
                        dict = 'timetable@reunited@ig_2',
                        clip = 'jimmy_getknocked',
                        flag = 7,
                    },
                },
            },
        },
    },

    CayoPerico = {
        coords   = vec4(5198.0337, -5012.7637, 14.3701, 45.5706),
        cost     = 25000,
        showBlip = true,
        ped = {
            model  = 's_m_m_doctor_01',
            coords = vec4(5198.0337, -5012.7637, 14.3701, 45.5706),
        },
        steps = {
            {
                coords = vec4(5195.3921, -5011.9624, 14.1762, 46.0579),
                progress = {
                    duration  = 6000,
                    label     = 'Stretching...',
                    canCancel = false,
                    disable   = { move = true, combat = true },
                    anim = {
                        dict = 'mini@triathlon',
                        clip = 'idle_e',
                        flag = 7,
                    },
                },
            },
            {
                coords = vec4(5197.6641, -5009.8486, 14.2756, 39.5841),
                progress = {
                    duration  = 6000,
                    label     = 'Stretching...',
                    canCancel = false,
                    disable   = { move = true, combat = true },
                    anim = {
                        dict = 'mini@triathlon',
                        clip = 'idle_f',
                        flag = 7,
                    },
                },
            },
        },
    },

    -- Add more locations here following the same array-step format.
    -- Locations with fewer than 3 steps skip missing ones gracefully.
}