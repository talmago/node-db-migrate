var _ = require('lodash');
var fs = require('fs');
var mysql = require('mysql');
var logging = require('./logging');
var Promise = require('bluebird');
var util = require('util');
var url = require('url');
var knex = require('knex');


var MySQLTransport = (function () {

    // Create a store to hold the private objects.
    var _private = {};

    /**
     * MySQL MySQLTransport.
     * @param connectionConfig: See https://github.com/felixge/node-mysql#connection-options
     * @constructor
     */
    function MySQLTransport(connectionConfig) {

        var self = this;

        if (!_.isObject(connectionConfig) && !_.isString(connectionConfig)) {
            throw new Error("first argument was expected to be an object or a string, but got: " + typeof connectionConfig);
        }

        _private._connectionConfig = connectionConfig;

        _private._name = util.format("[MySQL transport /%s:%s]",
            _.get(_private._connectionConfig, "host", "localhost"),
            _.get(_private._connectionConfig, "port", 3306)
        );

        _private._logger = logging.getLogger(_private._name);

        /**
         * Knex.js MySQL query builder.
         * See http://knexjs.org/#Builder for more details.
         * @returns {knex.QueryBuilder}
         */
        self.knex = require('knex')({
            client: 'mysql',
            connection: _private._connectionConfig
        });

        /**
         * Get a connection from the pool.
         * When connection is ready to go back to the pool, call `connection.release()`.
         * @param callback: optional callback that accepts two arguments;
         *                  - err: Error object if error occurred, otherwise `null`.
         *                  - conn: MySQL connection object (mysql.createConnection).
         * @returns {*}
         */
        self._getConnection = function (config, callback) {

            if (!config) {
                config = _private._connectionConfig;
            }

            var promise = new Promise(function (resolve, reject) {
                var connection = mysql.createConnection(config);
                connection.on('error', function (err) {
                    if (_private._logger.isLevelEnabled("DEBUG")) {
                        _private._logger.error(err);
                    }
                });
                connection.connect(function (err) {
                    if (err) return reject(err);
                    resolve(connection);
                });
            });

            if (!callback) return promise;
            return promise
                .then(function (connection) {
                    callback(null, connection);
                })
                .catch(function (e) {
                    callback(e);
                })
        };
    }

    /**
     * MySQLTransport string representation.
     * @returns {String}
     */
    MySQLTransport.prototype.toString = function() {
        return _private._name;
    };

    /**
     * Gracefully terminates the connection pool.
     * `shutdown` will make sure that all previously enqueued queries
     * will get to be executed before sending a COM_QUIT packet to the MySQL server.
     * @param callback: optional, a callback function that accepts one argument only
     *                  which will point to an Error object in case something went wrong.
     * @returns {*}
     */
    MySQLTransport.prototype.shutdown = function (callback) {
        //_private._logger.info("Shutting down connection pool");
        //_private._pool && _private._pool.end(callback);
        //_private._pool = null;
    };

    /**
     * Execute a single MySQL statement.
     * @param query: String, the statement to be executed.
     * @param params: Object/Array, params to `escape` into the statement.
     *                See https://github.com/felixge/node-mysql#escaping-query-values for more details.
     * @param callback: optional,
     * @returns {*}
     */
    MySQLTransport.prototype.execute = function (query, params, callback) {
        var self = this;

        var promise = new Promise(function (resolve, reject) {
            self._getConnection(null, function (err, connection) {
                if (err) return reject(err);
                connection.query(query, params, function (err, rows) {
                    connection.end();
                    if (err) reject(err);
                    else resolve(rows);
                });
            })
        });

        if (!callback) return promise;
        return promise
            .then(function (rows) {
                callback(null, rows);
            })
            .catch(function (e) {
                callback(e);
            });
    };

    /**
     * Execute SQL script (multiple statements).
     * @param filename: String, absolute path to the script.
     * @param callback: optional, a callback function that accepts two arguments:
     *                  - err: Error object in case something went wrong.
     *                  - results: Either an `Object` or an `Array` with the execution results.
     * @returns {*}
     */
    MySQLTransport.prototype.executeFile = function (filename, callback) {
        var self = this;

        var promise = new Promise(function (resolve, reject) {
            fs.readFile(filename, 'utf8', function (err, query) {
                self.transaction(query, function(err, data) {
                    if (err) reject(err);
                    else resolve(data);
                });
            });
        });

        if (!callback) return promise;
        return promise
            .then(function (result) {
                callback(null, result);
            })
            .catch(function (e) {
                callback(e);
            });
    };

    MySQLTransport.prototype.transaction = function(multipleStatements, callback) {
        var self = this;
        var connectionConfig;

        if (typeof _private._connectionConfig == 'string') {
            connectionConfig = _private._connectionConfig + '&multipleStatements=true';
        } else {
            connectionConfig = _.assign(
                _private._connectionConfig,
                {multipleStatements: true}
            );
        }

        var promise = new Promise(function (resolve, reject) {
            self._getConnection(connectionConfig, function (err, connection) {
                if (err) return reject(err);
                _private._logger.debug("Starting transaction");
                connection.beginTransaction(function (err) {
                    if (err) reject(err);
                    connection.query(multipleStatements, undefined, function (err, result) {
                        if (err) {
                            _private._logger.debug("Something went wrong here, rolling back.");
                            connection.rollback(function () {
                                reject(err);
                                connection.end();
                            });
                        } else {
                            _private._logger.debug("Committing");
                            connection.commit(function (err) {
                                if (err) {
                                    _private._logger.debug("Commit failed, rolling back.");
                                    connection.rollback(function () {
                                        reject(err);
                                        connection.end();
                                    });
                                } else {
                                    resolve(result);
                                    connection.end();
                                }
                            });
                        }
                    });
                });
            });
        });

        if (!callback) return promise;
        return promise
            .then(function (result) {
                callback(null, result);
            })
            .catch(function (e) {
                callback(e);
            });
    };

    return MySQLTransport;
}());


