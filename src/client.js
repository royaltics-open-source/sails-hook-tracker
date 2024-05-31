'use strict';

var utils = require('./utils');
var events = require('events');
var nodeUtil = require('util'); // nodeUtil to avoid confusion with "utils"
var uuid = require('uuid');
var parsers = require('./parsers');
var stringify = require('json-stringify-safe');
var httpSend = require('./HttpRequest');


function Tracker() {


    this.config = (dsn, options) => {


        //Review require navigator
        if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof navigator !== 'undefined') {
            utils.consoleAlertOnce('This looks like a browser environment; are you sure you don\'t want Tracker.js for browser JavaScript? https://sentry.io/for/javascript');
        }


        if (!dsn || !options) {
            options = {};
            utils.consoleAlertOnce('Tracker requiere file config/tracker.js module.exports.tracker{ dsn: string, options: {}} ');

        }


        this.options = options || {};
        this.debug = options.debug || false;
        this.dsn = utils.parseDSN(dsn);


        if (!this.dsn) {
            utils.consoleAlert('no DSN provided, error reporting disabled');
        }


        // enabled if a dsn is set
        this._enabled = !!this.dsn;

        var context = {}
        context.server_name = options.server_name || require('os').hostname() || '';
        context.root = options.root || process.cwd();
        context.headers = options.headers;
        context.release = options.release || '';
        context.environment = options.environment || '';
        context.logger = options.loggerName || '';
        context.username = options.username || '';
        context.platform = options.platform || 'node';
        context.project = options.project_id;
        context.node = process.version;

        this.breadcrumbs = options.breadcrumbs || {};
        this.context = context;
        this.extra = options.extra || {};
        this.tags = options.tags || {};
        this.dataCallback = options.dataCallback;
        this.shouldSendCallback = options.shouldSendCallback;
        this.captureUnhandledRejections = options.captureUnhandledRejections;



        this.on('error', (err) => {
            utils.consoleAlert(err?.message, err?.response);
        });

        return this;
    }


    this.install = (opts, cb) => {
        if (this.installed) return this;

        if (typeof opts === 'function') {
            cb = opts;
        }

        registerExceptionHandler(this, cb);
        if (this.captureUnhandledRejections) {
            registerRejectionHandler(this, cb);
        }


        if (this.debug) {
            utils.consoleAlert('Instalado DSN: ' + this.dsn.hostname + this.dsn.path + " port: " + this.dsn.port + " protocol: " + this.dsn.protocol);
        }

        this.installed = true;

        return this;
    }


    this.process = (eventId, eventCapture, cb) => {
        // prod codepaths shouldn't hit this branch, for testing
        if (typeof eventId === 'object') {
            cb = eventCapture;
            eventCapture = eventId;
            eventId = this.generateEventId();
        }

        var extra = eventCapture.extra || {};

        //GENERATE CONTEXT

        this.context.server_name = extra.server_name || this.context.server_name;
        this.context.root = extra.root || this.context.root;
        this.context.headers = extra.headers || this.context.headers;
        this.context.release = extra.release || this.context.release;
        this.context.environment = extra.environment || this.context.environment;
        this.context.loggerName = extra.loggerName || this.context.logger;
        this.context.username = extra.username || this.context.username;
        this.context.timestamp = new Date().toLocaleTimeString();


        eventCapture.event_id = eventId;
        eventCapture.context = this.context;
        eventCapture.tags = eventCapture.tags || this.tags;
        eventCapture.extra = extra;

        //eventCapture.exeption from parseError;

        eventCapture.aditional = {
            modules: utils.getModules() || [],
            breadcrumbs: this.breadcrumbs || []
        };


        if (this.dataCallback) {
            eventCapture = this.dataCallback(eventCapture);
        }

        var shouldSend = true;
        if (!this._enabled) shouldSend = false;
        if (this.shouldSendCallback && !this.shouldSendCallback(eventCapture)) shouldSend = false;

        if (shouldSend) {
            this.send(eventCapture, cb);
        } else {
            // wish there was a good way to communicate to cb why we didn't send; worth considering cb api change?
            // could be shouldSendCallback, could be disabled, could be sample rate
            // avoiding setImmediate here because node 0.8
            cb && setTimeout(function () {
                cb(null, eventId);
            }, 0);
        }
    }

    /**
     * Send to Webhooks
     * @param {*} eventCapture 
     * @param {*} cb 
     */
    this.send = (eventCapture, cb) => {
        var seventCapture = stringify(eventCapture);
        if (this.debug) {
            utils.consoleAlert('Enviando: ', seventCapture);
        }
        //Send Data
        httpSend.send(this, seventCapture, eventCapture.event_id);
    }

    this.generateEventId = () => {
        return uuid().replace(/-/g, '');
    }

    this.captureMessage = (message, eventCapture, cb) => {
        if (!cb && typeof eventCapture === 'function') {
            cb = eventCapture;
            eventCapture = {};
        } else {
            eventCapture = eventCapture || {};
        }
        var eventId = this.generateEventId();
        this.process(eventId, parsers.parseText(message, eventCapture), cb);

        return eventId;
    }

    this.captureException = (err, eventCapture, cb) => {
        if (!(err instanceof Error)) {
            // This handles when someone does:
            //   throw "something awesome";
            // We synthesize an Error here so we can extract a (rough) stack trace.
            err = new Error(err);
        }

        if (!cb && typeof eventCapture === 'function') {
            cb = eventCapture;
            eventCapture = {};
        } else {
            eventCapture = eventCapture || {};
        }

        var self = this;
        var eventId = this.generateEventId();

        parsers.parseError(err, eventCapture, function (kw) {
            try {
                self.process(eventId, kw, cb);
            } catch (internal_exception) {
                return utils.consoleAlert('internalException:', internal_exception);
            }
        });

        return eventId;
    }

}


const registerExceptionHandler = (client, cb) => {
    let called = false;
    process.on('uncaughtException', function (err) {
        if (cb) { // bind event listeners only if a callback was supplied
            const onLogged = () => {
                called = false;
                cb(true, err);
            };

            const onError = () => {
                called = false;
                cb(false, err);
            };

            if (called) {
                client.removeListener('logged', onLogged);
                client.removeListener('error', onError);
                return cb(false, err);
            }

            client.once('logged', onLogged);
            client.once('error', onError);

            called = true;
        }

        var eventId = client.captureException(err);

        return utils.consoleAlert('uncaughtException: ' + eventId, err.message);
    });
}

const registerRejectionHandler = (client, cb) => {
    process.on('unhandledRejection', function (reason) {
        var eventId = client.captureException(reason, function (sendErr) {
            cb && cb(!sendErr, reason);
        });
        return utils.consoleAlert('unhandledRejection: ' + eventId);
    });
}

//Add events Extends
nodeUtil.inherits(Tracker, events.EventEmitter);

//Instance Tracker
var defaultInstance = new Tracker();
defaultInstance.version = require('../package.json').version;
defaultInstance.disableConsoleAlerts = utils.disableConsoleAlerts;
module.exports = defaultInstance;


