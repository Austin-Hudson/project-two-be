var express = require('express');
var cors = require('cors');
var bodyParser = require('body-parser');
var busboyBodyParser = require("busboy-body-parser");
var mongodb = require('mongodb');
var request = require('request');
var aws = require('aws-sdk');
var app = express();
var PORT = 3000;

/* let's add the ability ajax to our server from anywhere! */
app.use(cors());

/* extended:true = put it in an obj */
app.use(bodyParser.urlencoded({extended: true}));

//set limit to the upload
app.use(busboyBodyParser({ limit: '5mb' }));

//aws setup
aws.config.update({
  accessKeyId: process.env.aws_access_key_id,
  secretAccessKey: process.env.aws_secret_access_key,
  region:'us-west-2'
});

var s3 = new aws.S3();

// s3.createBucket({Bucket: 'project-two-restaurants'}, function(err, resp) {
//   if (err) {
//    console.log(err);
//    return;
// }
//   console.log(resp);
// });

var RESTAURANT_COLLECTION = 'restaurants';

// connect to the database server!
var url = 'mongodb://heroku_5tbqgz7w:72qn927dh6r56asdknkjvo9tha@ds027425.mlab.com:27425/heroku_5tbqgz7w'

mongodb.MongoClient.connect(process.env.MONGODB_URI || url, function (err, database) {
  if (err) {
    console.log(err);
    process.exit(1);
  }

  // Save database object from the callback for reuse.
  db = database;
  console.log("Database connection ready");

  // Initialize the app. another way to start a server in express
  var server = app.listen(process.env.PORT || 3000 || 80, function () {
    var port = server.address().port;
    console.log("App now running on port", port);
  });
});

//file upload
app.post("/upload", function (req, res) {
  s3.putObject( {Bucket:'project-two-restaurants', Key:req.files.name["name"], ACL:'public-read', Body: req.files.name["data"]}, function(err, resp) {
    if (err) {
        console.log(err);
        return;
    }
    console.log(resp);

  });
});
//get image and send it
app.get("/restaurants/img", function(req, res){
  var params = {Bucket: "project-two-restaurants"};
  s3.listObjects(params, function(err, data){
    var bucketContents = data.Contents;
    var urls = [];
    for(var i=0; i < bucketContents.length; i++){
      var urlParams = {Bucket: 'project-two-restaurants', Key: bucketContents[i].Key};
      s3.getSignedUrl('getObject', urlParams, function(err, url){
        //console.log("url", url);
        urls.push(url);
      })
    }
      var returnedData = {
        urls: urls
      }
      console.log("Returned Data:", returnedData);
      res.json(returnedData);
      res.end();
  })
})


/* restaurant search */
app.post('/restaurant/search', function(req, res) {

  var baseUrl = "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
  var apiKeyQueryString = "?key=";
  var GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  var query = "&name=" + req.body.queryString;
  var lat = req.body.lat;
  var long = req.body.long;
  var location = "&location=" + lat + ',' + long;
  var radius = "&radius=" + req.body.radius;
  var type = "&type=restaurant";
  var fullQuery = baseUrl + apiKeyQueryString + GOOGLE_MAPS_API_KEY + query + type + radius + location;
  console.log("fullQuery:", fullQuery); // prints to terminal

  request({
    url: fullQuery,
    method: 'GET',
    callback: function(error, response, body) {
      // console.log(body);
      // console.log(response);
      res.send(body);
    }
  })

}); // end post request

app.post('/restaurants', function(req, res) {
  var restaurant = req.body;
  var name = restaurant.name;
  // db.collection(RESTAURANT_COLLECTION.find({name: name}, function(err, doc){
  //   if (err) {
  //       handleError(response, err.message, "Failed to add new character.");
  //     } else {
  //       res.status(201).json(doc);
  // })
 //insert comment to restaurant
  //  db.collection(RESTAURANT_COLLECTION).update(restaurant, function(err, doc) {
  //   if (err) {
  //     handleError(response, err.message, "Failed to add new character.");
  //   } else {
  //     res.status(201).json(doc);
  //   }
  // });
});

app.get("/restaurants/:name", function(request, response) {
  var name = request.params.name;

  db.collection(RESTAURANT_COLLECTION).findOne({name: name}, function(err, doc) {
    if (err) {
      handleError(response, err.message, "Failed to get restaurant");
    } else {
      response.status(200).json(doc);
    }
  });

});

//
// app.get('/restaurants/:name', function(req, res) {
//   var name = req.params.name
//   console.log(name);
//  //find restaurnt with comments
//    db.collection(RESTAURANT_COLLECTION).findOne({name: name}, function(err, doc) {
//     if (err) {
//       handleError(response, err.message, "Failed to add new character.");
//     } else {
//       console.log(doc);
//       res.status(200).json(JSON.stringify(doc));
//     }
//   });
// });

// when things go wrong
function handleError(res, reason, message, code) {
  console.log("ERROR: " + reason);
  res.status(code || 500).json({"error": message});
}
