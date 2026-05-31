-- admin.lua
-- In-game NUI admin panel for Flake Physical Therapy

local function vecToTable(v)
    if not v then return nil end
    local t = { x = v.x, y = v.y, z = v.z }
    if v.w then t.w = v.w end
    return t
end

local function configToPayload(cfg)
    local out = {}
    for k, v in pairs(cfg) do
        local t = type(v)
        if t == 'function' then
            out[k] = nil
        elseif t == 'table' then
            if v.x and v.y then
                out[k] = vecToTable(v)
            else
                out[k] = configToPayload(v)
            end
        else
            out[k] = v
        end
    end
    return out
end

RegisterCommand('ptadmin', function()
    print('[PT Admin] /ptadmin command triggered')
    lib.callback('flake_physicaltherapy:canUseAdminPanel', false, function(result)
        print('[PT Admin] Permission result:', json.encode(result))
        if not result or not result.allowed then
            Config.Notify('You do not have permission to use the admin panel.', 'error')
            return
        end

        SetNuiFocus(true, true)
        SendNUIMessage({
            action = 'open',
            config = configToPayload(Config)
        })
    end)
end, false)

RegisterKeyMapping('ptadmin', 'Open Physical Therapy Admin', 'keyboard', 'F6')

RegisterNUICallback('closeUI', function(data, cb)
    SetNuiFocus(false, false)
    cb({})
end)

RegisterNUICallback('saveConfig', function(data, cb)
    if not data or not data.config then
        cb({ success = false, error = 'No data received' })
        return
    end

    lib.callback('flake_physicaltherapy:saveConfig', false, function(result)
        cb(result or { success = false, error = 'Server error' })
    end, data.config)
end)

RegisterNUICallback('getPosition', function(data, cb)
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    cb({ x = coords.x, y = coords.y, z = coords.z, w = heading })
end)

-- =====================
-- 3D PLACEMENT MODE
-- Stage 1: place ped (ghost model follows raycast, scroll to rotate, LMB confirm, RMB cancel)
-- Stages 2-4: place each step marker (LMB confirm, RMB skip rest)
-- =====================

RegisterNUICallback('startPedPlacement', function(data, cb)
    cb({})
    SetNuiFocus(false, false)

    local locName = data.name

    CreateThread(function()
        -- ── Step 1: place the therapy ped ──────────────────────────────────
        local pedModelHash = joaat('s_m_m_doctor_01')
        lib.requestModel(pedModelHash)

        local playerPed = PlayerPedId()
        local spawnPos  = GetEntityCoords(playerPed) + GetEntityForwardVector(playerPed) * 2.0

        local ghostPed = CreatePed(4, pedModelHash, spawnPos.x, spawnPos.y, spawnPos.z,
            GetEntityHeading(playerPed), false, true)
        SetEntityInvincible(ghostPed, true)
        SetBlockingOfNonTemporaryEvents(ghostPed, true)
        SetEntityAsMissionEntity(ghostPed, true, true)
        SetEntityCollision(ghostPed, false, false)

        local pedResult = PT_UseGizmo(ghostPed)
        local pedPos    = pedResult.position
        local pedCoords = { x = pedPos.x, y = pedPos.y, z = pedPos.z, w = GetEntityHeading(ghostPed) }

        DeleteEntity(ghostPed)
        SetModelAsNoLongerNeeded(pedModelHash)

        -- ── Steps 1-3: place each step marker using a cone prop ───────────
        local coneModelHash = joaat('prop_mp_cone_02')
        lib.requestModel(coneModelHash)

        local steps = {}
        for i = 1, 3 do
            local cone = CreateObject(coneModelHash,
                pedCoords.x, pedCoords.y, pedCoords.z, false, false, false)
            SetEntityInvincible(cone, true)
            SetEntityAsMissionEntity(cone, true, true)
            SetEntityCollision(cone, false, false)

            local stepResult = PT_UseGizmo(cone)
            local sp = stepResult.position
            steps[i]  = { x = sp.x, y = sp.y, z = sp.z, w = 0.0 }

            DeleteEntity(cone)
        end

        SetModelAsNoLongerNeeded(coneModelHash)

        -- ── Return to NUI ─────────────────────────────────────────────────
        SetNuiFocus(true, true)
        SendNUIMessage({
            action = 'pedPlacementResult',
            name   = locName,
            ped    = pedCoords,
            steps  = steps,
        })
    end)
end)

RegisterNUICallback('teleportToLocation', function(data, cb)
    if data and data.coords then
        local c = data.coords
        local ped = PlayerPedId()
        SetEntityCoords(ped, c.x, c.y, c.z, false, false, false, true)
        SetEntityHeading(ped, c.w or 0.0)
    end
    cb({})
end)
