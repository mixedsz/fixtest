-- Embedded object_gizmo
-- Credits: Andyyy7666 (ox_lib PR #453), AvarianKnight (cfx.re forum)

local dataview = require 'client.dataview'

local enableScale    = false
local isCursorActive = false
local gizmoEnabled   = false
local currentMode    = 'Translate'
local isRelative     = false
local currentEntity  = nil

local function normalize(x, y, z)
    local len = math.sqrt(x*x + y*y + z*z)
    if len == 0 then return 0, 0, 0 end
    return x/len, y/len, z/len
end

local function makeEntityMatrix(entity)
    local f, r, u, a = GetEntityMatrix(entity)
    local view = dataview.ArrayBuffer(60)
    view:SetFloat32(0,  r[1]):SetFloat32(4,  r[2]):SetFloat32(8,  r[3]):SetFloat32(12, 0)
        :SetFloat32(16, f[1]):SetFloat32(20, f[2]):SetFloat32(24, f[3]):SetFloat32(28, 0)
        :SetFloat32(32, u[1]):SetFloat32(36, u[2]):SetFloat32(40, u[3]):SetFloat32(44, 0)
        :SetFloat32(48, a[1]):SetFloat32(52, a[2]):SetFloat32(56, a[3]):SetFloat32(60, 1)
    return view
end

local function applyEntityMatrix(entity, view)
    local x1,y1,z1 = view:GetFloat32(16), view:GetFloat32(20), view:GetFloat32(24)
    local x2,y2,z2 = view:GetFloat32(0),  view:GetFloat32(4),  view:GetFloat32(8)
    local x3,y3,z3 = view:GetFloat32(32), view:GetFloat32(36), view:GetFloat32(40)
    local tx,ty,tz = view:GetFloat32(48), view:GetFloat32(52), view:GetFloat32(56)
    if not enableScale then
        x1,y1,z1 = normalize(x1,y1,z1)
        x2,y2,z2 = normalize(x2,y2,z2)
        x3,y3,z3 = normalize(x3,y3,z3)
    end
    SetEntityMatrix(entity, x1,y1,z1, x2,y2,z2, x3,y3,z3, tx,ty,tz)
end

local function gizmoLoop(entity)
    if not gizmoEnabled then
        LeaveCursorMode()
        return
    end

    EnterCursorMode()
    isCursorActive = true

    if IsEntityAPed(entity) then
        SetEntityAlpha(entity, 200)
    else
        SetEntityDrawOutline(entity, true)
    end

    while gizmoEnabled and DoesEntityExist(entity) do
        Wait(0)

        if IsControlJustPressed(0, 47) then -- G: toggle cursor
            if isCursorActive then
                LeaveCursorMode()
                isCursorActive = false
            else
                EnterCursorMode()
                isCursorActive = true
            end
        end

        DisableControlAction(0, 24, true)   -- LMB
        DisableControlAction(0, 25, true)   -- RMB
        DisableControlAction(0, 140, true)  -- R (prevent reload)
        DisablePlayerFiring(PlayerId(), true)

        local matBuf  = makeEntityMatrix(entity)
        local changed = Citizen.InvokeNative(0xEB2EDCA2, matBuf:Buffer(), 'Editor1',
            Citizen.ReturnResultAnyway())
        if changed then
            applyEntityMatrix(entity, matBuf)
        end
    end

    if isCursorActive then LeaveCursorMode() end
    isCursorActive = false

    if DoesEntityExist(entity) then
        if IsEntityAPed(entity) then SetEntityAlpha(entity, 255) end
        SetEntityDrawOutline(entity, false)
    end

    gizmoEnabled  = false
    currentEntity = nil
end

local function textUILoop()
    CreateThread(function()
        while gizmoEnabled do
            Wait(100)
            if not currentEntity then break end

            local pos = GetEntityCoords(currentEntity)
            local rot = GetEntityRotation(currentEntity)
            lib.showTextUI(
                'Mode: ' .. currentMode .. ' | ' .. (isRelative and 'Relative' or 'World') .. '\n' ..
                ('Pos: %.2f, %.2f, %.2f'):format(pos.x, pos.y, pos.z) .. '\n' ..
                ('Rot: %.2f, %.2f, %.2f'):format(rot.x, rot.y, rot.z) .. '\n' ..
                '[G]      Toggle Cursor\n' ..
                '[W]      Translate Mode\n' ..
                '[R]      Rotate Mode\n' ..
                '[Q]      Toggle World/Relative\n' ..
                '[L.Alt]  Snap to Ground\n' ..
                '[Enter]  Confirm',
                { position = 'left-center', style = { whiteSpace = 'pre-line' } }
            )
        end
        lib.hideTextUI()
    end)
end

-- Global so admin.lua can call it directly (same resource, shared scope)
function PT_UseGizmo(entity)
    gizmoEnabled  = true
    currentEntity = entity
    textUILoop()
    gizmoLoop(entity)
    return {
        handle   = entity,
        position = GetEntityCoords(entity),
        rotation = GetEntityRotation(entity),
    }
end

-- ── Keybinds ────────────────────────────────────────────────────────────────

lib.addKeybind({
    name = 'pt_gizmoSelect',
    description = 'Gizmo: select / drag',
    defaultMapper = 'MOUSE_BUTTON',
    defaultKey = 'MOUSE_LEFT',
    onPressed = function()
        if not gizmoEnabled then return end
        ExecuteCommand('+gizmoSelect')
    end,
    onReleased = function()
        ExecuteCommand('-gizmoSelect')
    end,
})

lib.addKeybind({
    name = 'pt_gizmoTranslation',
    description = 'Gizmo: translate mode',
    defaultKey = 'W',
    onPressed = function()
        if not gizmoEnabled then return end
        currentMode = 'Translate'
        ExecuteCommand('+gizmoTranslation')
    end,
    onReleased = function()
        ExecuteCommand('-gizmoTranslation')
    end,
})

lib.addKeybind({
    name = 'pt_gizmoRotation',
    description = 'Gizmo: rotate mode',
    defaultKey = 'R',
    onPressed = function()
        if not gizmoEnabled then return end
        currentMode = 'Rotate'
        ExecuteCommand('+gizmoRotation')
    end,
    onReleased = function()
        ExecuteCommand('-gizmoRotation')
    end,
})

lib.addKeybind({
    name = 'pt_gizmoLocal',
    description = 'Gizmo: toggle world / relative',
    defaultKey = 'Q',
    onPressed = function()
        if not gizmoEnabled then return end
        isRelative = not isRelative
        ExecuteCommand('+gizmoLocal')
    end,
    onReleased = function()
        ExecuteCommand('-gizmoLocal')
    end,
})

lib.addKeybind({
    name = 'pt_gizmoConfirm',
    description = 'Gizmo: confirm placement',
    defaultKey = 'RETURN',
    onReleased = function()
        if not gizmoEnabled then return end
        gizmoEnabled = false
    end,
})

lib.addKeybind({
    name = 'pt_gizmoSnap',
    description = 'Gizmo: snap to ground',
    defaultKey = 'LMENU',
    onPressed = function()
        if not gizmoEnabled or not currentEntity then return end
        PlaceObjectOnGroundProperly_2(currentEntity)
    end,
})
