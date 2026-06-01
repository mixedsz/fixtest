-- client.lua
-- Physical Therapy - Client Script

local ESX       = nil
local QBCore    = nil
local inTherapy = false  -- guards against duplicate sessions

-- =====================
-- FRAMEWORK INIT
-- =====================

CreateThread(function()
    if GetResourceState(Config.ESXgetSharedObject) == 'started' then
        ESX = exports[Config.ESXgetSharedObject]:getSharedObject()
    end

    if GetResourceState(Config.QBCoreGetCoreObject) == 'started' then
        QBCore = exports[Config.QBCoreGetCoreObject]:GetCoreObject()
    end
end)

-- =====================
-- INTERNAL: Remove crutch silently after therapy completes
-- =====================

local function RemoveCrutchOnCompletion()
    local serverId = GetPlayerServerId(PlayerId())

    if GetResourceState('wasabi_crutch') == 'started' then
        exports.wasabi_crutch:RemoveCrutch(serverId)
    elseif GetResourceState('ak47_crutch') == 'started' then
        TriggerServerEvent('ak47_crutch:remove', serverId)
    elseif GetResourceState('ak47_qb_crutch') == 'started' then
        TriggerServerEvent('ak47_qb_crutch:remove', serverId)
    end
end

-- =====================
-- REMOVE CRUTCH (via doctor slip item — server triggers this)
-- =====================

RegisterNetEvent('flake_physicaltherapy:RemoveCrutchItem', function()
    local wasabiActive = GetResourceState('wasabi_crutch')  == 'started'
    local ak47Active   = GetResourceState('ak47_crutch')    == 'started'
    local ak47QBActive = GetResourceState('ak47_qb_crutch') == 'started'
    local serverId     = GetPlayerServerId(PlayerId())

    if wasabiActive then
        if exports.wasabi_crutch:IsCrutchActive() then
            exports.wasabi_crutch:RemoveCrutch(serverId)
            Config.Notify('You used the doctor slip. Your wasabi crutch has been removed!', 'success')
            return
        elseif ak47Active then
            TriggerServerEvent('ak47_crutch:remove', serverId)
            Config.Notify('You used the doctor slip. Your ak47 crutch has been removed!', 'success')
            return
        elseif ak47QBActive then
            TriggerServerEvent('ak47_qb_crutch:remove', serverId)
            Config.Notify('You used the doctor slip. Your ak47_qb crutch has been removed!', 'success')
            return
        else
            Config.Notify("You aren't currently using a crutch.", 'error')
            return
        end
    elseif ak47Active then
        TriggerServerEvent('ak47_crutch:remove', serverId)
        Config.Notify('You used the doctor slip. Your ak47 crutch has been removed!', 'success')
    elseif ak47QBActive then
        TriggerServerEvent('ak47_qb_crutch:remove', serverId)
        Config.Notify('You used the doctor slip. Your ak47_qb crutch has been removed!', 'success')
    else
        Config.Notify("You aren't currently using a crutch.", 'error')
    end
end)

-- =====================
-- SPAWN PEDS + INTERACTION (with reload support)
-- =====================

local SpawnedPeds   = {}
local ActiveThreads = {}
local SpawnedBlips  = {}

-- Convert payload tables back into vectors for FiveM
local function applyPayloadToConfig(tbl)
    local out = {}
    for k, v in pairs(tbl) do
        local t = type(v)
        if t == 'table' then
            if type(v.x) == 'number' and type(v.y) == 'number' and type(v.z) == 'number' then
                if type(v.w) == 'number' then
                    out[k] = vec4(v.x, v.y, v.z, v.w)
                else
                    out[k] = vec3(v.x, v.y, v.z)
                end
            else
                out[k] = applyPayloadToConfig(v)
            end
        else
            out[k] = v
        end
    end
    return out
end

