var _ = require('lodash');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var util = require('util');
var url = require('url');
var logging = require('./logging');
var logger = logging.getLogger('Util');


/**
 * Get file extension.
 *
 * Examples
 * ----------
 * getFileExtension("hello.world") => ".world"
 * getFileExtension("hello.JSON") => ".json"
 *
 * @param filename: String
 * @returns: String
 */
function getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
}


/**
 * Parse version.
 *
 * A version must have the following structure:
 * - One or more numeric parts.
 * - Separated by a dot (.) or an underscore (_).
 * - Underscores are replaced by dots at runtime.
 * - Leading zeroes are ignored in each part.
 *
 * Examples
 * ---------
 * parseVersion("1")    ---> "1"
 * parseVersion("001")  ---> "1"
 * parseVersion("5.2")  ---> "5.2"
 * parseVersion("5_2")  ---> "5.2"
 * parseVersion("1.2.3.4.5.6.7.8.9") --> "1.2.3.4.5.6.7.8.9"
 *
 * @param version: String.
 * @returns String.
 */

function parseVersion(version) {

    if (!version || !_.isString(version)) {
        throw new Error("Bad version: " + version);
    }

    if (version[0].toLowerCase() == "v") {
        version = version.slice(1);
    }

    version = version.replace(/\_/g, '.');

    if (/^\d?([\d\.]+)?\d$/.test(version) == false) {
        throw new Error(
            "Invalid version, probably a non-numeric format " +
            "or starting with a dot (.) instead of a digit or a letter: " + version
        );
    }

    version = _.map(version.split("."), function(n) {
        return parseInt(n);
    }).join(".");

    return version;
}

/**
 * Compare version.
 *
 * For example,
 * compareVersion("0.1", "0.1.1") = 1
 *
 * @param v1: String, 1st version for comparison.
 * @param v2: String, 2nd version for comparison.
 * @returns {number}. If v1 is less than v2, -1. If v1 is greater than v2, 1. Otherwise, 0.
 */

function compareVersion(v1, v2) {

    var v1parts, v2parts, v1i, v2i;

    if (v1) {
        v1parts = v1.split('.');
    } else {
        if (v2) {
            return -1;  // v1 is missing. Treat v2 as larger.
        } else {
            return 0;   // Both are undefined.
        }
    }

    if (v2) {
        v2parts = v2.split('.');
    } else {
        return 1; // v2 is missing. Treat v1 as larger.
    }

    // Force equal length on both arrays:
    while (_.size(v1parts) != _.size(v2parts)) {
        if (_.size(v1parts) > _.size(v2parts)) {
            v2parts.push(0);
        } else { // (_.size(v1parts) < _.size(v2parts)
            v1parts.push(0);
        }
    }

    // Assuming equal length:
    for (var i = 0; i < v1parts.length; ++i) {
        v1i = +v1parts[i];
        v2i = +v2parts[i];

        if (v1i < v2i) { //v2 part is larger.
            return -1;
        } else if (v1i > v2i) { //v1 part is larger.
            return 1;
        } // Else equal
    }

    return 0;
}

/**
 * Parse file name to extract details about the migration, such as its version and description.
 *
 * Examples
 * ------------

 parseScriptName("V01_1__My_Migration_Script.sql") -->

 {
    "script": 'V01_1__My_Migration_Script.sql',
    "path": '/path/to/lib/V01_1__My_Migration_Script.sql',
    "type": 'sql',
    "version": '1.1',
    "description": 'My Migration Script'
 }

 * @param migrationScript: String.
 * @returns: Object, see the example above.
 */

function parseFilename(migrationScript) {

    var raw, pos,
        basename,
        extension,
        version,
        description;

    basename = path.basename(migrationScript);
    extension = getFileExtension(basename);

    if ([".sql", ".js"].indexOf(extension) < 0) {
        throw new Error(
            "Invalid migration script type, file extension " +
            "was expected to be .sql / .js but got: " + extension
        );
    }

    pos = basename.indexOf("__");
    if (pos < 0) {
        raw = basename;
        description = "";
    } else {
        raw = basename.substr(0, pos);
        description = basename.substring(pos + 2, basename.length - extension.length);
    }

    version = parseVersion(raw);
    description = description.replace(/\_/g, ' ');

    return {
        "script": basename,
        "path": path.resolve(migrationScript),
        "type": extension == ".js" ? "Node.js" : "SQL",
        "version": version,
        "description": description
    };
}

/**
 * Discover migration scripts.
 *
 *
 * @param directory: String, path to a directory.
 *                       `discover` will raise an error under the following circumstances:
 *                          - `discoveryPath` does not exist.
 *                          - `discoveryPath` is not a directory.
 *                          - `discoveryPath` has no privileges;
 *
 * @param targetVersion: Optional. If `targetVersion` was passed, the result
 *                       will include only migration scripts with version = `targetVersion`.
 *
 * @param baseVersion: Optional. If `baseVersion` was passed, the result
 *                     will include only migration scripts with version > `baseVersion`.
 *
 * @param baseVersionObjects: Optional.
 *
 * @results: Array, sorted by version, each element will contain details regarding the migration script.
 */

