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

-- Also register a keybind for testing
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

RegisterNUICallback('startPedPlacement', function(data, cb)
    cb({})
    SetNuiFocus(false, false)

    local locName   = data.name
    local modelHash = joaat('s_m_m_doctor_01')
    RequestModel(modelHash)
    while not HasModelLoaded(modelHash) do Wait(10) end

    local spawnPos = GetEntityCoords(PlayerPedId())
    local tempPed  = CreatePed(4, modelHash, spawnPos.x, spawnPos.y, spawnPos.z, 0.0, false, true)
    SetEntityInvincible(tempPed, true)
    SetBlockingOfNonTemporaryEvents(tempPed, true)
    SetEntityAsMissionEntity(tempPed, true, true)
    SetEntityAlpha(tempPed, 180, false)

    -- phase: 'raycast' → 'gizmo' → 'confirm' | 'cancel'
    local phase = 'raycast'

    CreateThread(function()
        while phase ~= 'confirm' and phase ~= 'cancel' do
            Wait(0)

            if phase == 'raycast' then
                -- Ground raycast from camera
                local camPos = GetGameplayCamCoord()
                local camRot = GetGameplayCamRot(2)
                local f      = math.rad(camRot.z)
                local p      = math.rad(camRot.x)
                local dir    = vector3(-math.sin(f) * math.cos(p), math.cos(f) * math.cos(p), math.sin(p))
                local dest   = camPos + dir * 50.0
                local ray    = StartShapeTestRay(camPos.x, camPos.y, camPos.z, dest.x, dest.y, dest.z, 1 + 16, tempPed, 0)
                local _, hit, hitPos = GetShapeTestResult(ray)
                if hit then
                    SetEntityCoordsNoOffset(tempPed, hitPos.x, hitPos.y, hitPos.z, false, false, false)
                end

                -- Rotation via arrow keys (disabled so they don't trigger game actions)
                DisableControlAction(0, 174, true)
                DisableControlAction(0, 175, true)
                DisableControlAction(0, 38,  true)
                DisableControlAction(0, 177, true)
                if IsDisabledControlPressed(0, 174) then
                    SetEntityHeading(tempPed, GetEntityHeading(tempPed) + 2.0)
                end
                if IsDisabledControlPressed(0, 175) then
                    SetEntityHeading(tempPed, GetEntityHeading(tempPed) - 2.0)
                end

                -- Blue arrow marker above ped
                local pp = GetEntityCoords(tempPed)
                DrawMarker(36, pp.x, pp.y, pp.z + 1.8, 0, 0, 0, 0, 180, 0, 0.5, 0.5, 0.5, 94, 196, 255, 200, false, true, 2, nil, nil, false)

                BeginTextCommandDisplayHelp('STRING')
                AddTextComponentSubstringPlayerName('~b~[E]~w~ Lock Position   ~b~[←→]~w~ Rotate   ~b~[BACKSPACE]~w~ Cancel')
                EndTextCommandDisplayHelp(0, false, true, -1)

                if IsDisabledControlJustPressed(0, 38)  then phase = 'gizmo'  end
                if IsDisabledControlJustPressed(0, 177) then phase = 'cancel' end

            elseif phase == 'gizmo' then
                StartEntityGizmo(tempPed)

                DisableControlAction(0, 191, true)
                DisableControlAction(0, 177, true)

                BeginTextCommandDisplayHelp('STRING')
                AddTextComponentSubstringPlayerName('~b~[ENTER]~w~ Confirm   ~b~[BACKSPACE]~w~ Back to Placement')
                EndTextCommandDisplayHelp(0, false, true, -1)

                if IsDisabledControlJustPressed(0, 191) then phase = 'confirm' end
                if IsDisabledControlJustPressed(0, 177) then phase = 'raycast' end
            end
        end

        local finalPos     = GetEntityCoords(tempPed)
        local finalHeading = GetEntityHeading(tempPed)

        ResetEntityAlpha(tempPed)
        DeleteEntity(tempPed)
        SetModelAsNoLongerNeeded(modelHash)

        SetNuiFocus(true, true)

        if phase == 'confirm' then
            SendNUIMessage({
                action = 'pedPlacementResult',
                name   = locName,
                coords = { x = finalPos.x, y = finalPos.y, z = finalPos.z, w = finalHeading }
            })
        else
            SendNUIMessage({ action = 'pedPlacementCancelled' })
        end
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
