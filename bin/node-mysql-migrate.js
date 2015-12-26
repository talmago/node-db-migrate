#!/usr/bin/env node

var _ = require('lodash');
var pkginfo = require('../package.json');
var program = require('commander');
var Table = require('cli-table2');
var Config = require('../lib/config');
var SchemaManager = require('../lib/schema');
var exitCode = 0;

/**
 * Short circuit for the command line options.
 * @param operation: String, operation name (e.g "migrate").
 * @param arguments: Array, list of arguments for the operation.
 * @param callback: Optional, callback function that will receive the output of the operation.
 */
function callOperationByName(operation, arguments, callback) {

    var mgr, op,
        config = Config.db;

    // callback is optional. default is noop.
    callback = callback ? callback : _.noop;

    // set schema hardcoded configs
    if (operation != "baseline") {
        config.database = Config.migration.schema;
    }

    // initiate a schema manager for the operation
    mgr = new SchemaManager(Config.migration.schema, Config.db);

    // operation is not supported
    op = _.get(mgr, operation);
    if (!op) {
        throw new Error("Operation is not supported: " + operation);
    }

    return op.bind(mgr).apply(null, arguments)
        .then(callback)
        .catch(function(e) {
            console.error(e.message);
            exitCode = 1;
        })
        .finally(function() {
            mgr.close();
            process.exit(exitCode)
        })
}

// `version`
program
    .version(pkginfo.version);

// `info` command
program
    .command('info')
    .description('show revision information')
    .action(function() {
        return callOperationByName('revision', [], function(revision) {
            var version = _.get(revision, 'version');
            console.log("Schema: `%s`, Version:", Config.migration.schema, version);
            if (version.toLowerCase() != "unknown") {
                var table = new Table({
                    head: ['Script', 'Description', 'Execution Time', 'Status', 'Reason']
                });
                _.each(revision.migrations || [], function(migration) {
                    table.push(
                        [
                            _.get(migration, "script", "N/A"),
                            _.get(migration, "description", "N/A"),
                            _.get(migration, "execution_time", "0") + " ms",
                            _.get(migration, "status", 1) == 0 ? "OK" : "FAILED",
                            _.get(migration, "reason", "N/A")
                        ]
                    );
                });
                _.each(table.toString().split("\n"), function(line) {
                    console.log(line);
                });
            }
        });
    });

// `clean`
program
    .command('clean')
    .description('drops all objects in the managed schema')
    .action(function() {
        return callOperationByName('clean', []);
    });

// `baseline`
program
    .command('baseline <version>')
    .description("baseline existing schema to initial version")
    .action(function(version) {
        return callOperationByName('baseline', [version]);
    });

// `migrate`
program
    .command('migrate [version]')
    .description("migrate schema to new version")
    .action(function(version) {
        return callOperationByName('migrate', [Config.migration.datadir, version]);
    });

// parse command line arguments
program.parse(process.argv);

// prompt exit code on exit
process.on('exit', function(code) {
    console.log('Exit with status code %s', code);
});