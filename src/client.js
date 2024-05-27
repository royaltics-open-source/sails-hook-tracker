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

        if (arguments.length === 0) {
            options = {};
            utils.consoleAlertOnce('Capture Exceptions requiere dsn');

        }

        //Review require navigator
        if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof navigator !== 'undefined') {
            utils.consoleAlertOnce('This looks like a browser environment; are you sure you don\'t want Tracker.js for browser JavaScript? https://sentry.io/for/javascript');
        }



        this.options = options || {};
        this.dsn = utils.parseDSN(dsn);
        this.name = options.name || require('os').hostname();
        this.root = options.root || process.cwd();
        this.headers = options.headers || {};
        this.release = options.release || '';
        this.environment = options.environment || '';
        this.captureUnhandledRejections = options.captureUnhandledRejections;
        this.loggerName = options.logger || '';
        this.dataCallback = options.dataCallback;
        this.shouldSendCallback = options.shouldSendCallback;
        this.parseUser = options.parseUser;

        if (!this.dsn) {
            utils.consoleAlert('no DSN provided, error reporting disabled');
        }


        // enabled if a dsn is set
        this._enabled = !!this.dsn;

        var globalContext = this._globalContext = {};
        if (options.tags) {
            globalContext.tags = options.tags;
        }
        if (options.extra) {
            globalContext.extra = options.extra;
        }

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

        for (var key in this.autoBreadcrumbs) {
            if (this.autoBreadcrumbs.hasOwnProperty(key)) {
                this.autoBreadcrumbs[key] && autoBreadcrumbs.instrument(key, this);
            }
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

        var domainContext = {};
        eventCapture.user = this._globalContext.user || domainContext.user || eventCapture.user;
        eventCapture.tags = this._globalContext.tags || domainContext.tags || eventCapture.tags;
        eventCapture.extra = this._globalContext.extra || domainContext.extra || eventCapture.extra;
        eventCapture.breadcrumbs = {
            values: domainContext.breadcrumbs || this._globalContext.breadcrumbs || []
        };

        eventCapture.modules = utils.getModules();
        eventCapture.server_name = eventCapture.server_name || this.name;

        if (typeof process.version !== 'undefined') {
            eventCapture.extra.node = process.version;
        }

        eventCapture.environment = eventCapture.environment || this.environment;
        eventCapture.logger = eventCapture.logger || this.loggerName;
        eventCapture.event_id = eventId;
        eventCapture.timestamp = new Date().toISOString().split('.')[0];
        eventCapture.project = this.options.project_id;
        eventCapture.platform = 'node';

        // Only include release information if it is set
        if (this.release) {
            eventCapture.release = this.release;
        }

        if (this.dataCallback) {
            eventCapture = this.dataCallback(eventCapture);
        }

        var shouldSend = true;
        if (!this._enabled) shouldSend = false;
        if (this.shouldSendCallback && !this.shouldSendCallback(eventCapture)) shouldSend = false;
        if (Math.random() >= this.sampleRate) shouldSend = false;

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
        //Send Data
        httpSend.send(this, seventCapture, eventCapture.event_id);
    }

    this.generateEventId = generateEventId => {
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
            self.process(eventId, kw, cb);
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
        return utils.consoleAlert('uncaughtException: ' + eventId);
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


