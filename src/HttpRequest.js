'use strict';

var http = require('http');
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

HttpSendRequest.prototype.send = function send(client, skwargs, eventId, cb) {
    var self = this;

    //Compress data
    zlib.deflate(skwargs, function (err, buff) {
        var headers = {
            'Content-Type': 'application/json',
        };
        const postData = JSON.stringify({
            data:  buff.toString('base64')
        })

        self.prepareOptions(client, headers)
        //Http Request
        var req = http.request(self.options, function (res) {
            let data = '';
            res.setEncoding('utf8');
            if (res.statusCode >= 200 && res.statusCode < 300) {
                client.emit('logged', eventId);
                cb && cb(null, eventId);
            }

            // force the socket to drain
            res.on('data', (chunk) => { data += chunk; });

            res.on('end', () => {
                try {
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
