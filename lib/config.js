/*

Migration tool uses rc config for its settings.

See https://www.npmjs.com/package/rc for more details about rc-config.

Configuration file should be placed in one of the following locations:
    - $HOME/.db-migraterc
    - $HOME/.db-migrate/config
    - $HOME/.config/db-migrate
    - $HOME/.config/db-migrate/config
    - /etc/db-migraterc
    - /etc/db-migrate/config


Configuration should be in one of the following formats:
    - INI
    - JSON


INI (1)
---

client              =   pg

connection           =   postgres://username:password@localhost/database

[logging]
level               =   INFO|DEBUG|WARN|ERROR

[schema]
name                =   myproject
datadir             =   /etc/db-migraterc/data


INI (2)
---

client  =   mysql

[connection]
host        =   localhost
port        =   3367
user        =   root
password    =   pass

JSON (1)
----
{
    "client": "mysql",
    "connection": {
        "user": "root",
        "password": "pass",
        "host": "localhost",
        "port": 3367
    },
    "logging": {
        "level": "INFO"
    },
    "schema": {
        "name": "myproject",
        "datadir": "/etc/db-migraterc/data/myproject"
    }
}

JSON (2)
---------

{
    "client": "pg",
    "connection": "postgres://username:password@localhost/database",
    ..
}

*/

let config = require("rc")("db-migrate", {
    "client": "mysql",
    "connection": {
        "user": "root",
        "password": "",
        "host": "localhost"
    },
    "logging": {
        "level": "INFO",
        "filepath": null
    },
    "schema": {
        "name": "myproject",
        "datadir": "/etc/db-migraterc/data/myproject"
    }
});


module.exports = config;
