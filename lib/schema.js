var _ = require('lodash');
var Promise = require('bluebird');
var mysql = require('mysql');
var util = require('util');
var os = require('os');

var Logging = require('./logging');
var Client = require('./client');
var Util = require('./utils');


var SchemaManager = (function () {

    // Create a store to hold the private objects.
    var private = {};

    /**
     * Schema Manager.
     *
     * @param schema: String, schema name.
     * @param config: Object, connection config.
     * @constructor
     */
    function SchemaManager(schema, config) {

        if (!_.isString(schema)) {
            throw new Error(
                "constructor expects first argument to be a string " +
                "but got `" + typeof(schema) + "` instead."
            );
        }

        if (!_.isObject(config)) {
            throw new Error(
                "constructor expects second argument to be an object " +
                "but got `" + typeof(config) + "` instead."
            );
        }

        var self = this;
        self._schema = schema;
        self._config = config;

        private['_client'] = new Client(config);
        private['_logger'] = Logging.getLogger(util.format("[SchemaMgr/ %s]", schema));
        private['_revisionTbl'] = "schema_version";
        private['_revisionTblColumns'] = [
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

        // escape MySQL query to our 'schema_version' tbl and designated tbl.
        private['_escape'] = function (query, params) {
            var queryParams = [schema, private._revisionTbl];
            _.each(params || [], function (param) {
                queryParams.push(param);
            });
            return mysql.format(query, queryParams);
        };

        // create objects in DB, mostly the `schema_version` tbl.
        private['_createObjects'] = function () {
            private._logger.info("Creating `%s` object in `%s` schema.", private._revisionTbl, self._schema);
            return private._client.execute(private._escape(
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
        private['_deleteObjects'] = function () {
            private._logger.info("Deleting objects in `%s`.`%s`", self._schema, private._revisionTbl);
            return private._client.execute(private._escape("DELETE FROM ??.??"));
        };

        // drop objects from DB
        private['_dropObjects'] = function () {
            private._logger.info("Dropping objects in `%s`", self._schema);
            return private._client.execute(private._escape("DROP TABLE IF EXISTS ??.??"));
        };

        // read objects from DB
        private['_getObjects'] = function () {
            private._logger.info("Reading objects from `%s`.`%s`", self._schema, private._revisionTbl);
            return private._client.execute(private._escape("SELECT * FROM ??.??"))
                .then(_.partialRight(_.groupBy, 'version'))
                .then(_.partialRight(_.mapValues, function (value) {
                    return _.sortBy(value, 'installed_rank');
                }));
        };

        // write object to DB
        private['_addObject'] = function (obj) {
            var ov = private._parseObject(obj);
            private._logger.info(
                "Saving version `%s` to `%s`.`%s`",
                ov.version, self._schema, private._revisionTbl
            );
            return private._client.execute(
                private._escape("INSERT INTO ??.?? SET ? ON DUPLICATE KEY UPDATE ?", [ov, ov])
            );
        };

        private._parseObject = function (obj) {
            // ensure object exists
            if (!_.isObject(obj)) {
                throw new Error("Expected an object but got: " + typeof(obj));
            }

            // ensure object version is in the right format
            obj.version = Util.parseVersion(obj.version);

            // object properties
            return _.pick(obj, private._revisionTblColumns);
        };

        // run migration script
        private['_migration'] = function (migration) {

            var end, conn,
                promise, exec,
                start = new Date,
                status = 0;

            if (!migration) {
                throw new Error("Migration was called with no arguments.")
            }

            if (!migration.path) {
                throw new Error("Migration was called with no execution path.")
            }

            if (migration.type == "SQL") {
                promise = private._client.executeFile(migration.path);
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
                promise = private._client.getConnection()
                    .then(function connect(connection) {
                        conn = Promise.promisifyAll(connection);
                        private._logger.info("Starting transaction");
                        return conn.beginTransactionAsync();
                    })
                    .then(function migrate() {
                        return exec(conn);
                    })
                    .then(function commit() {
                        private._logger.info("Committing transaction");
                        return conn.commitAsync();
                    })
                    .catch(function (e) {
                        status = 1;
                        private._logger.error(e);
                        if (conn) {
                            private._logger.info("Something went wrong, rolling back");
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
                    return private._addObject({
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
                });
        }
    }

    SchemaManager.prototype.close = function () {
        return private._client.shutdown();
    };

    SchemaManager.prototype.clean = function () {
        return private._dropObjects();
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

        return private._createObjects().bind(self)
            .then(private._deleteObjects)
            .then(function () {
                return private._addObject({
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
    SchemaManager.prototype.revision = function () {
        var self = this;
        var result = {};

        return private._getObjects().bind(self)
            .then(function (objects) {
                var currentVersion = _.last(_.sortBy(_.keys(objects)));
                result.version = currentVersion;
                result.migrations = _.map(objects[currentVersion],
                    _.partialRight(_.pick, [
                        'script',
                        'description',
                        'execution_time',
                        'status'
                    ])
                );
            })
            .catch(function (e) {
                private._logger.error(e);
                result.version = "Unknown";
                result.migrations = [];
            })
            .then(function () {
                return result;
            });
    };

    /**
     * Run migration.
     * @param directory: String, directory for discovery.
     * @param targetVersion: String, target version for the new migration.
     */
    SchemaManager.prototype.migrate = function (directory, targetVersion) {
        var self = this;

        // get current revision
        return self.revision()
            .then(function getStepByStep(revision) {
                var baseVersion = _.get(revision, 'version', 'Unknown');
                if (baseVersion.toLowerCase() == "unknown") {
                    return Promise.reject(new Error(
                        "Could not determine schema revision before running migration scripts. " +
                        "It is possible that `baseline` was never executed or database is currently not reachable."
                    ));
                } else {
                    return Util.discovery(
                        directory, targetVersion, baseVersion,
                        _.pluck(_.get(revision, 'migrations', []), 'script')
                    )
                }
            })
            .then(function(steps) {
                // no execution step found, we are done.
                if (_.isEmpty(steps)) {
                    private._logger.info("No migration steps were found.");
                    return Promise.resolve();
                }
                // start step-by-step execution
                return Promise.mapSeries(steps, function(step) {
                    // migrate a new version by running each of th
                    return Promise.map(step, function(migration, idx) {
                        // set migration installation rank
                        migration.rank = idx+1;
                        // perform one step of the version
                        return private._migration(migration);
                    });
                });
            })
            .catch(function(e) {
                private._logger.error(e);
            });
    };

    return SchemaManager;

}());


module.exports = SchemaManager;