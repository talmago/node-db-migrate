# node-db-migrate

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Command line](#command-line)
    - [baseline](#baseline)
    - [info](#info)
    - [migrate](#migrate)
    - [repair](#repair)
    - [clean](#clean)
- [Writing a migration script](#writing-a-migration-script)
    - [Data Directory](#data-directory)
    - [Naming](#naming)
    - [SQL](#sql)
    - [Node.js](#nodejs)
- [Using the library](#using-the-library-directly)
- [Configuration](#configuration)


## Overview

Simple MySQL migration tool written in Node.js. MIT License.

## Quick Start

#### Installation

```sh
npm install -g https://github.com/talmago/node-db-migrate
```

> **NOTICE:** -g flag is mandatory if you wish to use the command line.
Use `npm install https://github.com/talmago/node-db-migrate` if you want to use the library.

#### Command line

```sh

$ db-migrate --help

  Usage: db-migrate [options] [command]


  Commands:

    info                show revision information
    clean               drops all objects in the managed schema
    repair              repair migration failures
    baseline <version>  baseline existing schema to initial version
    migrate [version]   migrate schema to new version

  Options:

    -h, --help     output usage information
    -V, --version  output the version number
```

###### baseline

`baseline` will first create the schema (if it doesn't exist already)
and then will initiate the objects where the revision information will be hold.

```sh

$ db-migrate baseline 1.0
[2015-12-26 13:38:33.137] [INFO] [MySQL Client /localhost:3306] - Connection pool of 10 connections was established
[2015-12-26 13:38:33.141] [INFO] [SchemaMgr/ myproject] - Creating Schema `myproject` if not exists.
[2015-12-26 13:38:33.160] [INFO] [SchemaMgr/ myproject] - Creating `schema_version` object in `myproject` schema.
[2015-12-26 13:38:33.177] [INFO] [SchemaMgr/ myproject] - Deleting objects in `myproject`.`schema_version`
[2015-12-26 13:38:33.179] [INFO] [SchemaMgr/ myproject] - Saving version `1.0` to `myproject`.`schema_version`
[2015-12-26 13:38:33.183] [INFO] [MySQL Client /localhost:3306] - Shutting down connection pool
[2015-12-26 13:38:33.186] [INFO] console - Exit with status code 0

```

###### info

`info` will show the relevant information about the current revision:
    * Current version, defined as the highest rank that has at least one successful execution.
    * Latest executions, including all executions of the current version, regardless of their status,
      and failures of executions related to higher versions.

```sh

$ db-migrate info
[2015-12-26 13:39:53.077] [INFO] [MySQL Client /localhost:3306] - Connection pool of 10 connections was established
[2015-12-26 13:39:53.080] [INFO] [SchemaMgr/ myproject] - Reading objects from `myproject`.`schema_version`
[2015-12-26 13:39:53.112] [INFO] console - Schema: `myproject`, Version: 1.0
[2015-12-26 13:39:53.126] [INFO] console - ┌────────┬──────────────┬────────────────┬────────┐
[2015-12-26 13:39:53.126] [INFO] console - │ Script │ Description  │ Execution Time │ Status │
[2015-12-26 13:39:53.126] [INFO] console - ├────────┼──────────────┼────────────────┼────────┤
[2015-12-26 13:39:53.127] [INFO] console - │        │ Base version │ 0 ms           │ OK     │
[2015-12-26 13:39:53.127] [INFO] console - └────────┴──────────────┴────────────────┴────────┘
[2015-12-26 13:39:53.127] [INFO] [MySQL Client /localhost:3306] - Shutting down connection pool
[2015-12-26 13:39:53.128] [INFO] console - Exit with status code 0

```

###### migrate

`migrate` discovers new content in the data directory and executes it, moving the schema into a new state (revision), 
either a version bump or changes in content of the current version. `migrate` can work with a target
version if you want to define the specific target version and will ignore any changes related to versions
with higher rank. In the example below, we perform a migration to version 1.1.

```sh

$ db-migrate migrate
[2015-12-26 14:06:08.730] [INFO] [MySQL Client /localhost:3306] - Connection pool of 10 connections was established
[2015-12-26 14:06:08.734] [INFO] [SchemaMgr/ myproject] - Reading objects from `myproject`.`schema_version`
[2015-12-26 14:06:08.768] [INFO] [MySQL Client /localhost:3306] - Starting transaction
[2015-12-26 14:06:08.795] [INFO] [MySQL Client /localhost:3306] - Committing
[2015-12-26 14:06:08.798] [INFO] [SchemaMgr/ myproject] - Saving version `1.1` to `myproject`.`schema_version`
[2015-12-26 14:06:08.809] [INFO] [MySQL Client /localhost:3306] - Shutting down connection pool
[2015-12-26 14:06:08.811] [INFO] console - Exit with status code 0

```

And we can see the version bump by calling `info` again.

```sh

$ db-migrate info
[2015-12-26 14:06:57.206] [INFO] [MySQL Client /localhost:3306] - Connection pool of 10 connections was established
[2015-12-26 14:06:57.210] [INFO] [SchemaMgr/ myproject] - Reading objects from `myproject`.`schema_version`
[2015-12-26 14:06:57.238] [INFO] console - Schema: `myproject`, Version: 1.1
[2015-12-26 14:06:57.271] [INFO] console - ┌─────────────────────────────┬───────────────────┬────────────────┬────────┐
[2015-12-26 14:06:57.272] [INFO] console - │ Script                      │ Description       │ Execution Time │ Status │
[2015-12-26 14:06:57.272] [INFO] console - ├─────────────────────────────┼───────────────────┼────────────────┼────────┤
[2015-12-26 14:06:57.272] [INFO] console - │ v1_1__Create_User_Table.sql │ Create User Table │ 32 ms          │ OK     │
[2015-12-26 14:06:57.272] [INFO] console - └─────────────────────────────┴───────────────────┴────────────────┴────────┘
[2015-12-26 14:06:57.272] [INFO] [MySQL Client /localhost:3306] - Shutting down connection pool
[2015-12-26 14:06:57.273] [INFO] console - Exit with status code 0

```

###### repair

Since failures are documented by the schema manager in the same manner
as successful events, it is impossible to fix a failure by running the migration again.
In order to fix a failure, we must call `repair`, which will scan the data directory
for the same script, but this time with the correct syntax, and re-base the version.

Hence, let's change the example above to have a syntax error:

```sql
CREATE TABLE IF NOT EXISTS users (
  name VARCHAR(25) NOT NULL,
  PRIMARY KEY(user_name)
);
```

After trying to run the migration (with no success), there will be no version bump
but we will be able to see the failures of the attempted version.

```sh

$ db-migrate info
[2015-12-26 17:10:23.921] [INFO] [SchemaMgr/ myproject] - Reading objects from `myproject`.`schema_version`
[2015-12-26 17:10:24.026] [INFO] console - Schema: `myproject`, Version: 1.0
[2015-12-26 17:10:24.044] [INFO] console - ┌────────────────────────────┬───────────────────┬────────────────┬────────┬─────────────────────────────────────────────────────────────────────────────┐
[2015-12-26 17:10:24.044] [INFO] console - │ Script                     │ Description       │ Execution Time │ Status │ Reason                                                                      │
[2015-12-26 17:10:24.044] [INFO] console - ├────────────────────────────┼───────────────────┼────────────────┼────────┼─────────────────────────────────────────────────────────────────────────────┤
[2015-12-26 17:10:24.044] [INFO] console - │                            │ Base version      │ 0 ms           │ OK     │                                                                             │
[2015-12-26 17:10:24.044] [INFO] console - ├────────────────────────────┼───────────────────┼────────────────┼────────┼─────────────────────────────────────────────────────────────────────────────┤
[2015-12-26 17:10:24.044] [INFO] console - │ v1_1__Create_User_Table.js │ Create User Table │ 15 ms          │ FAILED │ ER_KEY_COLUMN_DOES_NOT_EXITS: Key column 'user_name' doesn't exist in table │
[2015-12-26 17:10:24.045] [INFO] console - └────────────────────────────┴───────────────────┴────────────────┴────────┴─────────────────────────────────────────────────────────────────────────────┘
[2015-12-26 17:10:24.048] [INFO] console - Exit with status code 0

```

Calling `migrate` again at this stage will do nothing since the 
migration tool will ignore any object that was already registered to the schema revision.
`repair` will go over failures and try to run them again.

```sh

$ db-migrate repair
[2015-12-26 17:39:58.266] [INFO] [SchemaMgr/ myproject] - Reading objects from `myproject`.`schema_version`
[2015-12-26 17:39:58.350] [INFO] [SchemaMgr/ myproject] - Preparing to repair 1.1/v1_1__Create_User_Table.js
[2015-12-26 17:39:58.360] [INFO] [SchemaMgr/ myproject] - Starting transaction
[2015-12-26 17:39:58.380] [INFO] [SchemaMgr/ myproject] - Committing transaction
[2015-12-26 17:39:58.382] [INFO] [SchemaMgr/ myproject] - Saving version `1.1` to `myproject`.`schema_version`
[2015-12-26 17:39:58.391] [INFO] console - Exit with status code 0

```

If repair completed succesfully, we can now see the version bump.

```sh

$ db-migrate info
[2015-12-26 17:40:05.141] [INFO] [SchemaMgr/ myproject] - Reading objects from `myproject`.`schema_version`
[2015-12-26 17:40:05.224] [INFO] console - Schema: `myproject`, Version: 1.1
[2015-12-26 17:40:05.246] [INFO] console - ┌────────────────────────────┬───────────────────┬────────────────┬────────┬────────┐
[2015-12-26 17:40:05.246] [INFO] console - │ Script                     │ Description       │ Execution Time │ Status │ Reason │
[2015-12-26 17:40:05.246] [INFO] console - ├────────────────────────────┼───────────────────┼────────────────┼────────┼────────┤
[2015-12-26 17:40:05.246] [INFO] console - │ v1_1__Create_User_Table.js │ Create User Table │ 30 ms          │ OK     │        │
[2015-12-26 17:40:05.247] [INFO] console - └────────────────────────────┴───────────────────┴────────────────┴────────┴────────┘
[2015-12-26 17:40:05.247] [INFO] console - Exit with status code 0

```

###### clean

```sh

$ db-migrate clean
[2015-12-26 13:26:18.042] [INFO] [MySQL Client /localhost:3306] - Connection pool of 10 connections was established
[2015-12-26 13:26:18.045] [INFO] [SchemaMgr/ myproject] - Dropping objects in `myproject`
[2015-12-26 13:26:18.070] [INFO] [MySQL Client /localhost:3306] - Shutting down connection pool
[2015-12-26 13:26:18.072] [INFO] console - Exit with status code 0

```

#### Writing a migration script

###### Data Directory

Data directory is where migration scripts should be uploaded.
Please make to sure to configure the data directory in your project rc file.

```
...

[migration]
schema      =   myproject
datadir     =   /etc/db-migraterc/data/myproject

```

###### Naming

Files in the data directory must have a name in the following format: 

v${VERSION}__${DESCRIPTION}.${EXT}

${VERSION} must have the following structure:
* One or more numeric parts.
* Separated by a dot (.) or an underscore (_).
* Underscores are replaced by dots at runtime.
* Leading zeroes are ignored in each part.          

${DESCRIPTION} must have the following structure:
* Text.
* Less then 255 characters.
* Separated by a an underscore (_).

${EXT} can be one of the following:
* .js / .JS
* .sql / .SQL

Examples:
* v1_1_Create_User_Table.sql
* v01_1_Create_User_Table.js

###### SQL

Writing migration script in SQL is pretty straight-forward, as it uses the standard
SQL programming (e.g. http://dev.mysql.com/doc/refman/5.7/en/sql-syntax.html). Below is
a simple example in MySQL which created a new table in our project called `users`.

```sql
CREATE TABLE IF NOT EXISTS users (
  name VARCHAR(25) NOT NULL,
  PRIMARY KEY(name)
);
```

> **NOTICE:** Currently there is no enforcement on changes that can be done to other 
perhaps non-managed schemas. In fact, scope of SQL scripts is not limited to the managed schema only. 
We highly recommend to be careful with the changes as in the future we will probably
validate the syntax before calling the execution. No need for `USE` statement, as you can assume 
the execution will use the managed schema.

###### Node.js

For more complex statements, we support Node.js programming language.
A Node.js module should export one function only that will receive one argument,
a `connection`, which is a transaction that was succesfully established against 
the database server. `connection` supports both native callbacks and Promises/A+ (bluebird) 
and documentation can be found [here](https://github.com/felixge/node-mysql#establishing-connections).


```javascript

module.exports = function(connection) {
    return connection.queryAsync("CREATE TABLE test_user (name VARCHAR(25) NOT NULL, PRIMARY KEY(name));");
};

```

> **NOTICE:** Runtime errors will immediately rollback the transaction to the database.
Node.js modules should not start or end a new transaction, as these operations are expected to raise
runtime errors as well.

#### Using the library directly

```javascript

var dbmigrate = require('node-db-migrate');
var Transport = dbmigrate.Transport;
var SchemaManager = dbmigrate.SchemaManager;

var transport = Transport.fromCfg("mysql://root@localhost");
var mgr = new SchemaManager('myproject', transport);

mgr.migrate('/path/to/data/directory')
        .then(function() {
            // .. post-migration code ..
        })
        .catch(function(e) {
            console.error(e.message);
        })
        .finally(function() {
            mgr.close();
        })
```

#### Configuration
 
Migration tool uses rc file for its settings.

Configuration file should be placed in one of the following locations:

    * $HOME/.db-migraterc
    * $HOME/.db-migrate/config
    * $HOME/.config/db-migrate
    * $HOME/.config/db-migrate/config
    * /etc/db-migraterc
    * /etc/db-migrate/config

Configuration should be in one of the following formats:

    * INI
    * JSON

###### INI

```
[logging]
level               =   INFO|DEBUG|WARN|ERROR
filepath            =   /path/to/logfile

[transport]
connectionString    =   mysql://root@localhost

[schema]
name                =   myproject
datadir             =   /etc/mysql-migraterc/data
```

###### JSON

```javascript
{
    "logging": {
        "level": "INFO",
        "filepath": null
    },
    "transport": {
        "connectionString": "mysql://root@localhost"
    },
    "schema": {
        "name": "myproject",
        "datadir": "/etc/mysql-migraterc/data/myproject"
    }
}
```
