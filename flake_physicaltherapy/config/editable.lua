--#Notifications
Config.Notify = function(message, type)
    lib.notify({
        title = 'Physical Therapy',
        description = message,
        type = type,
        position = 'top',
        duration = 5000
    })
end


--TEXT UI
Config.showTextUI = function(msg)
    lib.showTextUI(msg)
end

Config.hideTextUI = function()
    lib.hideTextUI()
end