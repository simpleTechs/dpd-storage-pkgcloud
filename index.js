var debug = require('debug')('dpd-storage-pkgcloud'),
    Resource = require('deployd/lib/resource'),
    when = require('when'),
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
        };
        
        // monkey-patch getURL-functions
        PKGFile = require('./lib/pkgcloud-s3-geturl');
    }
}
util.inherits(PKGCloudBucket, Resource);
module.exports = PKGCloudBucket;
module.exports.label = "pkgcloud Bucket";

module.exports.prototype.clientGeneration = false;

module.exports.events = ['BeforePut', 'AfterPut', 'BeforeGet', 'BeforeDelete'];
module.exports.dashboard = {
    path: path.join(__dirname, 'dashboard'),
    pages: ['Config', 'Events', 'Files']
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
        self = this,
        // remove the first /
        filepath = path.normalize(decodeURIComponent(ctx.url)),
        filepath = filepath[0] == '/' ? filepath.substr(1) : filepath,
        filepath = filepath[filepath.length] == '/' ? filepath.substr(0, -1) : filepath,
        domain = {
            filepath: filepath, 
            query:ctx.query
        },
        isRoot = ctx.session.isRoot;

    if(!this.client) return ctx.done('Missing configuration!');

    if(req.method === 'POST' || req.method === 'PUT') {
        req.method = 'PUT';
    }

    if(!filepath && !isRoot && req.method !== 'PUT') {
        return ctx.done('Missing path');
    }

    debug('handle %s called method: %s', filepath, ctx.req.method);
    if(req.method === 'GET') {
        if(ctx.query.action === 'list' && isRoot) {
            return this._getFiles(ctx, ctx.done);
        }
        
        this.runEvent(this.events.BeforeGet, ctx, domain, function(err) {
            if (err) return ctx.done(err);

            self._getURL(ctx, 'get', domain.filepath, ctx.done);
        });
    } else if(req.method === 'DELETE') {
        this.runEvent(this.events.BeforeDelete, ctx, domain, function(err) {
            if (err) return ctx.done(err);
            self['delete'](ctx, domain.filepath, function(err, res) {
                if(err) {
                    return ctx.done(err);
                }

                ctx.done(null, 'File was deleted');
            });
        });
    } else if(req.method === 'PUT') {
        var requestType = req.headers['content-type'] || '';
        
        if(ctx.query.returnFormat && ctx.query.returnFormat.toLowerCase() == 'url') {
            this.runEvent(this.events.BeforePut, ctx, domain, function(err) {
                if(err) return ctx.done(err);

                self._getURL(ctx, 'put', domain.filepath, function(err, res) {
                    if(err) ctx.done(err);
                
                    self.runEvent(self.events.AfterPut, ctx, domain, function(err) {
                        debug('All uploads done, error: %j', err);
                        if(err) return ctx.done(err);

                        ctx.done(null, {
                            success: true,
                            filepath: path.join(self.path, domain.filepath),
                            uploadURL: res
                        });
                    });
                }, 'url');
            });
        } else if(requestType.indexOf('multipart/form-data') !== -1) {
            //handle form upload
            debug('got form-post request, type: %s', requestType);
            
            var busboy = new Busboy({ headers: req.headers }),
                uploads = [];
            busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
                uploads.push(new when.promise(function(resolve, reject) {
                    // if the user supplied a directory in the upload request, we will use that instead of the dirname
                    var destpath = path.join(ctx.url[ctx.url.length - 1] == '/' ? path.dirname(domain.filepath) : domain.filepath, filename);
                    debug('Uploading file from field "%s" to "%s"', fieldname, destpath);
                    
                    domain.filepath = destpath;
                    self.runEvent(self.events.BeforePut, ctx, domain, function(err) {
                        if(err) {
                            file.resume();
                            return reject(err);
                        }

                        file.pipe(self._getUploadStream(ctx, domain.filepath, function(err, res) {
                            self.runEvent(self.events.AfterPut, ctx, domain, function(err) {
                                if(err) {
                                    return reject(err);
                                }
                                resolve({
                                    path: path.join(self.path, domain.filepath),
                                    field: fieldname
                                });
                            });
                        }));
                    });
                }));
            });
            busboy.on('finish', function() {
                when.all(uploads).then(function(results) {
                    debug('All uploads done');
                    ctx.done(null, {
                        success: true,
                        filepaths: results.map(function(res) {
                            return res.path;
                        }),
                        results: results
                    });
                }, function(err) {
                    console.error('An error happened:', err);
                    ctx.done(err);
                });
            });
            req.pipe(busboy);

            if(ctx.req.headers['content-length']) {
                req.resume(); // this is needed as deployd will internall pause every stream that has a content-length
            }
        } else {
            //handle direct upload
            debug('got direct-post request, type: %s', requestType);
            this.runEvent(this.events.BeforePut, ctx, domain, function(err) {
                if(err) return ctx.done(err);

                self.putStream(ctx, domain.filepath, ctx.req, function(err, res) {
                    if(err) ctx.done(err);
                
                    self.runEvent(self.events.AfterPut, ctx, domain, function(err) {
                        debug('All uploads done, error: %j', err);
                        if(err) return ctx.done(err);

                        ctx.done(null, {
                            success: true,
                            filepaths: [path.join(self.path, domain.filepath)]
                        });
                    });
                });
            });
        }
    } else {
        next();
    }
};

// get the contents of the current container
module.exports.prototype._getFiles = function(ctx, done) {
    this.client.getFiles(this.config.s3bucket, function(err, container) {
        done(null, container);
    });
};


// get a signedUrl for [get/put]object into s3
module.exports.prototype._getURL = function (ctx, action, filepath, done, returnFormat) {
    return new PKGFile(this.client, {
        name: filepath,
        container: this.container
    }).getURL(action.toUpperCase(), function(err, url) {
        debug('got URL: %s', url);
        if(err) {
            return done(err);
        }

        if(returnFormat === 'url' || (ctx.query.returnFormat && ctx.query.returnFormat.toLowerCase() == 'url')) {
            // simple ajax to get url link
            done(null, url);
        } else {
            // redirect (can be used in <img src="/s3bucket/apple.jpg">)
            ctx.res.statusCode = 307;
            ctx.res.setHeader("Location", url);
            ctx.res.end(null, url);
        }
    });
};

module.exports.prototype._getUploadStream = function (ctx, filepath, done) {
    var uploadStream = this.client.upload({
        container: this.container.name,
        remote: filepath
    });

    uploadStream.on('success', function(file) {
        done(null, file);
    });

    uploadStream.on('error', function(err) {
        done(err);
    });

    return uploadStream;
};

module.exports.prototype.putStream = function (ctx, filepath, readStream, done) {
    var writeStream = this._getUploadStream(ctx, filepath, done);

    readStream.pipe(writeStream);

    if(ctx.req.headers['content-length']) {
        readStream.resume(); // this is needed as deployd will internall pause every stream that has a content-length
    }
};

module.exports.prototype.delete = function (ctx, filepath, done) {
    this.client.removeFile(this.container.name, filepath, done);
};

module.exports.prototype.runEvent = function(ev, ctx, domainData, done) {
  if(ev) {
    return ev.run(ctx, {
        data: domainData, 
        'this': domainData
    }, done);
  }
  return done();
};
