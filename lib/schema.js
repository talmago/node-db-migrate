var _ = require('lodash');
var Promise = require('bluebird');
var mysql = require('mysql');
var util = require('util');
var os = require('os');

var Logging = require('./logging');
var Util = require('./utils');


var SchemaManager = (function () {

    // Create a store to hold the private objects.
    var _private = {};

    /**
     * Schema Manager.
     *
     * @param schema: String, schema name.
     * @param config: Object, connection config.
     * @constructor
     */
    function SchemaManager(schema, transport) {

        if (typeof schema != "string") {
            throw new Error(
                "constructor expects first argument to be a string " +
                "but got `" + typeof(schema) + "` instead."
            );
        }

        if (typeof transport != "object" || ["MySQLTransport"].indexOf(transport.constructor.name) < 0) {
            throw new Error(
                "constructor expects second argument to be an instance " +
                "of SQL transport class but got `" + typeof(transport) + "` instead."
            );
        }

        _private._schema = schema;
        _private._transport = transport;
        _private._logger = Logging.getLogger(util.format("[SchemaManager/ %s]", schema));
        _private._revisionTbl = "schema_version";
        _private._revisionTblColumns = [
            "version",
            "description",
            "type",
            "script",
            "checksum",
            "installed_rank",
            "installed_by",
            "installation_time",
            "execution_time",
            "status",
            "reason"
        ];

        _private._createObjects = function () {
            return _private._transport.knex.schema
                .withSchema(_private._schema)
                .createTableIfNotExists(_private._revisionTbl, function (table) {
                    table.increments('revision');
                    table.string('version');
                    table.string('description');
                    table.enu('type', ['SQL', 'Node.js']);
                    table.string('script');
                    table.integer('checksum');
                    table.integer('installed_rank');
                    table.string('installed_by');
                    table.dateTime('installation_time');
                    table.integer('execution_time');
                    table.integer('status');
                    table.string('reason');
                });
        };

        // reset objects
        _private._deleteObjects = function () {
            _private._logger.info("Deleting objects in `%s`.`%s`",
                _private._schema, _private._revisionTbl
            );
            return _private._transport.knex
                .withSchema(_private._schema)
                .del('*').from(_private._revisionTbl);
        };

        // drop objects from DB
        _private._dropObjects = function () {
            _private._logger.info("Dropping objects in `%s`", _private._schema);
            return _private._transport.knex.schema
                .withSchema(_private._schema)
                .dropTableIfExists(_private._revisionTbl);
        };

        // read objects from DB
        _private._getObjects = function () {
            _private._logger.info("Reading objects from `%s`.`%s`", _private._schema, _private._revisionTbl);
            return _private._transport.knex
                .withSchema(_private._schema)
                .select('*').from(_private._revisionTbl)
                .then(_.partialRight(_.groupBy, 'version'))
                .then(_.partialRight(_.mapValues, function (value) {
                    return _.sortBy(value, 'installed_rank');
                }));
        };

        // write object to DB
        _private._addObject = function (obj) {
            var ov = _private._parseObject(obj);
            _private._logger.info(
                "Saving object %s/%s to `%s`.`%s`",
                ov.version, ov.script, _private._schema, _private._revisionTbl
            );
            return _private._transport.knex
                .withSchema(_private._schema)
                .insert(ov).into(_private._revisionTbl);
        };

        // parse object
        _private._parseObject = function (obj) {
            // ensure object exists
            if (!_.isObject(obj)) {
                throw new Error("Expected an object but got: " + typeof(obj));
            }
            // ensure object version is in the right format
            obj.version = Util.parseVersion(obj.version);
            return _.pick(obj, _private._revisionTblColumns);
        };

        // run migration script
        _private._migration = function (migration) {

            var end, conn,
                promise, exec,
                reason,
                start = new Date,
                status = 0;

            if (!migration) {
                throw new Error("Migration was called with no arguments.")
            }

            if (!migration.path) {
                throw new Error("Migration was called with no execution path.")
            }

            if (migration.type == "SQL") {
                promise = _private._transport.executeFile(migration.path)
                    .catch(function(e) {
                        status = 1;
                        reason = e.message;
                    });
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

                promise = _private._transport._getConnection()
                    .then(function connect(connection) {
                        conn = Promise.promisifyAll(connection);
                        _private._logger.debug("Starting transaction");
                        return conn.beginTransactionAsync();
                    })
                    .then(function migrate() {
                        // pass both the transaction and the query builder to the external module
                        return exec(conn,
                            _private._transport.knex.withSchema(_private._schema),
                            _private._transport.knex.schema.withSchema(_private._schema)
                        );
                    })
                    .then(function commit() {
                        _private._logger.debug("Committing");
                        return conn.commitAsync();
                    })
                    .catch(function (e) {
                        status = 1;
                        reason = e.message;
                        if (_private._logger.isLevelEnabled("DEBUG")) {
                            _private._logger.error(e);
                        }
                        if (conn) {
                            _private._logger.debug("Something went wrong, rolling back");
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

            _private._logger.info("Running migration script %s/%s (%s)",
                migration.version, migration.rank || 1, migration.script
            );

            return promise
                .then(function () {
                    end = new Date;
                    return _private._addObject({
                        version: migration.version,
                        script: migration.script,
                        description: migration.description,
                        type: migration.type,
                        installed_by: os.hostname(),
                        installed_rank: migration.rank || 1,
                        installation_time: start,
                        execution_time: end - start,
                        status: status,
                        reason: reason
                    })
                        .then(function() {
                            if (status) {
                                throw new Error(util.format(
                                    "Migration (%s/%s) failed. Run `mysql-migrate info` " +
                                    "for more details.", migration.version, migration.script)
                                );
                            } else {
                                return Promise.resolve();
                            }
                        });
                });
        }
    }

    SchemaManager.prototype.close = function () {
        return _private._transport.shutdown();
    };

    SchemaManager.prototype.clean = function () {
        return _private._dropObjects();
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
        return _private._createObjects().bind(self)
            .then(_private._deleteObjects)
            .then(function () {
                return _private._addObject({
                    version: version,
                    script: "baseline",
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

        return _private._getObjects().bind(self)
            .then(function (objects) {
                var latest = "Unknown",
                    tmp, migrations = [];

                _.each(_.keys(objects), function(version) {
                    tmp = _.map(objects[version],
                        _.partialRight(_.pick, [
                            'script',
                            'description',
                            'execution_time',
                            'status',
                            'reason'
                        ])
                    );
                    if (_.find(tmp, {status: 0})) {
                        latest = version;
                        migrations = tmp;
                    } else {
                        _.forEach(tmp, function(tmpItem) {
                            migrations.push(tmpItem);
                        });
                    }
                });
                result.version = latest;
                result.migrations = migrations;
            })
            .catch(function (e) {
                if (_private._logger.isLevelEnabled("DEBUG")) {
                    _private._logger.error(e);
                }
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
            .then(function (revision) {
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
                    _private._logger.info("No migration steps were found.");
                    return Promise.resolve();
                }
                // start step-by-step execution
                return Promise.mapSeries(steps, function(step) {
                    // migrate a new version by running each of th
                    return Promise.map(step, function(migration, idx) {
                        // set migration installation rank
                        migration.rank = idx+1;
                        // perform one step of the version
                        return _private._migration(migration);
                    }, {concurrency: 1});
                });
            });
    };

    SchemaManager.prototype.repair = function(directory) {
        return _private._getObjects()
            .then(function(objects) {
                var fixUs = _.filter(_.flatten(_.values(objects)), function(o) {
                    return o.status > 0;
                });
                return Util.discovery(directory)
                    .then(_.flatten)
                    .then(function(scripts) {
                        return Promise.map(fixUs, function(fixIt) {
                            var script = _.find(scripts, function(s) {
                                return s.script == fixIt.script;
                            });
                            if (!script) {
                                return Promise.resolve();
                            } else {
                                _private._logger.info(
                                    "Preparing to repair %s/%s",
                                    fixIt.version, fixIt.script
                                );
                                return _private._migration(script);
                            }
                        });
                    });
            });
    };

    return SchemaManager;

}());


module.exports = SchemaManager;