var express = require('express');
var app = express()

app.get('/', function (req, res) {
  // res.send('Hello World!')
  
  console.log(res);

  // res.writeHead(200, {'Content-Type': 'application/json'});
  var keepAlive = setInterval(function() {
    console.log('kA');
    res.write('\n');
  }, 1000);
  setTimeout(function() {
    clearInterval(keepAlive);
    console.log('timeout')
    res.end(JSON.stringify({'test': 'done!'}));
  }, 2000)
})

app.get('/auth', function(req, res, next) {
    console.log(req.headers);

    res.end();
});

var server = app.listen(3000, function () {

  var host = server.address().address
  var port = server.address().port

  console.log('Example app listening at http://%s:%s', host, port)

})