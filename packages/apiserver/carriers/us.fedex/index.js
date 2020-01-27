const axios = require('axios');
const qs = require('querystring');

function parseStatusId(s) {
  if (s.includes('information sent')) return 'information_received';
  if (s.includes('Picked up')) return 'at_pickup';
  if (s.includes('Delivered')) return 'delivered';
  return 'in_transit';
}

function getTrack(trackId) {
  // const trimString = s => {
  //   return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim();
  // };

  return new Promise((resolve, reject) => {
    axios
      .post(
        'https://www.fedex.com/trackingCal/track',
        qs.stringify({
          data: JSON.stringify({
            TrackPackagesRequest: {
              appType: 'WTRK',
              appDeviceType: '',
              supportHTML: true,
              supportCurrentLocation: true,
              uniqueKey: '',
              processingParameters: {},
              trackingInfoList: [
                {
                  trackNumberInfo: {
                    trackingNumber: trackId,
                    trackingQualifier: '',
                    trackingCarrier: '',
                  },
                },
              ],
            },
          }),
          action: 'trackpackages',
          locale: 'en_US',
          version: '1',
          format: 'json',
        })
      )
      .then(res => {
        const info = res.data.TrackPackagesResponse.packageList[0];

        if (info.isInvalid || info.isNotFound) {
          reject({
            code: 404,
            message: 'Tracking ID Error',
          });
          return;
        }

        const shippingInformation = {
          from: {
            address: `${info.originCity}, ${info.originCntryCD}`,
          },
          to: {
            address: `${info.destCity}, ${info.destCntryCD}`,
          },
          state: { id: 'information_received', text: 'information received' },
          progresses: [],
        };

        info.scanEventList.forEach(event => {
          const eventInfo = {
            time: `${event.date}T${event.time}${event.gmtOffset}`,
            status: { id: parseStatusId(event.status), text: event.status },
            location: { name: event.scanLocation },
          };

          if (
            !shippingInformation.from.time &&
            eventInfo.status.id === 'at_pickup'
          )
            shippingInformation.from.time = eventInfo.time;

          shippingInformation.progresses.unshift(eventInfo);
        });

        const lastProgress =
          shippingInformation.progresses[
            shippingInformation.progresses.length - 1
          ];
        if (lastProgress) {
          shippingInformation.state = lastProgress.status;
          if (lastProgress.status.id === 'delivered')
            shippingInformation.to.time = lastProgress.time;
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: 'Fedex',
  },
  getTrack,
};
