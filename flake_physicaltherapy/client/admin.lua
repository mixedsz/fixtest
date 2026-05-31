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

    local locName   = data.name
    local modelHash = joaat('s_m_m_doctor_01')
    RequestModel(modelHash)
    while not HasModelLoaded(modelHash) do Wait(10) end

    local spawnPos = GetEntityCoords(PlayerPedId())
    local ghostPed = CreatePed(4, modelHash, spawnPos.x, spawnPos.y, spawnPos.z, 0.0, false, true)
    SetEntityInvincible(ghostPed, true)
    SetBlockingOfNonTemporaryEvents(ghostPed, true)
    SetEntityAsMissionEntity(ghostPed, true, true)
    SetEntityAlpha(ghostPed, 160, false)

    -- stage: 'ped' -> 'step1' -> 'step2' -> 'step3' -> 'done' | 'cancel'
    local stage     = 'ped'
    local lastStage = nil
    local placed    = { ped = nil, steps = {} }

    local function getRay()
        local cam = GetGameplayCamCoord()
        local rot = GetGameplayCamRot(2)
        local f   = math.rad(rot.z)
        local p   = math.rad(rot.x)
        local dir = vector3(-math.sin(f) * math.cos(p), math.cos(f) * math.cos(p), math.sin(p))
        local dst = cam + dir * 60.0
        local ray = StartShapeTestRay(cam.x, cam.y, cam.z, dst.x, dst.y, dst.z, 1 + 16, ghostPed, 0)
        local _, hit, pos = GetShapeTestResult(ray)
        if not hit then return false, nil end

        -- Whatever the ray hit (floor OR wall), shoot a downward ray from that X,Y
        -- to find the actual floor beneath the cursor — ped follows along any surface
        local above = vector3(pos.x, pos.y, pos.z + 2.0)
        local below = vector3(pos.x, pos.y, pos.z - 4.0)
        local dray  = StartShapeTestRay(above.x, above.y, above.z, below.x, below.y, below.z, 1 + 16, ghostPed, 0)
        local _, dhit, dpos, dnormal = GetShapeTestResult(dray)
        if dhit and dnormal and dnormal.z > 0.5 then
            return true, dpos
        end
        -- Fallback: use hit pos directly if downward ray found nothing
        return true, pos
    end

    local function placeOnFloor(x, y, z)
        SetEntityCoordsNoOffset(ghostPed, x, y, z, false, false, false)
        PlaceObjectOnGroundProperly(ghostPed)
    end

    local function forceGroundSnap()
        local pos = GetEntityCoords(ghostPed)
        -- Try engine ground first (works outdoors)
        local found, gz = GetGroundZFor_3dCoord(pos.x, pos.y, pos.z + 3.0, false)
        if found then
            SetEntityCoordsNoOffset(ghostPed, pos.x, pos.y, gz, false, false, false)
            PlaceObjectOnGroundProperly(ghostPed)
        else
            -- Indoors: shoot a ray straight down to find the floor
            local top = vector3(pos.x, pos.y, pos.z + 3.0)
            local bot = vector3(pos.x, pos.y, pos.z - 5.0)
            local ray = StartShapeTestRay(top.x, top.y, top.z, bot.x, bot.y, bot.z, 1 + 16, ghostPed, 0)
            local _, hit, hitPos, normal = GetShapeTestResult(ray)
            if hit and normal and normal.z > 0.5 then
                SetEntityCoordsNoOffset(ghostPed, pos.x, pos.y, hitPos.z, false, false, false)
                PlaceObjectOnGroundProperly(ghostPed)
            end
        end
    end

    CreateThread(function()
        while stage ~= 'done' and stage ~= 'cancel' do
            Wait(0)

            -- Intercept mouse clicks, scroll, and LAlt
            DisableControlAction(0, 24,  true)  -- LMB
            DisableControlAction(0, 25,  true)  -- RMB
            DisableControlAction(0, 241, true)  -- scroll up
            DisableControlAction(0, 242, true)  -- scroll down
            DisableControlAction(0, 19,  true)  -- Left Alt

            -- Update ox_lib textui only on stage change
            if stage ~= lastStage then
                if stage == 'ped' then
                    lib.showTextUI('**Place Therapy Ped**\n**[LMB]** Confirm Position\n**[Scroll ↑↓]** Rotate\n**[L.Alt]** Snap to Ground\n**[RMB]** Cancel', {
                        position = 'left-center', icon = 'user-doctor'
                    })
                elseif stage == 'step1' then
                    lib.showTextUI('**Step 1 of 3**\n**[LMB]** Set Position\n**[RMB]** Skip All Steps', {
                        position = 'left-center', icon = 'location-dot'
                    })
                elseif stage == 'step2' then
                    lib.showTextUI('**Step 2 of 3**\n**[LMB]** Set Position\n**[RMB]** Skip Remaining', {
                        position = 'left-center', icon = 'location-dot'
                    })
                elseif stage == 'step3' then
                    lib.showTextUI('**Step 3 of 3**\n**[LMB]** Set Position\n**[RMB]** Finish', {
                        position = 'left-center', icon = 'location-dot'
                    })
                end
                lastStage = stage
            end

            local hit, hitPos = getRay()

            if stage == 'ped' then
                if hit then
                    placeOnFloor(hitPos.x, hitPos.y, hitPos.z)
                end

                -- Scroll wheel rotation — 10 deg per tick
                if IsDisabledControlJustPressed(0, 241) then
                    SetEntityHeading(ghostPed, GetEntityHeading(ghostPed) + 10.0)
                end
                if IsDisabledControlJustPressed(0, 242) then
                    SetEntityHeading(ghostPed, GetEntityHeading(ghostPed) - 10.0)
                end

                -- L.Alt: force snap to ground
                if IsDisabledControlJustPressed(0, 19) then
                    forceGroundSnap()
                end

                if IsDisabledControlJustPressed(0, 24) then  -- LMB: confirm ped
                    local pos = GetEntityCoords(ghostPed)
                    placed.ped = { x = pos.x, y = pos.y, z = pos.z, w = GetEntityHeading(ghostPed) }
                    SetEntityAlpha(ghostPed, 50, false)
                    stage = 'step1'
                end
                if IsDisabledControlJustPressed(0, 25) then  -- RMB: cancel
                    stage = 'cancel'
                end

            elseif stage == 'step1' or stage == 'step2' or stage == 'step3' then
                local n = tonumber(stage:sub(-1))

                if hit then
                    DrawMarker(1, hitPos.x, hitPos.y, hitPos.z, 0,0,0, 0,0,0,
                        0.6, 0.6, 0.5, 255, 165, 0, 180, false, true, 2, nil, nil, false)
                end

                if IsDisabledControlJustPressed(0, 24) and hit then  -- LMB: confirm step
                    placed.steps[n] = { x = hitPos.x, y = hitPos.y, z = hitPos.z, w = 0.0 }
                    stage = n < 3 and ('step' .. (n + 1)) or 'done'
                end
                if IsDisabledControlJustPressed(0, 25) then  -- RMB: skip remaining
                    stage = 'done'
                end
            end
        end

        lib.hideTextUI()
        ResetEntityAlpha(ghostPed)
        DeleteEntity(ghostPed)
        SetModelAsNoLongerNeeded(modelHash)
        SetNuiFocus(true, true)

        if stage == 'done' and placed.ped then
            local stepsOut = {}
            for i = 1, 3 do
                stepsOut[i] = placed.steps[i] or { x = 0.0, y = 0.0, z = 0.0, w = 0.0 }
            end
            SendNUIMessage({
                action = 'pedPlacementResult',
                name   = locName,
                ped    = placed.ped,
                steps  = stepsOut
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
