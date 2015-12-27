var _ = require('lodash');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');
var util = require('util');
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

            if (targetVersion && version != targetVersion) {
                logger.info(util.format(
                    "Version (%s) is different from target version " +
                    "(%s) and will be ignored.", version, targetVersion)
                );
            }

            else if (baseVersion && version < baseVersion) {
                logger.info(util.format(
                    "Version (%s) is lower then base version " +
                    "(%s) and will be ignored.", version, baseVersion)
                );
            }

            else if (baseVersion && version == baseVersion && baseVersionObjects && baseVersionObjects.indexOf(object) > -1) {
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
                    return _.map(_.sortBy(_.keys(versions)), function(key) {
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

module.exports = {
    parseVersion: parseVersion,
    discovery: discovery
};