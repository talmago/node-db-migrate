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

$ ./node-mysql-migrate.js --help

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