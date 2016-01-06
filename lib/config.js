var _ = require('lodash');
var url = require('url');

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
level               =   INFO|DEBUG|WARN|ERROR
filepath            =   /path/to/logfile

[transport]
connectionString    =   mysql://root@localhost

[migration]
schema              =   myproject
datadir             =   /etc/mysql-migraterc/data


JSON
----
 {
    "logging": {
        "level": "INFO",
        "filepath": null
    },
    "transport": {
        "connectionString": "mysql://root@localhost"
    },
    "migration": {
        "schema": "myproject",
        "datadir": "/etc/mysql-migraterc/data/myproject"
    }
 }
*/

config = require('rc')('mysql-migrate', {
    "logging": {
        "level": "DEBUG",
        "filepath": null
    },
    "transport": {
        "connectionString": "mysql://root@localhost"
    },
    "migration": {
        "schema": "myproject",
        "datadir": "/etc/mysql-migraterc/data/myproject"
    }
});

/*
    Format/validate connection string.
 */
if (_.isString(config.transport.connectionString)) {
    var asUrl;

    try {
        asUrl = url.parse(config.transport.connectionString);
        if (!asUrl.pathname) {
            asUrl.pathname = "/";
        }
    } catch(e) {
        throw new Error("Invalid connection string: " + config.transport.connectionString)
    }

    // re-build the connection string
    config.transport.connectionString = url.format(asUrl);
}

/**
 * Set connection config parameter.
 * @param k: String, config key.
 * @param v: String, config value.
 */
config.setConnectionCfg = function(k, v) {
    if (_.isString(config.transport.connectionString)) {

        // parse connection string as url
        var asUrl = url.parse(config.transport.connectionString);

        // build query string if not exists
        if (!_.isObject(asUrl.query)) {
            asUrl.query = {};
        }

        // set k-v pair into the querystring
        asUrl.query[k] = v;

        // re-build the connection string
        config.transport.connectionString = url.format(asUrl);
    }

    else if (_.isObject(config.transport)) {
        // set k-v pair into the connection config object
        config.transport[k] = v;
    }
};

module.exports = config;