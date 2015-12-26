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
     * @param options: It is possible to set connection/pool settings.
     *                 See https://github.com/felixge/node-mysql#connection-options
     *                 and https://github.com/felixge/node-mysql#pool-options.
     * @constructor
     */
    function Client(options) {
        options = options || {};

        _private._pool = mysql.createPool(options);
        _private._name = util.format("[MySQL Client /%s:%s]",
            _private._pool.config.connectionConfig.host,
            _private._pool.config.connectionConfig.port
        );

        _private._logger = logging.getLogger(_private._name);
        _private._logger.info(
            "Connection pool of %d connections was established",
            _private._pool.config.connectionLimit
        );

        /**
         * Get a connection from the pool.
         * When connection is ready to go back to the pool, call `connection.release()`.
         * @param callback: optional callback that accepts two arguments;
         *                  - err: Error object if error occurred, otherwise `null`.
         *                  - conn: MySQL connection object (mysql.createConnection).
         * @returns {*}
         */
        _private._getConnection = function (callback) {

            if (!_private._pool) {
                throw new Error("Connection pool must be initialized first");
            }

            // Set connectionConfig.multipleStatements to `true`
            _private._pool.config.connectionConfig.multipleStatements = true;

            var promise = new Promise(function (resolve, reject) {
                _private._pool.getConnection(function (err, connection) {
                    if (err) reject(err);
                    else resolve(connection);
                });
            });

            if (!callback) return promise;
            return promise
                .then(function (connection) {
                    connection.on('error', function (err) {
                        _private._logger.error(err);
                    });
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
        _private._logger.info("Shutting down connection pool");
        _private._pool && _private._pool.end(callback);
        _private._pool = null;
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

        var promise = new Promise(function (resolve, reject) {
            _private._getConnection(function (err, connection) {
                if (err) return reject(err);
                connection.query(query, params, function (err, rows) {
                    connection.release();
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

    Client.prototype.executeMulti = function(query, callback) {
        var self = this;

        var promise = new Promise(function (resolve, reject) {
            _private._getConnection(function (err, connection) {
                if (err) return reject(err);
                _private._logger.info("Starting transaction");
                connection.beginTransaction(function (err) {
                    if (err) reject(err);
                    connection.query(query, undefined, function (err, result) {
                        connection.release();
                        if (err) {
                            _private._logger.info("Something went wrong here, rolling back.");
                            connection.rollback(function () {
                                reject(err);
                            });
                        } else {
                            _private._logger.info("Committing");
                            connection.commit(function (err) {
                                if (err) {
                                    self.logger.info("Commit failed, rolling back.");
                                    connection.rollback(function () {
                                        reject(err);
                                    });
                                } else {
                                    resolve(result);
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
                self.executeMulti(query, function(err, data) {
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

    return Client;
}());

module.exports = Client;