# node-mysql-migrate

## Overview
Simple migration tool for Mysql/Node.js

# Quick Start

#### Install

```sh
npm install -g https://github.com/talmago/node-mysql-migrate
```

After the installation, you can start using the command line.


#### Command line

```sh

$ mysql-migrate.js --help

  Usage: node-mysql-migrate [options] [command]


  Commands:

    info                show revision information
    clean               drops all objects in the managed schema
    baseline <version>  baseline existing schema to initial version
    migrate [version]   migrate schema to new version

  Options:

    -h, --help     output usage information
    -V, --version  output the version number
```

###### baseline

```sh

$ mysql-migrate baseline 1.0
[2015-12-26 13:20:18.693] [INFO] [MySQL Client /localhost:3306] - Connection pool of 10 connections was established
[2015-12-26 13:20:18.697] [INFO] [SchemaMgr/ myproject] - Creating `schema_version` object in `myproject` schema.
[2015-12-26 13:20:18.718] [INFO] [SchemaMgr/ myproject] - Deleting objects in `myproject`.`schema_version`
[2015-12-26 13:20:18.730] [INFO] [SchemaMgr/ myproject] - Saving version `1.0` to `myproject`.`schema_version`
[2015-12-26 13:20:18.735] [INFO] [MySQL Client /localhost:3306] - Shutting down connection pool
[2015-12-26 13:20:18.736] [INFO] console - Exit with status code 0

```


###### info

```sh

$ mysql-migrate info
[2015-12-26 13:23:00.573] [INFO] [MySQL Client /localhost:3306] - Connection pool of 10 connections was established
[2015-12-26 13:23:00.577] [INFO] [SchemaMgr/ myproject] - Reading objects from `myproject`.`schema_version`
[2015-12-26 13:23:00.607] [INFO] console - Schema Version: 1.0
[2015-12-26 13:23:00.630] [INFO] console - ┌────────┬──────────────┬────────────────┬────────┐
[2015-12-26 13:23:00.630] [INFO] console - │ Script │ Description  │ Execution Time │ Status │
[2015-12-26 13:23:00.630] [INFO] console - ├────────┼──────────────┼────────────────┼────────┤
[2015-12-26 13:23:00.630] [INFO] console - │        │ Base version │ 0 ms           │ 0      │
[2015-12-26 13:23:00.630] [INFO] console - └────────┴──────────────┴────────────────┴────────┘
[2015-12-26 13:23:00.631] [INFO] [MySQL Client /localhost:3306] - Shutting down connection pool
[2015-12-26 13:23:00.632] [INFO] console - Exit with status code 0

```

###### clean

```sh

$ mysql-migrate clean
[2015-12-26 13:26:18.042] [INFO] [MySQL Client /localhost:3306] - Connection pool of 10 connections was established
[2015-12-26 13:26:18.045] [INFO] [SchemaMgr/ myproject] - Dropping objects in `myproject`
[2015-12-26 13:26:18.070] [INFO] [MySQL Client /localhost:3306] - Shutting down connection pool
[2015-12-26 13:26:18.072] [INFO] console - Exit with status code 0

```


#### Configuration
 
Migration tool uses rc file for its settings.

Configuration file should be placed in one of the following locations:

    * $HOME/.mysql-migraterc
    * $HOME/.mysql-migrate/config
    * $HOME/.config/mysql-migrate
    * $HOME/.config/mysql-migrate/config
    * /etc/mysql-migraterc
    * /etc/mysql-migrate/config

Configuration should be in one of the following formats:

    * INI
    * JSON

## INI (example)

```
[logging]
level       =   INFO|DEBUG|WARN|ERROR
filepath    =   /path/to/logfile

[db]
host        =   localhost
user        =   root
password    =   pass

[migration]
schema      =   myproject
datadir     =   /etc/mysql-migraterc/data
```


## JSON (example)

```javascript
{
    "logging": {
        "level": "INFO",
        "filepath": null
    },
    "db": {
        "host": "localhost",
        "user": "root",
        "password": ""
    },
    "migration": {
        "schema": "myproject",
        "datadir": "/etc/mysql-migraterc/data/myproject"
    }
}
```