function discovery(directory, targetVersion, baseVersion, baseVersionObjects) {

    if (!_.isString(directory)) {
        throw new Error("`directory` argument must be a string");
    }

    if (targetVersion) {
        targetVersion = parseVersion(targetVersion);
    }

    if (baseVersion) {
        baseVersion = parseVersion(baseVersion);
    }

    if (baseVersionObjects && !_.isArray(baseVersionObjects)) {
        throw new Error("`baseVersionObjects` argument must be an array");
    }

    return fs.lstatAsync(directory)
        .then(function (stats) {
            return stats.isDirectory() ?
                fs.readdirAsync(directory) :
                Promise.reject(directory + ' is not a directory.');
        })
        .map(function (script) {

            var migration,
                version,
                object;

            try {
                migration = parseFilename(path.resolve(directory, script));
            } catch(e) {
                if (logger.isLevelEnabled("DEBUG")) {
                    logger.error(e.message);
                }
                return;
            }

            version = _.get(migration, 'version', '');
            object = _.get(migration, 'script');

            if (targetVersion && compareVersion(version, targetVersion) == 1) {
                logger.info(util.format(
                    "Version (%s) is greater then target version " +
                    "(%s) and will be ignored.", version, targetVersion)
                );
            }

            else if (baseVersion && compareVersion(baseVersion, version) == 1) {
                logger.info(util.format(
                    "Version (%s) is lower then base version " +
                    "(%s) and will be ignored.", version, baseVersion)
                );
            }

            else if (baseVersion && compareVersion(baseVersion, version) == 0 && baseVersionObjects && baseVersionObjects.indexOf(object) > -1) {
                logger.info(util.format(
                    "Object %s/%s already exists " +
                    "and will be ignored.", version, object)
                );
            }

            else {
                return migration;
            }

        })
        .then(function(migrations) {
            return _.chain(migrations)
                .compact()
                .groupBy('version')
                .thru(function(versions) {
                    var ver = _.keys(versions);
                    ver.sort(compareVersion);
                    return _.map(ver, function(key) {
                        return versions[key];
                    });
                })
                .values()
                .value();
        })
        .catch(function (e) {
            throw new Error(
                "Discovery path (" + directory +") is either not a directory,\n" +
                "does not exist or has insufficient privileges." + e.message +
                ", errno: " + e.errno + ", code: " + e.code
            );
        });
}

/**
 * Knex Client installation (http://knexjs.org/#Installation-client)
 * As Knex provides the SQL transport for the schema management, this function
 * simply call knex's constructor with some extra validations and manipulations.
 * @param client: String, SQL flavor ["mysql","sqlite3","pg","mariasql","strong-oracle","oracle"].
 * @param connectionStringOrConfig: String/Object, connection string or config object.
 *        Either a key-value object (key-value) or a URL formatted connection string.
 * @returns: {Knex}.
 */
function getTransport(client, connectionStringOrConfig, database) {

    var transport, asUrl;

    if (typeof client != "string") {
        throw new Error(
            "expected second argument to be a string " +
            "but got `" + typeof(schema) + "` instead."
        );
    }

    if (!_.isObject(connectionStringOrConfig) && !_.isString(connectionStringOrConfig)) {
        throw new Error(
            "expected third argument to be an object or a string, " +
            "but got `" + typeof connectionStringOrConfig + "` instead. aborting."
        );
    }

    if (client == "mysql") {

        if (_.isString(connectionStringOrConfig)) {

            try {
                asUrl = url.parse(connectionStringOrConfig);
            } catch(e) {
                throw new Error("Could not parse connection string: " + connectionStringOrConfig);
            }

            // Knex won't stand a connection string with empty pathname
            if (!asUrl.pathname) {
                asUrl.pathname = "/";
            }

            // Knex won't stand a password-less connection string
            if (asUrl.auth && asUrl.auth.indexOf(":") < 0) {
                asUrl.auth += ":";
            }

            // Init query object if not exists
            if (!asUrl.query) {
                asUrl.query = {};
            }

            // Set `multipleStatements` to true
            asUrl.query["multipleStatements"] = "true";

            // Set `database`
            asUrl.query["database"] = database;

            // re-build the connection string with the modifications
            connectionStringOrConfig = url.format(asUrl);

        } else {
            // Set `multipleStatements` to true
            connectionStringOrConfig["multipleStatements"] = true;
            // Set `database`
            connectionStringOrConfig["database"] = database;
        }
    }

    else if (client == "pg") {

    }

    else if (client == "mariasql") {

    }

    else {
        throw new Error("Client not supported: " + client);
    }

    try {
        transport = require('knex')({
            client: client,
            connection: connectionStringOrConfig
        });
    } catch(e) {
        throw new Error("Could not load transport:" + e);
    }

    return transport;
}

module.exports = {
    getTransport: getTransport,
    parseVersion: parseVersion,
    discovery: discovery
};