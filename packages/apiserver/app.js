const path = require('path');
const fs = require('fs');
const i18n = require('i18n');
const cors = require('cors');

i18n.configure({
  locales: ['en', 'ja', 'ko'],
  directory: __dirname + '/locales',
});

function initApp(app) {
  app.use(cors());
  app.use(i18n.init);

  const CARRIERS = {};

  fs.readdirSync(path.join(__dirname, 'carriers')).forEach(name => {
    // eslint-disable-next-line no-console
    console.log(`load carrier ${name}`);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    CARRIERS[name] = require(`./carriers/${name}`);
  });

  const CARRIERS_INFOS = Object.keys(CARRIERS).map(id => ({ id, ...CARRIERS[id].info }));

  app.get('/carriers', (req, res) => {
    res.json(CARRIERS_INFOS);
  });

  app.get('/carriers/:carrierId', (req, res) => {
    if (!(req.params.carrierId in CARRIERS)) {
      res.status(404).json({
        message: res.__('not supported carrier'),
      });
      return;
    }

    res.json({
      id: req.params.carrierId,
      ...CARRIERS[req.params.carrierId].info,
    });
  });

  app.get('/carriers/:carrierId/tracks/:trackId', (req, res) => {
    const { carrierId, trackId } = req.params;

    if (!(carrierId in CARRIERS)) {
      res.status(404).json({
        message: res.__('not supported carrier'),
      });
      return;
    }

    CARRIERS[carrierId]
      .getTrack(trackId)
      .then(info =>
        res.status(200).json({
          ...info,
          carrier: {
            id: carrierId,
            ...CARRIERS[carrierId].info,
          },
        })
      )
      .catch(err =>
        res.status(typeof err.code === 'number' ? err.code : 500).json({
          message: err.message
            ? err.message
            : res.__('error message'),
        })
      );
  });

  return app;
}

module.exports = initApp;
