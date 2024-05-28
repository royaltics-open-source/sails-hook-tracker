'use strict';
var utils = require('./utils');
var http = require('http');
var https = require('https');
const httpProtocol = [http, https];
var zlib = require('zlib');


function HttpSendRequest() {
    this.defaultPort = 80;
    this.options = {};

    this.prepareOptions = function prepareOptions(client, _headers = {}) {
        const { dsn, headers } = client;
        this.options = {
            ...dsn,
            method: 'POST',
            headers: {
                ...headers,
                ..._headers
            }
        };
    }

}

HttpSendRequest.prototype.send = function send(client, seventCapture, eventId, cb) {
    var self = this;

    //Compress data
    zlib.deflate(seventCapture, function (err, buff) {
        var headers = {
            'Content-Type': 'application/json',
        };
        const postData = JSON.stringify({
            data: buff.toString('base64')
        })

        self.prepareOptions(client, headers)
        if (client.debug) utils.consoleAlert('Http Options:', self.options);

        const httpInstance = httpProtocol[self.options.protocolIndex];
        //Http Request
        var req = httpInstance.request(self.options, function (res) {
            let data = '';
            res.setEncoding('utf8');

            if (client.debug) utils.consoleAlert('Respuesta HTTP: ', res.statusCode);

            if (res.statusCode >= 200 && res.statusCode < 300) {
                client.emit('logged', eventId);
                cb && cb(null, eventId);
            }

            // force the socket to drain
            res.on('data', (chunk) => { data += chunk; });

            res.on('end', () => {
                try {
                    if (client.debug) utils.consoleAlert('Data Response: ', data);

                    // Attempt to parse the response data as JSON
                    const json = JSON.parse(data);

                    if (!json.success) {
                        var e = new Error('HTTP Request Error (' + res.statusCode + '): ' + json?.message);
                        e.response = json;
                        e.statusCode = res.statusCode;
                        e.sendMessage = message;
                        e.eventId = eventId;
                        client.emit('error', e);
                        cb && cb(e);
                    }
                } catch (e) { }
            });
        });

        var cbFired = false;
        req.on('error', function (e) {
            if (client.debug) utils.consoleAlert('Error: ', e);
            client.emit('error', e);
            if (!cbFired) {
                cb && cb(e);
                cbFired = true;
            }
        });
        req.end(postData);

    });

};

var httpSend = new HttpSendRequest();
module.exports = httpSend;
