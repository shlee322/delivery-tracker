const path = require('path')
const fs = require('fs')
const cors = require('cors')

function init_app(app) {
  app.use(cors())

  var CARRIERS = {}
  var CARRIERS_INFOS = []

  fs.readdirSync(path.join(__dirname, 'carriers')).forEach(name => {
    console.log('load carrier ' + name);
    CARRIERS[name] = require('./carriers/' + name);
  })

  for(var id in CARRIERS) {
    CARRIERS_INFOS.push({
      id,
      ...CARRIERS[id].info,
    })
  }

  app.get('/carriers', function (req, res) {
    res.json(CARRIERS_INFOS)
  })

  app.get('/carriers/:carrier_id', function (req, res) {
    if(!(req.params.carrier_id in CARRIERS)) {
      return res.status(404).json({
        message: '지원하지 않는 택배사입니다.',
      })
    }

    res.json({
      id: req.params.carrier_id,
      ...CARRIERS[req.params.carrier_id].info,
    })
  })

  app.get('/carriers/:carrier_id/tracks/:track_id', (req, res) => {
    const carrier_id = req.params.carrier_id;

    if(!(carrier_id in CARRIERS)) {
      return res.status(404).json({
        message: '지원하지 않는 택배사입니다.',
      })
    }

    CARRIERS[carrier_id].getTrack(req.params.track_id)
      .then(info => res.status(200).json({
        ...info,
        carrier: {
          id: carrier_id,
          ...CARRIERS[carrier_id].info,
        },
      })).catch(err => res.status(typeof err.code == 'number' ? err.code : 500).json({
        message: err.message ? err.message : '오류가 발생하였습니다. 잠시후 다시 시도해주세요.'
      }))
  })
  return app;
}

module.exports = init_app;
