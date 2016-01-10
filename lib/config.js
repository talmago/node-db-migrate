var _ = require('lodash');
var url = require('url');

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

INI
---

transport           =   mysql://root@localhost

[logging]
level               =   INFO|DEBUG|WARN|ERROR
filepath            =   /path/to/logfile

[schema]
name                =   myproject
datadir             =   /etc/db-migraterc/data


JSON
----
{
    "transport": "mysql://root@localhost",
    "logging": {
        "level": "INFO",
        "filepath": null
    },
    "schema": {
        "name": "myproject",
        "datadir": "/etc/db-migraterc/data/myproject"
    }
}

or alternatively:

{
    "transport": {
        "connection": "mysql",
        "user": "root",
        "password": "",
        "host": "localhost"
    },

    ..
}

*/

config = require('rc')('db-migrate', {
    "transport": "mysql://root@localhost",
    "logging": {
        "level": "INFO",
        "filepath": null
    },
    "schema": {
        "name": "myproject",
        "datadir": "/etc/db-migraterc/data/myproject"
    }
});

/*
    Format/validate connection string.
 */
if (_.isString(config.transport)) {
    var asUrl;

    try {
        asUrl = url.parse(config.transport);
    } catch(e) {
        throw new Error("Invalid connection string: " + config.transport);
    }

    // node-mysql can't stand a connection string with empty pathname
    if (!asUrl.pathname) {
        asUrl.pathname = "/";
    }

    // knex can't stand a password-less connection string
    if (asUrl.auth && asUrl.auth.indexOf(":") < 0) {
        asUrl.auth += ":";
    }

    // re-build the connection string
    config.transport = url.format(asUrl);
}

/**
 * Set connection config parameter.
 * @param k: String, config key.
 * @param v: String, config value.
 */
config.setConnectionCfg = function(k, v) {
    if (_.isString(config.transport)) {

        // parse connection string as url
        var asUrl = url.parse(config.transport);

        // build query string if not exists
        if (!_.isObject(asUrl.query)) {
            asUrl.query = {};
        }

        // set k-v pair into the querystring
        asUrl.query[k] = v;

        // re-build the connection string
        config.transport = url.format(asUrl);
    }
    else if (_.isObject(config.transport)) {
        // set k-v pair into the connection config object
        config.transport[k] = v;
    }
};

module.exports = config;