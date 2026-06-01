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
    local found, groundZ = GetGroundZFor_3dCoord(coords.x, coords.y, coords.z, false)
    local z = found and groundZ or coords.z
    cb({ x = coords.x, y = coords.y, z = z, w = heading })
end)

-- =====================
-- 3D PLACEMENT MODE
-- Stage 1: place ped (ghost model follows raycast, scroll to rotate, LMB confirm, RMB cancel)
-- Stages 2-4: place each step marker (LMB confirm, RMB skip rest)
-- =====================

local function placementRay(ignoreEnt)
    local cam = GetGameplayCamCoord()
    local rot = GetGameplayCamRot(2)
    local rad = math.pi / 180
    local dir = vector3(
        -math.sin(rot.z * rad) * math.abs(math.cos(rot.x * rad)),
         math.cos(rot.z * rad) * math.abs(math.cos(rot.x * rad)),
         math.sin(rot.x * rad)
    )
    local dst = cam + dir * 1000.0
    local _, hit, pos, normal = GetShapeTestResult(
        StartShapeTestRay(cam.x, cam.y, cam.z, dst.x, dst.y, dst.z, -1, PlayerPedId(), 0)
    )
    if not hit then return false, nil end

    -- Surface is mostly horizontal (floor) — use Z directly
    if normal and normal.z > 0.5 then
        return true, pos
    end

    -- Ray hit a wall or ceiling — shoot straight down from that X,Y to find the floor beneath
    local _, fhit, fpos, fnormal = GetShapeTestResult(
        StartShapeTestRay(pos.x, pos.y, pos.z + 2.0, pos.x, pos.y, pos.z - 10.0, -1, PlayerPedId(), 0)
    )
    if fhit and fnormal and fnormal.z > 0.5 then
        return true, fpos
    end

    -- Fallback: use whatever the primary ray hit
    return true, pos
end

RegisterNUICallback('startPedPlacement', function(data, cb)
    cb({})
    SetNuiFocus(false, false)

    local locName   = data.name
    local modelHash = joaat('s_m_m_doctor_01')
    RequestModel(modelHash)
    while not HasModelLoaded(modelHash) do Wait(0) end

    local spawnPos = GetEntityCoords(PlayerPedId())
    local ghostPed = CreatePed(4, modelHash, spawnPos.x, spawnPos.y, spawnPos.z, 0.0, false, true)
    SetEntityInvincible(ghostPed, true)
    SetBlockingOfNonTemporaryEvents(ghostPed, true)
    SetEntityAsMissionEntity(ghostPed, true, true)
    SetEntityAlpha(ghostPed, 150, false)
    SetEntityCollision(ghostPed, false, false)
    FreezeEntityPosition(ghostPed, true)
    TaskStandStill(ghostPed, -1)  -- force upright stand pose, no spawn animation

    local pedHeading = 0.0
    local stage      = 'ped'
    local lastStage  = nil
    local placed     = { ped = nil, steps = {} }

    CreateThread(function()
        while stage ~= 'done' and stage ~= 'cancel' do
            Wait(0)

            -- disable controls we intercept
            DisableControlAction(0, 24,  true)  -- LMB
            DisableControlAction(0, 25,  true)  -- RMB
            DisableControlAction(0, 174, true)  -- left arrow
            DisableControlAction(0, 175, true)  -- right arrow
            DisableControlAction(0, 241, true)  -- scroll up
            DisableControlAction(0, 242, true)  -- scroll down

            -- re-show textUI every frame so other resources can't permanently kill it
            local style = { whiteSpace = 'pre-line' }
            if stage == 'ped' then
                lib.showTextUI('[LMB] Place Ped\n[Scroll / ← →] Rotate\n[RMB] Cancel', {
                    position = 'left-center', icon = 'user-doctor', style = style
                })
            elseif stage == 'step1' then
                lib.showTextUI('Step 1 of 3\n[LMB] Set Position\n[RMB] Skip All Steps', {
                    position = 'left-center', icon = 'location-dot', style = style
                })
            elseif stage == 'step2' then
                lib.showTextUI('Step 2 of 3\n[LMB] Set Position\n[RMB] Skip Remaining', {
                    position = 'left-center', icon = 'location-dot', style = style
                })
            elseif stage == 'step3' then
                lib.showTextUI('Step 3 of 3\n[LMB] Set Position\n[RMB] Finish', {
                    position = 'left-center', icon = 'location-dot', style = style
                })
            end

            local rayHit, rayPos = placementRay()

            if stage == 'ped' then
                if rayHit then
                    SetEntityCoordsNoOffset(ghostPed, rayPos.x, rayPos.y, rayPos.z + 1.0, false, false, false)
                end

                if IsDisabledControlJustPressed(0, 241) or IsDisabledControlPressed(0, 174) then
                    pedHeading = (pedHeading + 5.0) % 360.0
                end
                if IsDisabledControlJustPressed(0, 242) or IsDisabledControlPressed(0, 175) then
                    pedHeading = (pedHeading - 5.0) % 360.0
                end
                SetEntityHeading(ghostPed, pedHeading)

                if IsDisabledControlJustPressed(0, 24) then
                    local pos = GetEntityCoords(ghostPed)
                    placed.ped = { x = pos.x, y = pos.y, z = pos.z - 1.0, w = pedHeading }
                    SetEntityAlpha(ghostPed, 50, false)
                    stage = 'step1'
                elseif IsDisabledControlJustPressed(0, 25) then
                    stage = 'cancel'
                end

            elseif stage == 'step1' or stage == 'step2' or stage == 'step3' then
                local n = tonumber(stage:sub(-1))

                -- draw already-confirmed step markers so user can see all placed positions
                for i = 1, n - 1 do
                    local s = placed.steps[i]
                    if s then
                        DrawMarker(1, s.x, s.y, s.z, 0,0,0, 0,0,0,
                            0.5, 0.5, 0.4, 0, 200, 100, 220, false, true, 2, nil, nil, false)
                    end
                end

                -- cursor marker for current step (orange)
                if rayHit then
                    DrawMarker(1, rayPos.x, rayPos.y, rayPos.z, 0,0,0, 0,0,0,
                        0.5, 0.5, 0.4, 255, 165, 0, 180, false, true, 2, nil, nil, false)
                end

                if IsDisabledControlJustPressed(0, 24) and rayHit then
                    placed.steps[n] = { x = rayPos.x, y = rayPos.y, z = rayPos.z, w = 0.0 }
                    stage = n < 3 and ('step' .. (n + 1)) or 'done'
                elseif IsDisabledControlJustPressed(0, 25) then
                    stage = 'done'
                end
            end
        end

        lib.hideTextUI()
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
                steps  = stepsOut,
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
