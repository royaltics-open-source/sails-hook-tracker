# sails-hook-tracker

A simple Sails.js hook that serves as an alternative to Sentry and Raven for error and message tracking.

## Installation

```bash
npm install sails-hook-tracker
```

## Requirements

* Sails.js >= 1.0

## Configuration

The default configuration is located in `sails.config.tracker`. The configuration key (`tracker`) can be changed by setting `sails.config.hooks['sails-hook-tracker'].configKey`.

### Basic Configuration

```javascript
// [your-sails-app]/config/tracker.js
module.exports.tracker = {
  active: true,
  dsn: "https://your-domain.com/api/error-tracking",
  options: {
    release: '1.0.0',
    environment: 'development'
  }
};
```

### Usage in Controllers

```javascript
// [your-sails-app]/api/controllers/UserController.js
module.exports = {
  find: async function(req, res) {
    // Capture custom message with extra data
    await sails.tracker.captureMessage("User accessing find", {
      extra: {
        userId: req.user.id,
        timestamp: new Date(),
        requestParams: req.allParams()
      }
    });
    
    // Capture error with extra data
    try {
      // ... your code ...
    } catch (error) {
      await sails.tracker.captureException(error, {
        extra: {
          userId: req.user.id,
          url: req.url,
          method: req.method,
          body: req.body
        }
      });
    }
    
    return res.ok('ok');
  }
};
```

### Automatic 500 Error Capture

Add this to your `responses/serverError.js`:

```javascript
if(sails.tracker) sails.tracker.captureException(new Error(data));
```

## Capture Server (Backend Example)

Here's an example of how to implement the server that will receive the errors:

```javascript
// [tracking-server]/api/controllers/ErrorTrackingController.js
module.exports = {
  capture: async function(req, res) {
    try {
      // Decode and decompress data
      const compressedData = Buffer.from(req.body.data, 'base64');
      
      zlib.inflate(compressedData, async (err, decompressedBuffer) => {
        if (err) {
          return res.serverError(err);
        }

        const errorData = JSON.parse(decompressedBuffer.toString());
        
        // Save to database
        await ErrorLog.create({
          message: errorData.message,
          stack: errorData.stack,
          environment: errorData.environment,
          release: errorData.release,
          timestamp: new Date(),
          metadata: errorData.extra || {}
        });

        return res.ok();
      });
    } catch (error) {
      return res.serverError(error);
    }
  }
};

// [tracking-server]/api/models/ErrorLog.js
module.exports = {
  attributes: {
    message: { type: 'string', required: true },
    stack: { type: 'string' },
    environment: { type: 'string' },
    release: { type: 'string' },
    timestamp: { type: 'ref', columnType: 'datetime' },
    metadata: { type: 'json' }
  }
};
```

## Features

- Error and exception capture
- Custom message capture
- Automatic data compression
- Support for additional metadata
- Environment and version configuration

## Contributing

Contributions are welcome. Please open an issue or pull request on GitHub.

## License

MIT

## Repository

[GitHub Repository](https://github.com/royaltics-open-source/sails-hook-tracker)
