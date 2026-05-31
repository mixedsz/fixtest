fx_version 'cerulean'
game      'gta5'
lua54     'yes'

author      'Flake'
description 'Physical Therapy Script'

shared_scripts {
    '@ox_lib/init.lua',
    'config/*.lua',
}

client_scripts {
    'client/admin.lua',
    'client/client.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/server.lua',
}

files {
    'web/index.html',
    'web/style.css',
    'web/script.js',
}

ui_page 'web/index.html'

escrow_ignore {
    'config/*.lua',
}

dependency '/assetpacks'