local function StopAndCleanAllLocations()
    for name, _ in pairs(ActiveThreads) do
        ActiveThreads[name] = false
    end
    Wait(250)

    local pedNames = {}
    for name, _ in pairs(SpawnedPeds) do
        pedNames[#pedNames+1] = name
    end
    for _, name in ipairs(pedNames) do
        local ped = SpawnedPeds[name]
        if DoesEntityExist(ped) then
            pcall(function() exports.ox_target:removeLocalEntity(ped) end)
            pcall(function() exports['qb-target']:RemoveTargetEntity(ped) end)
            DeleteEntity(ped)
        end
        SpawnedPeds[name] = nil
    end

    local threadNames = {}
    for name, _ in pairs(ActiveThreads) do
        threadNames[#threadNames+1] = name
    end
    for _, name in ipairs(threadNames) do
        ActiveThreads[name] = nil
    end

    for name, blip in pairs(SpawnedBlips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
        SpawnedBlips[name] = nil
    end
end

local function SpawnLocation(locName, locData)
    local modelHash = joaat(locData.ped.model)
    RequestModel(modelHash)
    while not HasModelLoaded(modelHash) do
        Wait(10)
    end

    local px = locData.ped.coords.x
    local py = locData.ped.coords.y
    local pz = locData.ped.coords.z

    local ped = CreatePed(4, modelHash, px, py, pz, locData.ped.coords.w, false, true)

    SetEntityInvincible(ped, true)
    SetBlockingOfNonTemporaryEvents(ped, true)
    SetPedDiesWhenInjured(ped, false)
    SetEntityAsMissionEntity(ped, true, true)
    FreezeEntityPosition(ped, true)

    SpawnedPeds[locName] = ped
    ActiveThreads[locName] = true

    -- Blip
    if locData.showBlip then
        local blip = AddBlipForCoord(locData.ped.coords.x, locData.ped.coords.y, locData.ped.coords.z)
        SetBlipSprite(blip, locData.blipId or 61)
        SetBlipDisplay(blip, 4)
        SetBlipScale(blip, 0.8)
        SetBlipColour(blip, 2)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentString(locName)
        EndTextCommandSetBlipName(blip)
        SpawnedBlips[locName] = blip
    end

    -- Interaction system
    if Config.System == 'ox_target' then
        exports.ox_target:addLocalEntity(ped, {
            {
                name  = 'therapy_option_' .. locName,
                label = 'Physical Therapy ($' .. locData.cost .. ')',
                icon  = 'fa-solid fa-person',
                canInteract = function(entity, distance)
                    return distance < 3.0
                end,
                onSelect = function()
                    StartTherapy(locName, locData)
                end,
            }
        })

    elseif Config.System == 'qb-target' then
        exports['qb-target']:AddTargetEntity(ped, {
            options = {
                {
                    type    = 'client',
                    event   = 'flake_physicaltherapy:Start',
                    icon    = 'fa-solid fa-person',
                    label   = 'Physical Therapy ($' .. locData.cost .. ')',
                    locName = locName,
                }
            },
            distance = Config.Distance,
        })

    else
        -- Fallback: TextUI + E key
        CreateThread(function()
            while ActiveThreads[locName] do
                Wait(0)

                local playerCoords = GetEntityCoords(PlayerPedId())
                local pedCoords    = vec3(locData.ped.coords.x, locData.ped.coords.y, locData.ped.coords.z)
                local dist         = #(playerCoords - pedCoords)

                if dist < Config.Distance then
                    Config.showTextUI('Click [E] to start Physical Therapy ($' .. locData.cost .. ')')
                    if IsControlJustPressed(0, 38) then
                        StartTherapy(locName, locData)
                    end
                elseif dist >= Config.Distance and dist <= 4.0 then
                    Config.hideTextUI()
                end
            end
            Config.hideTextUI()
        end)
    end

    -- Green marker at the NPC location
    CreateThread(function()
        while ActiveThreads[locName] do
            Wait(0)

            local playerCoords = GetEntityCoords(PlayerPedId())
            local targetCoords = vec3(locData.coords.x, locData.coords.y, locData.coords.z)
            local dist         = #(playerCoords - targetCoords)

            if dist < 15.0 then
                DrawMarker(
                    2,
                    locData.coords.x, locData.coords.y, locData.coords.z + 0.15,
                    0.0, 0.0, 0.0,
                    0.0, 0.0, 0.0,
                    0.5, 0.5, 0.3,
                    0, 255, 0, 150,
                    false, false, 2, true, nil, nil, false
                )
            end
        end
    end)
end

local function SpawnAllLocations()
    for locName, locData in pairs(Config.TherapyLocations) do
        SpawnLocation(locName, locData)
    end
end

CreateThread(SpawnAllLocations)

RegisterNetEvent('flake_physicaltherapy:reloadConfig', function(newConfigPayload)
    local oldESX = Config.ESXgetSharedObject
    local oldQBCore = Config.QBCoreGetCoreObject

    -- apply converted payload
    local converted = applyPayloadToConfig(newConfigPayload)
    for k, v in pairs(converted) do
        Config[k] = v
    end

    Config.ESXgetSharedObject = Config.ESXgetSharedObject or oldESX
    Config.QBCoreGetCoreObject = Config.QBCoreGetCoreObject or oldQBCore

    StopAndCleanAllLocations()
    Wait(300)
    SpawnAllLocations()
end)

-- =====================
-- qb-target bridge: fires client event with locName in data table
-- =====================

RegisterNetEvent('flake_physicaltherapy:Start', function(data)
    if not data or not data.locName then return end
    local locData = Config.TherapyLocations[data.locName]
    if not locData then return end
    StartTherapy(data.locName, locData)
end)

-- =====================
-- START THERAPY SESSION
-- =====================

function StartTherapy(locName, locData)
    -- Crutch requirement (wasabi only — others don't expose IsCrutchActive)
    if GetResourceState('wasabi_crutch') == 'started' then
        if not exports.wasabi_crutch:IsCrutchActive() then
            Config.Notify("You are not on a crutch! You can't do therapy right now.", 'error')
            return
        end
    end

    -- Prevent duplicate sessions
    if inTherapy then
        Config.Notify("You're already in a therapy session!", 'error')
        return
    end

    -- Server callback: validates EMS, cooldown; uses doctor slip OR deducts money
    lib.callback('flake_physicaltherapy:attemptTherapy', false, function(result)
        if not result.success then
            if result.reason == 'EMS_UNAVAILABLE' then
                local emsCount = result.emsCount or 0
                Config.Notify('There are ' .. emsCount .. " EMS online, we're unavailable now.", 'error')

            elseif result.reason == 'NEEDS_SLIP' then
                local itemName = result.item or 'doctor slip'
                Config.Notify("You need a " .. itemName .. " to start therapy!", 'error')

            elseif result.reason == 'NO_MONEY' then
                Config.Notify("You don't have enough money to start therapy!", 'error')

            elseif result.reason == 'COOLDOWN' then
                local timeLeft = math.ceil(result.timeLeft or 0)
                Config.Notify('You must wait ' .. timeLeft .. ' more second(s) before starting therapy again.', 'error')

            else
                Config.Notify('Unable to start therapy due to an error.', 'error')
            end
            return
        end

        -- Let the player know how they paid
        if result.usedItem then
            Config.Notify('Doctor slip accepted. Complete all 3 steps of therapy to finish.', 'inform')
        else
            Config.Notify('Complete all 3 steps of therapy to finish the session.', 'inform')
        end

        inTherapy = true
        BeginTherapySteps(locData)
    end, locData.cost)
end

-- =====================
-- THERAPY STEPS (sequential chain)
-- Steps are stored as an array: locData.steps[1], [2], [3]
-- =====================

function BeginTherapySteps(locData)
    if not locData or not locData.steps then
        inTherapy = false
        return
    end

    local steps = locData.steps

    -- Chain steps sequentially via nested callbacks
    DoTherapyStep(steps[1], 1, function()
        DoTherapyStep(steps[2], 2, function()
            DoTherapyStep(steps[3], 3, function()
                Config.Notify('You have completed your therapy. Your crutch is off.', 'success')
                RemoveCrutchOnCompletion()
                inTherapy = false
            end)
        end)
    end)
end

-- =====================
-- INDIVIDUAL STEP HANDLER
-- stepData   = { coords = vec4, progress = { ... } }
-- stepNumber = 1 | 2 | 3
-- onComplete = called after progress bar finishes
-- Missing steps (nil) are skipped gracefully so locations with < 3 steps work.
-- =====================

function DoTherapyStep(stepData, stepNumber, onComplete)
    if not stepData or not stepData.coords then
        if onComplete then onComplete() end
        return
    end

    local stepCoords  = vec3(stepData.coords.x, stepData.coords.y, stepData.coords.z)
    local stepHeading = stepData.coords.w

    CreateThread(function()
        local done = false

        while not done do
            Wait(0)

            local playerCoords = GetEntityCoords(PlayerPedId())
            local dist         = #(playerCoords - stepCoords)

            -- Yellow marker visible from 50 m
            if dist < 50.0 then
                DrawMarker(
                    2,
                    stepCoords.x, stepCoords.y, stepCoords.z + 0.15,
                    0.0, 0.0, 0.0,
                    0.0, 0.0, 0.0,
                    0.5, 0.5, 0.3,
                    255, 255, 0, 150,
                    false, false, 2, true, nil, nil, false
                )
            end

            -- Interaction zone (2 m)
            if dist < 2.0 then
                Config.showTextUI('Click [E] to start Step ' .. stepNumber)

                if IsControlJustPressed(0, 38) then
                    done = true
                    Config.hideTextUI()
                    Config.Notify("Keep going, you're almost done!", 'success')

                    -- Face the correct heading for the animation
                    SetEntityHeading(PlayerPedId(), stepHeading)

                    -- ox_lib progress bar (blocks movement/combat, plays anim)
                    lib.progressBar(stepData.progress)

                    if onComplete then onComplete() end
                end
            else
                Config.hideTextUI()
            end
        end
    end)
end
