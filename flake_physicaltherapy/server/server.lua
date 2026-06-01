-- server.lua
-- Physical Therapy - Server Script
-- Handles: framework init, EMS checks, money deduction, cooldowns, doctor slip item, config save+reload

local ESX    = nil
local QBCore = nil

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
-- COOLDOWN STORE
-- In-memory table: { [identifier] = os.time() of last therapy }
-- =====================

local cooldowns = {}

local function getIdentifier(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if string.sub(id, 1, 7) == 'license' then
            return id
        end
    end
    return tostring(src)
end

-- =====================
-- HELPERS: MONEY
-- =====================

local function getPlayerMoney(src)
    if ESX then
        local xPlayer = ESX.GetPlayerFromId(src)
        if xPlayer then
            return xPlayer.getMoney()
        end
    elseif QBCore then
        local Player = QBCore.Functions.GetPlayer(src)
        if Player then
            return Player.PlayerData.money['cash']
        end
    end
    return 0
end

local function removePlayerMoney(src, amount)
    if ESX then
        local xPlayer = ESX.GetPlayerFromId(src)
        if xPlayer then
            xPlayer.removeMoney(amount)
            return true
        end
    elseif QBCore then
        local Player = QBCore.Functions.GetPlayer(src)
        if Player then
            return Player.Functions.RemoveMoney('cash', amount, 'physical-therapy')
        end
    end
    return false
end

-- =====================
-- HELPERS: EMS COUNT
-- =====================

local function getOnlineEMSCount()
    local count = 0
    for _, playerId in ipairs(GetPlayers()) do
        if ESX then
            local xPlayer = ESX.GetPlayerFromId(tonumber(playerId))
            if xPlayer then
                local job = xPlayer.getJob()
                for _, emsJob in ipairs(Config.EMSJobs) do
                    if job.name == emsJob then
                        count = count + 1
                        break
                    end
                end
            end
        elseif QBCore then
            local Player = QBCore.Functions.GetPlayer(tonumber(playerId))
            if Player then
                local job = Player.PlayerData.job
                for _, emsJob in ipairs(Config.EMSJobs) do
                    if job.name == emsJob then
                        count = count + 1
                        break
                    end
                end
            end
        end
    end
    return count
end

-- =====================
-- HELPERS: ITEM (doctor slip)
-- =====================

local function removeItem(src, itemName)
    if ESX then
        local xPlayer = ESX.GetPlayerFromId(src)
        if xPlayer then
            xPlayer.removeInventoryItem(itemName, 1)
            return true
        end
    elseif QBCore then
        local Player = QBCore.Functions.GetPlayer(src)
        if Player then
            return Player.Functions.RemoveItem(itemName, 1)
        end
    end
    return false
end

local function hasItem(src, itemName)
    if ESX then
        local xPlayer = ESX.GetPlayerFromId(src)
        if xPlayer then
            local item = xPlayer.getInventoryItem(itemName)
            return item and item.count > 0
        end
    elseif QBCore then
        local Player = QBCore.Functions.GetPlayer(src)
        if Player then
            local item = Player.Functions.GetItemByName(itemName)
            return item and item.amount > 0
        end
    end
    return false
end

-- =====================
-- CALLBACK: attemptTherapy
-- Called by client before starting a session.
-- Args: cost (number)
-- Returns: { success, usedItem?, reason?, emsCount?, timeLeft? }
--
-- Doctor slip logic:
--   - If DoctorSlipItem is enabled AND the player has the item:
--       consume the item, skip payment entirely, mark usedItem = true
--   - Otherwise:
--       run the normal EMS / cooldown / money checks and deduct cost
-- =====================

lib.callback.register('flake_physicaltherapy:attemptTherapy', function(src, cost)
    -- EMS check (applies regardless of item)
    local emsCount = getOnlineEMSCount()
    if emsCount < Config.EMSCount then
        return { success = false, reason = 'EMS_UNAVAILABLE', emsCount = emsCount }
    end

    -- Cooldown check (applies regardless of item)
    if Config.Cooldown.enable then
        local identifier = getIdentifier(src)
        local lastTime   = cooldowns[identifier]
        if lastTime then
            local elapsed   = os.time() - lastTime
            local remaining = Config.Cooldown.time - elapsed
            if remaining > 0 then
                return { success = false, reason = 'COOLDOWN', timeLeft = remaining }
            end
        end
    end

    -- Doctor slip: required when enabled
    if Config.DoctorSlipItem.enable then
        if not hasItem(src, Config.DoctorSlipItem.item) then
            return { success = false, reason = 'NEEDS_SLIP', item = Config.DoctorSlipItem.item }
        end
        removeItem(src, Config.DoctorSlipItem.item)

        if Config.Cooldown.enable then
            cooldowns[getIdentifier(src)] = os.time()
        end

        if Config.Debug then
            print('[flake_physicaltherapy] Player ' .. src .. ' used doctor slip — therapy free.')
        end

        return { success = true, usedItem = true }
    end

    -- No slip required: standard money check
    local money = getPlayerMoney(src)
    if money < cost then
        return { success = false, reason = 'NO_MONEY' }
    end

    local removed = removePlayerMoney(src, cost)
    if not removed then
        return { success = false, reason = 'NO_MONEY' }
    end

    if Config.Cooldown.enable then
        cooldowns[getIdentifier(src)] = os.time()
    end

    if Config.Debug then
        print('[flake_physicaltherapy] Player ' .. src .. ' paid $' .. cost .. ' for therapy.')
    end

    return { success = true, usedItem = false }
end)

-- =====================
-- qb-target bridge (type = "client" means qb-target fires this on the client
-- directly — this server-side stub is kept for safety only)
-- =====================

RegisterNetEvent('flake_physicaltherapy:Start', function(data)
    -- Intentionally empty: handled client-side
end)

-- =====================
-- HELPERS: ADMIN PANEL PERMISSION
-- =====================

local function getPlayerGroupName(src)
    if ESX then
        local xPlayer = ESX.GetPlayerFromId(src)
        if xPlayer then
            local ok, group = pcall(function() return xPlayer.getGroup() end)
            if ok and group then return group end
            ok, group = pcall(function() return xPlayer:getGroup() end)
            if ok and group then return group end
            ok, group = pcall(function() return xPlayer.group end)
            if ok and group then return group end
        end
    elseif QBCore then
        local Player = QBCore.Functions.GetPlayer(src)
        if Player then
            local ok, group = pcall(function() return Player.PlayerData.group end)
            if ok and group then return group end
        end
    end
    return nil
end

local function isAllowedForAdminPanel(src)
    local roles = Config.AdminPanelRoles or {}
    local playerGroup = getPlayerGroupName(src)

    if Config.Debug then
        print('[flake_physicaltherapy] Admin check for player ' .. src .. ' | group: ' .. tostring(playerGroup) .. ' | roles: ' .. json.encode(roles))
    end

    -- First: check framework group
    if playerGroup then
        for _, role in ipairs(roles) do
            if string.lower(role) == string.lower(playerGroup) then
                return true
            end
        end
    end

    -- Second: ACE fallback
    if IsPlayerAceAllowed(src, 'flake_physicaltherapy.admin') then
        return true
    end

    return false
end

-- =====================
-- ADMIN UI: PERMISSION & SAVE CONFIG
-- =====================

lib.callback.register('flake_physicaltherapy:canUseAdminPanel', function(src)
    local allowed = isAllowedForAdminPanel(src)
    if Config.Debug then
        print('[flake_physicaltherapy] canUseAdminPanel result for ' .. src .. ': ' .. tostring(allowed))
    end
    return { allowed = allowed }
end)

-- Check if a table looks like a simple vector {x, y, z, [w]}
local function isVectorTable(t)
    return type(t) == 'table'
        and type(t.x) == 'number'
        and type(t.y) == 'number'
        and type(t.z) == 'number'
end

local function serializeVal(v, indent)
    indent = indent or 0
    local t = type(v)
    if t == 'table' then
        if isVectorTable(v) then
            if type(v.w) == 'number' then
                return string.format('vec4(%.4f, %.4f, %.4f, %.4f)', v.x, v.y, v.z, v.w)
            else
                return string.format('vec4(%.4f, %.4f, %.4f, 0.0)', v.x, v.y, v.z)
            end
        end

        -- Detect array vs dict
        local maxIdx = 0
        local hasSequential = false
        for _, _ in ipairs(v) do
            maxIdx = maxIdx + 1
            hasSequential = true
        end
        local hasKeys = false
        for k, _ in pairs(v) do
            if type(k) ~= 'number' or k > maxIdx or k < 1 then
                hasKeys = true
                break
            end
        end

        local parts = {}
        local innerIndent = string.rep('    ', indent + 1)
        local closeIndent = string.rep('    ', indent)

        if not hasKeys and hasSequential then
            -- plain array
            for _, item in ipairs(v) do
                table.insert(parts, innerIndent .. serializeVal(item, indent + 1))
            end
            return '{\n' .. table.concat(parts, ',\n') .. '\n' .. closeIndent .. '}'
        else
            -- dict (mixed or keyed)
            for key, val in pairs(v) do
                local keyStr
                if type(key) == 'string' then
                    if key:match('^[A-Za-z_][A-Za-z0-9_]*$') then
                        keyStr = key
                    else
                        keyStr = string.format('%q', key)
                    end
                else
                    keyStr = tostring(key)
                end
                table.insert(parts, innerIndent .. keyStr .. ' = ' .. serializeVal(val, indent + 1))
            end
            return '{\n' .. table.concat(parts, ',\n') .. '\n' .. closeIndent .. '}'
        end
    elseif t == 'string' then
        return string.format('%q', v)
    elseif t == 'boolean' then
        return tostring(v)
    else
        return tostring(v)
    end
end

local function serializeConfig(cfg)
    local lines = {
        '-- Auto-generated by Flake Physical Therapy Admin UI.',
        '-- Manual edits may be overwritten.',
        '',
        'Config = {}',
    }

    -- Preserve certain keys in a fixed order for readability
    local simpleScalars = {
        'Debug', 'ESXgetSharedObject', 'QBCoreGetCoreObject',
        'Distance', 'System',
    }

    for _, k in ipairs(simpleScalars) do
        if cfg[k] ~= nil then
            table.insert(lines, string.format('Config.%s = %s', k, serializeVal(cfg[k])))
        end
    end

    -- EMSJobs array
    if cfg.EMSJobs then
        table.insert(lines, '')
        table.insert(lines, 'Config.EMSJobs = ' .. serializeVal(cfg.EMSJobs))
    end

    if cfg.EMSCount ~= nil then
        table.insert(lines, string.format('Config.EMSCount = %s', serializeVal(cfg.EMSCount)))
    end

    if cfg.Cooldown then
        table.insert(lines, '')
        table.insert(lines, 'Config.Cooldown = ' .. serializeVal(cfg.Cooldown))
    end

    if cfg.DoctorSlipItem then
        table.insert(lines, '')
        table.insert(lines, 'Config.DoctorSlipItem = ' .. serializeVal(cfg.DoctorSlipItem))
    end

    if cfg.AdminPanelRoles then
        table.insert(lines, '')
        table.insert(lines, 'Config.AdminPanelRoles = ' .. serializeVal(cfg.AdminPanelRoles))
    end

    if cfg.AdminPanelRequireACE ~= nil then
        table.insert(lines, string.format('Config.AdminPanelRequireACE = %s', serializeVal(cfg.AdminPanelRequireACE)))
    end

    if cfg.TherapyLocations then
        table.insert(lines, '')
        table.insert(lines, 'Config.TherapyLocations = ' .. serializeVal(cfg.TherapyLocations))
    end

    table.insert(lines, '')
    return table.concat(lines, '\n')
end

lib.callback.register('flake_physicaltherapy:saveConfig', function(src, payload)
    if not isAllowedForAdminPanel(src) then
        return { success = false, error = 'Not authorized' }
    end

    if not payload then
        return { success = false, error = 'No payload' }
    end

    -- Keep framework object keys safe from accidental overwrites
    payload.ESXgetSharedObject  = payload.ESXgetSharedObject  or Config.ESXgetSharedObject
    payload.QBCoreGetCoreObject = payload.QBCoreGetCoreObject or Config.QBCoreGetCoreObject
    -- Preserve admin-only config that the UI never sends
    payload.AdminPanelRoles      = payload.AdminPanelRoles      or Config.AdminPanelRoles
    payload.AdminPanelRequireACE = payload.AdminPanelRequireACE ~= nil and payload.AdminPanelRequireACE or Config.AdminPanelRequireACE

    local serialized = serializeConfig(payload)

    local resourcePath = GetResourcePath(GetCurrentResourceName())
    local configPath   = resourcePath:gsub('\\', '/') .. '/config/config.lua'

    local f = io.open(configPath, 'w')
    if not f then
        return { success = false, error = 'Failed to open config.lua' }
    end

    f:write(serialized)
    f:close()

    -- Update server memory
    Config.Debug               = payload.Debug
    Config.Distance            = payload.Distance
    Config.System              = payload.System
    Config.Cooldown            = payload.Cooldown
    Config.DoctorSlipItem      = payload.DoctorSlipItem
    Config.EMSJobs             = payload.EMSJobs
    Config.EMSCount            = payload.EMSCount
    Config.TherapyLocations    = payload.TherapyLocations
    Config.AdminPanelRoles     = payload.AdminPanelRoles
    Config.AdminPanelRequireACE = payload.AdminPanelRequireACE

    -- Broadcast to clients so they hot-reload
    TriggerClientEvent('flake_physicaltherapy:reloadConfig', -1, payload)

    if Config.Debug then
        print('[flake_physicaltherapy] Config saved and reloaded by admin ' .. src)
    end

    return { success = true }
end)

-- =====================
-- DEBUG: List active cooldowns from server console
-- =====================

if Config.Debug then
    RegisterCommand('pt_cooldowns', function(src)
        if src ~= 0 then return end
        print('[flake_physicaltherapy] Active cooldowns:')
        for id, t in pairs(cooldowns) do
            local remaining = Config.Cooldown.time - (os.time() - t)
            if remaining > 0 then
                print(string.format('  %s -> %ds remaining', id, math.ceil(remaining)))
            end
        end
    end, true)
end
