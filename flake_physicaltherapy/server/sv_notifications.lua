-- sv_notifications.lua
-- Relays a notification to a specific client by server ID.

RegisterNetEvent('flake_physicaltherapy:notify', function(message, type)
    local src = source
    TriggerClientEvent('flake_physicaltherapy:notify', src, message, type)
end)
