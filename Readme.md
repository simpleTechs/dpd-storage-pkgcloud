## storage-pkgcloud Resource

This custom resource type allows you to provide multiple ways of storing files in the cloud through deployd.
Currently, the following backends are supported for storage:

* **Amazon S3**

Others can be implemented easily if pkgcloud supports them (i.e. Google Cloud Storage, Azure, Rackspace)

`dpd-storage-pkgcloud` supports the following types of requests:

* **GET** `/file` - be redirected to the file at the storage provider (can be used in `<img src="/files/image.jpg">`)
* **GET** `/file?returnFormat=url` - retrive a signed URL to GET the file
* **GET** `/file?_method=PUT&returnFormat=url` - retrive a signed URL to PUT the file (i.e. from the client directly to the storage provider)
* **DELETE** `/file` - delete a file
* **PUT/POST** `/file` (Body = File Content) - upload a file by streaming it from the request to the storage provider
* **PUT/POST** `/file` (Body = Multipart Form) - upload multiple files by streaming them from the request to the storage provider (may include additional information, such as mimetype and multiple filenames)
* **PUT/POST** `/file?returnFormat=url` - retrive a signed URL to PUT the file (i.e. from the client directly to the storage provider)

### Requirements

* deployd (you'd have guessed that, probably :-))
* Access Credentials for your Storage Provider

### Installation

In your app's root directory, type `npm install dpd-storage-pkgcloud` into the command line or [download the source](https://bitbucket.org/simpletechs/dpd-storage-pkgcloud). This should create a `dpd-storage-pkgcloud` directory in your app's `node_modules` directory.

See [Installing Modules](http://docs.deployd.com/docs/using-modules/installing-modules.md) for details.

### Setup

* enter your credentials in the event's config
* make sure to implement **secure** `beforePut`, `beforeGet` and `beforeDelete` handlers. Use `cancelUnless(me, 'You are not authorized to do this', 403);` as a basic template.
* if you'd like, you can set `this.filepath` in the `beforePut` event - this will change the destination which a file is uploaded to

### Usage

For best performance, always try to *directly* upload data from your client to the storage backend. Use `?returnFormat=url` in your `PUT` request to receive an `uploadURL` in the response.
You can then `PUT` your file directly to this url and your deployd-server will never have to handle the file itself.
The signed URL does not include any secret information.

### API

`dpd-storage-pkgcloud` supports multiple events, i.e. scripts that run once certain actions are done (or about to happen). 

The following list shows all events that are supported:

* **BeforePut** - will run once for every file that is about to be uploaded to the storage provider, may be used to `cancel` that request
* **AfterPut** - will run once for every file that was successfully uploaded to the storage provider, **cannot** be cancelled
* **BeforeGet** - will run on each `get` request to a file, may be used to `cancel` that request
* **BeforeDelete** - will run on each `delete` request to a file, may be used to `cancel` that request

Each event will run inside the following domain, i.e. the following variables can be accessed inside the script (all read-only):

* **filepath** - the path a file is being/was uploaded to
* **query** - the query of the file upload request

Additionally, the `afterput`-event will have a property called `file`, that is, the response of the storage backend to the upload request.
You can use this to keep track of every file uploaded (e.g. in a dedicated collection)

### Credits

We'd like to thank pkgcloud for building this great abstraction layer!

`storage-pkgcloud` is the work of [simpleTechs.net](https://www.simpletechs.net)