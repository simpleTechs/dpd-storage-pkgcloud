/*
    This mokney-pathes a .getURL-function into the pkgclient amazon client
 */

var File = require('pkgcloud').providers.amazon.storage.File;
File.prototype.getURL = function(action, cb) {
    action = (action==='GET'?'getObject':(action==='PUT'?'putObject':''));
    if(!action) return cb('action required', null);

    this.client.s3.getSignedUrl(action, {
        Bucket: this.container.name,
        Key: this.name
    }, cb);
}

module.exports = File;