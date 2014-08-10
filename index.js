var fs = require("fs");
var express = require('express');
var makerequest = require('request');
var bodyParser = require('body-parser');
var parseString = require('xml2js').parseString;
var cradle = require('cradle');
var moment = require('moment');

// Get Twilio settings from config.
var config = require('./config');
var twilio = require('twilio')(config.config.accountSID, config.config.authToken);

// Set up Express app.
var app = express();
app.use(bodyParser());

app.use(express.static(__dirname + '/public'));

app.post('/register', function(request, response){
	var db = new(cradle.Connection)().database('streetpermits');
	
	// Prepare CouchDB doc & add unique code.
	var doc = request.body;
	var rightnow = new Date();
	var timestamp = rightnow.getUTCMilliseconds() + '' + rightnow.getUTCSeconds() + '' + rightnow.getUTCMinutes();
	doc.code = timestamp;
	db.save(doc, function(err, res) {
		if(!err) {
			response.sendfile('public/verify.html');
			twilio.sendMessage({ to: doc.PhoneNumber, from: config.config.fromNumber, body: 'Verification code: ' + timestamp }, function(err, responseData) { 
			    if (!err) {
			        console.log(responseData.body);
			    }
			});
		}
		else {
			response.status(500).end();
		}
		
	});
	
});

app.post('/verify', function(request, response){
	var db = new(cradle.Connection)().database('streetpermits');
	db.view('verify/getcode', function(err, res) {
		res.forEach(function(row) {
          if(request.body.VerificationCode == row.code) {
          	fs.readFile('./permit.json', 'utf8', function(err, data) {
          		if(err) {
          			console.log('Could not open file.');
          		}
          		else {
          			var body = data.replace("#start-date#", moment(row.StartDate)).replace("#number-of-spaces#", row.NumberOfSpaces)
          				.replace("#point-of-contact#", row.PointofContact).replace("#phone-number#", row.PhoneNumber)
          				.replace("#location-description#", row.LocationDescription);
          			var options = {
				        url: "https://permitapidev.cityofboston.gov:4443/api/building/occupancyapplication",
				        method: 'PUT',
				        body: body
				    };
				    makerequest(options, function (error, resp, bod){
				    	if(!error && resp.statusCode == 201) {
				    		var loc = resp.headers.location.toString();
				    		var id = loc.substr(77, 6);
				    		fs.readFile('./public/thanks.html', 'utf8', function(err, data) {
				    			var page = data.replace('#permit-id#', id).replace('#link#', loc);
				    			response.send(page);
				    		});
				    	}
				    	else {
				    		response.sendfile('public/sorry.html');
				    	}
				    });
          		}
          	});
          }
		});
	});	
});

app.listen(3000);

