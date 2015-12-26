/*

Migration tool uses rc config for its settings.

See https://www.npmjs.com/package/rc for more details about rc-config.

Configuration file should be placed in one of the following locations:
    - $HOME/.mysql-migraterc
    - $HOME/.mysql-migrate/config
    - $HOME/.config/mysql-migrate
    - $HOME/.config/mysql-migrate/config
    - /etc/mysql-migraterc
    - /etc/mysql-migrate/config


Configuration should be in one of the following formats:
    - INI
    - JSON

INI
---

[logging]
level       =   INFO|DEBUG|WARN|ERROR
filepath    =   /path/to/logfile

[db]
host        =   localhost
user        =   root
password    =   pass

[migration]
schema      =   myproject
datadir     =   /etc/mysql-migraterc/data


JSON
----
 {
    "logging": {
        "level": "INFO",
        "filepath": null
    },
    "db": {
        "host": "localhost",
        "user": "root",
        "password": ""
    },
    "migration": {
        "schema": "myproject",
        "datadir": "/etc/mysql-migraterc/data/myproject"
    }
 }
*/

module.exports = require('rc')('mysql-migrate', {
    "logging": {
        "level": "INFO",
        "filepath": null
    },
    "db": {
        "host": "localhost",
        "user": "root",
        "password": ""
    },
    "migration": {
        "schema": "myproject",
        "datadir": "/etc/mysql-migraterc/data/myproject"
    }
});