module.exports = require('rc')('mysql-migrate', {
    'logging': {
        'level': 'INFO',
        'filepath': null
    },
    'db': {
        'host': 'localhost',
        'user': 'root',
        'password': ''
    }
});