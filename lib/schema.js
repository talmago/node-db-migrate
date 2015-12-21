var _ = require('lodash');
var Promise = require('bluebird');
var mysql = require('mysql');
var util = require('util');
var os = require('os');

var Logging = require('./logging');
var Config = require('./config');
var Client = require('./client');
var Util = require('./utils');


/**
 * Schema Manager.
 *
 * @param name: String, schema name.
 * @constructor
 */
function SchemaManager(name) {

    var self = this;
    self._name = name;
    self._revisionTbl = "schema_version";
    self._revisionTblColumns = [
        "version",
        "description",
        "type",
        "script",
        "checksum",
        "installed_rank",
        "installed_by",
        "installation_time",
        "execution_time",
        "status"
    ];

    self._client = new Client(Config.db);
    self._logger = Logging.getLogger(util.format("[SchemaMgr/ %s]", self._name));

    // shutdown client
    self.close = function () {
        return self._client.shutdown();
    };

    // escape MySQL query to our 'schema_version' tbl and designated tbl.
    self.escape = function (query, params) {
        var queryParams = [self._name, self._revisionTbl];
        _.each(params || [], function (param) {
            queryParams.push(param);
        });
        return mysql.format(query, queryParams);
    };

    // create objects in DB, mostly the `schema_version` tbl.
    self._createObjects = function () {
        self._logger.info("Creating `%s` object in `%s` schema.", self._revisionTbl, self._name);
        return self._client.execute(self.escape(
            "CREATE TABLE IF NOT EXISTS ??.?? (" +
            "`revision` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT, " +
            "`version` VARCHAR(100) NOT NULL, " +
            "`description` VARCHAR(255) DEFAULT NULL, " +
            "`type` enum('SQL','Node.js') DEFAULT NULL, " +
            "`script` VARCHAR(100) DEFAULT NULL, " +
            "`checksum` INT(10) UNSIGNED DEFAULT NULL, " +
            "`installed_rank` INT(10) UNSIGNED DEFAULT NULL, " +
            "`installed_by` VARCHAR(45) DEFAULT NULL, " +
            "`installation_time` DATETIME NOT NULL, " +
            "`execution_time` INT(10) UNSIGNED DEFAULT NULL, " +
            "`status` BIT(1) NOT NULL, " +
            "PRIMARY KEY (`revision`), " +
            "UNIQUE KEY `ux_script` (`script`,`version`) " +
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8;"
        ));
    };

    // reset objects
    self._deleteObjects = function () {
        self._logger.info("Deleting objects in `%s`.`%s`", self._name, self._revisionTbl);
        return self._client.execute(self.escape("DELETE FROM ??.??"));
    };

    // drop objects from DB
    self._dropObjects = function () {
        self._logger.info("Dropping objects in `%s`", self._name);
        return self._client.execute(self.escape("DROP TABLE IF EXISTS ??.??"));
    };

    // read objects from DB
    self._getObjects = function () {
        self._logger.info("Reading objects from `%s`.`%s`", self._name, self._revisionTbl);
        return self._client.execute(self.escape("SELECT * FROM ??.??"))
            .then(_.partialRight(_.groupBy, 'version'))
            .then(_.partialRight(_.mapValues, function (value) {
                return _.sortBy(value, 'installed_rank');
            }));
    };

    // write object to DB
    self._addObject = function (versionObject) {
        self._logger.info(
            "Saving version `%s` to `%s`.`%s`",
            versionObject.version, self._name, self._revisionTbl
        );
        return self._client.execute(
            self.escape("INSERT INTO ??.?? SET ?",
                [_.pick(versionObject, self._revisionTblColumns)]
            )
        );
    };

    // run migration script
    self._migration = function (migration) {

        var end,
            start = new Date,
            status = 0,
            conn, promise, exec;

        if (!migration) {
            throw new Error("Migration was called with no arguments.")
        }

        if (!migration.path) {
            throw new Error("Migration was called with no execution path.")
        }

        if (migration.type == "SQL") {
            promise = self._client.executeFile(migration.path);
        } else if (migration.type == 'Node.js') {
            try {
                exec = require(migration.path);
                if (typeof exec != "function")
                    throw new Error;
            } catch (e) {
                throw new Error(
                    'Migration script could not be loaded ' +
                    'as `Node.js` source from: ' + migration.path
                );
            }
            promise = self._client.getConnection()
                .then(function connect(connection) {
                    conn = Promise.promisifyAll(connection);
                    self._logger.info("Starting transaction");
                    return conn.beginTransactionAsync();
                })
                .then(function migrate() {
                    return exec(conn);
                })
                .then(function commit() {
                    self._logger.info("Committing transaction");
                    return conn.commitAsync();
                })
                .catch(function (e) {
                    status = 1;
                    self._logger.error(e);
                    if (conn) {
                        self._logger.info("Something went wrong, rolling back");
                        return conn.rollbackAsync();
                    } else {
                        return Promise.resolve();
                    }
                });
        } else {
            throw new Error(
                "Invalid migration script type, expected type " +
                "to be SQL / Node.js but got: " + migration.type
            );
        }

        return promise
            .then(function () {
                end = new Date;
                return self._addObject({
                    version: migration.version,
                    script: migration.script,
                    description: migration.description,
                    type: migration.type,
                    installed_by: os.hostname(),
                    installed_rank: migration.rank || 1,
                    installation_time: start,
                    execution_time: end - start,
                    status: status
                });
            })
    }
}

/**
 * Drop all schema-management dedicated objects from the managed schema.
 */
SchemaManager.prototype.clean = function () {
    var self = this;
    return self._dropObjects();
};

/**
 * Creates a base version for all future DB migrations.
 * @param baseVersion: String, base version.
 * @param description: String, optional. description of the base version.
 * @returns Promise{Object}.
 */
SchemaManager.prototype.baseline = function (baseVersion, description) {
    var self = this;
    var version = Util.parseVersion(baseVersion);

    return self._createObjects().bind(self)
        .then(self._deleteObjects)
        .then(function () {
            return self._addObject({
                version: version,
                description: description || "Base version",
                type: "SQL",
                installed_by: os.hostname(),
                installed_rank: 1,
                installation_time: new Date,
                execution_time: 0,
                status: 0
            });
        });
};

/**
 * Show information about schema version.
 * @returns Promise{Object}
 */
SchemaManager.prototype.info = function () {
    var self = this;
    var result = {};

    return self._getObjects().bind(self)
        .then(function (objects) {
            var currentVersion = _.first(_.sortBy(_.keys(objects)));
            result.version = currentVersion;
            result.migrations = _.map(objects[currentVersion],
                _.partialRight(_.pick, ['script', 'description', 'success'])
            );
        })
        .catch(function (e) {
            self._logger.error(e);
            result.version = "Unknown";
            result.migrations = [];
        })
        .then(function () {
            return result;
        });
};


module.exports = SchemaManager;