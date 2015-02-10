var debug = require('debug')('dpd-storage-pkgcloud'),
    Resource = require('deployd/lib/resource'),
    util = require('util'),
    path = require('path'),
    pkgcloud = require('pkgcloud'),
    Busboy = require('busboy'),
    PKGFile;

function PKGCloudBucket(name, options) {
    Resource.apply(this, arguments);
    if (this.config.uses3 && this.config.s3key && this.config.s3secret && this.config.s3bucket) {
        this.client = pkgcloud.storage.createClient({
           provider: 'amazon',
           key: this.config.s3secret, // secret key
           keyId: this.config.s3key, // access key id
           region: this.config.s3region // region
        });

        this.container = {
            name: this.config.s3bucket
        }
        
        // monkey-patch getURL-functions
        PKGFile = require('./lib/pkgcloud-s3-geturl')
    }
}
util.inherits(PKGCloudBucket, Resource);
module.exports = PKGCloudBucket;
module.exports.label = "pkgcloud Bucket";

module.exports.prototype.clientGeneration = false;

module.exports.events = ['put', 'afterput', 'get', 'delete'];
module.exports.dashboard = {
    path: path.join(__dirname, 'dashboard')
  , pages: ['Config', 'Events', 'Files']
};
module.exports.basicDashboard = {
    settings: [
        {
            name: 'uses3',
            type: 'checkbox'
        }, {
            name: 's3key',
            type: 'string'
        }, {
            name: 's3secret',
            type: 'string'
        }, {
            name: 's3region',
            type: 'string'
        }, {
            name: 's3bucket',
            type: 'string'
        }
    ]
};

module.exports.prototype.handle = function(ctx, next) {
    var req = ctx.req,
        // remove the first /
        filepath = path.normalize(ctx.url),
        filepath = filepath[0] == '/' ? filepath.substr(1) : filepath,
        filepath = filepath[filepath.length] == '/' ? filepath.substr(0, -1) : filepath
        domain = {
            filepath: filepath, 
            query:ctx.query
        },
        isRoot = ctx.session.isRoot;

    if(!this.client) return ctx.done('Missing configuration!');
    if(!filepath && !isRoot) return ctx.done('Missing path');

    debug('handle %s called method: %s', filepath, ctx.req.method)
    if(req.method === 'GET') {
        if(ctx.query.action === 'list' && isRoot) {
            return this._getFiles(ctx, next);
        }
        var action = 'get';
        if (ctx.query.action && ctx.query.action.toLowerCase() === 'put') {
            action = 'put';
        }

        if (this.events[action]) {
                this.events[action].run(ctx, domain, function(err) {
                    if (err) return ctx.done(err);
                    this._getURL(ctx, action, domain.filepath, next);
                }.bind(this));
        } else {
            this._getURL(ctx, action, domain.filepath, next);
        }
    } else if(req.method === 'DELETE') {
        if (this.events['delete']) {
            this.events['delete'].run(ctx, domain, function(err) {
                if (err) return ctx.done(err);
                this.delete(ctx, next);
            }.bind(this));
        } else {
            this.delete(ctx, next);
        }
    } else if(req.method === 'POST' || req.method === 'PUT') {
        var requestType = req.headers['content-type'];
        if(requestType.indexOf('multipart/form-data') !== -1) {
            //handle form upload
            debug('got form-post request, type: %s', requestType);
            
            var busboy = new Busboy({ headers: req.headers });
            busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
                // if the user supplied a directory in the upload request, we will use that instead of the dirname
                var destpath = path.join(ctx.url[ctx.url.length] == '/' ? path.dirname(filepath) : filepath, filename);
                debug('Uploading file from field "%s" to "%s"', fieldname, destpath);
                
                if(this.events.afterput) {
                    var _domain = {
                        filepath: destpath, 
                        query: ctx.query,
                        form: {
                            filename: filename,
                            destpath: destpath,
                            fieldname: fieldname,
                            encoding: encoding,
                            mimetype: mimetype
                        }
                    };
                    this.events.put.run(ctx, _domain, function(err) {
                        if (err) return ctx.done(err);
                        file.pipe(this._getUploadStream(destpath, ctx, _domain));
                    }.bind(this));
                } else {
                    file.pipe(this._getUploadStream(destpath, ctx, domain));
                }
            }.bind(this));
            busboy.on('finish', function() {
                debug('All uploads done');
                ctx.res.end(null, '');
            });
            req.pipe(busboy);

            if(ctx.req.headers['content-length']) {
                req.resume(); // this is needed as deployd will internall pause every stream that has a content-length
            }
        } else {
            //handle direct upload
            debug('got direct-post request, type: %s', requestType);
            this.putStream(ctx, filepath, ctx.req, next);
        }
    } else {
        next();
    }
};

// get the contents of the current container
module.exports.prototype._getFiles = function(ctx, next) {
    this.client.getFiles(this.config.s3bucket, function(err, container) {
        ctx.done(null, container);
    });
}


// get a signedUrl for [get/put]object into s3
module.exports.prototype._getURL = function (ctx, action, filepath, next, returnFormat) {
    return new PKGFile(this.client, {
        name: filepath,
        container: this.container
    }).getURL(action.toUpperCase(), function(err, url) {
        if(err) {
            return ctx.done(err);
        }

        if(returnFormat === 'url' || (ctx.query.returnFormat && ctx.query.returnFormat.toLowerCase() == 'url')) {
            // simple ajax to get url link
            ctx.done(null, url);
        } else {
            // redirect (can be used in <img src="/s3bucket/apple.jpg">)
            ctx.res.statusCode = 307;
            ctx.res.setHeader("Location", url);
            ctx.res.end(null, url);
        }
    });
}
module.exports.prototype._getUploadStream = function (filepath, ctx, domain) {
    var uploadStream = this.client.upload({
        container: this.container.name,
        remote: filepath
    });

    if(this.events.afterput) {
        // this will run asynchronously and you cannot abort from here
        uploadStream.on('success', function(file) {
            debug('File uploaded successfully!');

            domain.file = file;
            this.events.afterput.run(ctx, domain, function(err) {
                if(err) {
                    debug('An error happened in afterput:', err);
                }
            });
        }.bind(this));
    }

    return uploadStream;
}
module.exports.prototype.putStream = function (ctx, filepath, readStream, next) {
    var writeStream = this._getUploadStream(filepath, ctx, {
            filepath: filepath,
            query: ctx.query
        });

    writeStream.on('error', function(err) {
        // handle your error case
        debug('An error happened in upload!', err);
        ctx.res.done(err);
    });

    writeStream.on('success', function(file) {
        // success, file will be a File model
        debug('File uploaded successfully!');

        // this will run asynchronously and you cannot abort from here
        domain.file = file;
        this.events.afterput.run(ctx, domain, function(err) {
            if(err) {
                debug('An error happened in afterput:', err);
            }
        });

        // respond with the new file's url
        this._getURL(ctx, 'get', filepath, next, 'url');
    }.bind(this));

    readStream.pipe(writeStream);

    if(ctx.req.headers['content-length']) {
        readStream.resume(); // this is needed as deployd will internall pause every stream that has a content-length
    }
}

// get a signedUrl for delete object into s3
module.exports.prototype.delete = function (ctx, next) {
    // remove the first /
    var s3Key = ctx.url[0] == '/' ? ctx.url.substr(1) : ctx.url;
    this.s3.deleteObject({
        Bucket: this.config.bucket,
        Key: s3Key,
    }, ctx.done);
}
