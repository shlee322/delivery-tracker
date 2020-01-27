const axios = require('axios');
const { JSDOM } = require('jsdom');
const qs = require('querystring');

const parseStatusId = s => {
  if (s.includes('Posted')) return 'at_pickup';
  if (s.includes('Out for delivery')) return 'out_for_delivery';
  if (s.includes('Delivered')) return 'delivered';
  return 'in_transit';
};

function getTime(location, time) {
  // WARNING : Timezone is ignored.
  const result = /^(\d+)\/(\d+)\/(\d+) (\d+):(\d+)$/.exec(time);

  // TODO : timezone convert
  return `${result[3]}-${result[2]}-${result[1]}T${result[4]}:${result[5]}:00Z`;
}

function getTrack(trackId) {
  // Ref : https://www.ems.post/en/global-network/tracking

  return new Promise((resolve, reject) => {
    axios
      .post(
        'https://storm-uat.ipc.be/storm/pages/fragments/public/itemtracking',
        qs.stringify({
          itemSearch: trackId,
          language: '1',
        })
      )
      .then(res => {
        const dom = new JSDOM(res.data);
        const { document } = dom.window;

        const table = document.querySelector('tbody');

        const error = table
          ? table.querySelector('tr:first-child td[colspan="3"]')
          : true;
        if (error) {
          reject({
            code: 404,
            message: error.textContent || 'Tracking ID Error',
          });
          return;
        }

        const shippingInformation = {
          state: { id: 'information_received', text: 'information received' },
          progresses: [],
        };

        table.querySelectorAll('tr').forEach(element => {
          const tds = element.querySelectorAll('td');

          shippingInformation.progresses.push({
            time: getTime(tds[2].textContent, tds[0].textContent),
            location: { name: tds[2].textContent },
            status: {
              id: parseStatusId(tds[1].textContent),
              text: tds[1].textContent,
            },
          });
        });

        const lastProgress =
          shippingInformation.progresses[
            shippingInformation.progresses.length - 1
          ];
        if (lastProgress) {
          shippingInformation.state = lastProgress.status;
          if (lastProgress.status.id === 'delivered')
            shippingInformation.to = { time: lastProgress.time };
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: 'EMS',
  },
  getTrack,
};
