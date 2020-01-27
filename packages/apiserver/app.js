const path = require('path');
const fs = require('fs');
const cors = require('cors');

function initApp(app) {
  app.use(cors());

  const CARRIERS = {};

  fs.readdirSync(path.join(__dirname, 'carriers')).forEach(name => {
    // eslint-disable-next-line no-console
    console.log(`load carrier ${name}`);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    CARRIERS[name] = require(`./carriers/${name}`);
  });

  const CARRIERS_INFOS = CARRIERS.map(({ id, info }) => ({ id, ...info }));

  app.get('/carriers', (req, res) => {
    res.json(CARRIERS_INFOS);
  });

  app.get('/carriers/:id', (req, res) => {
    if (!(req.params.id in CARRIERS)) {
      res.status(404).json({
        message: '지원하지 않는 택배사입니다.',
      });
      return;
    }

    res.json({
      id: req.params.carrier_id,
      ...CARRIERS[req.params.carrier_id].info,
    });
  });

  app.get('/carriers/:carrierId/tracks/:trackId', (req, res) => {
    const { carrierId, trackId } = req.params;

    if (!(carrierId in CARRIERS)) {
      res.status(404).json({
        message: '지원하지 않는 택배사입니다.',
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
            : '오류가 발생하였습니다. 잠시후 다시 시도해주세요.',
        })
      );
  });

  return app;
}

module.exports = initApp;
