var _ = require('lodash');
var fs = require('fs');
var mysql = require('mysql');
var logging = require('./logging');
var Promise = require('bluebird');
var util = require('util');


var Client = (function () {

    // Create a store to hold the private objects.
    var _private = {};

    /**
     * MySQL Client.
     * @param connectionConfig: See https://github.com/felixge/node-mysql#connection-options
     * @constructor
     */
    function Client(connectionConfig) {

        var self = this;
        connectionConfig = connectionConfig || {};

        if (connectionConfig && !_.isObject(connectionConfig)) {
            throw new Error("first argument was expected to be an object, but got: " + typeof connectionConfig);
        }

        _private._connectionConfig = _.defaults(connectionConfig, {
            user: 'root',
            password: ''
        });

        _private._name = util.format("[MySQL Client /%s:%s]",
            _.get(_private._connectionConfig, "host", "localhost"),
            _.get(_private._connectionConfig, "port", 3306)
        );

        _private._logger = logging.getLogger(_private._name);

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
     * Client string representation.
     * @returns {String}
     */
    Client.prototype.toString = function() {
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
    Client.prototype.shutdown = function (callback) {
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
    Client.prototype.execute = function (query, params, callback) {
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
    Client.prototype.executeFile = function (filename, callback) {
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

    Client.prototype.transaction = function(multipleStatements, callback) {
        var self = this;

        var connectionConfig = _.assign(_private._connectionConfig, {multipleStatements: true});
        var promise = new Promise(function (resolve, reject) {
            self._getConnection(connectionConfig, function (err, connection) {
                if (err) return reject(err);
                _private._logger.info("Starting transaction");
                connection.beginTransaction(function (err) {
                    if (err) reject(err);
                    connection.query(multipleStatements, undefined, function (err, result) {
                        if (err) {
                            _private._logger.info("Something went wrong here, rolling back.");
                            connection.rollback(function () {
                                reject(err);
                                connection.end();
                            });
                        } else {
                            _private._logger.info("Committing");
                            connection.commit(function (err) {
                                if (err) {
                                    _private._logger.info("Commit failed, rolling back.");
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

    return Client;
}());


module.exports = Client;