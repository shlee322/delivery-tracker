const axios = require('axios');
const qs = require('querystring');
const { JSDOM } = require('jsdom');

function parseStatus(status, index) {
  if (status.includes('발송') && index === 0)
    return { id: 'at_pickup', text: '상품인수' };
  if (status.includes('배달준비'))
    return { id: 'out_of_delivery', text: '배송출발' };
  if (status.includes('배달완료')) return { id: 'delivered', text: '배송완료' };
  return { id: 'in_transit', text: '상품이동중' };
}

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .get('http://www.swgexp.com/main/main.asp')
      .then(resp => {
        var cookies = resp.headers['set-cookie'][0];
        var data = {
          shipping_no: trackId,
          loading_no: '',
        };
        axios
          .post(
            'http://system.swgexp.com/common/tracking.asp',
            qs.stringify(data),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Cookie: cookies,
              },
            }
          )
          .then(res => {
            const dom = new JSDOM(res.data);
            const document = dom.window.document;
            const table = document.querySelectorAll(
              'table[bgcolor="#ffffff"]'
            )[0];
            if (table === undefined) {
              return reject({
                code: 404,
                message: '운송장 정보를 찾을 수 없습니다.',
              });
            }
            const contents = table.querySelectorAll('tr');
            const progresses = document
              .querySelectorAll('table[class="form_list"] tbody')[1]
              .querySelectorAll('tr[bgcolor="#ffffff"]');

            const shippingInformation = {
              from: {
                name: contents[2].querySelector('td[class="pl30"]').textContent,
                time: null,
              },
              to: {
                name: contents[6].querySelector('td[class="pl30"]').textContent,
                time: null,
              },
              state: {
                id: null,
                text: '',
              },
              progresses: [],
            };
            progresses.forEach((element, index) => {
              const td = element.querySelectorAll('td');

              shippingInformation.progresses.push({
                time: `${td[0].textContent
                  .slice(0, -5)
                  .replace(' ', 'T')}:00+09:00`,
                location: {
                  name: td[2].textContent,
                },
                status: parseStatus(td[4].textContent, index),
                description: td[6].textContent,
              });
            });

            if (shippingInformation.progresses.length > 0) {
              const firstProgress = shippingInformation.progresses[0];
              const lastProgress =
                shippingInformation.progresses[
                  shippingInformation.progresses.length - 1
                ];
              shippingInformation.state = lastProgress.status;
              shippingInformation.from.time = firstProgress.time;
              if (lastProgress.status.id === 'delivered') {
                shippingInformation.to.time = lastProgress.time;
              }
            }

            resolve(shippingInformation);
          });
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: '성원글로벌카고',
    tel: '+82327469984',
  },
  getTrack,
};
