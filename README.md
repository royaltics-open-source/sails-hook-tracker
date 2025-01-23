# sails-hook-tracker

Un hook simple para Sails.js que sirve como alternativa a Sentry y Raven para el rastreo de errores y mensajes.

## Instalación

```bash
npm install sails-hook-tracker
```

## Requisitos

* Sails.js >= 1.0

## Configuración

La configuración por defecto se encuentra en `sails.config.tracker`. La clave de configuración (`tracker`) puede cambiarse estableciendo `sails.config.hooks['sails-hook-tracker'].configKey`.

### Configuración Básica

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

### Uso en Controladores

```javascript
// [your-sails-app]/api/controllers/UserController.js
module.exports = {
  find: async function(req, res) {
    // Capturar mensaje personalizado con datos extras
    await sails.tracker.captureMessage("Usuario accediendo a find", {
      extra: {
        userId: req.user.id,
        timestamp: new Date(),
        requestParams: req.allParams()
      }
    });
    
    // Capturar error con datos extras
    try {
      // ... tu código ...
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

### Captura Automática de Errores 500

Agrega esto a tu `responses/serverError.js`:

```javascript
if(sails.tracker) sails.tracker.captureException(new Error(data));
```

## Servidor de Captura (Backend Example)

Aquí hay un ejemplo de cómo implementar el servidor que recibirá los errores:

```javascript
// [tracking-server]/api/controllers/ErrorTrackingController.js
module.exports = {
  capture: async function(req, res) {
    try {
      // Decodificar y descomprimir datos
      const compressedData = Buffer.from(req.body.data, 'base64');
      
      zlib.inflate(compressedData, async (err, decompressedBuffer) => {
        if (err) {
          return res.serverError(err);
        }

        const errorData = JSON.parse(decompressedBuffer.toString());
        
        // Guardar en la base de datos
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

## Características

- Captura de errores y excepciones
- Captura de mensajes personalizados
- Compresión automática de datos
- Soporte para metadatos adicionales
- Configuración de ambiente y versión

## Contribución

Las contribuciones son bienvenidas. Por favor, abre un issue o pull request en GitHub.

## Licencia

MIT

## Repositorio

[GitHub Repository](https://github.com/royaltics-open-source/sails-hook-tracker)
