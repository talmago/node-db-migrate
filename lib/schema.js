const _ = require("lodash");
const Promise = require("bluebird");
const util = require("util");
const os = require("os");
const fs = require("fs");

const Logging = require("./logging");
const Util = require("./utils");


const SchemaManager = ((() => {
    // Create a store to hold the private objects.
    const _private = {};

    /**
     * Schema Manager.
     *
     * @param schema: String, schema name.
     * @param client: String, client name [e.g. "mysql"].
     * @param connectionConfig: Object/String, either a config object a URL formatted string.
     * @constructor
     */
    class SchemaManager {
        constructor(schema, client, connectionConfig, logger) {


            if (typeof schema != "string") {
                throw new Error(
                    `expected first argument to be a string but got \`${typeof(schema)}\` instead.`
                );
            }

            _private._schema = schema;
            _private._transport = Util.getTransport(client, connectionConfig, schema);

            _private._logger = logger ? logger : require("./logging").getLogger(util.format("[SchemaManager/ %s]", schema));

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

            _private._createObjects = () => _private._transport.schema
                .withSchema(_private._schema)
                .createTableIfNotExists(_private._revisionTbl, table => {
                    table.increments("revision");
                    table.string("version");
                    table.string("description");
                    table.enu("type", ["SQL", "Node.js"]);
                    table.string("script");
                    table.integer("checksum");
                    table.integer("installed_rank");
                    table.string("installed_by");
                    table.dateTime("installation_time");
                    table.integer("execution_time");
                    table.integer("status");
                    table.text("reason");
                });

            // reset objects
            _private._deleteObjects = () => {
                _private._logger.info("Deleting objects in `%s`.`%s`",
                    _private._schema, _private._revisionTbl
                );
                return _private._transport
                    .withSchema(_private._schema)
                    .del("*").from(_private._revisionTbl);
            };

            // drop objects from DB
            _private._dropObjects = () => {
                _private._logger.info("Dropping objects in `%s`", _private._schema);
                return _private._transport.schema
                    .withSchema(_private._schema)
                    .dropTableIfExists(_private._revisionTbl);
            };

            // read objects from DB
            _private._getObjects = () => {
                _private._logger.info("Reading objects from `%s`.`%s`", _private._schema, _private._revisionTbl);
                return _private._transport
                    .withSchema(_private._schema)
                    .select("*").from(_private._revisionTbl)
                    .then(_.partialRight(_.groupBy, "version"))
                    .then(_.partialRight(_.mapValues, value => _.sortBy(value, "installed_rank")));
            };

            // write object to DB
            _private._addObject = obj => {
                const ov = _private._parseObject(obj);
                _private._logger.info(
                    "Saving object %s/%s to `%s`.`%s`",
                    ov.version, ov.script, _private._schema, _private._revisionTbl
                );
                return _private._transport
                    .withSchema(_private._schema)
                    .insert(ov).into(_private._revisionTbl);
            };

            // parse object
            _private._parseObject = obj => {
                // ensure object exists
                if (!_.isObject(obj)) {
                    throw new Error(`Expected an object but got: ${typeof(obj)}`);
                }
                // ensure object version is in the right format
                obj.version = Util.parseVersion(obj.version);
                return _.pick(obj, _private._revisionTblColumns);
            };

            // run migration script
            _private._migration = migration => {
                let end;
                let exec;
                let reason;
                const start = new Date;
                let status = 0;

                if (!migration) {
                    throw new Error("Migration was called with no arguments.");
                }

                if (!migration.path) {
                    throw new Error("Migration was called with no execution path.");
                }

                return _private._transport.transaction(trx => {

                    _private._logger.info("Running transaction for migration script %s/%s (%s)",
                        migration.version, migration.rank || 1, migration.script
                    );

                    if (migration.type == "SQL") {
                        return fs.readFileAsync(migration.path, "utf8")
                            .then(query => //_private._logger.debug("Query execution:", query);
                                trx.schema.raw(query));
                    } else if (migration.type == "Node.js") {
                        try {
                            exec = require(migration.path);
                            if (typeof exec != "function")
                                throw new Error;
                        } catch (e) {
                            throw new Error(
                                `Migration script could not be loaded as \`Node.js\` source from: ${migration.path}`
                            );
                        }
                        return exec(trx);
                    } else {
                        throw new Error(
                            `Invalid migration script type, expected type to be SQL / Node.js but got: ${migration.type}`
                        );
                    }
                })
                    .then(result => {
                        _private._logger.debug(
                            util.format("Migration (%s/%s) completed succesfully.",
                                migration.version, migration.script)
                        );
                        if (_private._logger.isLevelEnabled("DEBUG")) {
                            _private._logger.debug(result);
                        }
                    })
                    .catch(e => {
                        status = 1;
                        reason = e.message;
                        if (_private._logger.isLevelEnabled("DEBUG")) {
                            _private._logger.error(e.code);
                        }
                        throw new Error(util.format(
                            "Migration (%s/%s) failed. Run `mysql-migrate info` " +
                            "for more details.", migration.version, migration.script)
                        );
                    })
                    .finally(() => {
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
                            status,
                            reason
                        });
                    });
            };
        }

        close() {
            //return _private._transport.shutdown();
        }

        clean() {
            return _private._dropObjects();
        }

        /**
         * Creates a base version for all future DB migrations.
         * @param baseVersion: String, base version.
         * @param description: String, optional. description of the base version.
         * @returns Promise{Object}.
         */
        baseline(baseVersion, description) {
            const self = this;
            const version = Util.parseVersion(baseVersion);
            return _private._createObjects().bind(self)
                .then(_private._deleteObjects)
                .then(() => _private._addObject({
                    version,
                    script: "baseline",
                    description: description || "Base version",
                    type: "SQL",
                    installed_by: os.hostname(),
                    installed_rank: 1,
                    installation_time: new Date,
                    execution_time: 0,
                    status: 0
                }));
        }

        /**
         * Show information about schema version.
         * @returns Promise{Object}
         */
        revision() {
            const self = this;
            const result = {};

            return _private._getObjects().bind(self)
                .then(objects => {
                    let latest = "Unknown", tmp, migrations = [];

                    _.each(_.keys(objects), version => {
                        tmp = _.map(objects[version],
                            _.partialRight(_.pick, [
                                "script",
                                "description",
                                "execution_time",
                                "status",
                                "reason"
                            ])
                        );
                        if (_.find(tmp, {status: 0})) {
                            latest = version;
                            migrations = tmp;
                        } else {
                            _.forEach(tmp, tmpItem => {
                                migrations.push(tmpItem);
                            });
                        }
                    });
                    result.version = latest;
                    result.migrations = migrations;
                })
                .catch(e => {
                    if (_private._logger.isLevelEnabled("DEBUG")) {
                        _private._logger.error(e);
                    }
                    result.version = "Unknown";
                    result.migrations = [];
                })
                .then(() => result);
        }

        /**
         * Run migration.
         * @param directory: String, directory for discovery.
         * @param targetVersion: String, target version for the new migration.
         */
        migrate(directory, targetVersion) {
            const self = this;

            // get current revision
            return self.revision()
                .then(revision => {
                    const baseVersion = _.get(revision, "version", "Unknown");
                    if (baseVersion.toLowerCase() == "unknown") {
                        return Promise.reject(new Error(
                            "Could not determine schema revision before running migration scripts. " +
                            "It is possible that `baseline` was never executed or database is currently not reachable."
                        ));
                    } else {
                        return Util.discovery({
                            directory, targetVersion, baseVersion,
                           baseVersionObjects: _.pluck(_.get(revision, "migrations", []), "script"),
                            logger:_private._logger
                        } );
                    }
                })
                .then(steps => {
                    // no execution step found, we are done.
                    if (_.isEmpty(steps)) {
                        _private._logger.info("No migration steps were found.");
                        return Promise.resolve();
                    }
                    // start step-by-step execution
                    return Promise.mapSeries(steps, step => // migrate a new version by running each of th
                        Promise.map(step, (migration, idx) => {
                        // increment migration installation rank
                        // and perform one step of the version
                            migration.rank = idx+1;
                            return _private._migration(migration);
                        }, {concurrency: 1}));
                });
        }

        /**
         * Repair migration history failures by "rebasing" old scripts
         * on top of the current state of the schema.
         * @param directory: String, path to data directory.
         */
        repair(directory) {
            return _private._getObjects()
                .then(objects => {
                    const fixUs = _.filter(_.flatten(_.values(objects)), o => o.status > 0);
                    return Util.discovery({directory,logger:_private._logger})

                        .then(_.flatten)
                        .then(scripts => Promise.map(fixUs, fixIt => {
                            const script = _.find(scripts, s => s.script == fixIt.script);
                            if (!script) {
                                return Promise.resolve();
                            } else {
                                _private._logger.info(
                                    "Preparing to repair %s/%s",
                                    fixIt.version, fixIt.script
                                );
                                return _private._migration(script);
                            }
                        }));
                });
        }
    }

    return SchemaManager;
})());


module.exports = SchemaManager;
