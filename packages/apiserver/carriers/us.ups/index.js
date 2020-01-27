const axios = require('axios');

function getTime(location, date, time) {
  // WARNING : Timezone is ignored.
  const dateResult = /^(\d+)\/(\d+)\/(\d+)$/.exec(date);
  const timeResult = /^(\d+):(\d+) (A\.M\.|P\.M\.)$/.exec(time);

  timeResult[1] = parseInt(timeResult[1], 10);
  if (timeResult[1] === 12) timeResult[1] = 0;
  if (timeResult[3] === 'P.M.') timeResult[1] += 12;
  if (timeResult[1] < 10) timeResult[1] = `0${timeResult[1]}`;

  // TODO : timezone convert
  return `${dateResult[3]}-${dateResult[1]}-${dateResult[2]}T${timeResult[1]}:${timeResult[2]}:00Z`;
}

function parseStatusId(name) {
  if (name === 'cms.stapp.orderReceived') return 'information_received';
  if (name === 'cms.stapp.shipped') return 'at_pickup';
  if (name === 'cms.stapp.outForDelivery') return 'out_for_delivery';
  if (name === 'cms.stapp.delivered') return 'delivered';
  return 'in_transit';
}

function getTrack(trackId) {
  // const trimString = s => {
  //   return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim();
  // };

  return new Promise((resolve, reject) => {
    axios
      .post('https://www.ups.com/track/api/Track/GetStatus?loc=en_US', {
        Locale: 'en_US',
        TrackingNumber: [trackId],
      })
      .then(res => {
        if (
          res.data.statusCode !== '200' ||
          res.data.trackDetails[0].errorCode
        ) {
          reject({
            code: 404,
            message: res.data.trackDetails
              ? res.data.trackDetails[0].errorText
              : res.data.statusText,
          });
          return;
        }

        const info = res.data.trackDetails[0];

        const shippingInformation = {
          from: {},
          to: {},
          state: { id: 'information_received', text: 'information received' },
          progresses: [],
        };

        info.shipmentProgressActivities.forEach(event => {
          const eventInfo = {
            time: getTime(event.location, event.date, event.time),
            status: {
              id: parseStatusId(event.milestone ? event.milestone.name : null),
              text: event.activityScan,
            },
            location: { name: event.location },
          };

          if (
            !shippingInformation.from.time &&
            eventInfo.status.id === 'at_pickup'
          ) {
            shippingInformation.from = {
              time: eventInfo.time,
              address: event.location,
            };
          }

          shippingInformation.progresses.unshift(eventInfo);
        });

        const lastProgress =
          shippingInformation.progresses[
            shippingInformation.progresses.length - 1
          ];
        if (lastProgress) {
          shippingInformation.state = lastProgress.status;
          if (lastProgress.status.id === 'delivered') {
            shippingInformation.to = {
              time: lastProgress.time,
              address: lastProgress.location,
            };
          }
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: 'UPS',
  },
  getTrack,
};
