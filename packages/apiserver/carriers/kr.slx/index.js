const axios = require('axios');
const { JSDOM } = require('jsdom');

function parseStatusId(s) {
  if (s === '집하') return 'at_pickup';
  if (s === '배달완료') return 'delivered';
  return 'in_transit';
}

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .get('http://www.slx.co.kr/delivery/delivery_number.php', {
        params: {
          param1: trackId,
        },
      })
      .then(res => {
        const dom = new JSDOM(res.data);
        const { document } = dom.window;

        const tables = document.querySelectorAll('.tbl_type02');

        if (tables.length === 0) {
          const errorDiv = document.querySelector(
            'div[style="text-align:center;color:red"]'
          );

          return reject({
            code: 404,
            message: errorDiv ? errorDiv.textContent : '운송장 번호 에러',
          });
        }

        return {
          info: tables[0].querySelectorAll('td:nth-child(2n)'),
          progresses: tables[1].querySelectorAll('tr:not(:first-child)'),
        };
      })
      .then(({ info, progresses }) => {
        const shippingInformation = {
          from: {
            name: info[2].textContent,
            address: info[3].textContent,
          },
          to: {
            name: info[4].textContent,
            address: info[5].textContent,
          },
          state: { id: 'information_received', text: '접수' },
          progresses: [],
        };

        progresses.forEach(element => {
          const tds = element.querySelectorAll('td');

          shippingInformation.progresses.push({
            time: `${tds[0].textContent
              .replace(/\./g, '-')
              .replace(' ', 'T')}:00+09:00`,
            location: {
              name: tds[1].textContent,
            },
            description: `배송자: ${tds[2].textContent} (${tds[3].textContent})`,
            status: {
              id: parseStatusId(tds[4].textContent),
              text: tds[4].textContent,
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
            shippingInformation.to.time = lastProgress.time;
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: 'SLX',
    tel: '+82316375400',
  },
  getTrack,
};
