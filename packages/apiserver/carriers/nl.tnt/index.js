const axios = require('axios');

function parseStatusId(s) {
  if (s === 'PU') return 'at_pickup';
  if (s === 'OD') return 'out_for_delivery';
  if (s === 'OK') return 'delivered';
  return 'in_transit';
}

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .get('https://www.tnt.com/api/v3/shipment', {
        params: {
          con: trackId,
          searchType: 'CON',
          locale: 'en_US', // TODO :i18n
          channel: 'OPENTRACK',
        },
      })
      .then(res => {
        if (res.data['tracker.output'].notFound) {
          reject({
            code: 404,
            message: 'Tracking ID Error',
          });
          return;
        }

        const info = res.data['tracker.output'].consignment[0];

        const shippingInformation = {
          from: {
            address: [info.originAddress.city, info.originAddress.country]
              .filter(e => e)
              .join(', '),
            time: info.originDate,
          },
          to: {
            address: [
              info.destinationAddress.city,
              info.destinationAddress.country,
            ]
              .filter(e => e)
              .join(', '),
            time: info.destinationDate,
          },
          state: { id: 'information_received', text: 'information received' },
          progresses: [],
        };

        info.events.forEach(event => {
          const eventInfo = {
            time: event.date,
            status: {
              id: parseStatusId(event.legacyCode),
              text: event.statusDescription,
            },
            location: {
              name: [event.location.city, event.location.country]
                .filter(e => e)
                .join(', '),
            },
          };

          shippingInformation.progresses.unshift(eventInfo);
        });

        if (shippingInformation.progresses.length > 0) {
          shippingInformation.state =
            shippingInformation.progresses[
              shippingInformation.progresses.length - 1
            ].status;
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: 'TNT',
  },
  getTrack,
};
