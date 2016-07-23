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
var RESTAURANT_FAV_COLLECTION = 'restaurant_favs'

// connect to the database server!
//var url = 'mongodb://heroku_5tbqgz7w:72qn927dh6r56asdknkjvo9tha@ds027425.mlab.com:27425/heroku_5tbqgz7w'
var url = "mongodb://localhost:27017/food_app"
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
app.post("/restaurants/img", function(req, res){
  var files = req.body.files;
  var params = {Bucket: "project-two-restaurants"};
  s3.listObjects(params, function(err, data){
    console.log(data);
    var bucketContents = data.Contents;
    var urls = [];
    for(var i=0; i < bucketContents.length; i++){
      //if the file is corresponded to the restaurant
      if(files != undefined){
        if(files.indexOf(bucketContents[i].Key) != -1){
          var urlParams = {Bucket: 'project-two-restaurants', Key: bucketContents[i].Key};
          s3.getSignedUrl('getObject', urlParams, function(err, url){
            //console.log("url", url);
            urls.push(url);
          })
        }
      }

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
//update restaurant comment
app.put('/restaurants/:name', function(request, response) {
    var old = {name: request.body.name};
    var updateTo = request.body.comments;
    var updatedComments = [];

      db.collection(RESTAURANT_COLLECTION).find(old).toArray(function(err, doc){
        if (err){
          console.log("Error: ", err);
        }
        else {
            if(doc.length != 0){
              for(var i = 0; i < doc[0].comments.length; i++){
                  updatedComments.push(doc[0].comments[i]);
              }
            }
            updatedComments.push(updateTo.pop());

            db.collection(RESTAURANT_COLLECTION).update(old ,{$set:{comments: updatedComments}}, {upsert: true},function (err, result) {
              console.log("comments", updatedComments);
              console.log("old:", old);
              if (err) {
                console.log("ERROR!", err);
                response.json("error");
              } else if (result.length) {
                console.log('Found:', result);
                response.json(result);
              } else { //
                console.log('No document(s) found with defined "find" criteria');
                response.json("none found");
              }

            }); // end find
        }
      })

  }); // end update

//find a restaurant
app.get("/restaurants/:name", function(request, response) {
  var name = request.params.name;

  db.collection(RESTAURANT_COLLECTION).findOne({name: name}, function(err, doc) {
    if (err) {
      handleError(response, err.message, "Failed to get restaurant");
    } else {
      response.status(200).json(JSON.stringify(doc));
    }
  });

});
//save a restaurant with image name
app.post("/restaurant/:name", function(request, response){
  var name = request.params.name;
  var fileName = request.body.fileName;
  console.log(name, fileName);

  var restaurantInfo = {
    name: name,
    fileName: fileName
  }

  db.collection(RESTAURANT_FAV_COLLECTION).insert(restaurantInfo, function (err, result) {
       if (err) {
         console.log(err);
         response.json("error");
       } else {
         console.log('Inserted.');
         console.log('RESULT!!!!', result);
         console.log("end result");
         response.json(result);
       }
    });

});
//get the images corresponding to the restaurnt
app.get("/restaurants/favorite/:name", function(request, response){
    var restaurantName = request.params.name;

    db.collection(RESTAURANT_FAV_COLLECTION).find({name: restaurantName}).toArray(function(err, doc) {
      if (err) {
        handleError(response, err.message, "Failed to get restaurant");
      } else {
        response.status(200).json(doc);
      }
    })
});
//delete comment
app.delete("/restaurants/:name", function(request, response){
  var name = {name: request.body.name};
  var commentToDelete = request.body.comment;
  var updatedComments = [];

    db.collection(RESTAURANT_COLLECTION).find(name).toArray(function(err, doc){
      if (err){
        console.log("Error: ", err);
      }
      else {
          if(doc.length != 0){
            //create updated comments
            for(var i = 0; i < doc[0].comments.length; i++){
                updatedComments.push(doc[0].comments[i]);
            }
            //spice it out
            var commentIndex = updatedComments.indexOf(commentToDelete);
            updatedComments.splice(commentIndex, 1);
          }
          //console.log(updatedComments);
          db.collection(RESTAURANT_COLLECTION).update(name ,{$set:{comments: updatedComments}}, {upsert: true},function (err, result) {
            if (err) {
              console.log("ERROR!", err);
              response.json("error");
            } else if (result.length) {
              console.log('Found:', result);
              response.json(result);
            } else { //
              console.log('No document(s) found with defined "find" criteria');
              response.json("none found");
            }
          }); // end find
      }
    })

});
// when things go wrong
function handleError(res, reason, message, code) {
  console.log("ERROR: " + reason);
  res.status(code || 500).json({"error": message});
}
