const axios = require('axios');

const STATUS_ID_MAP = {
  'picked up': { id: 'at_pickup', text: '상품인수' },
  delivered: { id: 'delivered', text: '배송완료' },
};

function getTime(location, date, time) {
  // WARNING : Timezone is ignored.
  const dateObj = new Date(date);

  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() < 9 ? '0' : '') + (dateObj.getMonth() + 1);
  const day = dateObj.getDate();

  // TODO : timezone convert
  return `${year}-${month}-${day}T${time}:00Z`;
}

function getStatus(description) {
  // eslint-disable-next-line no-restricted-syntax
  for (const key of Object.keys(STATUS_ID_MAP)) {
    if (description.toLowerCase().indexOf(key) !== -1)
      return STATUS_ID_MAP[key];
  }
  return { id: 'in_transit', text: '이동중' };
}

function getTrack(trackId) {
  const trimString = s => {
    return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim();
  };

  return new Promise((resolve, reject) => {
    axios
      .get('https://www.logistics.dhl/shipmentTracking', {
        params: {
          AWB: trackId,
          countryCode: 'g0',
          languageCode: 'en', // TODO :i18n
        },
      })
      .then(res => {
        if (res.data.errors) {
          reject({
            code: 404,
            message: res.data.errors[0].message,
          });
          return;
        }

        const info = res.data.results[0];

        const shippingInformation = {
          from: {
            name: info.origin.value,
          },
          to: {
            name: info.destination.value,
          },
          state: { id: 'information_received', text: '접수완료' },
          progresses: [],
        };

        info.checkpoints.forEach(checkpoint => {
          shippingInformation.progresses.unshift({
            time: getTime(
              trimString(checkpoint.location),
              checkpoint.date,
              checkpoint.time
            ),
            status: getStatus(checkpoint.description),
            location: { name: trimString(checkpoint.location) },
            description: checkpoint.description,
          });
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
    name: 'DHL',
    tel: '+8215880001',
  },
  getTrack,
};
