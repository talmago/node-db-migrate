module.exports = function(connection) {
    var query = "CREATE TABLE test_user (name VARCHAR(25) NOT NULL, PRIMARY KEY(user_name));";
    return connection.queryAsync(query);
};