/**
 * Create SQL transport layer based on the config object passed to the function.
 * @param connectionStringOrConfig: String/Object.
 *                connectionStringOrConfig is either a connection string
 *                or a config object (key-value) for the setting up the connection to the database.
 *                If `connectionStringOrConfig` is a url-formatted string, it will be validated
 *                to see if it matches one of the supported transports. Otherwise, (an object)
 *                must have a `type` property that will point to the database type.
 * @returns: MySQLTransport/..
 */
function fromCfg(connectionStringOrConfig) {

    var transport,
        asUrl, connectionCfg;

    if (!_.isObject(connectionStringOrConfig) && !_.isString(connectionStringOrConfig)) {
        throw new Error(
            "first argument was expected to be an object, " +
            "but got `" + typeof connectionStringOrConfig + "` instead. aborting.");
    }

    if (_.isString(connectionStringOrConfig)) {
        asUrl = url.parse(connectionStringOrConfig);
        switch(asUrl.protocol) {
            case "mysql:":
                transport = new MySQLTransport(connectionStringOrConfig);
                break;
            default:
                throw new Error(
                    "connection string `" + connectionStringOrConfig + "` matches none " +
                    "of the supported transport classes, and therefore could not be loaded.\n" +
                    "please see https://github.com/talmago/node-mysql-migrate for documentation."
                );
        }
    }

    else if (connectionStringOrConfig.connection) {
        connectionCfg = _.omit(connectionStringOrConfig, 'connection');
        switch(connectionStringOrConfig.connection) {
            case "mysql":
                transport = new MySQLTransport(connectionCfg);
                break;
            default:
                throw new Error(
                    "connection type `" + connectionStringOrConfig.type + "` matches none " +
                    "of the supported transport classes, and therefore could not be loaded.\n" +
                    "please see https://github.com/talmago/node-mysql-migrate for documentation."
                );
        }
    }

    else {
        throw new Error(
            "Could not load transport class for the given object " +
            "since it has no `connection` property that suggests what class to load.\n" +
            "See https://github.com/talmago/node-mysql-migrate for more details."
        );
    }

    return transport;
}

// export only createTransport function
module.exports.fromCfg = fromCfg;